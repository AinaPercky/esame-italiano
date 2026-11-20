-- Prevent duplicate teacher-issued retry grants for the same student and quiz launch.
-- A single launch permits one second-chance authorization per student.
-- Reopening the quiz creates a new launch and permits a new authorization.

CREATE OR REPLACE FUNCTION public.grant_quiz_retry(
  p_quiz_id TEXT,
  p_student_id TEXT,
  p_reason TEXT,
  p_launch_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_quiz public.quizzes%ROWTYPE;
  v_grant public.quiz_retry_grants%ROWTYPE;
  v_launch public.quiz_launches%ROWTYPE;
  v_class_id TEXT;
BEGIN
  IF NOT public.quiz_is_teacher() THEN
    RAISE EXCEPTION 'Autorisation professeur requise.';
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Le motif est obligatoire.';
  END IF;

  -- Serialize all grant operations for this quiz to make the duplicate check
  -- safe even when two teacher requests arrive at nearly the same time.
  SELECT * INTO v_quiz
  FROM public.quizzes
  WHERE id = p_quiz_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz introuvable.';
  END IF;

  SELECT ce.class_id::text INTO v_class_id
  FROM public.class_enrollments ce
  JOIN public.students s
    ON s.id = ce.student_id
   AND s.validation_status = 'approved'
  WHERE ce.student_id::text = p_student_id
    AND ce.status = 'active'
    AND ce.class_id::text = ANY(
      coalesce(nullif(v_quiz.class_ids, ARRAY[]::text[]), ARRAY[v_quiz.class_id])
    )
  ORDER BY ce.started_at DESC NULLS LAST, ce.created_at DESC
  LIMIT 1;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Cet élève n’appartient pas aux classes autorisées de ce quiz.';
  END IF;

  IF p_launch_id IS NOT NULL THEN
    SELECT * INTO v_launch
    FROM public.quiz_launches
    WHERE id = p_launch_id
      AND quiz_id = p_quiz_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Le lancement ciblé ne correspond pas à ce quiz.';
    END IF;
    IF v_launch.status <> 'launched' OR v_launch.closed_at IS NOT NULL THEN
      v_launch.id := NULL;
    END IF;
  ELSE
    SELECT * INTO v_launch
    FROM public.quiz_launches
    WHERE quiz_id = p_quiz_id
      AND status = 'launched'
      AND closed_at IS NULL
    ORDER BY launched_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  -- If the quiz is currently closed, open a fresh launch first. A new launch
  -- is the only way to issue a new second chance after the previous one.
  IF v_launch.id IS NULL THEN
    PERFORM public.launch_quiz_with_presence(p_quiz_id);
    SELECT * INTO v_launch
    FROM public.quiz_launches
    WHERE quiz_id = p_quiz_id
      AND status = 'launched'
      AND closed_at IS NULL
    ORDER BY launched_at DESC
    LIMIT 1
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Impossible de créer un nouveau lancement pour cette seconde chance.';
    END IF;
  END IF;

  -- Idempotency: an existing grant (used, unused or revoked) means the
  -- authorization has already been issued for this launch. Never duplicate it.
  SELECT * INTO v_grant
  FROM public.quiz_retry_grants
  WHERE quiz_id = p_quiz_id
    AND student_id = p_student_id
    AND launch_id = v_launch.id
  ORDER BY created_at, id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_grant.id,
      'quiz_id', v_grant.quiz_id,
      'student_id', v_grant.student_id,
      'launch_id', v_launch.id,
      'granted', 0,
      'already_granted', TRUE
    );
  END IF;

  INSERT INTO public.quiz_retry_grants (
    quiz_id, student_id, granted_by, reason, launch_id
  )
  VALUES (
    p_quiz_id, p_student_id, auth.uid(), btrim(p_reason), v_launch.id
  )
  RETURNING * INTO v_grant;

  INSERT INTO public.quiz_participants (
    launch_id, quiz_id, student_id, class_id, presence_status,
    presence_confirmed_at, attendance_locked_at, presence_deadline_at,
    final_status, final_score, updated_at
  )
  VALUES (
    v_launch.id, p_quiz_id, p_student_id, v_class_id, 'retry_authorized',
    NULL, NULL, NULL, NULL, NULL, clock_timestamp()
  )
  ON CONFLICT (quiz_id, student_id)
  DO UPDATE SET
    launch_id = EXCLUDED.launch_id,
    class_id = EXCLUDED.class_id,
    presence_status = 'retry_authorized',
    presence_confirmed_at = NULL,
    attendance_locked_at = NULL,
    presence_deadline_at = NULL,
    final_status = NULL,
    final_score = NULL,
    updated_at = clock_timestamp();

  UPDATE public.quizzes
  SET status = 'launched',
      launched_at = v_launch.launched_at,
      expires_at = NULL
  WHERE id = p_quiz_id;

  RETURN jsonb_build_object(
    'id', v_grant.id,
    'quiz_id', v_grant.quiz_id,
    'student_id', v_grant.student_id,
    'launch_id', v_launch.id,
    'granted', 1,
    'already_granted', FALSE
  );
