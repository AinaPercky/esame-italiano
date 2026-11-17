-- Phase B: replace unrestricted public table access with role- and ownership-based RLS.
-- This migration is additive to application behavior: public QR reports and student
-- registration move to narrowly scoped RPCs before direct anonymous table access is removed.

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_pass_order ENABLE ROW LEVEL SECURITY;

-- Classes are the only core school records needed by the anonymous registration form.
DROP POLICY IF EXISTS "classes_read_available" ON public.classes;
CREATE POLICY classes_read_available
  ON public.classes FOR SELECT TO anon, authenticated
  USING (archived_at IS NULL OR public.class_enrollment_is_teacher());

-- Teacher access remains complete; students can read only their own profile, including its approval state.
DROP POLICY IF EXISTS "Students full access" ON public.students;
DROP POLICY IF EXISTS students_teacher_manage ON public.students;
DROP POLICY IF EXISTS students_self_read ON public.students;
CREATE POLICY students_teacher_manage
  ON public.students FOR ALL TO authenticated
  USING (public.class_enrollment_is_teacher())
  WITH CHECK (public.class_enrollment_is_teacher());
CREATE POLICY students_self_read
  ON public.students FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- Students can read only exams assigned to an active class enrollment.
DROP POLICY IF EXISTS "Exams full access" ON public.exams;
DROP POLICY IF EXISTS exams_teacher_manage ON public.exams;
DROP POLICY IF EXISTS exams_student_read_enrolled ON public.exams;
CREATE POLICY exams_teacher_manage
  ON public.exams FOR ALL TO authenticated
  USING (public.class_enrollment_is_teacher())
  WITH CHECK (public.class_enrollment_is_teacher());
CREATE POLICY exams_student_read_enrolled
  ON public.exams FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.class_enrollments ce
      WHERE ce.student_id = public.class_enrollment_current_student_id()
        AND ce.class_id = exams.class_id
        AND ce.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = public.class_enrollment_current_student_id()
        AND s.class_id = exams.class_id
    )
  );

-- Rubrics are visible only when their parent exam is visible to the student.
DROP POLICY IF EXISTS "Exam rubrics full access" ON public.exam_rubrics;
DROP POLICY IF EXISTS exam_rubrics_teacher_manage ON public.exam_rubrics;
DROP POLICY IF EXISTS exam_rubrics_student_read_enrolled ON public.exam_rubrics;
CREATE POLICY exam_rubrics_teacher_manage
  ON public.exam_rubrics FOR ALL TO authenticated
  USING (public.class_enrollment_is_teacher())
  WITH CHECK (public.class_enrollment_is_teacher());
CREATE POLICY exam_rubrics_student_read_enrolled
  ON public.exam_rubrics FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.exams e
      WHERE e.id = exam_rubrics.exam_id
    )
  );

-- Students may read their own oral evaluation, never a classmate's score.
DROP POLICY IF EXISTS "Evaluations full access" ON public.evaluations;
DROP POLICY IF EXISTS evaluations_teacher_manage ON public.evaluations;
DROP POLICY IF EXISTS evaluations_student_read_own ON public.evaluations;
CREATE POLICY evaluations_teacher_manage
  ON public.evaluations FOR ALL TO authenticated
  USING (public.class_enrollment_is_teacher())
  WITH CHECK (public.class_enrollment_is_teacher());
CREATE POLICY evaluations_student_read_own
  ON public.evaluations FOR SELECT TO authenticated
  USING (student_id = public.class_enrollment_current_student_id());

-- Evaluation details inherit the access rights of their parent evaluation.
DROP POLICY IF EXISTS "Evaluation details full access" ON public.evaluation_details;
DROP POLICY IF EXISTS evaluation_details_teacher_manage ON public.evaluation_details;
DROP POLICY IF EXISTS evaluation_details_student_read_own ON public.evaluation_details;
CREATE POLICY evaluation_details_teacher_manage
  ON public.evaluation_details FOR ALL TO authenticated
  USING (public.class_enrollment_is_teacher())
  WITH CHECK (public.class_enrollment_is_teacher());
