-- Réactiver les autorisations individuelles encore valides créées avant ce correctif.
-- Crée un lancement par quiz fermé, rattache les autorisations et ne touche jamais
-- aux anciennes tentatives, soumissions, notes ou réponses.
DO $$
DECLARE
  v_quiz_id TEXT;
  v_launch public.quiz_launches%ROWTYPE;
BEGIN
  FOR v_quiz_id IN
    SELECT DISTINCT g.quiz_id
    FROM public.quiz_retry_grants g
    JOIN public.quizzes q ON q.id = g.quiz_id
    JOIN public.students s ON s.id::text = g.student_id
    WHERE g.used_at IS NULL
      AND g.revoked_at IS NULL
      AND g.used_attempts < g.max_attempts
      AND (g.expires_at IS NULL OR g.expires_at > clock_timestamp())
  LOOP
    SELECT * INTO v_launch
    FROM public.quiz_launches
    WHERE quiz_id = v_quiz_id AND status = 'launched'
    ORDER BY launched_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.quiz_launches (quiz_id, launched_at, status)
      VALUES (v_quiz_id, clock_timestamp(), 'launched')
      RETURNING * INTO v_launch;
    END IF;

    UPDATE public.quiz_retry_grants
    SET launch_id = v_launch.id
    WHERE quiz_id = v_quiz_id
      AND used_at IS NULL
      AND revoked_at IS NULL
      AND used_attempts < max_attempts
      AND (expires_at IS NULL OR expires_at > clock_timestamp());

    INSERT INTO public.quiz_participants (
      launch_id, quiz_id, student_id, class_id, presence_status
    )
    SELECT v_launch.id, v_quiz_id, s.id::text, s.class_id::text, 'retry_authorized'
    FROM public.quiz_retry_grants g
    JOIN public.students s ON s.id::text = g.student_id
    WHERE g.quiz_id = v_quiz_id
      AND g.launch_id = v_launch.id
      AND g.used_at IS NULL
      AND g.revoked_at IS NULL
      AND g.used_attempts < g.max_attempts
      AND (g.expires_at IS NULL OR g.expires_at > clock_timestamp())
    GROUP BY s.id, s.class_id
    ON CONFLICT (launch_id, student_id)
    DO UPDATE SET
      presence_status = 'retry_authorized',
      presence_confirmed_at = NULL,
      attendance_locked_at = NULL,
      presence_deadline_at = NULL;

    UPDATE public.quizzes
    SET status = 'launched',
        launched_at = v_launch.launched_at,
        expires_at = NULL
    WHERE id = v_quiz_id;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
