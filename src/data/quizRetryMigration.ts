export const QUIZ_INDIVIDUAL_RETRY_MIGRATION_SQL = String.raw`-- PerckyLingua — corriger la seconde chance individuelle après une tentative terminée
-- Migration additive et idempotente. Aucune tentative, note ou copie n'est supprimée.
-- Un élève déjà en completed peut recevoir une nouvelle autorisation sur le lancement actif.

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
    IF NOT FOUND OR v_launch.status <> 'launched' THEN
      RAISE EXCEPTION 'Le lancement ciblé est introuvable ou déjà clôturé.';
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

  IF v_launch.id IS NOT NULL THEN
    -- Inclut les participants completed, mais conserve leur ancienne note et leur copie.
    -- L'UPSERT couvre aussi un élève absent de la liste initiale du lancement.
    INSERT INTO public.quiz_participants (
      launch_id, quiz_id, student_id, class_id, presence_status
    )
    VALUES (
      v_launch.id, p_quiz_id, p_student_id, v_class_id, 'retry_authorized'
    )
    ON CONFLICT (launch_id, student_id)
    DO UPDATE SET presence_status = 'retry_authorized';
  END IF;

  RETURN jsonb_build_object(
    'id', v_grant.id,
    'quiz_id', v_grant.quiz_id,
    'student_id', v_grant.student_id,
    'launch_id', v_grant.launch_id,
    'granted', 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_quiz_retry(TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_quiz_retry(TEXT, TEXT, TEXT, UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
`;
