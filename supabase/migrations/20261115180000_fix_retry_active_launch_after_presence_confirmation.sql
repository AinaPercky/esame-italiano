-- Keep a teacher-authorized retry visible after the student has confirmed presence.
-- A confirmed retry remains available until the corresponding retry grant is submitted/consumed.
CREATE OR REPLACE FUNCTION public.get_student_active_launch(p_quiz_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student TEXT := public.quiz_current_student_id();
  v_row JSONB;
BEGIN
  SELECT jsonb_build_object(
    'launch', to_jsonb(l),
    'participant', to_jsonb(p)
  )
  INTO v_row
  FROM public.quiz_launches l
  JOIN public.quiz_participants p ON p.launch_id = l.id
  WHERE l.quiz_id = p_quiz_id
    AND l.status = 'launched'
    AND p.student_id = v_student
    AND (
      p.presence_status IN ('pending', 'present')
      OR (
        p.presence_status = 'retry_authorized'
        AND EXISTS (
          SELECT 1
          FROM public.quiz_retry_grants g
          WHERE g.quiz_id = p.quiz_id
            AND g.student_id = p.student_id
            AND (g.launch_id = p.launch_id OR g.launch_id IS NULL)
            AND g.used_at IS NULL
            AND g.revoked_at IS NULL
            AND (g.expires_at IS NULL OR g.expires_at > now())
            AND g.used_attempts < g.max_attempts
        )
      )
    )
  ORDER BY l.launched_at DESC
  LIMIT 1;

  RETURN COALESCE(v_row, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_active_launch(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_active_launch(TEXT) TO authenticated;
NOTIFY pgrst, 'reload schema';
