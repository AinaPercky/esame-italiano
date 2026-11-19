-- Allow one oral exam to target one, several, or every class.
-- Keep exams.class_id as the legacy/main class for historical consumers.
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.oral_exam_classes (
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (exam_id, class_id)
);

CREATE INDEX IF NOT EXISTS idx_oral_exam_classes_class_id
  ON public.oral_exam_classes(class_id);
CREATE INDEX IF NOT EXISTS idx_oral_exam_classes_exam_id
  ON public.oral_exam_classes(exam_id);

-- Backfill every existing exam with its former single class assignment.
INSERT INTO public.oral_exam_classes (exam_id, class_id)
SELECT e.id, e.class_id
FROM public.exams e
WHERE e.class_id IS NOT NULL
ON CONFLICT (exam_id, class_id) DO NOTHING;

ALTER TABLE public.oral_exam_classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oral_exam_classes_teacher_manage ON public.oral_exam_classes;
CREATE POLICY oral_exam_classes_teacher_manage
  ON public.oral_exam_classes FOR ALL TO authenticated
  USING (public.class_enrollment_is_teacher())
  WITH CHECK (public.class_enrollment_is_teacher());

-- Students can read an exam only when it is global or assigned to one of
-- their active classes (including their legacy primary class).
DROP POLICY IF EXISTS exams_student_read_enrolled ON public.exams;
CREATE POLICY exams_student_read_enrolled
  ON public.exams FOR SELECT TO authenticated
  USING (
    exams.is_global
    OR EXISTS (
      SELECT 1
      FROM public.oral_exam_classes oec
      WHERE oec.exam_id = exams.id
        AND (
          EXISTS (
            SELECT 1
            FROM public.class_enrollments ce
            WHERE ce.student_id = public.class_enrollment_current_student_id()
              AND ce.class_id = oec.class_id
              AND ce.status = 'active'
          )
          OR EXISTS (
            SELECT 1
            FROM public.students s
            WHERE s.id = public.class_enrollment_current_student_id()
              AND s.class_id = oec.class_id
          )
        )
    )
  );

