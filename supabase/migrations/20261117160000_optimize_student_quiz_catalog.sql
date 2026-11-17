-- Speed up the student quiz catalog's three repeated lookup predicates.
-- Keep the existing RPC payload and visibility rules unchanged.

-- Match the approved-student identity lookup and its newest-record ordering.
CREATE INDEX IF NOT EXISTS idx_students_catalog_email_created_approved
  ON public.students (lower(email), created_at DESC)
  WHERE coalesce(validation_status, 'approved') = 'approved';

-- Cover the student's active class membership lookup used for each catalog candidate.
CREATE INDEX IF NOT EXISTS idx_class_enrollments_catalog_student_status_class
  ON public.class_enrollments (student_id, status, class_id);

-- The catalog intentionally includes quizzes with any historical submission,
-- even when the submission is not the currently counted/best attempt.
CREATE INDEX IF NOT EXISTS idx_quiz_submissions_catalog_quiz_student
  ON public.quiz_submissions (quiz_id, student_id);

NOTIFY pgrst, 'reload schema';
