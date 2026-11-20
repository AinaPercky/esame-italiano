DO $test$
DECLARE
  v_result JSONB;
  v_feedback JSONB;
  v_failed BOOLEAN := FALSE;
BEGIN
  v_result := public.evaluate_public_quiz_answers(
    'share-quiz-1',
    '{"q1":"sono","q2":"sbagliato"}'::jsonb
  );
  IF (v_result ->> 'rawScore')::numeric <> 2
     OR (v_result ->> 'maxScore')::numeric <> 5 THEN
    RAISE EXCEPTION 'Batch public quiz score was not calculated from all questions: %', v_result;
  END IF;
  v_feedback := v_result -> 'feedback';
  IF coalesce((v_feedback #>> '{q1,correct}')::boolean, FALSE) IS NOT TRUE
     OR coalesce((v_feedback #>> '{q2,correct}')::boolean, TRUE) IS NOT FALSE
     OR v_feedback #>> '{q2,expected}' <> 'sei'
     OR v_feedback #>> '{q2,studentAnswer}' <> 'sbagliato' THEN
    RAISE EXCEPTION 'Batch public quiz detailed feedback is incorrect: %', v_feedback;
  END IF;

  BEGIN
    PERFORM public.evaluate_public_quiz_answers('private-share-1', '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Batch grading must reject a non-public quiz.';
  END IF;

  v_failed := FALSE;
  BEGIN
    PERFORM public.evaluate_public_quiz_answers('share-quiz-1', '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Batch grading must reject non-object answers.';
  END IF;

  IF NOT has_function_privilege('anon', 'public.evaluate_public_quiz_answers(text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.evaluate_public_quiz_answers(text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Public batch grading must be executable by anon and authenticated.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid = 'public.evaluate_public_quiz_answers(text,jsonb)'::regprocedure
      AND a.grantee = 0
      AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Public batch grading must not grant EXECUTE to PUBLIC.';
  END IF;
END
$test$;
