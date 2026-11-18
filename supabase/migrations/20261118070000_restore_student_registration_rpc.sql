-- Restore the public student registration RPC missing from production.
-- Keep the RPC narrowly scoped: it validates the class and identity fields,
-- creates only a pending student record, and never exposes the student roster.

CREATE OR REPLACE FUNCTION public.prepare_student_registration(
  p_first_name text,
  p_last_name text,
  p_gender text,
  p_student_number text,
  p_class_id uuid,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_first_name text := btrim(coalesce(p_first_name, ''));
  v_last_name text := btrim(coalesce(p_last_name, ''));
  v_gender text := CASE WHEN p_gender = 'femme' THEN 'femme' ELSE 'homme' END;
  v_student_number text := nullif(btrim(coalesce(p_student_number, '')), '');
  v_match_count integer;
  v_student public.students%ROWTYPE;
  v_class_name text;
BEGIN
  IF v_first_name = '' OR v_last_name = '' OR v_email = ''
     OR v_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'Veuillez vérifier les informations saisies.';
  END IF;

  IF p_class_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = p_class_id AND c.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Classe introuvable ou indisponible.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email, 0));

  SELECT count(*)::integer
  INTO v_match_count
  FROM public.students s
  WHERE lower(btrim(s.email)) = v_email;

  IF v_match_count > 1 THEN
    RAISE EXCEPTION 'Impossible de vérifier cette inscription. Contactez votre professeur.';
  ELSIF v_match_count = 1 THEN
    SELECT *
    INTO v_student
    FROM public.students s
    WHERE lower(btrim(s.email)) = v_email
    FOR UPDATE;

    IF lower(btrim(v_student.first_name)) <> lower(v_first_name)
       OR lower(btrim(v_student.last_name)) <> lower(v_last_name)
       OR (
         v_student_number IS NOT NULL
         AND coalesce(btrim(v_student.student_number), '') <> v_student_number
       ) THEN
      RAISE EXCEPTION 'Les informations ne correspondent pas au dossier scolaire. Contactez votre professeur.';
    END IF;
  ELSE
    INSERT INTO public.students (
      id, class_id, first_name, last_name, gender, email, student_number,
      validation_status, created_at, updated_at
    )
    VALUES (
      pg_catalog.gen_random_uuid(), p_class_id, v_first_name, v_last_name,
      v_gender, v_email, v_student_number, 'pending', now(), now()
    )
    RETURNING * INTO v_student;
  END IF;

  SELECT c.name INTO v_class_name
  FROM public.classes c
  WHERE c.id = v_student.class_id;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_student.id,
    'class_id', v_student.class_id,
    'class_name', v_class_name,
    'first_name', v_student.first_name,
    'last_name', v_student.last_name,
    'gender', v_student.gender,
    'student_number', v_student.student_number,
    'validation_status', v_student.validation_status
  );
END;
$function$;

-- When Supabase Auth immediately creates a session (email confirmation disabled),
-- ensure the matched/new roster record remains pending until teacher approval.
CREATE OR REPLACE FUNCTION public.finalize_student_registration()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_student_id uuid;
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Session étudiant authentifiée requise.';
  END IF;

  UPDATE public.students
  SET validation_status = 'pending',
      updated_at = now()
  WHERE lower(btrim(email)) = v_email
  RETURNING id INTO v_student_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Impossible de finaliser cette inscription. Contactez votre professeur.';
  END IF;

  RETURN v_student_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_student_registration(text,text,text,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_student_registration(text,text,text,text,uuid,text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.finalize_student_registration() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_student_registration() TO authenticated;

NOTIFY pgrst, 'reload schema';
