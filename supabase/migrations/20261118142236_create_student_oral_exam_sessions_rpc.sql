-- Student oral-exam history: one row per completed evaluation, grouped by class.
-- The student identity is always resolved from the authenticated JWT; no student
-- identifier is accepted from the browser.
CREATE OR REPLACE FUNCTION public.get_student_oral_exam_sessions()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_student_id uuid;
  v_sessions jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_student_id := public.class_enrollment_current_student_id();
  IF v_student_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'class', jsonb_build_object(
          'id', c.id,
          'name', c.name
        ),
        'exam', jsonb_build_object(
          'id', e.id,
          'class_id', e.class_id,
          'title', e.title,
          'description', e.description,
          'level', e.level,
          'exam_date', e.exam_date,
          'status', e.status,
          'created_at', e.created_at,
          'class_name', c.name
        ),
        'rubrics', coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', r.id,
              'exam_id', r.exam_id,
              'title', r.title,
              'question', r.question,
              'example_sentence', r.example_sentence,
              'points', r.points,
              'position', r.position
            ) ORDER BY r.position
          )
          FROM public.exam_rubrics r
          WHERE r.exam_id = e.id
        ), '[]'::jsonb),
        'evaluation', jsonb_build_object(
          'id', ev.id,
          'exam_id', ev.exam_id,
          'student_id', ev.student_id,
          'total_score', ev.total_score,
          'max_score', coalesce((
            SELECT nullif(sum(r.points), 0)
            FROM public.exam_rubrics r
            WHERE r.exam_id = e.id
          ), 10),
          'status', ev.status,
          'max_duration_seconds', ev.max_duration_seconds,
          'duration_used_seconds', ev.duration_used_seconds,
          'timer_status', ev.timer_status,
          'created_at', ev.created_at,
          'updated_at', ev.updated_at,
          'details', coalesce((
            SELECT jsonb_agg(
              jsonb_build_object(
                'rubric_id', d.rubric_id,
                'is_validated', d.is_validated,
                'awarded_points', d.awarded_points,
                'error_note', d.error_note
              )
            )
            FROM public.evaluation_details d
            WHERE d.evaluation_id = ev.id
          ), '[]'::jsonb)
        )
      )
      ORDER BY c.name, e.exam_date DESC, e.created_at DESC, ev.updated_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_sessions
  FROM public.evaluations ev
  JOIN public.students s ON s.id = ev.student_id
  JOIN public.exams e ON e.id = ev.exam_id
  JOIN public.classes c ON c.id = e.class_id
  WHERE ev.student_id = v_student_id
    AND ev.status = 'completed'
    AND (
      s.class_id = e.class_id
      OR EXISTS (
        SELECT 1
        FROM public.class_enrollments ce
        WHERE ce.student_id = s.id
          AND ce.class_id = e.class_id
          AND ce.status = 'active'
      )
    );

  RETURN v_sessions;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_student_oral_exam_sessions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_oral_exam_sessions() TO authenticated;

COMMENT ON FUNCTION public.get_student_oral_exam_sessions() IS
  'Returns completed oral-exam sessions belonging to the authenticated student, grouped by enrolled class.';

NOTIFY pgrst, 'reload schema';
