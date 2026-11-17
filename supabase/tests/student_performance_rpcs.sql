-- End-to-end tests for the two student performance RPC migrations.
INSERT INTO public.classes (id, name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Classe A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Classe B');

INSERT INTO public.students
  (id, class_id, first_name, last_name, email, student_number, validation_status, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ada', 'Etudiante', 'ada@example.test', 'A001', 'approved', now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Luca', 'Camarade', 'luca-private@example.test', 'A002', 'approved', now(), now()),
  ('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Mia', 'AutreClasse', 'mia@example.test', 'B003', 'approved', now(), now());

INSERT INTO public.class_enrollments (student_id, class_id, status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'active'),
  ('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'active');

INSERT INTO public.quizzes (id, class_id, class_ids)
VALUES ('quiz-a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']);

INSERT INTO public.quiz_submissions
  (id, quiz_id, quiz_title, student_id, student_name, student_number, class_id,
   class_name, submitted_at, answers, score, max_score, score_20, status,
   feedback, attempt_number, is_counted)
VALUES
  ('sub-ada', 'quiz-a', 'Quiz A', '11111111-1111-1111-1111-111111111111',
   'Ada Etudiante', 'A001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Classe A',
   now(), '{"q1":"a"}', 16, 20, 16, 'submitted', '{"q1":"ok"}', 1, true),
  ('sub-luca-missed', 'quiz-a', 'Quiz A', '22222222-2222-2222-2222-222222222222',
   'Luca Camarade', 'A002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Classe A',
   now() - interval '1 day', '{}', 18, 20, 18, 'missed', '{}', 1, true),
  ('sub-luca-submitted', 'quiz-a', 'Quiz A', '22222222-2222-2222-2222-222222222222',
   'Luca Camarade', 'A002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Classe A',
   now(), '{"q1":"b"}', 18, 20, 18, 'submitted', '{"q1":"ok"}', 2, true),
  ('sub-mia', 'quiz-a', 'Quiz A', '33333333-3333-3333-3333-333333333333',
   'Mia AutreClasse', 'B003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Classe B',
   now(), '{}', 20, 20, 20, 'submitted', '{}', 1, true);

UPDATE public.quizzes
SET questions = '[{"id":"question-1","expected":"a"},{"id":"question-2","expected":"b"}]'::jsonb,
    attendance_mode = 'open',
    status = 'launched'
WHERE id = 'quiz-a';

SET ROLE authenticated;

DO $$
DECLARE
  roster jsonb;
  leaderboard jsonb;
  luca jsonb;
  item_count integer;
  error_message text;
BEGIN
  IF has_function_privilege('anon', 'public.get_student_class_roster()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute get_student_class_roster';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_student_class_roster()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must execute get_student_class_roster';
  END IF;
  IF has_function_privilege('anon', 'public.get_class_quiz_leaderboard()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute get_class_quiz_leaderboard';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_class_quiz_leaderboard()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must execute get_class_quiz_leaderboard';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_quiz_submissions_leaderboard'
  ) THEN
    RAISE EXCEPTION 'leaderboard partial index was not created';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
  PERFORM set_config('test.student_id', '11111111-1111-1111-1111-111111111111', false);
  PERFORM set_config('test.is_teacher', 'false', false);

  roster := public.get_student_class_roster();
  item_count := jsonb_array_length(roster);
  IF item_count <> 2 THEN
    RAISE EXCEPTION 'expected only self and one active classmate in roster, got %', item_count;
  END IF;
  IF NOT roster @> '[{"id":"11111111-1111-1111-1111-111111111111","email":"ada@example.test"}]'::jsonb THEN
    RAISE EXCEPTION 'student must receive their own full profile';
  END IF;
  IF NOT roster @> '[{"id":"22222222-2222-2222-2222-222222222222","email":"","class_ids":["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]}]'::jsonb THEN
    RAISE EXCEPTION 'classmate must receive only minimal shared-class data';
  END IF;
  IF roster @> '[{"id":"33333333-3333-3333-3333-333333333333"}]'::jsonb THEN
    RAISE EXCEPTION 'student from another class must not appear in roster';
  END IF;

  leaderboard := public.get_class_quiz_leaderboard();
  item_count := jsonb_array_length(leaderboard);
  IF item_count <> 2 THEN
    RAISE EXCEPTION 'expected two leaderboard rows, got %', item_count;
  END IF;
  SELECT value INTO luca
  FROM jsonb_array_elements(leaderboard)
  WHERE value->>'student_id' = '22222222-2222-2222-2222-222222222222';
  IF luca IS NULL THEN
    RAISE EXCEPTION 'active classmate missing from leaderboard';
  END IF;
  IF luca->>'id' <> 'sub-luca-submitted' THEN
    RAISE EXCEPTION 'best-attempt tie-breaker did not prefer submitted row: %', luca->>'id';
  END IF;
  IF luca->'answers' <> '{}'::jsonb OR luca->'feedback' <> '{}'::jsonb THEN
    RAISE EXCEPTION 'leaderboard must not expose answers or feedback';
  END IF;
  IF leaderboard @> '[{"student_id":"33333333-3333-3333-3333-333333333333"}]'::jsonb THEN
    RAISE EXCEPTION 'student from another class must not appear in leaderboard';
  END IF;

  PERFORM set_config('test.is_teacher', 'true', false);
  BEGIN
    PERFORM public.get_student_class_roster();
    RAISE EXCEPTION 'teacher unexpectedly executed student roster RPC';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
    IF error_message <> 'Cette fonction est réservée aux comptes étudiants.' THEN
      RAISE;
    END IF;
  END;
  BEGIN
    PERFORM public.get_class_quiz_leaderboard();
    RAISE EXCEPTION 'teacher unexpectedly executed student leaderboard RPC';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
    IF error_message <> 'Cette fonction est réservée aux comptes étudiants.' THEN
      RAISE;
    END IF;
  END;

  PERFORM set_config('test.is_teacher', 'false', false);
  PERFORM set_config('test.student_id', '11111111-1111-1111-1111-111111111111', false);
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_class_enrollments_student_text_active'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_students_id_text_class_lookup'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_quiz_attempts_quiz_student_attempt'
  ) THEN
    RAISE EXCEPTION 'One or more grading lookup indexes are missing';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.evaluate_quiz_question(text,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated must execute evaluate_quiz_question';
  END IF;
  IF has_function_privilege(
    'anon',
    'public.evaluate_quiz_question(text,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon must not execute evaluate_quiz_question';
  END IF;

  IF public.evaluate_quiz_question('quiz-a', 'question-1', 'a')->>'correct' <> 'true' THEN
    RAISE EXCEPTION 'question 1 grading returned an unexpected result';
  END IF;
  IF public.evaluate_quiz_question('quiz-a', 'question-2', 'b')->>'correct' <> 'true' THEN
    RAISE EXCEPTION 'question 2 grading returned an unexpected result';
  END IF;
  IF (public.test_question_evaluation_counts(
    'quiz-a', '11111111-1111-1111-1111-111111111111'
  )->>'attempts')::integer <> 1 THEN
    RAISE EXCEPTION 'answers in the same quiz attempt must share one attempt number';
  END IF;
  IF (public.test_question_evaluation_counts(
    'quiz-a', '11111111-1111-1111-1111-111111111111'
  )->>'total')::integer <> 2 THEN
    RAISE EXCEPTION 'both question answers must be persisted';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', false);
  BEGIN
    PERFORM public.evaluate_quiz_question('quiz-a', 'question-1', 'a');
    RAISE EXCEPTION 'unauthenticated user unexpectedly evaluated a question';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
    IF error_message <> 'Session étudiant authentifiée requise.' THEN
      RAISE;
    END IF;
  END;
END;
$;

RESET ROLE;