END;
$function$;

-- Class-wide grants use exactly the same idempotent per-student operation.
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
AS $function$
DECLARE
  v_student TEXT;
  v_grant JSONB;
  v_granted INTEGER := 0;
  v_skipped INTEGER := 0;
BEGIN
  IF NOT public.quiz_is_teacher() THEN
    RAISE EXCEPTION 'Seul le professeur peut accorder une seconde chance.';
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Le motif est obligatoire.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.quizzes q
    WHERE q.id = p_quiz_id
      AND p_class_id = ANY(coalesce(nullif(q.class_ids, ARRAY[]::text[]), ARRAY[q.class_id]))
  ) THEN
    RAISE EXCEPTION 'Cette classe ne fait pas partie du quiz sélectionné.';
  END IF;

  FOR v_student IN
    SELECT DISTINCT ce.student_id::text
    FROM public.class_enrollments ce
    JOIN public.students s
      ON s.id = ce.student_id
     AND s.validation_status = 'approved'
    WHERE ce.class_id::text = p_class_id
      AND ce.status = 'active'
  LOOP
    v_grant := public.grant_quiz_retry(p_quiz_id, v_student, p_reason, NULL);
    IF coalesce((v_grant ->> 'granted')::integer, 0) = 1 THEN
      UPDATE public.quiz_retry_grants
      SET max_attempts = greatest(1, p_max_attempts)
      WHERE id = (v_grant ->> 'id')::uuid;
      v_granted := v_granted + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('granted', v_granted, 'already_granted', v_skipped);
END;
$function$;

-- JSON-list overload follows the same rule and never resets an existing grant.
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
AS $function$
DECLARE
  v_student TEXT;
  v_grant JSONB;
  v_granted INTEGER := 0;
  v_skipped INTEGER := 0;
BEGIN
  IF NOT public.quiz_is_teacher() THEN
    RAISE EXCEPTION 'Seul le professeur peut accorder une seconde chance.';
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Le motif est obligatoire.';
  END IF;

  FOR v_student IN
    SELECT DISTINCT jsonb_array_elements_text(coalesce(p_student_ids, '[]'::jsonb))
  LOOP
    v_grant := public.grant_quiz_retry(p_quiz_id, v_student, p_reason, NULL);
    IF coalesce((v_grant ->> 'granted')::integer, 0) = 1 THEN
      UPDATE public.quiz_retry_grants
      SET max_attempts = greatest(1, p_max_attempts)
      WHERE id = (v_grant ->> 'id')::uuid;
      v_granted := v_granted + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('granted', v_granted, 'already_granted', v_skipped);
END;
$function$;

REVOKE ALL ON FUNCTION public.grant_quiz_retry(TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.grant_quiz_retry_for_class(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.grant_quiz_retry(TEXT, JSONB, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_quiz_retry(TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_quiz_retry_for_class(TEXT, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_quiz_retry(TEXT, JSONB, TEXT, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