CREATE POLICY evaluation_details_student_read_own
  ON public.evaluation_details FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.evaluations ev
      WHERE ev.id = evaluation_details.evaluation_id
        AND ev.student_id = public.class_enrollment_current_student_id()
    )
  );

-- Students can see their own place in the oral exam queue, not the full class order.
DROP POLICY IF EXISTS "Exam pass order full access" ON public.exam_pass_order;
DROP POLICY IF EXISTS exam_pass_order_teacher_manage ON public.exam_pass_order;
DROP POLICY IF EXISTS exam_pass_order_student_read_own ON public.exam_pass_order;
CREATE POLICY exam_pass_order_teacher_manage
  ON public.exam_pass_order FOR ALL TO authenticated
  USING (public.class_enrollment_is_teacher())
  WITH CHECK (public.class_enrollment_is_teacher());
CREATE POLICY exam_pass_order_student_read_own
  ON public.exam_pass_order FOR SELECT TO authenticated
  USING (student_id = public.class_enrollment_current_student_id());

-- Anonymous clients no longer receive direct access to private school records.
REVOKE ALL ON TABLE
  public.students,
  public.exams,
  public.exam_rubrics,
  public.evaluations,
  public.evaluation_details,
  public.exam_pass_order
FROM anon;

-- Anonymous clients may list only active class names for the registration form.
REVOKE ALL ON TABLE public.classes FROM anon;
GRANT SELECT ON TABLE public.classes TO anon;

-- The student identity helper must reject unapproved profiles even when called by
-- a SECURITY DEFINER quiz RPC.
CREATE OR REPLACE FUNCTION public.quiz_current_student_id()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_id text;
BEGIN
  IF auth.uid() IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Session étudiant authentifiée requise.';
  END IF;

  SELECT s.id::text
  INTO v_id
  FROM public.students s
  WHERE lower(s.email) = v_email
    AND coalesce(s.validation_status, 'approved') = 'approved'
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Aucune fiche étudiant approuvée ne correspond à cette session.';
  END IF;

  RETURN v_id;
END;
$function$;

-- Public registration can create a pending profile or securely match an existing
-- roster row. It never returns whether an arbitrary email exists unless the
-- supplied name (and supplied student number, when present) also match.
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

-- If sign-up immediately returns an authenticated session (email confirmation
-- disabled), move the matched roster record to pending before the app signs out.
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

-- A student receives a minimal class roster (no email addresses or private
-- student metadata) so the existing class leaderboard can still show classmates.
CREATE OR REPLACE FUNCTION public.get_student_class_roster()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_student_id uuid;
  v_class_ids uuid[];
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.class_enrollment_is_teacher() THEN
    RAISE EXCEPTION 'Cette fonction est réservée aux élèves authentifiés.';
  END IF;

  v_student_id := public.class_enrollment_current_student_id();
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Profil étudiant approuvé introuvable.';
  END IF;

  SELECT array_agg(DISTINCT member.class_id)
  INTO v_class_ids
  FROM (
    SELECT ce.class_id
    FROM public.class_enrollments ce
    WHERE ce.student_id = v_student_id AND ce.status = 'active'
    UNION
    SELECT s.class_id
    FROM public.students s
    WHERE s.id = v_student_id
      AND NOT EXISTS (
        SELECT 1 FROM public.class_enrollments ce WHERE ce.student_id = v_student_id
      )
  ) member;

  IF coalesce(cardinality(v_class_ids), 0) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'class_id', s.class_id,
        'class_ids', coalesce((
          SELECT jsonb_agg(DISTINCT ce2.class_id)
          FROM public.class_enrollments ce2
          WHERE ce2.student_id = s.id
            AND ce2.status = 'active'
            AND ce2.class_id = ANY(v_class_ids)
        ), jsonb_build_array(s.class_id)),
        'first_name', s.first_name,
        'last_name', s.last_name,
        'student_number', s.student_number,
        'avatar_url', s.avatar_url,
        'validation_status', coalesce(s.validation_status, 'approved'),
        'created_at', s.created_at,
        'updated_at', s.updated_at
      )
      ORDER BY s.last_name, s.first_name
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.students s
  WHERE coalesce(s.validation_status, 'approved') = 'approved'
    AND (
      s.class_id = ANY(v_class_ids)
      OR EXISTS (
        SELECT 1
        FROM public.class_enrollments ce
        WHERE ce.student_id = s.id
          AND ce.class_id = ANY(v_class_ids)
          AND ce.status = 'active'
      )
    );

  RETURN v_result;
