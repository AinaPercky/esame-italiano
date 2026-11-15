-- Secure class leaderboard for student sessions.
-- Students may read only their own full submissions (RLS). This RPC exposes
-- aggregate grade rows for active classmates, never answers or feedback.

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
  IF auth.role() <> 'authenticated' THEN
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

  SELECT coalesce(jsonb_agg(to_jsonb(best_rows)), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT DISTINCT ON (sub.quiz_id, sub.student_id, member.class_id)
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
    JOIN public.quizzes q ON q.id = sub.quiz_id
    JOIN public.students student_row ON student_row.id::text = sub.student_id
    JOIN LATERAL (
      SELECT ce.class_id::text AS class_id
      FROM public.class_enrollments ce
      WHERE ce.student_id::text = student_row.id::text
        AND ce.status = 'active'
        AND ce.class_id::text = ANY(v_class_ids)
      UNION
      SELECT student_row.class_id::text
      WHERE student_row.class_id IS NOT NULL
        AND student_row.class_id::text = ANY(v_class_ids)
        AND NOT EXISTS (
          SELECT 1 FROM public.class_enrollments any_enrollment
          WHERE any_enrollment.student_id::text = student_row.id::text
        )
    ) member ON TRUE
    LEFT JOIN public.classes class_row ON class_row.id::text = member.class_id
    WHERE sub.is_counted = TRUE
      AND (sub.class_id IS NULL OR sub.class_id = member.class_id)
      AND member.class_id = ANY(
        coalesce(nullif(q.class_ids, ARRAY[]::text[]), ARRAY[q.class_id])
      )
    ORDER BY
      sub.quiz_id,
      sub.student_id,
      member.class_id,
      sub.score_20 DESC,
      CASE WHEN sub.status = 'missed' THEN 1 ELSE 0 END ASC,
      sub.submitted_at DESC NULLS LAST,
      sub.attempt_number DESC,
      sub.id DESC
  ) AS best_rows;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_class_quiz_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_quiz_leaderboard() TO authenticated;

NOTIFY pgrst, 'reload schema';
