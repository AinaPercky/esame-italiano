-- Optimize the student class leaderboard without changing its result contract.
-- Build the active class membership set once instead of running a LATERAL
-- membership lookup for every submission row.

CREATE INDEX IF NOT EXISTS idx_quiz_submissions_leaderboard
  ON public.quiz_submissions (
    quiz_id,
    student_id,
    class_id,
    score_20 DESC,
    (CASE WHEN status = 'missed' THEN 1 ELSE 0 END),
    submitted_at DESC NULLS LAST,
    attempt_number DESC,
    id DESC
  )
  WHERE is_counted = TRUE;

CREATE OR REPLACE FUNCTION public.get_class_quiz_leaderboard()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_student_id TEXT;
  v_class_ids TEXT[];
  v_result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Session étudiant authentifiée requise.';
  END IF;

  IF public.quiz_is_teacher() THEN
    RAISE EXCEPTION 'Cette fonction est réservée aux comptes étudiants.';
  END IF;

  v_student_id := public.quiz_current_student_id();

  SELECT array_agg(DISTINCT ce.class_id::text)
  INTO v_class_ids
  FROM public.class_enrollments ce
  WHERE ce.student_id::text = v_student_id
    AND ce.status = 'active';

  IF coalesce(array_length(v_class_ids, 1), 0) = 0 THEN
    SELECT ARRAY[s.class_id::text]
    INTO v_class_ids
    FROM public.students s
    WHERE s.id::text = v_student_id
      AND s.class_id IS NOT NULL;
  END IF;

  IF coalesce(array_length(v_class_ids, 1), 0) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  WITH eligible_memberships AS (
    SELECT
      ce.student_id::text AS student_id,
      ce.class_id::text AS class_id
    FROM public.class_enrollments ce
    WHERE ce.status = 'active'
      AND ce.class_id::text = ANY(v_class_ids)

    UNION

    SELECT
      student_row.id::text AS student_id,
      student_row.class_id::text AS class_id
    FROM public.students student_row
    WHERE student_row.class_id IS NOT NULL
      AND student_row.class_id::text = ANY(v_class_ids)
      AND NOT EXISTS (
        SELECT 1
        FROM public.class_enrollments any_enrollment
        WHERE any_enrollment.student_id = student_row.id
      )
  ),
  candidate_rows AS (
    SELECT
      sub.id,
      sub.quiz_id,
      sub.quiz_title,
      sub.student_id,
      sub.student_name,
      sub.student_number,
      member.class_id,
      class_row.name AS class_name,
      sub.started_at,
      sub.submitted_at,
      '{}'::jsonb AS answers,
      sub.score,
      sub.max_score,
      sub.score_20,
      sub.status,
      '{}'::jsonb AS feedback,
      sub.date,
      sub.attempt_number,
      sub.launch_id,
      sub.attendance_status,
      NULL::uuid AS retry_grant_id,
      TRUE AS is_counted
    FROM public.quiz_submissions sub
    JOIN eligible_memberships member
      ON member.student_id = sub.student_id
    JOIN public.students student_row
      ON student_row.id::text = member.student_id
    JOIN public.quizzes q
      ON q.id = sub.quiz_id
    LEFT JOIN public.classes class_row
      ON class_row.id::text = member.class_id
    WHERE sub.is_counted = TRUE
      AND (sub.class_id IS NULL OR sub.class_id = member.class_id)
      AND member.class_id = ANY(
        coalesce(nullif(q.class_ids, ARRAY[]::text[]), ARRAY[q.class_id])
      )
  ),
  best_rows AS (
    SELECT DISTINCT ON (candidate.quiz_id, candidate.student_id, candidate.class_id)
      candidate.*
    FROM candidate_rows candidate
    ORDER BY
      candidate.quiz_id,
      candidate.student_id,
      candidate.class_id,
      candidate.score_20 DESC,
      CASE WHEN candidate.status = 'missed' THEN 1 ELSE 0 END ASC,
      candidate.submitted_at DESC NULLS LAST,
      candidate.attempt_number DESC,
      candidate.id DESC
  )
  SELECT coalesce(jsonb_agg(to_jsonb(best_rows)), '[]'::jsonb)
  INTO v_result
  FROM best_rows;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_class_quiz_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_quiz_leaderboard() TO authenticated;

NOTIFY pgrst, 'reload schema';
