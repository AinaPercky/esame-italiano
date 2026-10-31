-- Remove a student's quiz history atomically when their roster entry is deleted.
-- quiz_submissions.student_id is TEXT for legacy ID compatibility, so it cannot
-- use a direct foreign key to students.id without a potentially destructive conversion.
CREATE OR REPLACE FUNCTION public.delete_student_quiz_submissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.quiz_submissions
  WHERE student_id = OLD.id::text;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_student_quiz_submissions() FROM PUBLIC;

DROP TRIGGER IF EXISTS delete_student_quiz_submissions ON public.students;
CREATE TRIGGER delete_student_quiz_submissions
BEFORE DELETE ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.delete_student_quiz_submissions();
