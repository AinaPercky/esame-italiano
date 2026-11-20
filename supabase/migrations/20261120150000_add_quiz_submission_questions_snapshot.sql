-- Diagnostic pédagogique : conserver la version exacte des questions prévue au lancement du quiz.
-- Les lignes historiques ne sont volontairement ni remplies ni modifiées.
ALTER TABLE public.quiz_submissions
  ADD COLUMN IF NOT EXISTS questions_snapshot jsonb;

COMMENT ON COLUMN public.quiz_submissions.questions_snapshot IS
  'Snapshot JSONB des questions exactes du lancement associé. NULL pour les soumissions historiques antérieures à cette migration.';

CREATE OR REPLACE FUNCTION public.capture_quiz_submission_questions_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.questions_snapshot IS NULL THEN
    SELECT q.questions
      INTO NEW.questions_snapshot
      FROM public.quizzes AS q
     WHERE q.id = NEW.quiz_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Cette fonction privilégiée est réservée à son usage par le trigger.
-- Elle ne doit pas être exposée comme fonction exécutable via la Data API.
REVOKE ALL ON FUNCTION public.capture_quiz_submission_questions_snapshot()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_capture_quiz_submission_questions_snapshot
  ON public.quiz_submissions;

CREATE TRIGGER trg_capture_quiz_submission_questions_snapshot
BEFORE INSERT ON public.quiz_submissions
FOR EACH ROW
EXECUTE FUNCTION public.capture_quiz_submission_questions_snapshot();


-- Capture immuable des questions au lancement, avant toute modification ultérieure du quiz.
ALTER TABLE public.quiz_launches
  ADD COLUMN IF NOT EXISTS questions_snapshot jsonb;

COMMENT ON COLUMN public.quiz_launches.questions_snapshot IS
  'Copie serveur des questions au moment du lancement; conserve les corrigés pour la correction serveur.';

-- Le snapshot de lancement contient les corrigés : interdire sa lecture directe
-- via la Data API. Les élèves reçoivent uniquement la projection assainie par RPC.
REVOKE SELECT ON TABLE public.quiz_launches FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, quiz_id, launched_at, closed_at, launched_by, presence_deadline_at, status, created_at)
  ON TABLE public.quiz_launches TO authenticated;

ALTER TABLE public.quiz_submissions
  ADD COLUMN IF NOT EXISTS launch_id uuid;

CREATE OR REPLACE FUNCTION public.capture_quiz_launch_questions_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.questions_snapshot IS NULL THEN
    SELECT q.questions
      INTO NEW.questions_snapshot
      FROM public.quizzes AS q
     WHERE q.id = NEW.quiz_id;
  END IF;
  IF NEW.questions_snapshot IS NULL THEN
    RAISE EXCEPTION 'Impossible de capturer les questions du quiz % au lancement.', NEW.quiz_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_quiz_launch_questions_snapshot()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_capture_quiz_launch_questions_snapshot ON public.quiz_launches;
CREATE TRIGGER trg_capture_quiz_launch_questions_snapshot
BEFORE INSERT ON public.quiz_launches
FOR EACH ROW
EXECUTE FUNCTION public.capture_quiz_launch_questions_snapshot();