-- Public QR reports retain their existing privacy model but accept exams
-- assigned to any active class of the evaluated student, or globally.
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
  IF p_exam_id IS NULL THEN
    IF auth.uid() IS NULL THEN RETURN NULL; END IF;
    v_target_student_id := public.class_enrollment_current_student_id();
    IF v_target_student_id IS NULL THEN RETURN NULL; END IF;
  ELSE
    v_target_student_id := p_student_id;
    IF v_target_student_id IS NULL
       AND nullif(btrim(coalesce(p_lookup, '')), '') IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'student', pg_catalog.jsonb_build_object(
      'id', s.id, 'class_id', s.class_id, 'first_name', s.first_name,
      'last_name', s.last_name, 'gender', s.gender,
      'student_number', s.student_number, 'avatar_url', s.avatar_url
    ),
    'exam', pg_catalog.jsonb_build_object(
      'id', e.id, 'class_id', e.class_id, 'title', e.title,
      'description', e.description, 'level', e.level, 'exam_date', e.exam_date,
      'status', e.status, 'created_at', e.created_at, 'class_name', c.name,
      'is_global', e.is_global
    ),
    'rubrics', coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', r.id, 'exam_id', r.exam_id, 'title', r.title,
        'question', r.question, 'example_sentence', r.example_sentence,
        'points', r.points, 'position', r.position
      ) ORDER BY r.position)
      FROM public.exam_rubrics r WHERE r.exam_id = e.id
    ), '[]'::jsonb),
    'evaluation', pg_catalog.jsonb_build_object(
      'id', ev.id, 'exam_id', ev.exam_id, 'student_id', ev.student_id,
      'total_score', ev.total_score, 'status', ev.status,
      'max_duration_seconds', ev.max_duration_seconds,
      'duration_used_seconds', ev.duration_used_seconds,
      'timer_status', ev.timer_status, 'created_at', ev.created_at,
      'updated_at', ev.updated_at,
      'details', coalesce((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'rubric_id', d.rubric_id, 'is_validated', d.is_validated,
          'awarded_points', d.awarded_points, 'error_note', d.error_note
        ))
        FROM public.evaluation_details d WHERE d.evaluation_id = ev.id
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
        v_target_student_id IS NULL AND p_exam_id IS NOT NULL
        AND p_student_id IS NULL
        AND nullif(btrim(coalesce(p_lookup, '')), '') IS NOT NULL
        AND lower(btrim(s.email)) = lower(btrim(p_lookup))
      )
    )
    AND (
      e.is_global
      OR EXISTS (
        SELECT 1 FROM public.oral_exam_classes oec
        WHERE oec.exam_id = e.id
          AND (
            oec.class_id = s.class_id
            OR EXISTS (
              SELECT 1 FROM public.class_enrollments ce
              WHERE ce.student_id = s.id
                AND ce.class_id = oec.class_id
                AND ce.status = 'active'
            )
          )
      )
    )
  ORDER BY ev.updated_at DESC
  LIMIT 1;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_public_oral_report(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_oral_report(uuid,uuid,text) TO anon, authenticated;

-- Keep the student oral-history RPC consistent with multi-class and global
-- exam assignments. The historical display class remains the primary class.
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
  IF auth.uid() IS NULL THEN RETURN '[]'::jsonb; END IF;
  v_student_id := public.class_enrollment_current_student_id();
  IF v_student_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'class', jsonb_build_object('id', c.id, 'name', c.name),
      'exam', jsonb_build_object(
        'id', e.id, 'class_id', e.class_id, 'title', e.title,
        'description', e.description, 'level', e.level,
        'exam_date', e.exam_date, 'status', e.status,
        'created_at', e.created_at, 'class_name', c.name,
        'is_global', e.is_global
      ),
      'rubrics', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id, 'exam_id', r.exam_id, 'title', r.title,
          'question', r.question, 'example_sentence', r.example_sentence,
          'points', r.points, 'position', r.position
        ) ORDER BY r.position)
        FROM public.exam_rubrics r WHERE r.exam_id = e.id
      ), '[]'::jsonb),
      'evaluation', jsonb_build_object(
        'id', ev.id, 'exam_id', ev.exam_id, 'student_id', ev.student_id,
        'total_score', ev.total_score,
        'max_score', coalesce((
          SELECT nullif(sum(r.points), 0) FROM public.exam_rubrics r WHERE r.exam_id = e.id
        ), 10),
        'status', ev.status, 'max_duration_seconds', ev.max_duration_seconds,
        'duration_used_seconds', ev.duration_used_seconds,
        'timer_status', ev.timer_status, 'created_at', ev.created_at,
        'updated_at', ev.updated_at,
        'details', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'rubric_id', d.rubric_id, 'is_validated', d.is_validated,
            'awarded_points', d.awarded_points, 'error_note', d.error_note
          ))
          FROM public.evaluation_details d WHERE d.evaluation_id = ev.id
        ), '[]'::jsonb)
      )
    )
    ORDER BY c.name, e.exam_date DESC, e.created_at DESC, ev.updated_at DESC
  ), '[]'::jsonb)
  INTO v_sessions
  FROM public.evaluations ev
  JOIN public.students s ON s.id = ev.student_id
  JOIN public.exams e ON e.id = ev.exam_id
  JOIN public.classes c ON c.id = e.class_id
  WHERE ev.student_id = v_student_id
    AND ev.status = 'completed'
    AND (
      e.is_global
      OR EXISTS (
        SELECT 1 FROM public.oral_exam_classes oec
        WHERE oec.exam_id = e.id
          AND (
            oec.class_id = s.class_id
            OR EXISTS (
              SELECT 1 FROM public.class_enrollments ce
              WHERE ce.student_id = s.id
                AND ce.class_id = oec.class_id
                AND ce.status = 'active'
            )
          )
      )
    );

  RETURN v_sessions;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_student_oral_exam_sessions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_oral_exam_sessions() TO authenticated;

COMMENT ON TABLE public.oral_exam_classes IS
  'Classes assigned to oral exams. exams.is_global=true means every current and future class.';
NOTIFY pgrst, 'reload schema';
