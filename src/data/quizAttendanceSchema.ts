export const QUIZ_ATTENDANCE_MIGRATION_SQL = `
-- Présence stricte et secondes chances : migration additive et rétrocompatible.
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS attendance_mode TEXT NOT NULL DEFAULT 'legacy'
    CHECK (attendance_mode IN ('legacy', 'strict_presence'));
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS presence_window_seconds INTEGER NOT NULL DEFAULT 10;
ALTER TABLE public.quiz_submissions
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.quiz_submissions
  ADD COLUMN IF NOT EXISTS launch_id UUID;
ALTER TABLE public.quiz_submissions
  ADD COLUMN IF NOT EXISTS attendance_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (attendance_status IN ('unknown', 'present', 'absent'));
ALTER TABLE public.quiz_submissions
  ADD COLUMN IF NOT EXISTS retry_grant_id UUID;
ALTER TABLE public.quiz_submissions
  ADD COLUMN IF NOT EXISTS is_counted BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS public.quiz_launches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id TEXT NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  launched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  presence_deadline_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'launched' CHECK (status IN ('launched', 'closed')),
  created_by UUID
);
CREATE INDEX IF NOT EXISTS idx_quiz_launches_quiz ON public.quiz_launches(quiz_id, launched_at DESC);

CREATE TABLE IF NOT EXISTS public.quiz_participants (
  quiz_id TEXT NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  launch_id UUID REFERENCES public.quiz_launches(id) ON DELETE SET NULL,
  presence_status TEXT NOT NULL DEFAULT 'pending' CHECK (presence_status IN ('pending', 'present', 'absent')),
  presence_confirmed_at TIMESTAMPTZ,
  attendance_locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (quiz_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_quiz_participants_student ON public.quiz_participants(student_id, quiz_id);

CREATE TABLE IF NOT EXISTS public.quiz_retry_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id TEXT NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  granted_by UUID,
  reason TEXT,
  max_attempts INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts > 0),
  used_attempts INTEGER NOT NULL DEFAULT 0 CHECK (used_attempts >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_quiz_retry_grants_student ON public.quiz_retry_grants(quiz_id, student_id, created_at DESC);

DROP INDEX IF EXISTS public.unique_quiz_student_submission;
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY quiz_id, student_id ORDER BY started_at ASC, id ASC) AS rn
  FROM public.quiz_submissions
)
UPDATE public.quiz_submissions s SET attempt_number = numbered.rn FROM numbered WHERE s.id = numbered.id;
CREATE UNIQUE INDEX IF NOT EXISTS unique_quiz_student_attempt
  ON public.quiz_submissions(quiz_id, student_id, attempt_number);
CREATE INDEX IF NOT EXISTS idx_quiz_submissions_counted ON public.quiz_submissions(quiz_id, student_id, is_counted);

CREATE OR REPLACE FUNCTION public.is_quiz_teacher()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lower(coalesce(auth.email(), '')) = 'ainapercky@gmail.com';
$$;

CREATE OR REPLACE FUNCTION public.launch_quiz_and_clear_missed(p_quiz_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_quiz public.quizzes%ROWTYPE; v_launch public.quiz_launches%ROWTYPE;
BEGIN
  IF NOT public.is_quiz_teacher() THEN RAISE EXCEPTION 'Seul le professeur peut lancer un quiz.'; END IF;
  SELECT * INTO v_quiz FROM public.quizzes WHERE id = p_quiz_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz introuvable: %', p_quiz_id; END IF;
  IF coalesce(v_quiz.attendance_mode, 'legacy') = 'strict_presence' THEN
    INSERT INTO public.quiz_launches (quiz_id, launched_at, presence_deadline_at, status)
    VALUES (p_quiz_id, now(), now() + make_interval(secs => coalesce(v_quiz.presence_window_seconds, 10)), 'launched')
    RETURNING * INTO v_launch;
    INSERT INTO public.quiz_participants (quiz_id, student_id, launch_id, presence_status)
    SELECT p_quiz_id, s.id::text, v_launch.id, 'pending'
    FROM public.students s
    WHERE s.class_id::text = ANY(coalesce(nullif(v_quiz.class_ids, ARRAY[]::text[]), ARRAY[v_quiz.class_id]))
    ON CONFLICT (quiz_id, student_id) DO NOTHING;
  ELSE
    DELETE FROM public.quiz_submissions WHERE quiz_id = p_quiz_id AND status = 'missed';
  END IF;
  UPDATE public.quizzes SET status = 'launched', launched_at = now(), expires_at = NULL WHERE id = p_quiz_id RETURNING * INTO v_quiz;
  RETURN jsonb_build_object('quiz', to_jsonb(v_quiz), 'launch_id', to_jsonb(v_launch));
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_quiz_presence(p_quiz_id TEXT, p_student_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_quiz public.quizzes%ROWTYPE; v_part public.quiz_participants%ROWTYPE; v_email TEXT;
BEGIN
  v_email := lower(coalesce(auth.email(), ''));
  SELECT * INTO v_quiz FROM public.quizzes WHERE id = p_quiz_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz introuvable.'; END IF;
  IF coalesce(v_quiz.attendance_mode, 'legacy') <> 'strict_presence' THEN
    RETURN jsonb_build_object('allowed', true, 'mode', 'legacy', 'presence_status', 'present');
  END IF;
  IF v_email = '' OR NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id::text = p_student_id AND lower(s.email) = v_email) THEN
    RAISE EXCEPTION 'Identité élève non autorisée.';
  END IF;
  SELECT * INTO v_part FROM public.quiz_participants WHERE quiz_id = p_quiz_id AND student_id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participation non ouverte pour cet élève.'; END IF;
  IF v_part.presence_status = 'absent' THEN RAISE EXCEPTION 'La fenêtre de présence est clôturée.'; END IF;
  IF v_part.presence_status = 'pending' THEN
    IF NOT EXISTS (SELECT 1 FROM public.quiz_launches l WHERE l.id = v_part.launch_id AND l.status = 'launched' AND now() <= coalesce(l.presence_deadline_at, now())) THEN
      RAISE EXCEPTION 'La fenêtre de présence de 10 secondes est dépassée.';
    END IF;
    UPDATE public.quiz_participants SET presence_status = 'present', presence_confirmed_at = now(), updated_at = now()
    WHERE quiz_id = p_quiz_id AND student_id = p_student_id RETURNING * INTO v_part;
  END IF;
  RETURN jsonb_build_object('allowed', true, 'mode', 'strict_presence', 'presence_status', v_part.presence_status, 'launch_id', v_part.launch_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_quiz_and_mark_missed(p_quiz_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_quiz public.quizzes%ROWTYPE; v_submissions JSONB;
BEGIN
  IF NOT public.is_quiz_teacher() THEN RAISE EXCEPTION 'Seul le professeur peut clôturer un quiz.'; END IF;
  SELECT * INTO v_quiz FROM public.quizzes WHERE id = p_quiz_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz introuvable: %', p_quiz_id; END IF;
  UPDATE public.quizzes SET status = 'closed' WHERE id = p_quiz_id RETURNING * INTO v_quiz;
  IF coalesce(v_quiz.attendance_mode, 'legacy') = 'strict_presence' THEN
    UPDATE public.quiz_participants SET presence_status = 'absent', attendance_locked_at = now(), updated_at = now()
    WHERE quiz_id = p_quiz_id AND presence_status = 'pending';
    UPDATE public.quiz_participants SET attendance_locked_at = now(), updated_at = now()
    WHERE quiz_id = p_quiz_id AND presence_status = 'present' AND attendance_locked_at IS NULL;
    UPDATE public.quiz_launches SET status = 'closed', closed_at = now()
    WHERE quiz_id = p_quiz_id AND status = 'launched';
    INSERT INTO public.quiz_submissions (id, quiz_id, quiz_title, student_id, student_name, student_number, class_id, class_name, started_at, submitted_at, answers, score, max_score, score_20, status, feedback, date, attempt_number, launch_id, attendance_status, is_counted)
    SELECT 'sub_missed_' || v_quiz.id || '_' || p.student_id, v_quiz.id, v_quiz.title,
      p.student_id, concat_ws(' ', s.first_name, s.last_name), s.student_number, s.class_id::text, c.name,
      coalesce(v_quiz.launched_at, now()), now(), '{}'::jsonb, 0, coalesce(v_quiz.total_points, 20), 0,
      CASE WHEN p.presence_status = 'present' THEN 'timeout' ELSE 'missed' END, '{}'::jsonb, current_date, 1,
      p.launch_id, CASE WHEN p.presence_status = 'present' THEN 'present' ELSE 'absent' END, true
    FROM public.quiz_participants p
    JOIN public.students s ON s.id::text = p.student_id
    LEFT JOIN public.classes c ON c.id::text = s.class_id::text
    WHERE p.quiz_id = p_quiz_id AND NOT EXISTS (SELECT 1 FROM public.quiz_submissions x WHERE x.quiz_id = p_quiz_id AND x.student_id = p.student_id);
  ELSE
    INSERT INTO public.quiz_submissions (id, quiz_id, quiz_title, student_id, student_name, student_number, class_id, class_name, started_at, submitted_at, answers, score, max_score, score_20, status, feedback, date, attempt_number, attendance_status, is_counted)
    SELECT 'sub_missed_' || v_quiz.id || '_' || s.id::text, v_quiz.id, v_quiz.title, s.id::text,
      concat_ws(' ', s.first_name, s.last_name), s.student_number, s.class_id::text, c.name,
      coalesce(v_quiz.launched_at, now()), now(), '{}'::jsonb, 0, coalesce(v_quiz.total_points, 20), 0, 'missed', '{}'::jsonb, current_date, 1, 'unknown', true
    FROM public.students s LEFT JOIN public.classes c ON c.id::text = s.class_id::text
    WHERE s.class_id::text = ANY(coalesce(nullif(v_quiz.class_ids, ARRAY[]::text[]), ARRAY[v_quiz.class_id]))
      AND NOT EXISTS (SELECT 1 FROM public.quiz_submissions x WHERE x.quiz_id = p_quiz_id AND x.student_id = s.id::text);
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(sub) ORDER BY sub.student_name), '[]'::jsonb) INTO v_submissions FROM public.quiz_submissions sub WHERE sub.quiz_id = p_quiz_id;
  RETURN jsonb_build_object('quiz', to_jsonb(v_quiz), 'submissions', v_submissions);
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_quiz_retry(p_quiz_id TEXT, p_student_ids JSONB, p_reason TEXT DEFAULT NULL, p_max_attempts INTEGER DEFAULT 1)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_student TEXT; v_count INTEGER := 0;
BEGIN
  IF NOT public.is_quiz_teacher() THEN RAISE EXCEPTION 'Seul le professeur peut accorder une seconde chance.'; END IF;
  FOR v_student IN SELECT jsonb_array_elements_text(coalesce(p_student_ids, '[]'::jsonb)) LOOP
    IF EXISTS (SELECT 1 FROM public.quiz_submissions s WHERE s.quiz_id = p_quiz_id AND s.student_id = v_student AND s.score_20 = 0)
       AND NOT EXISTS (SELECT 1 FROM public.quiz_retry_grants g WHERE g.quiz_id = p_quiz_id AND g.student_id = v_student AND g.revoked_at IS NULL AND g.used_attempts < g.max_attempts) THEN
      INSERT INTO public.quiz_retry_grants (quiz_id, student_id, granted_by, reason, max_attempts) VALUES (p_quiz_id, v_student, auth.uid(), nullif(trim(p_reason), ''), greatest(1, p_max_attempts));
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('granted', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_quiz_submission(p_submission JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_quiz_id TEXT := p_submission ->> 'quiz_id'; v_student_id TEXT := p_submission ->> 'student_id'; v_quiz public.quizzes%ROWTYPE; v_part public.quiz_participants%ROWTYPE; v_grant public.quiz_retry_grants%ROWTYPE; v_attempt INTEGER; v_launch UUID;
BEGIN
  SELECT * INTO v_quiz FROM public.quizzes WHERE id = v_quiz_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz introuvable.'; END IF;
  IF coalesce(v_quiz.is_public, false) THEN NULL;
  ELSIF (p_submission ->> 'retry_grant_id') IS NOT NULL THEN
    SELECT * INTO v_grant FROM public.quiz_retry_grants WHERE id = (p_submission ->> 'retry_grant_id')::uuid AND quiz_id = v_quiz_id AND student_id = v_student_id AND revoked_at IS NULL AND used_attempts < max_attempts FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Seconde chance inexistante ou déjà utilisée.'; END IF;
    SELECT * INTO v_part FROM public.quiz_participants WHERE quiz_id = v_quiz_id AND student_id = v_student_id FOR UPDATE;
  ELSIF v_quiz.attendance_mode = 'strict_presence' THEN
    SELECT * INTO v_part FROM public.quiz_participants WHERE quiz_id = v_quiz_id AND student_id = v_student_id FOR UPDATE;
    IF NOT FOUND OR v_part.presence_status <> 'present' OR v_quiz.status <> 'launched' THEN
      RAISE EXCEPTION 'Présence non confirmée ou quiz clôturé.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.quiz_submissions s WHERE s.quiz_id = v_quiz_id AND s.student_id = v_student_id) THEN
      RAISE EXCEPTION 'Ce quiz a déjà été soumis. Une autorisation de seconde chance est nécessaire.';
    END IF;
  ELSIF v_quiz.status <> 'launched' THEN
    RAISE EXCEPTION 'Ce quiz est clôturé ou n''est pas lancé.';
  END IF;
  SELECT coalesce(max(attempt_number), 0) + 1 INTO v_attempt FROM public.quiz_submissions WHERE quiz_id = v_quiz_id AND student_id = v_student_id;
  INSERT INTO public.quiz_submissions (id, quiz_id, quiz_title, student_id, student_name, student_number, class_id, class_name, started_at, submitted_at, answers, score, max_score, score_20, status, feedback, date, attempt_number, launch_id, attendance_status, retry_grant_id, is_counted)
  VALUES (p_submission ->> 'id', v_quiz_id, coalesce(p_submission ->> 'quiz_title', v_quiz.title), v_student_id, p_submission ->> 'student_name', p_submission ->> 'student_number', p_submission ->> 'class_id', p_submission ->> 'class_name', (p_submission ->> 'started_at')::timestamptz, nullif(p_submission ->> 'submitted_at', '')::timestamptz, coalesce(p_submission -> 'answers', '{}'::jsonb), coalesce((p_submission ->> 'score')::numeric, 0), coalesce((p_submission ->> 'max_score')::numeric, 20), coalesce((p_submission ->> 'score_20')::numeric, 0), p_submission ->> 'status', coalesce(p_submission -> 'feedback', '{}'::jsonb), (p_submission ->> 'date')::date, v_attempt, CASE WHEN v_part.launch_id IS NOT NULL THEN v_part.launch_id ELSE NULL END, CASE WHEN v_part.presence_status IS NOT NULL THEN v_part.presence_status ELSE 'unknown' END, nullif(p_submission ->> 'retry_grant_id', '')::uuid, true);
  IF v_grant.id IS NOT NULL THEN UPDATE public.quiz_retry_grants SET used_attempts = used_attempts + 1 WHERE id = v_grant.id; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_quiz_retry_for_class(p_quiz_id TEXT, p_class_id TEXT, p_reason TEXT DEFAULT NULL, p_max_attempts INTEGER DEFAULT 1)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_student TEXT; v_count INTEGER := 0;
BEGIN
  IF NOT public.is_quiz_teacher() THEN RAISE EXCEPTION 'Seul le professeur peut accorder une seconde chance.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = p_quiz_id AND p_class_id = ANY(coalesce(nullif(q.class_ids, ARRAY[]::text[]), ARRAY[q.class_id]))) THEN
    RAISE EXCEPTION 'Cette classe ne fait pas partie du quiz sélectionné.';
  END IF;
  FOR v_student IN SELECT s.id::text FROM public.students s WHERE s.class_id::text = p_class_id LOOP
    IF NOT EXISTS (SELECT 1 FROM public.quiz_retry_grants g WHERE g.quiz_id = p_quiz_id AND g.student_id = v_student AND g.revoked_at IS NULL AND g.used_attempts < g.max_attempts) THEN
      INSERT INTO public.quiz_retry_grants (quiz_id, student_id, granted_by, reason, max_attempts)
      VALUES (p_quiz_id, v_student, auth.uid(), nullif(trim(p_reason), ''), greatest(1, p_max_attempts));
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('granted', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.is_quiz_teacher() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_quiz_presence(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_quiz_retry(TEXT, JSONB, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_quiz_retry_for_class(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_quiz_presence(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_quiz_retry(TEXT, JSONB, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_quiz_retry_for_class(TEXT, TEXT, TEXT, INTEGER) TO authenticated;

ALTER TABLE public.quiz_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_retry_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_launches ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY quiz_participants_teacher_select ON public.quiz_participants FOR SELECT TO authenticated USING (public.is_quiz_teacher());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY quiz_participants_student_select ON public.quiz_participants FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id::text = quiz_participants.student_id AND lower(s.email) = lower(coalesce(auth.email(), ''))));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY quiz_participants_teacher_write ON public.quiz_participants FOR ALL TO authenticated USING (public.is_quiz_teacher()) WITH CHECK (public.is_quiz_teacher());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY quiz_retry_grants_teacher_select ON public.quiz_retry_grants FOR SELECT TO authenticated USING (public.is_quiz_teacher());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY quiz_retry_grants_student_select ON public.quiz_retry_grants FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id::text = quiz_retry_grants.student_id AND lower(s.email) = lower(coalesce(auth.email(), ''))));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY quiz_retry_grants_teacher_write ON public.quiz_retry_grants FOR ALL TO authenticated USING (public.is_quiz_teacher()) WITH CHECK (public.is_quiz_teacher());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY quiz_launches_teacher_select ON public.quiz_launches FOR SELECT TO authenticated USING (public.is_quiz_teacher());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY quiz_launches_teacher_write ON public.quiz_launches FOR ALL TO authenticated USING (public.is_quiz_teacher()) WITH CHECK (public.is_quiz_teacher());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
NOTIFY pgrst, 'reload schema';
`;
