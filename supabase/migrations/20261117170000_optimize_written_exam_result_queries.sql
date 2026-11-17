-- Add indexes for written-exam result retrieval and foreign-key maintenance.
-- These indexes do not change scoring, attempt state, or access policies.

-- Teacher result lists filter by exam and sort newest attempts first.
CREATE INDEX IF NOT EXISTS idx_written_exam_attempts_exam_started
  ON public.written_exam_attempts (exam_id, started_at DESC);

-- Foreign-key lookup and version-scoped attempt maintenance.
CREATE INDEX IF NOT EXISTS idx_written_exam_attempts_version
  ON public.written_exam_attempts (version_id);

-- Section deletion/maintenance and section-specific result lookups.
-- The existing UNIQUE(attempt_id, section_id) already covers attempt_id lookups.
CREATE INDEX IF NOT EXISTS idx_written_exam_section_results_section
  ON public.written_exam_section_results (section_id);

-- Load integrity events for an attempt in chronological order.
CREATE INDEX IF NOT EXISTS idx_written_exam_integrity_events_attempt_occurred
  ON public.written_exam_integrity_events (attempt_id, occurred_at DESC);

NOTIFY pgrst, 'reload schema';
