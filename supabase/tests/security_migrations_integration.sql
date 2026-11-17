-- Assertions after applying Phase A then Phase B in the isolated integration database.
DO $integration$
DECLARE
  v_signature text;
  v_oid regprocedure;
  v_allowed text[] := ARRAY[
    'public.get_public_quiz_catalog()',
    'public.get_public_quiz(text)',
    'public.evaluate_public_quiz_question(text,text,text)',
    'public.prepare_student_registration(text,text,text,text,uuid,text)',
    'public.get_public_oral_report(uuid,uuid,text)'
  ];
  v_function record;
BEGIN
  FOREACH v_signature IN ARRAY v_allowed LOOP
    v_oid := to_regprocedure(v_signature);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Expected public RPC missing after cumulative migrations: %', v_signature;
    END IF;
    IF NOT has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Expected public RPC not executable by anon: %', v_signature;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_proc p,
           aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = v_oid::oid
        AND a.grantee = 0
        AND a.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'Public RPC inherits EXECUTE from PUBLIC: %', v_signature;
    END IF;
  END LOOP;

  IF has_function_privilege('anon', 'public.written_exam_auto_question_score(uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.written_exam_auto_question_score(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Private written-exam scorer is exposed to a client role.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.written_exam_auto_question_score(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'The service_role grant on the private scorer was not preserved.';
  END IF;

  IF has_function_privilege('anon', 'public.security_integration_probe_trigger()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.security_integration_probe_trigger()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Trigger function is still client-executable.';
  END IF;

  FOR v_function IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1 FROM unnest(v_allowed) AS allowed(signature)
        WHERE to_regprocedure(allowed.signature)::oid = p.oid
      )
  LOOP
    RAISE EXCEPTION 'Unexpected anon-executable SECURITY DEFINER function after both migrations: %', v_function.signature;
  END LOOP;
END
$integration$;

-- PostgreSQL must still invoke the trigger after its client EXECUTE grant is revoked.
INSERT INTO public.security_integration_trigger_probe(id) VALUES (1);
DO $trigger_test$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.security_integration_trigger_probe
    WHERE id = 1 AND touched = true
  ) THEN
    RAISE EXCEPTION 'Trigger stopped firing after client EXECUTE was revoked.';
  END IF;
END
$trigger_test$;
