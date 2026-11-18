-- Regression coverage for the authenticated student's multi-session oral history RPC.
-- Runs only in the isolated phase_b_rls_test database.
BEGIN;

-- Create one additional session in the student's primary class and one in a
-- second actively enrolled class. Also add a draft evaluation that must not count.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email":"ainapercky@gmail.com","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);

INSERT INTO public.exams (id,class_id,title,exam_date,status) VALUES
('20000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Deuxième session IUM-L2','2026-11-18','completed');

INSERT INTO public.exam_rubrics (id,exam_id,title,question,example_sentence,points,position) VALUES
('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','Expression','Expression orale','Esempio',20,1);

INSERT INTO public.class_enrollments (student_id,class_id,status) VALUES
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','active');

INSERT INTO public.evaluations (id,exam_id,student_id,total_score,status) VALUES
('40000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',16,'completed'),
('40000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',4,'completed'),
('40000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,'draft');

INSERT INTO public.evaluation_details (id,evaluation_id,rubric_id,is_validated,awarded_points,error_note) VALUES
('50000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000003',true,16,'Bonne fluidité.');

RESET ROLE;

-- Anonymous users must not be able to execute the authenticated-only RPC.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $test$
BEGIN
  IF has_function_privilege('anon','public.get_student_oral_exam_sessions()','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous users must not execute the student oral sessions RPC.';
  END IF;
END
$test$;
RESET ROLE;

-- The student sees only their completed sessions in their own active classes.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email":"student.one@example.com","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $test$
DECLARE
  v_sessions jsonb;
  v_class_one_count integer;
  v_class_two_count integer;
  v_total_count integer;
BEGIN
  IF NOT has_function_privilege('authenticated','public.get_student_oral_exam_sessions()','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated students must execute the oral sessions RPC.';
  END IF;

  v_sessions := public.get_student_oral_exam_sessions();
  v_total_count := jsonb_array_length(v_sessions);
  SELECT count(*) INTO v_class_one_count
  FROM jsonb_array_elements(v_sessions) item
  WHERE item->'class'->>'id' = '00000000-0000-4000-8000-000000000001';
  SELECT count(*) INTO v_class_two_count
  FROM jsonb_array_elements(v_sessions) item
  WHERE item->'class'->>'id' = '00000000-0000-4000-8000-000000000002';

  IF v_total_count <> 3 OR v_class_one_count <> 2 OR v_class_two_count <> 1 THEN
    RAISE EXCEPTION 'Expected 2 sessions in IUM-L2 and 1 in IUM-L3; got total %, class one %, class two %.',
      v_total_count, v_class_one_count, v_class_two_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_sessions) item
    WHERE item->'evaluation'->>'student_id' <> '10000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'The student oral sessions RPC exposed another student evaluation.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_sessions) item
    WHERE item->'evaluation'->>'status' <> 'completed'
  ) THEN
    RAISE EXCEPTION 'Draft evaluations must not appear in the student oral session history.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_sessions) item
    WHERE item->'exam'->>'id' = '20000000-0000-4000-8000-000000000003'
      AND (item->'evaluation'->>'max_score')::numeric = 20
      AND (item->'evaluation'->>'total_score')::numeric = 16
      AND jsonb_array_length(item->'evaluation'->'details') = 1
  ) THEN
    RAISE EXCEPTION 'The session response is missing its original scale or evaluation details.';
  END IF;
END
$test$;

RESET ROLE;
ROLLBACK;
