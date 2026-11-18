-- Restore the public oral-exam QR report RPC.
-- The application calls this by named arguments; PostgreSQL identity order is
-- (p_exam_id uuid, p_student_id uuid, p_lookup text).
CREATE OR REPLACE FUNCTION public.get_public_oral_report(
  p_exam_id uuid,
  p_student_id uuid DEFAULT NULL,
  p_lookup text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
  v_target_student_id uuid;
BEGIN
  -- Student portal: never trust a client-supplied student identifier.
  IF p_exam_id IS NULL THEN
    IF auth.uid() IS NULL THEN
      RETURN NULL;
    END IF;
    v_target_student_id := public.class_enrollment_current_student_id();
    IF v_target_student_id IS NULL THEN
      RETURN NULL;
    END IF;
  ELSE
    -- Public QR: require either a student UUID or an e-mail lookup.
    v_target_student_id := p_student_id;
    IF v_target_student_id IS NULL
       AND nullif(btrim(coalesce(p_lookup, '')), '') IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'student', pg_catalog.jsonb_build_object(
      'id', s.id,
      'class_id', s.class_id,
      'first_name', s.first_name,
      'last_name', s.last_name,
      'gender', s.gender,
      'student_number', s.student_number,
      'avatar_url', s.avatar_url
    ),
    'exam', pg_catalog.jsonb_build_object(
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
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
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
    'evaluation', pg_catalog.jsonb_build_object(
      'id', ev.id,
      'exam_id', ev.exam_id,
      'student_id', ev.student_id,
      'total_score', ev.total_score,
      'status', ev.status,
      'max_duration_seconds', ev.max_duration_seconds,
      'duration_used_seconds', ev.duration_used_seconds,
      'timer_status', ev.timer_status,
      'created_at', ev.created_at,
      'updated_at', ev.updated_at,
      'details', coalesce((
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
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
  INTO v_result
  FROM public.evaluations ev
  JOIN public.students s ON s.id = ev.student_id
  JOIN public.exams e ON e.id = ev.exam_id
  JOIN public.classes c ON c.id = e.class_id
  WHERE (p_exam_id IS NULL OR ev.exam_id = p_exam_id)
    AND (
      (v_target_student_id IS NOT NULL AND s.id = v_target_student_id)
      OR (
        v_target_student_id IS NULL
        AND p_exam_id IS NOT NULL
        AND p_student_id IS NULL
        AND nullif(btrim(coalesce(p_lookup, '')), '') IS NOT NULL
        AND lower(btrim(s.email)) = lower(btrim(p_lookup))
      )
    )
    AND (
      s.class_id = e.class_id
      OR EXISTS (
        SELECT 1
        FROM public.class_enrollments ce
        WHERE ce.student_id = s.id
          AND ce.class_id = e.class_id
          AND ce.status = 'active'
      )
    )
  ORDER BY ev.updated_at DESC
  LIMIT 1;

  RETURN v_result;
END;
$function$;

-- QR reports are an intentional public endpoint; keep the grant scoped to this
-- single function and do not expose the underlying school tables to anon.
REVOKE ALL ON FUNCTION public.get_public_oral_report(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_oral_report(uuid,uuid,text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
