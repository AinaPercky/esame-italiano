/** SQL migration mirrored in supabase/migrations for lifecycle regression tests. */
export const QUIZ_PARTICIPANT_LIFECYCLE_MIGRATION_SQL = String.raw`-- PerckyLingua: unified quiz participant and retry lifecycle.
-- Add late-approved enrollments to the active launch lazily and securely when
-- the student requests their active launch. Preserve previous attempts/results.

DO $migration$
DECLARE
  v_definition TEXT;
  v_old TEXT;
  v_new TEXT;
BEGIN
  -- Keep all participant upserts aligned with the actual unique key.
  v_definition := pg_get_functiondef('public.launch_quiz_with_presence(text)'::regprocedure);
  v_old := 'ON CONFLICT (launch_id, student_id)';
  IF position(v_old IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_old, 'ON CONFLICT (quiz_id, student_id)');
    EXECUTE v_definition;
  END IF;

  v_definition := pg_get_functiondef('public.grant_quiz_retry(text,text,text,uuid)'::regprocedure);
  IF position(v_old IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_old, 'ON CONFLICT (quiz_id, student_id)');
    EXECUTE v_definition;
  END IF;

  -- Only approved students with an active enrollment in one of the quiz's
  -- target classes may receive an individual retry authorization.
  v_definition := pg_get_functiondef('public.grant_quiz_retry(text,text,text,uuid)'::regprocedure);
  v_old := 'FROM public.class_enrollments ce
  JOIN public.quizzes q ON q.id = p_quiz_id
  WHERE ce.student_id::text = p_student_id AND ce.status = ''active''';
  v_new := 'FROM public.class_enrollments ce
  JOIN public.quizzes q ON q.id = p_quiz_id
  JOIN public.students s ON s.id = ce.student_id AND s.validation_status = ''approved''
  WHERE ce.student_id::text = p_student_id AND ce.status = ''active''';
  IF position(v_old IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_old, v_new);
    EXECUTE v_definition;
  END IF;

  -- Retry authorization is consumed only by a successful/timeout submission.
  -- Honour max_attempts rather than invalidating every grant after its first use.
  v_definition := pg_get_functiondef('public.submit_quiz_presence_submission_legacy_unsafe(jsonb)'::regprocedure);
  v_old := 'IF v_participant.presence_status = ''retry_authorized'' THEN
    UPDATE public.quiz_retry_grants
    SET used_at = coalesce(used_at, clock_timestamp())
    WHERE id = (
      SELECT id FROM public.quiz_retry_grants
      WHERE quiz_id = v_quiz.id AND student_id = v_student AND used_at IS NULL
        AND (launch_id IS NULL OR launch_id = v_launch.id)
      ORDER BY created_at
      LIMIT 1
    );
  END IF;';
  v_new := 'IF v_participant.presence_status = ''retry_authorized'' THEN
    UPDATE public.quiz_retry_grants
    SET used_attempts = used_attempts + 1,
        used_at = CASE
          WHEN used_attempts + 1 >= max_attempts THEN clock_timestamp()
          ELSE NULL
        END
    WHERE id = (
      SELECT id FROM public.quiz_retry_grants
      WHERE quiz_id = v_quiz.id
        AND student_id = v_student
        AND used_at IS NULL
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > clock_timestamp())
        AND used_attempts < max_attempts
        AND (launch_id IS NULL OR launch_id = v_launch.id)
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE
    );
    IF NOT FOUND THEN
      RAISE EXCEPTION ''La seconde chance est expirée, révoquée ou déjà utilisée.'';
    END IF;
  END IF;';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected retry-consumption block; migration stopped safely.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);
  EXECUTE v_definition;
END
$migration$;

-- This RPC is the single source of truth for student access. It also repairs
-- a missing participant row when an approved student enrolled after launch.
CREATE OR REPLACE FUNCTION public.get_student_active_launch(p_quiz_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_student TEXT := public.quiz_current_student_id();
  v_quiz public.quizzes%ROWTYPE;
  v_launch public.quiz_launches%ROWTYPE;
  v_class_id TEXT;
  v_has_retry BOOLEAN := FALSE;
  v_has_history BOOLEAN := FALSE;
  v_has_terminal_participation BOOLEAN := FALSE;
  v_participant public.quiz_participants%ROWTYPE;
BEGIN
  SELECT * INTO v_quiz
  FROM public.quizzes
  WHERE id = p_quiz_id AND status = 'launched';
  IF NOT FOUND THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT ce.class_id::text INTO v_class_id
  FROM public.students s
  JOIN public.class_enrollments ce ON ce.student_id = s.id
  WHERE s.id::text = v_student
    AND s.validation_status = 'approved'
    AND ce.status = 'active'
    AND ce.class_id::text = ANY(
      coalesce(nullif(v_quiz.class_ids, ARRAY[]::text[]), ARRAY[v_quiz.class_id])
    )
  ORDER BY ce.started_at DESC NULLS LAST, ce.created_at DESC
  LIMIT 1;

  IF v_class_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT * INTO v_launch
  FROM public.quiz_launches
  WHERE quiz_id = p_quiz_id AND status = 'launched' AND closed_at IS NULL
  ORDER BY launched_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.quiz_retry_grants g
    WHERE g.quiz_id = p_quiz_id
      AND g.student_id = v_student
      AND (g.launch_id = v_launch.id OR g.launch_id IS NULL)
      AND g.used_at IS NULL
      AND g.revoked_at IS NULL
      AND (g.expires_at IS NULL OR g.expires_at > clock_timestamp())
      AND g.used_attempts < g.max_attempts
  ) INTO v_has_retry;

  SELECT
    EXISTS (
      SELECT 1 FROM public.quiz_submissions s
      WHERE s.quiz_id = p_quiz_id AND s.student_id = v_student
        AND s.status IN ('completed', 'timeout', 'missed')
    )
    OR EXISTS (
      SELECT 1 FROM public.quiz_attempts a
      WHERE a.quiz_id = p_quiz_id AND a.student_id = v_student
        AND a.status IN ('completed', 'timeout', 'missed')
    )
  INTO v_has_history;

  SELECT EXISTS (
    SELECT 1 FROM public.quiz_participants p
    WHERE p.quiz_id = p_quiz_id
      AND p.student_id = v_student
      AND p.presence_status IN ('absent', 'completed', 'timeout')
  ) INTO v_has_terminal_participation;

  -- A first attempt is allowed only without a previous result/absence.
  -- A later attempt requires a live teacher-issued grant.
  IF v_has_retry OR (NOT v_has_history AND NOT v_has_terminal_participation) THEN
    INSERT INTO public.quiz_participants (
      quiz_id, student_id, launch_id, class_id, presence_status,
      presence_confirmed_at, attendance_locked_at, presence_deadline_at,
      final_status, final_score, updated_at
    )
    VALUES (
      p_quiz_id, v_student, v_launch.id, v_class_id,
      CASE WHEN v_has_retry THEN 'retry_authorized' ELSE 'pending' END,
      NULL, NULL, NULL, NULL, NULL, clock_timestamp()
    )
    ON CONFLICT (quiz_id, student_id)
    DO UPDATE SET
      launch_id = EXCLUDED.launch_id,
      class_id = EXCLUDED.class_id,
      presence_status = EXCLUDED.presence_status,
      presence_confirmed_at = NULL,
      attendance_locked_at = NULL,
      presence_deadline_at = NULL,
      final_status = NULL,
      final_score = NULL,
      updated_at = clock_timestamp()
    WHERE public.quiz_participants.launch_id IS DISTINCT FROM EXCLUDED.launch_id
       OR (
         EXCLUDED.presence_status = 'retry_authorized'
         AND public.quiz_participants.presence_status <> 'retry_authorized'
       );
  END IF;

  SELECT * INTO v_participant
  FROM public.quiz_participants
  WHERE quiz_id = p_quiz_id
    AND student_id = v_student
    AND launch_id = v_launch.id
    AND (
      presence_status IN ('pending', 'present')
      OR (
        presence_status = 'retry_authorized'
        AND EXISTS (
          SELECT 1 FROM public.quiz_retry_grants g
          WHERE g.quiz_id = p_quiz_id
            AND g.student_id = v_student
            AND (g.launch_id = v_launch.id OR g.launch_id IS NULL)
            AND g.used_at IS NULL
            AND g.revoked_at IS NULL
            AND (g.expires_at IS NULL OR g.expires_at > clock_timestamp())
            AND g.used_attempts < g.max_attempts
        )
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN '{}'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'launch', to_jsonb(v_launch),
    'participant', to_jsonb(v_participant)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_student_active_launch(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_active_launch(TEXT) TO authenticated;

-- Confirmation records attendance only; it must not consume a retry.
DO $assert$
DECLARE v_definition TEXT;
BEGIN
  v_definition := pg_get_functiondef('public.confirm_quiz_presence(uuid)'::regprocedure);
  IF position('SET used_at' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'Presence confirmation must not consume retry grants.';
  END IF;
END
$assert$;

NOTIFY pgrst, 'reload schema';`;
