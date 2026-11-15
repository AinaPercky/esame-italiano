-- PerckyLingua: reconcile the canonical grade for every student/quiz pair.
-- Historical attempts are preserved; only the reference flag is repaired.
-- The ranking policy matches src/utils/quizBestAttempt.ts:
-- highest score, then real submission before a synthetic "missed" row on ties,
-- then latest submission, highest attempt number, and stable id.

WITH ranked_submissions AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY quiz_id, student_id
      ORDER BY
        coalesce(score_20, 0) DESC,
        CASE WHEN status = 'missed' THEN 1 ELSE 0 END ASC,
        submitted_at DESC NULLS LAST,
        coalesce(attempt_number, 1) DESC,
        id DESC
    ) AS rank_number
  FROM public.quiz_submissions
)
UPDATE public.quiz_submissions AS submission
SET is_counted = (ranked.rank_number = 1)
FROM ranked_submissions AS ranked
WHERE submission.id = ranked.id
  AND submission.is_counted IS DISTINCT FROM (ranked.rank_number = 1);

-- Index used by leaderboard/reference-grade retrieval.
CREATE INDEX IF NOT EXISTS idx_quiz_submissions_reference_lookup
  ON public.quiz_submissions (quiz_id, student_id, is_counted)
  WHERE is_counted = TRUE;

NOTIFY pgrst, 'reload schema';
