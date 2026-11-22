-- Make the regular-present quiz available to the class linked from its lesson.
-- The lesson keeps its own publication status; this only activates its associated quiz.
UPDATE public.quizzes
SET status = 'launched',
    launched_at = COALESCE(launched_at, now()),
    expires_at = NULL
WHERE id = 'quiz-presente-indicativo-terminazioni-a1'
  AND status = 'draft';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.quizzes q
    JOIN public.lessons l ON l.quiz_ref = q.id
    WHERE q.id = 'quiz-presente-indicativo-terminazioni-a1'
      AND q.status = 'launched'
      AND l.slug = 'il-presente-indicativo-tre-coniugazioni-a1'
  ) THEN
    RAISE EXCEPTION 'Le quiz de conjugaison doit être lié à la leçon et actif.';
  END IF;
END $$;