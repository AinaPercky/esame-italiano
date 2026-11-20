-- Diagnostic pédagogique : conserver les questions exactes utilisées par chaque nouvelle soumission.
-- Les lignes historiques ne sont volontairement ni remplies ni modifiées.
ALTER TABLE public.quiz_submissions
  ADD COLUMN IF NOT EXISTS questions_snapshot jsonb;

COMMENT ON COLUMN public.quiz_submissions.questions_snapshot IS
  'Snapshot JSONB des questions du quiz au moment de la soumission. NULL pour les soumissions historiques antérieures à cette migration.';

CREATE OR REPLACE FUNCTION public.capture_quiz_submission_questions_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS trg_capture_quiz_submission_questions_snapshot
  ON public.quiz_submissions;

CREATE TRIGGER trg_capture_quiz_submission_questions_snapshot
BEFORE INSERT ON public.quiz_submissions
FOR EACH ROW
EXECUTE FUNCTION public.capture_quiz_submission_questions_snapshot();
