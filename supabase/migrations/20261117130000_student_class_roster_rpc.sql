-- Return only the authenticated student's own profile and a minimal roster
-- of approved students sharing one of their active classes.
-- Classmates' email, gender, avatar and timestamps are intentionally omitted.

CREATE OR REPLACE FUNCTION public.get_student_class_roster()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_student_id TEXT;
  v_class_ids TEXT[];
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

  -- Compatibility with accounts that still have only the legacy class_id.
  IF coalesce(array_length(v_class_ids, 1), 0) = 0 THEN
    SELECT ARRAY[s.class_id::text]
    INTO v_class_ids
    FROM public.students s
    WHERE s.id::text = v_student_id
      AND s.class_id IS NOT NULL;
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'class_id', s.class_id,
        'class_ids', coalesce(memberships.class_ids, ARRAY[]::text[]),
        'first_name', s.first_name,
        'last_name', s.last_name,
        'student_number', s.student_number,
        'validation_status', coalesce(s.validation_status, 'approved'),
        'email', CASE WHEN s.id::text = v_student_id THEN s.email ELSE '' END,
        'gender', CASE WHEN s.id::text = v_student_id THEN s.gender ELSE NULL END,
        'avatar_url', CASE WHEN s.id::text = v_student_id THEN s.avatar_url ELSE NULL END,
        'created_at', CASE WHEN s.id::text = v_student_id THEN s.created_at ELSE NULL END,
        'updated_at', CASE WHEN s.id::text = v_student_id THEN s.updated_at ELSE NULL END
      )
      ORDER BY s.last_name, s.first_name, s.id
    ), '[]'::jsonb)
    FROM public.students s
    LEFT JOIN LATERAL (
      SELECT array_agg(DISTINCT member.class_id) AS class_ids
      FROM (
        SELECT ce.class_id::text AS class_id
        FROM public.class_enrollments ce
        WHERE ce.student_id = s.id
          AND ce.status = 'active'
        UNION
        SELECT s.class_id::text
        WHERE s.class_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.class_enrollments any_enrollment
            WHERE any_enrollment.student_id = s.id
          )
      ) member
    ) memberships ON TRUE
    WHERE coalesce(s.validation_status, 'approved') = 'approved'
      AND (
        s.id::text = v_student_id
        OR EXISTS (
          SELECT 1
          FROM unnest(coalesce(v_class_ids, ARRAY[]::text[])) AS class_id
          WHERE class_id = ANY(coalesce(memberships.class_ids, ARRAY[]::text[]))
        )
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_class_roster() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_class_roster() TO authenticated;

NOTIFY pgrst, 'reload schema';
