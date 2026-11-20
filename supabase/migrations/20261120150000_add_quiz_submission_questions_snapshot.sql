-- Diagnostic pédagogique : conserver les questions utilisées par chaque nouvelle soumission.
-- Les lignes historiques ne sont volontairement ni remplies ni modifiées.
ALTER TABLE public.quiz_submissions
  ADD COLUMN IF NOT EXISTS questions_snapshot jsonb;

COMMENT ON COLUMN public.quiz_submissions.questions_snapshot IS
  'Snapshot JSONB des questions enregistrées lors de la soumission. NULL pour les soumissions historiques antérieures à cette migration.';

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
