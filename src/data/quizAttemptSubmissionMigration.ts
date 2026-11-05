export const QUIZ_ATTEMPT_SUBMISSION_MIGRATION_SQL = String.raw`-- PerckyLingua — aligner les RPC sur les soumissions multi-tentatives
-- Correctif additif et idempotent : ne supprime ni ne réécrit les lignes historiques.
-- Le résultat courant est l'unique ligne is_counted=true par quiz/élève; les autres
-- tentatives restent consultables dans quiz_submissions et quiz_attempts.

ALTER TABLE public.quiz_submissions
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER;
ALTER TABLE public.quiz_submissions
  ADD COLUMN IF NOT EXISTS is_counted BOOLEAN NOT NULL DEFAULT TRUE;

WITH numbered AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY quiz_id, student_id
           ORDER BY submitted_at NULLS FIRST, id
         )::INTEGER AS attempt_number
  FROM public.quiz_submissions
  WHERE attempt_number IS NULL
)
UPDATE public.quiz_submissions AS submission
SET attempt_number = numbered.attempt_number
FROM numbered
WHERE submission.id = numbered.id;

ALTER TABLE public.quiz_submissions
  ALTER COLUMN attempt_number SET DEFAULT 1,
  ALTER COLUMN attempt_number SET NOT NULL;

-- Réutiliser l'index unique existant quand il couvre déjà ces trois colonnes.
-- Sinon, créer l'index attendu; si des doublons existent, PostgreSQL interrompt
-- la migration sans supprimer ni modifier les soumissions concernées.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = 'public.quiz_submissions'::regclass
      AND i.indisunique
      AND i.indnkeyatts = 3
      AND (
        SELECT array_agg(a.attname ORDER BY k.ordinality)
        FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum, ordinality)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE k.ordinality <= i.indnkeyatts
      ) = ARRAY['quiz_id', 'student_id', 'attempt_number']::name[]
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX uq_quiz_submissions_attempt_identity
      ON public.quiz_submissions (quiz_id, student_id, attempt_number)';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_quiz_presence_submission(p_submission JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student TEXT := public.quiz_current_student_id();
  v_quiz public.quizzes%ROWTYPE;
  v_participant public.quiz_participants%ROWTYPE;
  v_launch public.quiz_launches%ROWTYPE;
  v_attempt_no INTEGER;
  v_status TEXT := coalesce(p_submission ->> 'status', 'completed');
  v_score NUMERIC := coalesce((p_submission ->> 'score')::numeric, 0);
  v_max NUMERIC := coalesce((p_submission ->> 'max_score')::numeric, 20);
  v_score20 NUMERIC := coalesce((p_submission ->> 'score_20')::numeric, 0);
  v_is_counted BOOLEAN;
  v_existing public.quiz_attempts%ROWTYPE;
  v_attempt public.quiz_attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_quiz
  FROM public.quizzes
  WHERE id = p_submission ->> 'quiz_id'
  FOR UPDATE;
  IF NOT FOUND OR v_quiz.status <> 'launched' THEN
    RAISE EXCEPTION 'Quiz non lancé.';
  END IF;

  SELECT * INTO v_launch
  FROM public.quiz_launches
  WHERE quiz_id = v_quiz.id AND status = 'launched'
  ORDER BY launched_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aucun lancement actif.'; END IF;

  SELECT * INTO v_participant
  FROM public.quiz_participants
  WHERE launch_id = v_launch.id AND student_id = v_student
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participation introuvable pour ce lancement.'; END IF;

  -- Un nouvel essai dans le même lancement n'est possible qu'après autorisation.
  -- En revanche, un nouvel envoi réseau après succès retourne le résultat déjà créé.
  IF v_participant.presence_status IN ('completed', 'timeout') THEN
    SELECT * INTO v_existing
    FROM public.quiz_attempts
    WHERE participant_id = v_participant.id
      AND status IN ('completed', 'timeout')
    ORDER BY attempt_number DESC
    LIMIT 1;
    IF FOUND THEN RETURN to_jsonb(v_existing); END IF;
  END IF;

  IF v_participant.presence_status NOT IN ('present', 'retry_authorized') THEN
    RAISE EXCEPTION 'Présence non confirmée ou participation verrouillée.';
  END IF;
  IF v_participant.presence_confirmed_at IS NULL
     OR v_participant.presence_deadline_at IS NULL
     OR clock_timestamp() < v_participant.presence_deadline_at THEN
    RAISE EXCEPTION 'La fenêtre d’initialisation de la présence n’est pas terminée.';
  END IF;
  IF v_status NOT IN ('completed', 'timeout') THEN
    RAISE EXCEPTION 'Statut de soumission invalide.';
  END IF;
  IF v_participant.presence_status = 'present' AND EXISTS (
    SELECT 1 FROM public.quiz_attempts a
    WHERE a.quiz_id = v_quiz.id AND a.student_id = v_student
  ) THEN
    RAISE EXCEPTION 'Une tentative existe déjà; une autorisation est requise.';
  END IF;

  SELECT greatest(
    coalesce((SELECT max(a.attempt_number) FROM public.quiz_attempts a
              WHERE a.quiz_id = v_quiz.id AND a.student_id = v_student), 0),
    coalesce((SELECT max(s.attempt_number) FROM public.quiz_submissions s
              WHERE s.quiz_id = v_quiz.id AND s.student_id = v_student), 0)
  ) + 1 INTO v_attempt_no;

  -- Une seule tentative est comptabilisée pour ce quiz/élève : on conserve le meilleur
  -- score; en cas d'égalité, le nouvel essai remplace le statut de missed/timeout.
  SELECT NOT EXISTS (
    SELECT 1 FROM public.quiz_submissions s
    WHERE s.quiz_id = v_quiz.id AND s.student_id = v_student
      AND s.is_counted = TRUE AND s.score_20 > v_score20
  ) INTO v_is_counted;

  INSERT INTO public.quiz_attempts (
    quiz_id, launch_id, participant_id, student_id, attempt_number, answers, score, max_score,
    score_20, status, feedback, started_at, submitted_at
  ) VALUES (
    v_quiz.id, v_launch.id, v_participant.id, v_student, v_attempt_no,
    coalesce(p_submission -> 'answers', '{}'::jsonb), v_score, v_max, v_score20, v_status,
    coalesce(p_submission -> 'feedback', '{}'::jsonb),
    coalesce(nullif(p_submission ->> 'started_at', '')::timestamptz, v_participant.presence_confirmed_at),
    clock_timestamp()
  ) RETURNING * INTO v_attempt;

  UPDATE public.quiz_participants
  SET presence_status = CASE WHEN v_status = 'timeout' THEN 'timeout' ELSE 'completed' END,
      final_status = v_status,
      final_score = v_score20
  WHERE id = v_participant.id;

  IF v_participant.presence_status = 'retry_authorized' THEN
    UPDATE public.quiz_retry_grants
    SET used_at = coalesce(used_at, clock_timestamp())
    WHERE id = (
      SELECT id FROM public.quiz_retry_grants
      WHERE quiz_id = v_quiz.id AND student_id = v_student AND used_at IS NULL
        AND (launch_id IS NULL OR launch_id = v_launch.id)
      ORDER BY created_at
      LIMIT 1
    );
  END IF;

  IF v_is_counted THEN
    UPDATE public.quiz_submissions
    SET is_counted = FALSE
    WHERE quiz_id = v_quiz.id AND student_id = v_student AND is_counted = TRUE;
  END IF;

  INSERT INTO public.quiz_submissions (
    id, quiz_id, quiz_title, student_id, student_name, student_number, class_id, class_name,
    started_at, submitted_at, answers, score, max_score, score_20, status, feedback, date,
    attempt_number, is_counted
  ) VALUES (
    coalesce(nullif(p_submission ->> 'id', ''), 'sub_' || v_attempt.id::text),
    v_quiz.id, v_quiz.title, v_student,
    coalesce(p_submission ->> 'student_name', ''), p_submission ->> 'student_number',
    p_submission ->> 'class_id', p_submission ->> 'class_name',
    v_attempt.started_at, v_attempt.submitted_at,
    coalesce(p_submission -> 'answers', '{}'::jsonb), v_score, v_max, v_score20, v_status,
    coalesce(p_submission -> 'feedback', '{}'::jsonb), current_date,
    v_attempt_no, v_is_counted
  )
  ON CONFLICT (quiz_id, student_id, attempt_number) DO UPDATE SET
    quiz_title = EXCLUDED.quiz_title,
    student_name = EXCLUDED.student_name,
    student_number = EXCLUDED.student_number,
    class_id = EXCLUDED.class_id,
    class_name = EXCLUDED.class_name,
    started_at = EXCLUDED.started_at,
    submitted_at = EXCLUDED.submitted_at,
    answers = EXCLUDED.answers,
    score = EXCLUDED.score,
    max_score = EXCLUDED.max_score,
    score_20 = EXCLUDED.score_20,
    status = EXCLUDED.status,
    feedback = EXCLUDED.feedback,
    date = EXCLUDED.date,
    is_counted = EXCLUDED.is_counted;

  RETURN to_jsonb(v_attempt);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_quiz_with_presence(p_quiz_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_launch public.quiz_launches%ROWTYPE;
  v_quiz public.quizzes%ROWTYPE;
  v_submissions JSONB;
  v_closed_at TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF NOT public.quiz_is_teacher() THEN RAISE EXCEPTION 'Autorisation professeur requise.'; END IF;
  SELECT * INTO v_quiz FROM public.quizzes WHERE id = p_quiz_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz introuvable.'; END IF;
  SELECT * INTO v_launch FROM public.quiz_launches
  WHERE quiz_id = p_quiz_id AND status = 'launched'
  ORDER BY launched_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aucun lancement actif.'; END IF;

  UPDATE public.quiz_participants
  SET presence_status = CASE
        WHEN presence_status = 'pending' OR (presence_status = 'retry_authorized' AND presence_confirmed_at IS NULL) THEN 'absent'
        WHEN presence_status = 'retry_authorized' AND presence_confirmed_at IS NOT NULL THEN 'timeout'
        ELSE presence_status
      END,
      final_status = CASE
        WHEN presence_status = 'pending' OR (presence_status = 'retry_authorized' AND presence_confirmed_at IS NULL) THEN 'missed'
        WHEN presence_status = 'retry_authorized' AND presence_confirmed_at IS NOT NULL THEN 'timeout'
        ELSE final_status
      END,
      attendance_locked_at = coalesce(attendance_locked_at, v_closed_at),
      final_score = CASE WHEN presence_status IN ('pending', 'present', 'retry_authorized') THEN 0 ELSE final_score END
  WHERE launch_id = v_launch.id;

  INSERT INTO public.quiz_attempts (
    quiz_id, launch_id, participant_id, student_id, attempt_number, status, score, max_score,
    score_20, started_at, submitted_at
  )
  SELECT p.quiz_id, p.launch_id, p.id, p.student_id,
    coalesce((SELECT max(a.attempt_number) + 1 FROM public.quiz_attempts a
              WHERE a.quiz_id = p.quiz_id AND a.student_id = p.student_id), 1),
    'missed', 0, coalesce(v_quiz.total_points, 20), 0, v_launch.launched_at, v_closed_at
  FROM public.quiz_participants p
  WHERE p.launch_id = v_launch.id AND p.presence_status = 'absent'
    AND NOT EXISTS (SELECT 1 FROM public.quiz_attempts a
                    WHERE a.participant_id = p.id AND a.launch_id = v_launch.id AND a.status = 'missed');

  UPDATE public.quiz_participants
  SET presence_status = 'timeout', final_status = 'timeout'
  WHERE launch_id = v_launch.id AND presence_status = 'present';

  INSERT INTO public.quiz_attempts (
    quiz_id, launch_id, participant_id, student_id, attempt_number, status, score, max_score,
    score_20, started_at, submitted_at
  )
  SELECT p.quiz_id, p.launch_id, p.id, p.student_id,
    coalesce((SELECT max(a.attempt_number) + 1 FROM public.quiz_attempts a
              WHERE a.quiz_id = p.quiz_id AND a.student_id = p.student_id), 1),
    'timeout', 0, coalesce(v_quiz.total_points, 20), 0,
    coalesce(p.presence_confirmed_at, v_launch.launched_at), v_closed_at
  FROM public.quiz_participants p
  WHERE p.launch_id = v_launch.id AND p.presence_status = 'timeout'
    AND NOT EXISTS (
      SELECT 1 FROM public.quiz_attempts a
      WHERE a.participant_id = p.id AND a.launch_id = v_launch.id
        AND a.status IN ('completed', 'timeout')
        AND (p.presence_confirmed_at IS NULL OR a.started_at >= p.presence_confirmed_at)
    );

  INSERT INTO public.quiz_submissions (
    id, quiz_id, quiz_title, student_id, student_name, student_number, class_id, class_name,
    started_at, submitted_at, answers, score, max_score, score_20, status, feedback, date,
    attempt_number, is_counted
  )
  SELECT 'sub_missed_' || v_quiz.id || '_' || p.student_id || '_' || a.attempt_number,
    v_quiz.id, v_quiz.title, p.student_id, concat_ws(' ', s.first_name, s.last_name),
    s.student_number, s.class_id::text, c.name, v_launch.launched_at, v_closed_at,
    '{}'::jsonb, 0, coalesce(v_quiz.total_points, 20), 0, 'missed', '{}'::jsonb, current_date,
    a.attempt_number,
    NOT EXISTS (SELECT 1 FROM public.quiz_submissions prior
                WHERE prior.quiz_id = v_quiz.id AND prior.student_id = p.student_id AND prior.is_counted = TRUE)
  FROM public.quiz_participants p
  JOIN public.students s ON s.id::text = p.student_id
  LEFT JOIN public.classes c ON c.id::text = s.class_id::text
  JOIN LATERAL (
    SELECT attempt_number FROM public.quiz_attempts
    WHERE participant_id = p.id AND launch_id = v_launch.id AND status = 'missed'
    ORDER BY attempt_number DESC LIMIT 1
  ) a ON TRUE
  WHERE p.launch_id = v_launch.id AND p.presence_status = 'absent'
  ON CONFLICT (quiz_id, student_id, attempt_number) DO NOTHING;

  INSERT INTO public.quiz_submissions (
    id, quiz_id, quiz_title, student_id, student_name, student_number, class_id, class_name,
    started_at, submitted_at, answers, score, max_score, score_20, status, feedback, date,
    attempt_number, is_counted
  )
  SELECT 'sub_timeout_' || v_quiz.id || '_' || p.student_id || '_' || a.attempt_number,
    v_quiz.id, v_quiz.title, p.student_id, concat_ws(' ', s.first_name, s.last_name),
    s.student_number, s.class_id::text, c.name,
    coalesce(p.presence_confirmed_at, v_launch.launched_at), v_closed_at, '{}'::jsonb, 0,
    coalesce(v_quiz.total_points, 20), 0, 'timeout', '{}'::jsonb, current_date,
    a.attempt_number,
    NOT EXISTS (SELECT 1 FROM public.quiz_submissions prior
                WHERE prior.quiz_id = v_quiz.id AND prior.student_id = p.student_id AND prior.is_counted = TRUE)
  FROM public.quiz_participants p
  JOIN public.students s ON s.id::text = p.student_id
  LEFT JOIN public.classes c ON c.id::text = s.class_id::text
  JOIN LATERAL (
    SELECT attempt_number FROM public.quiz_attempts
    WHERE participant_id = p.id AND launch_id = v_launch.id AND status = 'timeout'
    ORDER BY attempt_number DESC LIMIT 1
  ) a ON TRUE
  WHERE p.launch_id = v_launch.id AND p.presence_status = 'timeout'
  ON CONFLICT (quiz_id, student_id, attempt_number) DO NOTHING;

  UPDATE public.quiz_retry_grants SET launch_id = NULL
  WHERE quiz_id = p_quiz_id AND launch_id = v_launch.id AND used_at IS NULL;
  UPDATE public.quiz_launches SET status = 'closed', closed_at = v_closed_at
  WHERE id = v_launch.id RETURNING * INTO v_launch;
  UPDATE public.quizzes SET status = 'closed' WHERE id = p_quiz_id RETURNING * INTO v_quiz;
  SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_submissions
  FROM public.quiz_submissions s WHERE s.quiz_id = p_quiz_id;
  RETURN jsonb_build_object('quiz', to_jsonb(v_quiz), 'launch', to_jsonb(v_launch), 'submissions', v_submissions);
END;
$$;

-- Les quiz hors présence stricte utilisent aussi quiz_submissions. Conserver leur
-- règle historique d'une seule remise par élève, mais cibler l'index multi-essais.
CREATE OR REPLACE FUNCTION public.submit_quiz_submission(p_submission JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_quiz_id TEXT := p_submission ->> 'quiz_id';
  v_quiz public.quizzes%ROWTYPE;
  v_submission_id TEXT;
BEGIN
  IF v_quiz_id IS NULL OR v_quiz_id = '' THEN
    RAISE EXCEPTION 'Identifiant de quiz manquant.';
  END IF;
  SELECT * INTO v_quiz FROM public.quizzes WHERE id = v_quiz_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz introuvable: %', v_quiz_id; END IF;
  IF v_quiz.status <> 'launched' THEN RAISE EXCEPTION 'Ce quiz est clôturé ou n''est pas lancé.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.quiz_submissions
    WHERE quiz_id = v_quiz_id AND student_id = p_submission ->> 'student_id'
  ) THEN
    RAISE EXCEPTION 'Une soumission existe déjà pour cet élève et ce quiz.';
  END IF;

  INSERT INTO public.quiz_submissions (
    id, quiz_id, quiz_title, student_id, student_name, student_number, class_id, class_name,
    started_at, submitted_at, answers, score, max_score, score_20, status, feedback, date,
    attempt_number, is_counted
  ) VALUES (
    p_submission ->> 'id', v_quiz_id, coalesce(p_submission ->> 'quiz_title', v_quiz.title),
    p_submission ->> 'student_id', p_submission ->> 'student_name', p_submission ->> 'student_number',
    p_submission ->> 'class_id', p_submission ->> 'class_name',
    (p_submission ->> 'started_at')::timestamptz,
    nullif(p_submission ->> 'submitted_at', '')::timestamptz,
    coalesce(p_submission -> 'answers', '{}'::jsonb),
    coalesce((p_submission ->> 'score')::numeric, 0),
    coalesce((p_submission ->> 'max_score')::numeric, 20),
    coalesce((p_submission ->> 'score_20')::numeric, 0), p_submission ->> 'status',
    coalesce(p_submission -> 'feedback', '{}'::jsonb), (p_submission ->> 'date')::date,
    1, TRUE
  ) ON CONFLICT (quiz_id, student_id, attempt_number) DO NOTHING
  RETURNING id INTO v_submission_id;
  IF v_submission_id IS NULL THEN
    RAISE EXCEPTION 'Une soumission existe déjà pour cet élève et ce quiz.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_quiz_and_mark_missed(p_quiz_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_quiz public.quizzes%ROWTYPE;
  v_submissions JSONB;
BEGIN
  SELECT * INTO v_quiz FROM public.quizzes WHERE id = p_quiz_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz introuvable: %', p_quiz_id; END IF;
  UPDATE public.quizzes SET status = 'closed' WHERE id = p_quiz_id RETURNING * INTO v_quiz;
  INSERT INTO public.quiz_submissions (
    id, quiz_id, quiz_title, student_id, student_name, student_number, class_id, class_name,
    started_at, submitted_at, answers, score, max_score, score_20, status, feedback, date,
    attempt_number, is_counted
  )
  SELECT 'sub_missed_' || v_quiz.id || '_' || s.id::text,
    v_quiz.id, v_quiz.title, s.id::text, concat_ws(' ', s.first_name, s.last_name),
    s.student_number, s.class_id::text, c.name, coalesce(v_quiz.launched_at, now()), now(),
    '{}'::jsonb, 0, coalesce(v_quiz.total_points, 20), 0, 'missed', '{}'::jsonb,
    current_date, 1, TRUE
  FROM public.students s
  LEFT JOIN public.classes c ON c.id::text = s.class_id::text
  WHERE s.class_id::text = ANY(coalesce(nullif(v_quiz.class_ids, ARRAY[]::text[]), ARRAY[v_quiz.class_id]))
    AND NOT EXISTS (
      SELECT 1 FROM public.quiz_submissions prior
      WHERE prior.quiz_id = v_quiz.id AND prior.student_id = s.id::text
    )
  ON CONFLICT (quiz_id, student_id, attempt_number) DO NOTHING;
  SELECT coalesce(jsonb_agg(to_jsonb(sub) ORDER BY sub.student_name), '[]'::jsonb)
  INTO v_submissions FROM public.quiz_submissions sub WHERE sub.quiz_id = p_quiz_id;
  RETURN jsonb_build_object('quiz', to_jsonb(v_quiz), 'submissions', v_submissions);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_quiz_presence_submission(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_quiz_presence_submission(JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.close_quiz_with_presence(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_quiz_with_presence(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_quiz_submission(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_quiz_submission(JSONB) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.close_quiz_and_mark_missed(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_quiz_and_mark_missed(TEXT) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
`;
