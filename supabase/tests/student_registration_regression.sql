-- Integration/regression tests for the public student registration RPC.
-- Runs only against the isolated PostgreSQL CI database. All writes are rolled back.
BEGIN;
SET LOCAL ROLE anon;

DO $test$
DECLARE
  v_new jsonb;
  v_repeat jsonb;
  v_existing jsonb;
  v_expected_id uuid := '10000000-0000-4000-8000-000000000001'::uuid;
  v_error_raised boolean;
BEGIN
  IF to_regprocedure('public.prepare_student_registration(text,text,text,text,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'prepare_student_registration RPC is missing';
  END IF;
  IF to_regprocedure('public.finalize_student_registration()') IS NULL THEN
    RAISE EXCEPTION 'finalize_student_registration RPC is missing';
  END IF;

  IF NOT has_function_privilege('anon', 'public.prepare_student_registration(text,text,text,text,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must be able to prepare a student registration';
  END IF;
  IF has_function_privilege('anon', 'public.finalize_student_registration()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not be able to finalize a student registration';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.finalize_student_registration()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must be able to finalize a student registration';
  END IF;

  -- New student: normalized email, active class, and pending status.
  v_new := public.prepare_student_registration(
    '  Test ', ' Student ', 'femme', ' REG-TEST-001 ',
    '00000000-0000-4000-8000-000000000001'::uuid,
    ' REGISTRATION-TEST-001@EXAMPLE.INVALID '
  );
  IF v_new ->> 'validation_status' <> 'pending' THEN
    RAISE EXCEPTION 'New registration must remain pending: %', v_new;
  END IF;
  IF v_new ->> 'class_name' <> 'IUM-L2' OR v_new ->> 'first_name' <> 'Test' OR v_new ->> 'last_name' <> 'Student' THEN
    RAISE EXCEPTION 'New registration returned incorrect normalized profile: %', v_new;
  END IF;

  -- Idempotence: the same email and matching identity must reuse the same row.
  v_repeat := public.prepare_student_registration(
    'Test', 'Student', 'femme', 'REG-TEST-001',
    '00000000-0000-4000-8000-000000000001'::uuid,
    'registration-test-001@example.invalid'
  );
  IF (v_repeat ->> 'id') <> (v_new ->> 'id') THEN
    RAISE EXCEPTION 'Repeated registration created a duplicate student row';
  END IF;

  -- Existing roster record: valid details must link to the existing student.
  v_existing := public.prepare_student_registration(
    'Aina', 'One', 'femme', 'STU-001',
    '00000000-0000-4000-8000-000000000001'::uuid,
    'STUDENT.ONE@EXAMPLE.COM'
  );
  IF (v_existing ->> 'id')::uuid <> v_expected_id THEN
    RAISE EXCEPTION 'Existing roster student was not reused: %', v_existing;
  END IF;

  -- Mismatched identity must not silently bind to another student.
  v_error_raised := false;
  BEGIN
    PERFORM public.prepare_student_registration(
      'Wrong', 'Name', 'femme', 'STU-001',
      '00000000-0000-4000-8000-000000000001'::uuid,
      'student.one@example.com'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_raised := SQLERRM LIKE '%ne correspondent pas au dossier scolaire%';
  END;
  IF NOT v_error_raised THEN
    RAISE EXCEPTION 'Mismatched existing-student identity was not rejected';
  END IF;

  -- Invalid e-mail and archived/nonexistent classes must be rejected.
  v_error_raised := false;
  BEGIN
    PERFORM public.prepare_student_registration(
      'Test', 'Invalid', 'homme', NULL,
      '00000000-0000-4000-8000-000000000001'::uuid,
      'not-an-email'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_raised := SQLERRM LIKE '%informations saisies%';
  END;
  IF NOT v_error_raised THEN
    RAISE EXCEPTION 'Invalid e-mail was not rejected';
  END IF;

  v_error_raised := false;
  BEGIN
    PERFORM public.prepare_student_registration(
      'Test', 'Archived', 'homme', NULL,
      '00000000-0000-4000-8000-000000000003'::uuid,
      'registration-archived@example.invalid'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_raised := SQLERRM LIKE '%Classe introuvable ou indisponible%';
  END;
  IF NOT v_error_raised THEN
    RAISE EXCEPTION 'Archived class registration was not rejected';
  END IF;
END
$test$;

ROLLBACK;
