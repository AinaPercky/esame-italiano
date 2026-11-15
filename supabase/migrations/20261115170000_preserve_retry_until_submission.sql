-- Keep a teacher-authorized retry available until the student submits the retry.
-- Confirmation records attendance but must never consume the retry grant.
CREATE OR REPLACE FUNCTION public.confirm_quiz_presence(p_launch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student TEXT := public.quiz_current_student_id();
  v_quiz public.quizzes%ROWTYPE;
  v_launch public.quiz_launches%ROWTYPE;
  v_participant public.quiz_participants%ROWTYPE;
  v_retry_grant_id UUID;
  v_clicked_at TIMESTAMPTZ;
BEGIN
  SELECT q.* INTO v_quiz
  FROM public.quizzes q
  JOIN public.quiz_launches l ON l.quiz_id = q.id
  WHERE l.id = p_launch_id
  FOR UPDATE OF q;
  IF NOT FOUND OR v_quiz.status <> 'launched' THEN
    RAISE EXCEPTION 'Ce quiz est clôturé ou indisponible.';
  END IF;

  SELECT * INTO v_launch
  FROM public.quiz_launches
  WHERE id = p_launch_id
  FOR UPDATE;
  IF NOT FOUND OR v_launch.status <> 'launched' THEN
    RAISE EXCEPTION 'Ce quiz est clôturé ou indisponible.';
  END IF;

  SELECT * INTO v_participant
  FROM public.quiz_participants
  WHERE launch_id = p_launch_id AND student_id = v_student
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vous n’êtes pas autorisé à rejoindre ce lancement.';
  END IF;
  IF v_participant.presence_status = 'absent' THEN
    RAISE EXCEPTION 'Cette absence est verrouillée; demandez une seconde chance au professeur.';
  END IF;
  IF v_participant.presence_status NOT IN ('pending', 'present', 'retry_authorized') THEN
    RAISE EXCEPTION 'Cette participation est déjà verrouillée.';
  END IF;

  v_clicked_at := clock_timestamp();

  -- Validate the grant at first confirmation, but do NOT set used_at here.
  -- The grant is consumed atomically by submit_quiz_presence_submission().
  IF v_participant.presence_status = 'retry_authorized'
     AND v_participant.presence_confirmed_at IS NULL THEN
    SELECT g.id INTO v_retry_grant_id
    FROM public.quiz_retry_grants g
    WHERE g.quiz_id = v_quiz.id
      AND g.student_id = v_student
      AND (g.launch_id = p_launch_id OR g.launch_id IS NULL)
      AND g.used_at IS NULL
      AND (g.expires_at IS NULL OR g.expires_at > v_clicked_at)
    ORDER BY g.created_at
    LIMIT 1
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La seconde chance est expirée ou déjà utilisée; demandez une nouvelle autorisation au professeur.';
    END IF;
  END IF;

  UPDATE public.quiz_participants
  SET presence_status = CASE
        WHEN presence_status = 'retry_authorized' THEN 'retry_authorized'
        ELSE 'present'
      END,
      presence_confirmed_at = COALESCE(presence_confirmed_at, v_clicked_at),
      attendance_locked_at = COALESCE(attendance_locked_at, v_clicked_at),
      presence_deadline_at = COALESCE(
        presence_deadline_at,
        COALESCE(presence_confirmed_at, v_clicked_at) + interval '10 seconds'
      )
  WHERE id = v_participant.id
  RETURNING * INTO v_participant;

  RETURN to_jsonb(v_participant);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_quiz_presence(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_quiz_presence(UUID) TO authenticated;

-- Recover grants consumed by the old confirmation RPC when no retry was submitted.
-- Completed attempts are never reset.
UPDATE public.quiz_retry_grants g
SET used_at = NULL
FROM public.quiz_participants p
JOIN public.quiz_launches l ON l.id = p.launch_id
WHERE g.quiz_id = p.quiz_id
  AND g.student_id = p.student_id
  AND g.launch_id = p.launch_id
  AND g.used_at IS NOT NULL
  AND p.presence_status = 'retry_authorized'
  AND p.presence_confirmed_at IS NOT NULL
  AND l.status = 'launched'
  AND NOT EXISTS (
    SELECT 1 FROM public.quiz_attempts a
    WHERE a.participant_id = p.id AND a.launch_id = p.launch_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.quiz_submissions s
    WHERE s.quiz_id = p.quiz_id AND s.student_id = p.student_id
      AND s.launch_id = p.launch_id
  );

NOTIFY pgrst, 'reload schema';
