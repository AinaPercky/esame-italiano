-- Restrict anonymous execution of privileged SECURITY DEFINER RPCs.
-- Public practice quizzes remain available through the three explicitly whitelisted RPCs.
-- This removes explicit anon grants left by older migrations; REVOKE FROM PUBLIC alone
-- is not sufficient when anon was granted EXECUTE directly.

DO $migration$
DECLARE
  v_function record;
  v_service_role_oid oid;
BEGIN
  SELECT oid INTO v_service_role_oid
  FROM pg_roles
  WHERE rolname = 'service_role';

  FOR v_function IN
    SELECT
      p.oid::regprocedure AS signature,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
      CASE
        WHEN v_service_role_oid IS NOT NULL
          THEN has_function_privilege(v_service_role_oid, p.oid, 'EXECUTE')
        ELSE FALSE
      END AS service_role_can_execute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname NOT IN (
        'get_public_quiz_catalog',
        'get_public_quiz',
        'evaluate_public_quiz_question',
        'prepare_student_registration',
        'get_public_oral_report'
      )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',
      v_function.signature
    );

    -- Preserve existing authenticated RPC access explicitly instead of relying on PUBLIC.
    IF v_function.authenticated_can_execute THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO authenticated',
        v_function.signature
      );
    END IF;

    IF v_function.service_role_can_execute THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO service_role',
        v_function.signature
      );
    END IF;
  END LOOP;
END
$migration$;

-- The scorer reads private answer keys and is only an internal helper for
-- SECURITY DEFINER submission/grading functions. It must never be an RPC oracle.
REVOKE EXECUTE ON FUNCTION public.written_exam_auto_question_score(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

-- Trigger functions are invoked by PostgreSQL triggers, not by clients.
DO $triggers$
DECLARE
  v_signature text;
  v_regprocedure regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.apply_verbes_trous_attempt_score()',
    'public.delete_student_quiz_submissions()',
    'public.guard_written_exam_expression_writing_publication()',
    'public.snapshot_written_exam_expression_writing()',
    'public.validate_verbes_trous_published_version()'
  ]
  LOOP
    v_regprocedure := to_regprocedure(v_signature);
    IF v_regprocedure IS NOT NULL THEN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
        v_regprocedure
      );
    END IF;
  END LOOP;
END
$triggers$;

NOTIFY pgrst, 'reload schema';
