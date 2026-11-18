-- Add a configurable speaking duration to each oral exam.
-- Existing exams keep the previous default of 3 minutes.
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NOT NULL DEFAULT 180;

ALTER TABLE public.exams
  DROP CONSTRAINT IF EXISTS exams_duration_seconds_check;

ALTER TABLE public.exams
  ADD CONSTRAINT exams_duration_seconds_check
  CHECK (duration_seconds BETWEEN 60 AND 7200);

COMMENT ON COLUMN public.exams.duration_seconds IS
  'Maximum speaking time per student for this oral exam, in seconds (1 to 120 minutes).';
