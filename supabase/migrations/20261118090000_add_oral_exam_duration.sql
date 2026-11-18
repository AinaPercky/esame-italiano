-- Configure a speaking-time limit for each oral exam.
-- The limit is shared by all candidates in that exam and the timer restarts per candidate.
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NOT NULL DEFAULT 180;

ALTER TABLE public.exams
  DROP CONSTRAINT IF EXISTS exams_duration_seconds_range;

ALTER TABLE public.exams
  ADD CONSTRAINT exams_duration_seconds_range
  CHECK (duration_seconds BETWEEN 60 AND 7200);

COMMENT ON COLUMN public.exams.duration_seconds IS
  'Maximum speaking time per candidate for this oral exam, in seconds (1 to 120 minutes).';