-- La RPC renvoie uniquement la version assainie des questions : jamais les corrigés.
CREATE OR REPLACE FUNCTION public.get_student_active_launch(p_quiz_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student text := public.quiz_current_student_id();
  v_row jsonb;
BEGIN
  SELECT jsonb_build_object(
    'launch',
    (to_jsonb(l) - 'questions_snapshot')
      || jsonb_build_object('questions_snapshot', public.quiz_sanitize_questions(l.questions_snapshot)),
    'participant', to_jsonb(p)
  )
  INTO v_row
  FROM public.quiz_launches l
  JOIN public.quiz_participants p ON p.launch_id = l.id
  WHERE l.quiz_id = p_quiz_id
    AND l.status = 'launched'
    AND p.student_id = v_student
  ORDER BY l.launched_at DESC
  LIMIT 1;
  RETURN COALESCE(v_row, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_active_launch(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_active_launch(text) TO authenticated;

-- À la soumission, le snapshot du lancement est prioritaire sur toute donnée client.
CREATE OR REPLACE FUNCTION public.capture_quiz_submission_questions_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_launch_id uuid;
  v_questions jsonb;
BEGIN
  SELECT l.id, l.questions_snapshot
    INTO v_launch_id, v_questions
    FROM public.quiz_launches AS l
   WHERE l.quiz_id = NEW.quiz_id
     AND (l.status = 'launched' OR NEW.status = 'missed')
     AND (NEW.launch_id IS NULL OR l.id = NEW.launch_id)
   ORDER BY l.launched_at DESC
   LIMIT 1;

  IF v_launch_id IS NOT NULL AND v_questions IS NOT NULL THEN
    NEW.launch_id := v_launch_id;
    NEW.questions_snapshot := v_questions;
  ELSIF NEW.questions_snapshot IS NULL THEN
    SELECT q.questions
      INTO NEW.questions_snapshot
      FROM public.quizzes AS q
     WHERE q.id = NEW.quiz_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_quiz_submission_questions_snapshot()
  FROM PUBLIC, anon, authenticated;

-- Correction serveur basée sur la version figée au lancement.
CREATE OR REPLACE FUNCTION public.submit_quiz_presence_submission(p_submission JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_student TEXT := public.quiz_current_student_id();
  v_quiz public.quizzes%ROWTYPE;
  v_participant public.quiz_participants%ROWTYPE;
  v_launch public.quiz_launches%ROWTYPE;
  v_attempt_no INTEGER;
  v_status TEXT := coalesce(p_submission ->> 'status', 'completed');
  v_answers JSONB := coalesce(p_submission -> 'answers', '{}'::jsonb);
  v_feedback JSONB := '{}'::jsonb;
  v_raw_score NUMERIC := 0;
  v_score NUMERIC := 0;
  v_max NUMERIC := 20;
  v_score20 NUMERIC := 0;
  v_question JSONB;
  v_eval JSONB;
  v_is_counted BOOLEAN;
  v_existing public.quiz_attempts%ROWTYPE;
  v_attempt public.quiz_attempts%ROWTYPE;
  v_class_name TEXT;
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

  IF NOT EXISTS (
    SELECT 1 FROM public.class_enrollments ce
    WHERE ce.student_id::text = v_student AND ce.status = 'active'
      AND ce.class_id::text = ANY(coalesce(nullif(v_quiz.class_ids, ARRAY[]::text[]), ARRAY[v_quiz.class_id]))
  ) THEN
    RAISE EXCEPTION 'Vous n’êtes plus inscrit dans une classe autorisée pour ce quiz.';
  END IF;
  SELECT c.name INTO v_class_name FROM public.classes c WHERE c.id::text = v_participant.class_id;

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

  -- Calcul autoritaire de la note et du feedback côté serveur
  FOR v_question IN SELECT value FROM jsonb_array_elements(coalesce(v_launch.questions_snapshot, v_quiz.questions, '[]'::jsonb)) LOOP
    v_eval := public.quiz_grade_question(v_question, v_answers ->> (v_question ->> 'id'));
    v_raw_score := v_raw_score + coalesce((v_eval ->> 'points')::numeric, 0);
    v_feedback := v_feedback || jsonb_build_object(
      v_question ->> 'id',
      jsonb_build_object(
        'correct', coalesce((v_eval ->> 'correct')::boolean, false),
        'points', coalesce((v_eval ->> 'points')::numeric, 0),
        'expected', coalesce(v_eval ->> 'expected', ''),
        'studentAnswer', coalesce(v_eval ->> 'studentAnswer', '')
      )
    );
  END LOOP;

  v_max := coalesce(v_quiz.total_points, 20);
  v_score := CASE WHEN v_status = 'timeout' THEN 0 ELSE v_raw_score END;
  v_score20 := CASE
    WHEN v_status = 'timeout' THEN 0
    WHEN v_max > 0 THEN round(((v_raw_score / v_max) * 20)::numeric, 1)
    ELSE 0
  END;

  SELECT greatest(
    coalesce((SELECT max(a.attempt_number) FROM public.quiz_attempts a
              WHERE a.quiz_id = v_quiz.id AND a.student_id = v_student), 0),
    coalesce((SELECT max(s.attempt_number) FROM public.quiz_submissions s
              WHERE s.quiz_id = v_quiz.id AND s.student_id = v_student), 0)
  ) + 1 INTO v_attempt_no;

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
    v_answers, v_score, v_max, v_score20, v_status,
    v_feedback,
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
      SELECT g.id FROM public.quiz_retry_grants g
      WHERE g.quiz_id = v_quiz.id AND g.student_id = v_student AND g.used_at IS NULL
        AND (g.launch_id IS NULL OR g.launch_id = v_launch.id)
      ORDER BY g.created_at
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
    attempt_number, is_counted, launch_id, questions_snapshot
  ) VALUES (
    coalesce(nullif(p_submission ->> 'id', ''), 'sub_' || v_attempt.id::text),
    v_quiz.id, v_quiz.title, v_student,
    coalesce(p_submission ->> 'student_name', ''), p_submission ->> 'student_number',
    coalesce(v_participant.class_id, p_submission ->> 'class_id'), coalesce(v_class_name, p_submission ->> 'class_name'),
    v_attempt.started_at, v_attempt.submitted_at,
    v_answers, v_score, v_max, v_score20, v_status,
    v_feedback, current_date,
    v_attempt_no, v_is_counted, v_launch.id, coalesce(v_launch.questions_snapshot, v_quiz.questions)
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
    is_counted = EXCLUDED.is_counted,
    launch_id = EXCLUDED.launch_id,
    questions_snapshot = EXCLUDED.questions_snapshot;

  RETURN to_jsonb(v_attempt);
END;
$function$;

NOTIFY pgrst, 'reload schema';


-- Le snapshot de soumission contient les corrigés et mappings privés.
-- Les élèves gardent l'accès à leurs résultats/réponses, mais pas à cette colonne.
REVOKE SELECT ON TABLE public.quiz_submissions FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, quiz_id, quiz_title, student_id, student_name, student_number,
  class_id, class_name, started_at, submitted_at, answers, score, max_score,
  score_20, status, feedback, date, attempt_number, launch_id,
  attendance_status, retry_grant_id, is_counted
) ON TABLE public.quiz_submissions TO authenticated;

-- Seul le professeur peut récupérer les snapshots complets pour le diagnostic.
CREATE OR REPLACE FUNCTION public.get_teacher_quiz_submissions()
RETURNS SETOF public.quiz_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.quiz_is_teacher() THEN
    RAISE EXCEPTION 'Autorisation professeur requise.';
  END IF;

  RETURN QUERY
  SELECT s.*
  FROM public.quiz_submissions AS s
  ORDER BY s.submitted_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_quiz_submissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_quiz_submissions() TO authenticated;

NOTIFY pgrst, 'reload schema';
