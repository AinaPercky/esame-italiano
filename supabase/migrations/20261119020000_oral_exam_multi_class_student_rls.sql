-- Students need a narrowly scoped SELECT path through the exam/class
-- junction so the exams RLS predicate can verify their class assignments.
DROP POLICY IF EXISTS oral_exam_classes_student_read ON public.oral_exam_classes;
CREATE POLICY oral_exam_classes_student_read
  ON public.oral_exam_classes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.class_enrollments ce
      WHERE ce.student_id = public.class_enrollment_current_student_id()
        AND ce.class_id = oral_exam_classes.class_id
        AND ce.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = public.class_enrollment_current_student_id()
        AND s.class_id = oral_exam_classes.class_id
    )
  );

-- A global exam is still visible only to a verified student profile.
DROP POLICY IF EXISTS exams_student_read_enrolled ON public.exams;
CREATE POLICY exams_student_read_enrolled
  ON public.exams FOR SELECT TO authenticated
  USING (
    public.class_enrollment_current_student_id() IS NOT NULL
    AND (
      exams.is_global
      OR EXISTS (
        SELECT 1
        FROM public.oral_exam_classes oec
        WHERE oec.exam_id = exams.id
      )
    )
  );

NOTIFY pgrst, 'reload schema';
