export const QUIZ_INDIVIDUAL_RETRY_MIGRATION_SQL = String.raw`-- PerckyLingua — permettre à un élève autorisé de reprendre un quiz déjà clôturé.
-- Si aucun lancement n'est actif, créer un nouveau lancement et y inscrire l'élève
-- avec le statut retry_authorized. Les anciennes tentatives, notes et copies sont conservées.

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
AS $$
DECLARE
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

  SELECT s.class_id::text INTO v_class_id
  FROM public.students s
  JOIN public.quizzes q ON q.id = p_quiz_id
  WHERE s.id::text = p_student_id
    AND s.class_id::text = ANY(
      coalesce(nullif(q.class_ids, ARRAY[]::text[]), ARRAY[q.class_id])
    )
  LIMIT 1;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Cet élève n’appartient pas aux classes de ce quiz.';
  END IF;

  IF p_launch_id IS NOT NULL THEN
    SELECT * INTO v_launch
    FROM public.quiz_launches
    WHERE id = p_launch_id AND quiz_id = p_quiz_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Le lancement ciblé ne correspond pas à ce quiz.';
    END IF;
    IF v_launch.status <> 'launched' THEN
      v_launch.id := NULL;
    END IF;
  ELSE
    SELECT * INTO v_launch
    FROM public.quiz_launches
    WHERE quiz_id = p_quiz_id AND status = 'launched'
    ORDER BY launched_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  INSERT INTO public.quiz_retry_grants (
    quiz_id, student_id, granted_by, reason, launch_id
  )
  VALUES (
    p_quiz_id, p_student_id, auth.uid(), btrim(p_reason), v_launch.id
  )
  RETURNING * INTO v_grant;

  IF v_launch.id IS NULL THEN
    -- Réouvrir le quiz par la RPC officielle; elle rattache les autorisations
    -- sans lancement à la nouvelle session et crée les participants autorisés.
    PERFORM public.launch_quiz_with_presence(p_quiz_id);

    SELECT * INTO v_launch
    FROM public.quiz_launches
    WHERE quiz_id = p_quiz_id AND status = 'launched'
    ORDER BY launched_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Impossible de créer un nouveau lancement pour cette seconde chance.';
    END IF;

    UPDATE public.quiz_retry_grants
    SET launch_id = v_launch.id
    WHERE id = v_grant.id
    RETURNING * INTO v_grant;
  END IF;

  INSERT INTO public.quiz_participants (
    launch_id, quiz_id, student_id, class_id, presence_status
  )
  VALUES (
    v_launch.id, p_quiz_id, p_student_id, v_class_id, 'retry_authorized'
  )
  ON CONFLICT (launch_id, student_id)
  DO UPDATE SET presence_status = 'retry_authorized';

  UPDATE public.quizzes
  SET status = 'launched', launched_at = v_launch.launched_at, expires_at = NULL
  WHERE id = p_quiz_id;

  RETURN jsonb_build_object(
    'id', v_grant.id,
    'quiz_id', v_grant.quiz_id,
    'student_id', v_grant.student_id,
    'launch_id', v_launch.id,
    'granted', 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_quiz_retry(TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_quiz_retry(TEXT, TEXT, TEXT, UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';


-- Réactiver les autorisations individuelles encore valides créées avant ce correctif.
-- Crée un lancement par quiz fermé, rattache les autorisations et ne touche jamais
-- aux anciennes tentatives, soumissions, notes ou réponses.
DO $
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
$;

NOTIFY pgrst, 'reload schema';
`;