END;
$function$;

-- Narrow public QR report endpoint. It returns exactly one evaluated student's
-- report, never a class roster, raw table, or another student's result.
CREATE OR REPLACE FUNCTION public.get_public_oral_report(
  p_exam_id uuid,
  p_student_id uuid DEFAULT NULL,
  p_lookup text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF p_exam_id IS NULL OR (p_student_id IS NULL AND nullif(btrim(coalesce(p_lookup, '')), '') IS NULL) THEN
    RETURN NULL;
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'student', pg_catalog.jsonb_build_object(
      'id', s.id,
      'class_id', s.class_id,
      'first_name', s.first_name,
      'last_name', s.last_name,
      'gender', s.gender,
      'student_number', s.student_number,
      'avatar_url', s.avatar_url
    ),
    'exam', pg_catalog.jsonb_build_object(
      'id', e.id,
      'class_id', e.class_id,
      'title', e.title,
      'description', e.description,
      'level', e.level,
      'exam_date', e.exam_date,
      'status', e.status,
      'created_at', e.created_at,
      'class_name', c.name
    ),
    'rubrics', coalesce((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', r.id,
          'exam_id', r.exam_id,
          'title', r.title,
          'question', r.question,
          'example_sentence', r.example_sentence,
          'points', r.points,
          'position', r.position
        ) ORDER BY r.position
      )
      FROM public.exam_rubrics r
      WHERE r.exam_id = e.id
    ), '[]'::jsonb),
    'evaluation', pg_catalog.jsonb_build_object(
      'id', ev.id,
      'exam_id', ev.exam_id,
      'student_id', ev.student_id,
      'total_score', ev.total_score,
      'status', ev.status,
      'max_duration_seconds', ev.max_duration_seconds,
      'duration_used_seconds', ev.duration_used_seconds,
      'timer_status', ev.timer_status,
      'created_at', ev.created_at,
      'updated_at', ev.updated_at,
      'details', coalesce((
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'rubric_id', d.rubric_id,
            'is_validated', d.is_validated,
            'awarded_points', d.awarded_points,
            'error_note', d.error_note
          )
        )
        FROM public.evaluation_details d
        WHERE d.evaluation_id = ev.id
      ), '[]'::jsonb)
    )
  )
  INTO v_result
  FROM public.evaluations ev
  JOIN public.students s ON s.id = ev.student_id
  JOIN public.exams e ON e.id = ev.exam_id
  JOIN public.classes c ON c.id = e.class_id
  WHERE ev.exam_id = p_exam_id
    AND (
      (p_student_id IS NOT NULL AND s.id = p_student_id)
      OR (
        p_student_id IS NULL
        AND nullif(btrim(coalesce(p_lookup, '')), '') IS NOT NULL
        AND lower(btrim(s.email)) = lower(btrim(p_lookup))
      )
    )
    AND (
      s.class_id = e.class_id
      OR EXISTS (
        SELECT 1
        FROM public.class_enrollments ce
        WHERE ce.student_id = s.id
          AND ce.class_id = e.class_id
          AND ce.status = 'active'
      )
    )
  ORDER BY ev.updated_at DESC
  LIMIT 1;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_student_registration(text,text,text,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_student_registration(text,text,text,text,uuid,text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.finalize_student_registration() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_student_registration() TO authenticated;

REVOKE ALL ON FUNCTION public.get_student_class_roster() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_class_roster() TO authenticated;

REVOKE ALL ON FUNCTION public.get_public_oral_report(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_oral_report(uuid,uuid,text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
