BEGIN;

-- Anonymous clients have no direct table privileges except SELECT on active classes.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $test$
DECLARE
  v_report jsonb;
  v_registration jsonb;
BEGIN
  IF has_table_privilege('anon','public.students','SELECT')
     OR has_table_privilege('anon','public.exams','SELECT')
     OR has_table_privilege('anon','public.exam_rubrics','SELECT')
     OR has_table_privilege('anon','public.evaluations','SELECT')
     OR has_table_privilege('anon','public.evaluation_details','SELECT')
     OR has_table_privilege('anon','public.exam_pass_order','SELECT') THEN
    RAISE EXCEPTION 'Anonymous role still has direct read access to private school tables.';
  END IF;

  IF NOT has_table_privilege('anon','public.classes','SELECT')
     OR has_table_privilege('anon','public.classes','INSERT')
     OR has_table_privilege('anon','public.classes','UPDATE')
     OR has_table_privilege('anon','public.classes','DELETE') THEN
    RAISE EXCEPTION 'Anonymous class access is not read-only.';
  END IF;

  IF (SELECT count(*) FROM public.classes) <> 2 THEN
    RAISE EXCEPTION 'Anonymous class listing must hide archived classes.';
  END IF;

  IF NOT has_function_privilege('anon','public.get_public_oral_report(uuid,uuid,text)','EXECUTE')
     OR NOT has_function_privilege('anon','public.prepare_student_registration(text,text,text,text,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Required public QR or registration RPC is not executable by anon.';
  END IF;

  v_report := public.get_public_oral_report(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    NULL
  );
  IF v_report IS NULL OR v_report->'student'->>'id' <> '10000000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'Public QR report did not return the requested student report.';
  END IF;
  IF v_report->'student' ? 'email' OR v_report->'student' ? 'validation_status' THEN
    RAISE EXCEPTION 'Public QR report exposed private student fields.';
  END IF;
  IF (v_report->'evaluation'->>'total_score')::numeric <> 4
     OR jsonb_array_length(v_report->'rubrics') <> 1
     OR jsonb_array_length(v_report->'evaluation'->'details') <> 1 THEN
    RAISE EXCEPTION 'Public QR report is missing required score or rubric details.';
  END IF;

  v_registration := public.prepare_student_registration(
    'New', 'Student', 'femme', 'NEW-001',
    '00000000-0000-4000-8000-000000000001',
    'new.student@example.com'
  );
  IF v_registration->>'id' IS NULL
     OR v_registration->>'validation_status' <> 'pending' THEN
    RAISE EXCEPTION 'Public registration must create a pending student profile.';
  END IF;
  PERFORM set_config('test.new_student_id', v_registration->>'id', true);
END
$test$;

RESET ROLE;

-- The public registration RPC cannot write a non-pending profile.
DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.students
    WHERE id = current_setting('test.new_student_id')::uuid
      AND validation_status = 'pending'
      AND email = 'new.student@example.com'
  ) THEN
    RAISE EXCEPTION 'The new student record was not persisted as pending.';
  END IF;
END
$test$;

-- A student can read their own profile, class exams, evaluation and queue row only.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email":"student.one@example.com","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $test$
DECLARE
  v_roster jsonb;
  v_rows integer;
BEGIN
  IF (SELECT count(*) FROM public.students) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.students WHERE id='10000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'Student can read another profile or cannot read their own.';
  END IF;
  IF (SELECT count(*) FROM public.exams) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.exams WHERE id='20000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'Student exam access is not restricted to enrolled classes.';
  END IF;
  IF (SELECT count(*) FROM public.exam_rubrics) <> 1
     OR (SELECT count(*) FROM public.evaluations) <> 1
     OR (SELECT count(*) FROM public.evaluation_details) <> 1
     OR (SELECT count(*) FROM public.exam_pass_order) <> 1 THEN
    RAISE EXCEPTION 'Student evaluation, rubric or pass-order access is not scoped to their own record.';
  END IF;

  v_roster := public.get_student_class_roster();
  IF jsonb_array_length(v_roster) <> 2 THEN
    RAISE EXCEPTION 'Student class roster should contain only the two active classmates.';
  END IF;
  IF v_roster::text LIKE '%student.one@example.com%' OR v_roster::text LIKE '%student.two@example.com%' THEN
    RAISE EXCEPTION 'Student class roster must not expose e-mail addresses.';
  END IF;

  UPDATE public.students SET validation_status='approved'
  WHERE id='10000000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'Student was able to update a classmate profile.';
  END IF;
END
$test$;

RESET ROLE;

-- The teacher account retains access to the full school register and evaluations.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email":"ainapercky@gmail.com","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
DO $test$
DECLARE
  v_rows integer;
BEGIN
  IF NOT public.class_enrollment_is_teacher() THEN
    RAISE EXCEPTION 'Teacher role helper did not recognize the configured teacher account.';
  END IF;
  IF (SELECT count(*) FROM public.students) <> 4
     OR (SELECT count(*) FROM public.exams) <> 2
     OR (SELECT count(*) FROM public.evaluations) <> 3 THEN
    RAISE EXCEPTION 'Teacher access to complete school records was not preserved.';
  END IF;

  UPDATE public.students SET gender='femme'
  WHERE id='10000000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Teacher could not update a student record.';
  END IF;
END
$test$;

RESET ROLE;

-- A newly authenticated registrant can finalize their pending registration by
-- their own JWT e-mail only; no target student ID can be supplied by the caller.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","email":"new.student@example.com","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
DO $test$
BEGIN
  IF public.finalize_student_registration() IS NULL THEN
    RAISE EXCEPTION 'Registration finalization did not return the authenticated student ID.';
  END IF;
END
$test$;

RESET ROLE;
ROLLBACK;
