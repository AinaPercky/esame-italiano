-- Regression tests for anonymous access to privileged SECURITY DEFINER functions.
DO $test$
DECLARE
  v_function record;
  v_signature text;
  v_function_oid regprocedure;
  v_public_rpc_signatures text[] := ARRAY[
    'public.get_public_quiz_catalog()',
    'public.get_public_quiz(text)',
    'public.evaluate_public_quiz_question(text,text,text)'
  ];
BEGIN
  -- Every installed public-practice RPC must remain callable by anon.
  FOREACH v_signature IN ARRAY v_public_rpc_signatures LOOP
    v_function_oid := to_regprocedure(v_signature);
    IF v_function_oid IS NOT NULL
       AND NOT has_function_privilege('anon', v_function_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Required public practice RPC is not executable by anon: %', v_signature;
    END IF;
  END LOOP;

  -- No other SECURITY DEFINER function in public may be executable by anon.
  FOR v_function IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(v_public_rpc_signatures) AS allowed(signature)
        WHERE to_regprocedure(allowed.signature)::oid = p.oid
      )
  LOOP
    RAISE EXCEPTION 'Unexpected anon-executable SECURITY DEFINER function: %', v_function.signature;
  END LOOP;

  -- Trigger functions are not client-callable; their triggers remain installed.
  FOR v_function IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prorettype = 'trigger'::regtype
      AND (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
  LOOP
    RAISE EXCEPTION 'Trigger function remains client-executable: %', v_function.signature;
  END LOOP;

  -- Private scorer must not be exposed to either client role.
  IF to_regprocedure('public.written_exam_auto_question_score(uuid,jsonb)') IS NOT NULL
     AND (
       has_function_privilege('anon', 'public.written_exam_auto_question_score(uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.written_exam_auto_question_score(uuid,jsonb)', 'EXECUTE')
     ) THEN
    RAISE EXCEPTION 'Private written-exam scorer is still executable by a client role.';
  END IF;

  -- Teacher grading remains available to authenticated callers but not anon.
  IF to_regprocedure('public.grade_written_exam_attempt(uuid,jsonb)') IS NOT NULL THEN
    IF has_function_privilege('anon', 'public.grade_written_exam_attempt(uuid,jsonb)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Anonymous users can execute teacher grading.';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.grade_written_exam_attempt(uuid,jsonb)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Authenticated teacher grading grant was not preserved.';
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
END
$test$;
