-- Regression test for anonymous access to privileged SECURITY DEFINER functions.
DO $test$
DECLARE
  v_function record;
  v_public_rpc_name text;
  v_public_rpc_names text[] := ARRAY[
    'get_public_quiz_catalog',
    'get_public_quiz',
    'evaluate_public_quiz_question'
  ];
BEGIN
  IF to_regprocedure('public.written_exam_auto_question_score(uuid,jsonb)') IS NOT NULL
     AND (
       has_function_privilege('anon', 'public.written_exam_auto_question_score(uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.written_exam_auto_question_score(uuid,jsonb)', 'EXECUTE')
     ) THEN
    RAISE EXCEPTION 'Private written-exam scorer is still executable by a client role.';
  END IF;

  IF to_regprocedure('public.grade_written_exam_attempt(uuid,jsonb)') IS NOT NULL THEN
    IF has_function_privilege('anon', 'public.grade_written_exam_attempt(uuid,jsonb)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Anonymous users can execute teacher grading.';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.grade_written_exam_attempt(uuid,jsonb)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Authenticated teacher RPC grant was not preserved.';
    END IF;
  END IF;

  IF to_regprocedure('public.grade_written_exam_expression_writing(uuid,numeric)') IS NOT NULL THEN
    IF has_function_privilege('anon', 'public.grade_written_exam_expression_writing(uuid,numeric)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Anonymous users can execute expression-writing grading.';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.grade_written_exam_expression_writing(uuid,numeric)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Authenticated expression-writing grading grant was not preserved.';
    END IF;
  END IF;

  IF to_regprocedure('public.submit_quiz_submission(jsonb)') IS NOT NULL
     AND has_function_privilege('anon', 'public.submit_quiz_submission(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous users can submit quiz results using a caller-supplied student ID.';
  END IF;

  FOR v_function IN
    SELECT p.oid::regprocedure AS signature, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT (p.proname = ANY(v_public_rpc_names))
  LOOP
    RAISE EXCEPTION 'Unexpected anon-executable SECURITY DEFINER function: %', v_function.signature;
  END LOOP;

  FOREACH v_public_rpc_name IN ARRAY v_public_rpc_names LOOP
    -- Some isolated CI schemas do not install the quiz module. When present,
    -- the public quiz RPCs must remain available to anonymous learners.
    IF v_public_rpc_name = 'get_public_quiz_catalog'
       AND to_regprocedure('public.get_public_quiz_catalog()') IS NOT NULL
       AND NOT has_function_privilege('anon', 'public.get_public_quiz_catalog()', 'EXECUTE') THEN
      RAISE EXCEPTION 'Public quiz catalogue was accidentally closed.';
    END IF;
    IF v_public_rpc_name = 'get_public_quiz'
       AND to_regprocedure('public.get_public_quiz(text)') IS NOT NULL
       AND NOT has_function_privilege('anon', 'public.get_public_quiz(text)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Public quiz retrieval was accidentally closed.';
    END IF;
    IF v_public_rpc_name = 'evaluate_public_quiz_question'
       AND to_regprocedure('public.evaluate_public_quiz_question(text,text,text)') IS NOT NULL
       AND NOT has_function_privilege('anon', 'public.evaluate_public_quiz_question(text,text,text)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Public quiz correction was accidentally closed.';
    END IF;
  END LOOP;
END
$test$;
