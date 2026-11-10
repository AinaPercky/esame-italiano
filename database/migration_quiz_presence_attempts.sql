-- PerckyLingua — présence stricte, historique des lancements et tentatives multiples
-- Migration additive et non destructive. Ne supprime ni ne réinterprète les données historiques.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS attendance_mode TEXT NOT NULL DEFAULT 'legacy'
  CHECK (attendance_mode IN ('legacy', 'strict_presence'));

CREATE TABLE IF NOT EXISTS public.quiz_launches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identifiant du quiz legacy; existence vérifiée par les RPC.
  quiz_id TEXT NOT NULL,
  launched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  -- UUID de l’utilisateur Supabase ayant lancé le quiz. La vérification est
  -- effectuée par auth.uid() dans les RPC afin de rester compatible avec les
  -- projets où le schéma auth n’est pas exposé comme relation FK.
  launched_by UUID,
  presence_deadline_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'launched' CHECK (status IN ('launched', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CREATE TABLE IF NOT EXISTS ne complète pas une table préexistante.
-- Cette colonne est requise par launch_quiz_with_presence().
ALTER TABLE public.quiz_launches
  ADD COLUMN IF NOT EXISTS launched_by UUID;

CREATE TABLE IF NOT EXISTS public.quiz_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id UUID NOT NULL,
  quiz_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  presence_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (presence_status IN ('pending', 'present', 'absent', 'completed', 'timeout', 'retry_authorized')),
  presence_confirmed_at TIMESTAMPTZ,
  attendance_locked_at TIMESTAMPTZ,
  final_status TEXT,
  final_score NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (launch_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.quiz_retry_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  -- UUID de l’utilisateur Supabase ayant accordé la seconde chance.
  granted_by UUID,
  reason TEXT NOT NULL,
  launch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  max_attempts INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts > 0)
);

CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id TEXT NOT NULL,
  launch_id UUID,
  participant_id UUID,
  student_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  score NUMERIC(7,2) NOT NULL DEFAULT 0,
  max_score NUMERIC(7,2) NOT NULL DEFAULT 20,
  score_20 NUMERIC(5,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('completed', 'timeout', 'missed', 'retry_authorized')),
  feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, student_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_quiz_launches_quiz ON public.quiz_launches(quiz_id, launched_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_participants_launch ON public.quiz_participants(launch_id, presence_status);
CREATE INDEX IF NOT EXISTS idx_quiz_participants_student ON public.quiz_participants(student_id, quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student_quiz ON public.quiz_attempts(student_id, quiz_id, score_20 DESC);

ALTER TABLE public.quiz_launches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_retry_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

-- Les écritures passent par les RPC SECURITY DEFINER. Les lectures authentifiées
-- sont nécessaires aux écrans professeur/étudiant et restent limitées par les RPC
-- dans cette première migration compatible avec les politiques historiques.
DROP POLICY IF EXISTS "Quiz launch read authenticated" ON public.quiz_launches;
CREATE POLICY "Quiz launch read authenticated" ON public.quiz_launches FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Quiz participant read authenticated" ON public.quiz_participants;
CREATE POLICY "Quiz participant read authenticated" ON public.quiz_participants FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Quiz retry read authenticated" ON public.quiz_retry_grants;
CREATE POLICY "Quiz retry read authenticated" ON public.quiz_retry_grants FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Quiz attempt read authenticated" ON public.quiz_attempts;
CREATE POLICY "Quiz attempt read authenticated" ON public.quiz_attempts FOR SELECT TO authenticated USING (true);

-- Réconciliation additive du schéma de présence PerckyLingua.
-- Les anciennes versions utilisaient un schéma différent pour les mêmes tables.
-- CREATE TABLE IF NOT EXISTS ne met jamais à niveau une table déjà existante.
-- Cette migration conserve les lignes historiques et ajoute les colonnes attendues
-- par les RPC actuelles. Les launch_id historiques restent NULL car leur rattachement
-- à un lancement précis ne peut pas être déduit sans ambiguïté.

CREATE TABLE IF NOT EXISTS public.quiz_launches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id TEXT NOT NULL,
  launched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  launched_by UUID,
  presence_deadline_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'launched',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_launches
  ADD COLUMN IF NOT EXISTS launched_by UUID,
  ADD COLUMN IF NOT EXISTS presence_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'launched',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.quiz_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id UUID,
  quiz_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  class_id TEXT,
  presence_status TEXT NOT NULL DEFAULT 'pending',
  presence_confirmed_at TIMESTAMPTZ,
  presence_deadline_at TIMESTAMPTZ,
  attendance_locked_at TIMESTAMPTZ,
  final_status TEXT,
  final_score NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_participants
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS launch_id UUID,
  ADD COLUMN IF NOT EXISTS quiz_id TEXT,
  ADD COLUMN IF NOT EXISTS student_id TEXT,
  ADD COLUMN IF NOT EXISTS class_id TEXT,
  ADD COLUMN IF NOT EXISTS presence_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS presence_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS presence_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attendance_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_status TEXT,
  ADD COLUMN IF NOT EXISTS final_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

UPDATE public.quiz_participants SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE public.quiz_participants ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.quiz_participants ALTER COLUMN id SET NOT NULL;

-- L'ancien schéma limitait presence_status à pending/present/absent.
-- Remplacer uniquement les CHECK portant sur cette colonne; les données restent intactes.
DO $
DECLARE constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.quiz_participants'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%presence_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.quiz_participants DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END;
$;

ALTER TABLE public.quiz_participants
  ADD CONSTRAINT quiz_participants_presence_status_check
  CHECK (presence_status IN ('pending', 'present', 'absent', 'completed', 'timeout', 'retry_authorized'))
  NOT VALID;

CREATE TABLE IF NOT EXISTS public.quiz_retry_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  granted_by UUID,
  reason TEXT,
  launch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  max_attempts INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE public.quiz_retry_grants
  ADD COLUMN IF NOT EXISTS granted_by UUID,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS launch_id UUID,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id TEXT NOT NULL,
  launch_id UUID,
  participant_id UUID,
  student_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  score NUMERIC(7,2) NOT NULL DEFAULT 0,
  max_score NUMERIC(7,2) NOT NULL DEFAULT 20,
  score_20 NUMERIC(5,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS launch_id UUID,
  ADD COLUMN IF NOT EXISTS participant_id UUID,
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS answers JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS score NUMERIC(7,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_score NUMERIC(7,2) DEFAULT 20,
  ADD COLUMN IF NOT EXISTS score_20 NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS feedback JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.quiz_submissions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  quiz_title TEXT,
  student_id TEXT NOT NULL,
  student_name TEXT,
  student_number TEXT,
  class_id TEXT,
  class_name TEXT,
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  score NUMERIC DEFAULT 0,
  max_score NUMERIC DEFAULT 20,
  score_20 NUMERIC DEFAULT 0,
  status TEXT,
  feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
  date DATE DEFAULT current_date
);

ALTER TABLE public.quiz_submissions
  ADD COLUMN IF NOT EXISTS launch_id UUID,
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_counted BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS attendance_status TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS retry_grant_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_participants_launch_student
  ON public.quiz_participants (launch_id, student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_participants_launch_status
  ON public.quiz_participants (launch_id, presence_status);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_launch_student
  ON public.quiz_attempts (launch_id, student_id, attempt_number);
CREATE INDEX IF NOT EXISTS idx_quiz_retry_grants_launch_student
  ON public.quiz_retry_grants (launch_id, student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_launches_quiz_status
  ON public.quiz_launches (quiz_id, status, launched_at DESC);



CREATE OR REPLACE FUNCTION public.quiz_is_teacher()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $
  -- L'application identifie le seul compte professeur via ADMIN_EMAIL.
  -- Ne pas se fier à user_metadata, modifiable par l'utilisateur.
  SELECT auth.role() = 'authenticated'
    AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'ainapercky@gmail.com';
$;

CREATE OR REPLACE FUNCTION public.quiz_current_student_id()
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email TEXT := lower(COALESCE(auth.jwt() ->> 'email', '')); v_id TEXT;
BEGIN
  IF auth.role() <> 'authenticated' OR v_email = '' THEN RAISE EXCEPTION 'Session étudiant authentifiée requise.'; END IF;
  SELECT id::text INTO v_id FROM public.students WHERE lower(email) = v_email LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Aucune fiche étudiant associée à cette session.'; END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.launch_quiz_with_presence(p_quiz_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_quiz public.quizzes%ROWTYPE; v_launch public.quiz_launches%ROWTYPE; v_deadline TIMESTAMPTZ;
BEGIN
  IF NOT public.quiz_is_teacher() THEN RAISE EXCEPTION 'Autorisation professeur requise.'; END IF;
  SELECT * INTO v_quiz FROM public.quizzes WHERE id = p_quiz_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz introuvable.'; END IF;
  v_deadline := now() + interval '10 seconds';
  INSERT INTO public.quiz_launches (quiz_id, launched_by, presence_deadline_at)
  VALUES (p_quiz_id, auth.uid(), v_deadline) RETURNING * INTO v_launch;
  INSERT INTO public.quiz_participants (launch_id, quiz_id, student_id, class_id)
  SELECT v_launch.id, p_quiz_id, s.id::text, s.class_id::text
  FROM public.students s
  WHERE s.class_id::text = ANY(coalesce(nullif(v_quiz.class_ids, ARRAY[]::text[]), ARRAY[v_quiz.class_id]))
    AND (NOT EXISTS (
      SELECT 1 FROM public.quiz_participants old_p
      WHERE old_p.quiz_id = p_quiz_id AND old_p.student_id = s.id::text AND old_p.presence_status = 'absent'
    ) OR EXISTS (
      SELECT 1 FROM public.quiz_retry_grants grant_row
      WHERE grant_row.quiz_id = p_quiz_id AND grant_row.student_id = s.id::text
        AND grant_row.used_at IS NULL AND (grant_row.expires_at IS NULL OR grant_row.expires_at > now())
    ))
  ON CONFLICT (launch_id, student_id) DO NOTHING;
  UPDATE public.quizzes SET status = 'launched', launched_at = v_launch.launched_at, expires_at = NULL,
    attendance_mode = CASE WHEN is_public THEN 'legacy' ELSE 'strict_presence' END
  WHERE id = p_quiz_id RETURNING * INTO v_quiz;
  RETURN jsonb_build_object('quiz', to_jsonb(v_quiz), 'launch', to_jsonb(v_launch));
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_quiz_presence(p_launch_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_student TEXT := public.quiz_current_student_id(); v_participant public.quiz_participants%ROWTYPE; v_launch public.quiz_launches%ROWTYPE;
BEGIN
  SELECT * INTO v_launch FROM public.quiz_launches WHERE id = p_launch_id FOR UPDATE;
  IF NOT FOUND OR v_launch.status <> 'launched' THEN RAISE EXCEPTION 'Lancement indisponible.'; END IF;
  IF now() > v_launch.presence_deadline_at THEN RAISE EXCEPTION 'La fenêtre de présence de 10 secondes est dépassée.'; END IF;
  SELECT * INTO v_participant FROM public.quiz_participants WHERE launch_id = p_launch_id AND student_id = v_student FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Élève non inscrit à ce lancement.'; END IF;
  IF v_participant.presence_status = 'absent' THEN RAISE EXCEPTION 'Cette absence est verrouillée.'; END IF;
  UPDATE public.quiz_participants SET presence_status = 'present', presence_confirmed_at = now(), attendance_locked_at = now()
  WHERE id = v_participant.id RETURNING * INTO v_participant;
  RETURN to_jsonb(v_participant);
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_quiz_retry(p_quiz_id TEXT, p_student_id TEXT, p_reason TEXT, p_launch_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_grant public.quiz_retry_grants%ROWTYPE;
BEGIN
  IF NOT public.quiz_is_teacher() THEN RAISE EXCEPTION 'Autorisation professeur requise.'; END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN RAISE EXCEPTION 'Le motif est obligatoire.'; END IF;
  INSERT INTO public.quiz_retry_grants (quiz_id, student_id, granted_by, reason, launch_id)
  VALUES (p_quiz_id, p_student_id, auth.uid(), p_reason, p_launch_id) RETURNING * INTO v_grant;
  UPDATE public.quiz_participants SET presence_status = 'retry_authorized'
  WHERE quiz_id = p_quiz_id AND student_id = p_student_id AND presence_status IN ('present','timeout','absent');
  RETURN to_jsonb(v_grant);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_quiz_presence_submission(p_submission JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_student TEXT := public.quiz_current_student_id(); v_quiz public.quizzes%ROWTYPE; v_participant public.quiz_participants%ROWTYPE;
  v_launch public.quiz_launches%ROWTYPE; v_attempt_no INTEGER; v_status TEXT := coalesce(p_submission ->> 'status', 'completed'); v_score NUMERIC := coalesce((p_submission ->> 'score')::numeric, 0);
  v_max NUMERIC := coalesce((p_submission ->> 'max_score')::numeric, 20); v_score20 NUMERIC := coalesce((p_submission ->> 'score_20')::numeric, 0); v_attempt public.quiz_attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_quiz FROM public.quizzes WHERE id = p_submission ->> 'quiz_id' FOR UPDATE;
  IF NOT FOUND OR v_quiz.status <> 'launched' THEN RAISE EXCEPTION 'Quiz non lancé.'; END IF;
  SELECT * INTO v_launch FROM public.quiz_launches WHERE quiz_id = v_quiz.id AND status = 'launched' ORDER BY launched_at DESC LIMIT 1 FOR UPDATE;
  SELECT * INTO v_participant FROM public.quiz_participants WHERE launch_id = v_launch.id AND student_id = v_student FOR UPDATE;
  IF NOT FOUND OR v_participant.presence_status NOT IN ('present','retry_authorized') THEN RAISE EXCEPTION 'Présence non confirmée ou participation verrouillée.'; END IF;
  IF v_participant.presence_status = 'present' AND EXISTS (SELECT 1 FROM public.quiz_attempts a WHERE a.quiz_id = v_quiz.id AND a.student_id = v_student) THEN RAISE EXCEPTION 'Une tentative existe déjà; une autorisation est requise.'; END IF;
  SELECT coalesce(max(a.attempt_number) + 1, 1) INTO v_attempt_no FROM public.quiz_attempts a WHERE a.quiz_id = v_quiz.id AND a.student_id = v_student;
  INSERT INTO public.quiz_attempts (quiz_id, launch_id, participant_id, student_id, attempt_number, answers, score, max_score, score_20, status, feedback, started_at, submitted_at)
  VALUES (v_quiz.id, v_launch.id, v_participant.id, v_student, v_attempt_no, coalesce(p_submission -> 'answers','{}'::jsonb), v_score, v_max, v_score20, v_status, coalesce(p_submission -> 'feedback','{}'::jsonb), (p_submission ->> 'started_at')::timestamptz, now()) RETURNING * INTO v_attempt;
  UPDATE public.quiz_participants SET presence_status = CASE WHEN v_status = 'timeout' THEN 'timeout' ELSE 'completed' END, final_status = v_status, final_score = v_score20 WHERE id = v_participant.id;
  IF v_participant.presence_status = 'retry_authorized' THEN UPDATE public.quiz_retry_grants SET used_at = now() WHERE id = (SELECT id FROM public.quiz_retry_grants WHERE quiz_id = v_quiz.id AND student_id = v_student AND used_at IS NULL ORDER BY created_at LIMIT 1); END IF;
  INSERT INTO public.quiz_submissions (id, quiz_id, quiz_title, student_id, student_name, student_number, class_id, class_name, started_at, submitted_at, answers, score, max_score, score_20, status, feedback, date)
  VALUES (coalesce(p_submission ->> 'id', 'sub_' || v_attempt.id::text), v_quiz.id, v_quiz.title, v_student, coalesce(p_submission ->> 'student_name',''), p_submission ->> 'student_number', p_submission ->> 'class_id', p_submission ->> 'class_name', (p_submission ->> 'started_at')::timestamptz, now(), coalesce(p_submission -> 'answers','{}'::jsonb), v_score, v_max, v_score20, v_status, coalesce(p_submission -> 'feedback','{}'::jsonb), current_date)
  ON CONFLICT (quiz_id, student_id) DO UPDATE SET score = GREATEST(quiz_submissions.score, EXCLUDED.score), score_20 = GREATEST(quiz_submissions.score_20, EXCLUDED.score_20), status = CASE WHEN EXCLUDED.score_20 >= quiz_submissions.score_20 THEN EXCLUDED.status ELSE quiz_submissions.status END;
  RETURN to_jsonb(v_attempt);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_student_active_launch(p_quiz_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_student TEXT := public.quiz_current_student_id(); v_row JSONB;
BEGIN
  SELECT jsonb_build_object('launch', to_jsonb(l), 'participant', to_jsonb(p)) INTO v_row
  FROM public.quiz_launches l
  JOIN public.quiz_participants p ON p.launch_id = l.id
  WHERE l.quiz_id = p_quiz_id AND l.status = 'launched' AND p.student_id = v_student
  ORDER BY l.launched_at DESC LIMIT 1;
  RETURN COALESCE(v_row, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_quiz_with_presence(p_quiz_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_launch public.quiz_launches%ROWTYPE; v_quiz public.quizzes%ROWTYPE; v_submissions JSONB;
BEGIN
  IF NOT public.quiz_is_teacher() THEN RAISE EXCEPTION 'Autorisation professeur requise.'; END IF;
  SELECT * INTO v_quiz FROM public.quizzes WHERE id = p_quiz_id FOR UPDATE;
  SELECT * INTO v_launch FROM public.quiz_launches WHERE quiz_id = p_quiz_id AND status = 'launched' ORDER BY launched_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aucun lancement actif.'; END IF;
  UPDATE public.quiz_participants SET presence_status = CASE WHEN presence_status = 'pending' THEN 'absent' ELSE presence_status END,
    final_status = CASE WHEN presence_status = 'pending' THEN 'missed' ELSE final_status END,
    attendance_locked_at = COALESCE(attendance_locked_at, now())
  WHERE launch_id = v_launch.id;
  INSERT INTO public.quiz_attempts (quiz_id, launch_id, participant_id, student_id, attempt_number, status, score, max_score, score_20, started_at, submitted_at)
  SELECT p.quiz_id, p.launch_id, p.id, p.student_id, 1, 'missed', 0, v_quiz.total_points, 0,
    v_launch.launched_at, now()
  FROM public.quiz_participants p
  WHERE p.launch_id = v_launch.id AND p.presence_status = 'absent'
    AND NOT EXISTS (SELECT 1 FROM public.quiz_attempts a WHERE a.quiz_id = p.quiz_id AND a.student_id = p.student_id);
  UPDATE public.quiz_participants SET presence_status = 'timeout', final_status = 'timeout'
  WHERE launch_id = v_launch.id AND presence_status = 'present'
    AND NOT EXISTS (SELECT 1 FROM public.quiz_attempts a WHERE a.quiz_id = quiz_participants.quiz_id AND a.student_id = quiz_participants.student_id AND a.status IN ('completed','timeout'));
  INSERT INTO public.quiz_attempts (quiz_id, launch_id, participant_id, student_id, attempt_number, status, score, max_score, score_20, started_at, submitted_at)
  SELECT p.quiz_id, p.launch_id, p.id, p.student_id,
    coalesce((SELECT max(a.attempt_number) + 1 FROM public.quiz_attempts a WHERE a.quiz_id = p.quiz_id AND a.student_id = p.student_id), 1),
    'timeout', 0, v_quiz.total_points, 0, coalesce(p.presence_confirmed_at, v_launch.launched_at), now()
  FROM public.quiz_participants p
  WHERE p.launch_id = v_launch.id AND p.presence_status = 'timeout'
    AND NOT EXISTS (SELECT 1 FROM public.quiz_attempts a WHERE a.quiz_id = p.quiz_id AND a.student_id = p.student_id AND a.status IN ('completed','timeout'));
  INSERT INTO public.quiz_submissions (
    id, quiz_id, quiz_title, student_id, student_name, student_number, class_id, class_name,
    started_at, submitted_at, answers, score, max_score, score_20, status, feedback, date
  )
  SELECT 'sub_missed_' || v_quiz.id || '_' || p.student_id, v_quiz.id, v_quiz.title, p.student_id,
    concat_ws(' ', s.first_name, s.last_name), s.student_number, s.class_id::text, c.name,
    v_launch.launched_at, now(), '{}'::jsonb, 0, v_quiz.total_points, 0, 'missed', '{}'::jsonb, current_date
  FROM public.quiz_participants p
  JOIN public.students s ON s.id::text = p.student_id
  LEFT JOIN public.classes c ON c.id::text = s.class_id::text
  WHERE p.launch_id = v_launch.id AND p.presence_status = 'absent'
  ON CONFLICT (quiz_id, student_id) DO NOTHING;
  UPDATE public.quiz_launches SET status = 'closed', closed_at = now() WHERE id = v_launch.id RETURNING * INTO v_launch;
  UPDATE public.quizzes SET status = 'closed' WHERE id = p_quiz_id RETURNING * INTO v_quiz;
  SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_submissions FROM public.quiz_submissions s WHERE s.quiz_id = p_quiz_id;
  RETURN jsonb_build_object('quiz', to_jsonb(v_quiz), 'launch', to_jsonb(v_launch), 'submissions', v_submissions);
END;
$$;

REVOKE ALL ON FUNCTION public.launch_quiz_with_presence(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_quiz_presence(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_active_launch(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_quiz_retry(TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_quiz_presence_submission(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_quiz_with_presence(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.launch_quiz_with_presence(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_quiz_presence(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_active_launch(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_quiz_retry(TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_presence_submission(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_quiz_with_presence(TEXT) TO authenticated;
NOTIFY pgrst, 'reload schema';
