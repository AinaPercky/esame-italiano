-- Integration checks for the oral report RPC.
-- Run after migration 20261118120000_restore_public_oral_report_rpc.sql.
BEGIN;

DO $test$
DECLARE
  v_signature regprocedure;
  v_result jsonb;
BEGIN
  v_signature := to_regprocedure('public.get_public_oral_report(uuid,uuid,text)');
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'Missing RPC signature: public.get_public_oral_report(uuid,uuid,text)';
  END IF;

  IF NOT has_function_privilege('anon', v_signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon cannot execute the public QR report RPC';
  END IF;

  IF NOT has_function_privilege('authenticated', v_signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute the student report RPC';
  END IF;

  IF has_function_privilege('public', v_signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'RPC still has a broad PUBLIC execute grant';
  END IF;

  -- An anonymous caller without exam or lookup data must not receive a report.
  EXECUTE 'SET LOCAL ROLE anon';
  v_result := public.get_public_oral_report(NULL, NULL, NULL);
  IF v_result IS NOT NULL THEN
    RAISE EXCEPTION 'Anonymous caller received a report without lookup credentials';
  END IF;
  EXECUTE 'RESET ROLE';

  -- An unknown exam/student pair must return no report, not another student's data.
  EXECUTE 'SET LOCAL ROLE anon';
  v_result := public.get_public_oral_report(
    'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid,
    'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid,
    NULL
  );
  IF v_result IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown exam/student pair unexpectedly returned a report';
  END IF;
  EXECUTE 'RESET ROLE';
END
$test$;

ROLLBACK;
