-- Add an optional CEFR level to quizzes and oral exams.
-- Existing rows are deliberately left untouched: no backfill, default, or data rewrite.
-- Written exams and lessons already have their own level columns.
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS level text;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS level text;

COMMENT ON COLUMN public.quizzes.level IS
  'Optional CEFR level for this quiz (A1, A2, B1, B2, C1, C2).';

COMMENT ON COLUMN public.exams.level IS
  'Optional CEFR level for this oral exam (A1, A2, B1, B2, C1, C2).';
