-- Unify retry authorization across individual, class and legacy grant paths.
-- The student/quiz IDs are always taken from the request; no student or quiz is hard-coded.

DO $migration$
DECLARE
  v_definition TEXT;
  v_old TEXT;
BEGIN
  -- A launch may expose only grants that are genuinely usable.
  v_definition := pg_get_functiondef('public.launch_quiz_with_presence(text)'::regprocedure);
  v_old := 'AND g.used_at IS NULL';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected launch_quiz_with_presence definition; migration stopped safely.';
  END IF;
  v_definition := replace(
    v_definition,
    v_old,
    'AND g.used_at IS NULL AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > clock_timestamp()) AND g.used_attempts < g.max_attempts'
  );
  EXECUTE v_definition;

  -- Re-authorizing a participant in the same launch must start a fresh presence window.
  v_definition := pg_get_functiondef('public.grant_quiz_retry(text,text,text,uuid)'::regprocedure);
  v_old := 'DO UPDATE SET presence_status = ''retry_authorized'';';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected individual grant function definition; migration stopped safely.';
  END IF;
  v_definition := replace(
    v_definition,
    v_old,
    'DO UPDATE SET presence_status = ''retry_authorized'', presence_confirmed_at = NULL, attendance_locked_at = NULL, presence_deadline_at = NULL, final_status = NULL, final_score = NULL, updated_at = clock_timestamp();'
  );
  EXECUTE v_definition;
END
$migration$;

-- Class-wide grants use the same individual authorization path as a single-student grant.
-- This ensures they are linked to an active launch and create/update the participant row.
CREATE OR REPLACE FUNCTION public.grant_quiz_retry_for_class(
  p_quiz_id TEXT,
  p_class_id TEXT,
  p_reason TEXT DEFAULT NULL,
  p_max_attempts INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_student TEXT;
  v_grant JSONB;
  v_grant_id UUID;
  v_count INTEGER := 0;
BEGIN
  IF NOT public.quiz_is_teacher() THEN
    RAISE EXCEPTION 'Seul le professeur peut accorder une seconde chance.';
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Le motif est obligatoire.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.quizzes q
    WHERE q.id = p_quiz_id
      AND p_class_id = ANY(coalesce(nullif(q.class_ids, ARRAY[]::text[]), ARRAY[q.class_id]))
  ) THEN
    RAISE EXCEPTION 'Cette classe ne fait pas partie du quiz sélectionné.';
  END IF;

  FOR v_student IN
    SELECT DISTINCT ce.student_id::text
    FROM public.class_enrollments ce
    WHERE ce.class_id::text = p_class_id
      AND ce.status = 'active'
  LOOP
    v_grant := public.grant_quiz_retry(p_quiz_id, v_student, p_reason, NULL);
    v_grant_id := nullif(v_grant ->> 'id', '')::uuid;
    IF v_grant_id IS NOT NULL THEN
      UPDATE public.quiz_retry_grants
      SET max_attempts = greatest(1, p_max_attempts)
      WHERE id = v_grant_id;
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('granted', v_count);
END;
$$;

-- Keep the old JSONB overload functional, but route it through the same
-- individual grant workflow instead of creating unattached grants.
CREATE OR REPLACE FUNCTION public.grant_quiz_retry(
  p_quiz_id TEXT,
  p_student_ids JSONB,
  p_reason TEXT DEFAULT NULL,
  p_max_attempts INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_student TEXT;
  v_grant JSONB;
  v_grant_id UUID;
  v_count INTEGER := 0;
BEGIN
  IF NOT public.quiz_is_teacher() THEN
    RAISE EXCEPTION 'Seul le professeur peut accorder une seconde chance.';
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Le motif est obligatoire.';
  END IF;

  FOR v_student IN
    SELECT jsonb_array_elements_text(coalesce(p_student_ids, '[]'::jsonb))
  LOOP
    v_grant := public.grant_quiz_retry(p_quiz_id, v_student, p_reason, NULL);
    v_grant_id := nullif(v_grant ->> 'id', '')::uuid;
    IF v_grant_id IS NOT NULL THEN
      UPDATE public.quiz_retry_grants
      SET max_attempts = greatest(1, p_max_attempts)
      WHERE id = v_grant_id;
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('granted', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.grant_quiz_retry_for_class(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.grant_quiz_retry(TEXT, JSONB, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_quiz_retry_for_class(TEXT, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_quiz_retry(TEXT, JSONB, TEXT, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
