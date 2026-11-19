-- Keep oral exam assignment data private to authenticated school users.
-- Older installations may still have the permissive bootstrap policy.
DROP POLICY IF EXISTS "Exams full access" ON public.exams;
DROP POLICY IF EXISTS exams_teacher_manage ON public.exams;
CREATE POLICY exams_teacher_manage
  ON public.exams FOR ALL TO authenticated
  USING (public.class_enrollment_is_teacher())
  WITH CHECK (public.class_enrollment_is_teacher());

-- The junction table is not a public API. Teachers manage assignments;
-- verified students only read their own class assignments.
REVOKE ALL ON TABLE public.oral_exam_classes FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.oral_exam_classes FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.oral_exam_classes TO authenticated;

REVOKE ALL ON TABLE public.exams FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.exams FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exams TO authenticated;

NOTIFY pgrst, 'reload schema';
