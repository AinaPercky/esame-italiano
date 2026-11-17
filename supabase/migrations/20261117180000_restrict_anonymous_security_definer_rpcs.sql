-- Restrict anonymous execution of privileged SECURITY DEFINER RPCs.
-- Only these exact public-practice RPC signatures remain callable by anon.
-- Matching by signature (not proname) prevents accidental exposure of overloads.

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
      AND NOT EXISTS (
        SELECT 1
        FROM (VALUES
          ('public.get_public_quiz_catalog()'),
          ('public.get_public_quiz(text)'),
          ('public.evaluate_public_quiz_question(text,text,text)')
        ) AS allowed(signature)
        WHERE to_regprocedure(allowed.signature)::oid = p.oid
      )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',
      v_function.signature
    );

    -- Preserve the authenticated and service-role access that existed before
    -- removing PUBLIC/anon. This avoids silently breaking legitimate callers.
    IF v_function.authenticated_can_execute THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO authenticated',
        v_function.signature
      );
    END IF;

    IF v_service_role_oid IS NOT NULL AND v_function.service_role_can_execute THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO service_role',
        v_function.signature
      );
    END IF;
  END LOOP;
END
$migration$;

-- Explicitly retain the three public practice-quiz endpoints, if installed.
DO $public_quiz$
DECLARE
  v_signature text;
  v_function regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_public_quiz_catalog()',
    'public.get_public_quiz(text)',
    'public.evaluate_public_quiz_question(text,text,text)'
  ]
  LOOP
    v_function := to_regprocedure(v_signature);
    IF v_function IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', v_function);
    END IF;
  END LOOP;
END
$public_quiz$;

-- Trigger functions are invoked by PostgreSQL as part of their trigger;
-- clients do not need EXECUTE. Discover them from the catalog so new trigger
-- functions are covered automatically without maintaining a fragile list.
DO $triggers$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      v_function.signature
    );
  END LOOP;
END
$triggers$;

-- This helper reads private written-exam answer keys and is called internally
-- by SECURITY DEFINER grading/submission routines. It must never be a client RPC.
REVOKE EXECUTE ON FUNCTION public.written_exam_auto_question_score(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
