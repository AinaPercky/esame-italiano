-- Integration checks for the oral report RPC.
-- Run after migration 20261118120000_restore_public_oral_report_rpc.sql.
BEGIN;

DO $test$
DECLARE
  v_signature regprocedure;
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
END
$test$;

-- Exercise the RPC as the real anonymous database role.
SET LOCAL ROLE anon;
DO $anonymous$
BEGIN
  IF public.get_public_oral_report(NULL, NULL, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Anonymous caller received a report without lookup credentials';
  END IF;
  IF public.get_public_oral_report(
    'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid,
    'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid,
    NULL
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown exam/student pair unexpectedly returned a report';
  END IF;
END
$anonymous$;
RESET ROLE;

ROLLBACK;
