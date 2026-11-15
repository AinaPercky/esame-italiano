-- PerckyLingua: verrouillage définitif après soumission et consommation de la seconde chance.
CREATE OR REPLACE FUNCTION public.get_student_active_launch(p_quiz_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_student TEXT := public.quiz_current_student_id(); v_row JSONB;
BEGIN
  SELECT jsonb_build_object('launch', to_jsonb(l), 'participant', to_jsonb(p)) INTO v_row
  FROM public.quiz_launches l
  JOIN public.quiz_participants p ON p.launch_id = l.id
  WHERE l.quiz_id = p_quiz_id AND l.status = 'launched' AND p.student_id = v_student
    AND (
      p.presence_status IN ('pending', 'present')
      OR (p.presence_status = 'retry_authorized' AND p.presence_confirmed_at IS NULL)
    )
  ORDER BY l.launched_at DESC LIMIT 1;
  RETURN COALESCE(v_row, '{}'::jsonb);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_quiz_presence_submission(p_submission jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  sid TEXT := public.quiz_current_student_id();
  v_quiz_id TEXT := p_submission ->> 'quiz_id';
  v_quiz public.quizzes%ROWTYPE;
  attempt_no INTEGER;
  saved_answers JSONB;
  e JSONB;
  payload JSONB;
  v_status TEXT := coalesce(p_submission ->> 'status', 'completed');
  result JSONB;
  v_best_score NUMERIC;
  v_is_counted BOOLEAN;
BEGIN
  -- Verrou identique à celui de la fonction de persistance : évite que deux
  -- remises concurrentes calculent le même numéro de tentative.
  SELECT * INTO v_quiz
  FROM public.quizzes
  WHERE id = v_quiz_id
  FOR UPDATE;

  IF NOT FOUND OR v_quiz.status <> 'launched' THEN
    RAISE EXCEPTION 'Quiz non lancé.';
  END IF;

  SELECT greatest(
    coalesce((SELECT max(a.attempt_number)
              FROM public.quiz_attempts a
              WHERE a.quiz_id = v_quiz_id AND a.student_id = sid), 0),
    coalesce((SELECT max(s.attempt_number)
              FROM public.quiz_submissions s
              WHERE s.quiz_id = v_quiz_id AND s.student_id = sid), 0)
  ) + 1
  INTO attempt_no;

  SELECT coalesce(jsonb_object_agg(question_id, answer), '{}'::jsonb)
    INTO saved_answers
  FROM public.quiz_question_evaluations
  WHERE quiz_id = v_quiz_id
    AND student_id = sid
    AND attempt_number = attempt_no;

  -- Les réponses transmises par le navigateur ne font jamais autorité.
  e := public.quiz_grade_all(v_quiz_id, coalesce(saved_answers, '{}'::jsonb));
  IF v_status = 'timeout' THEN
    e := jsonb_set(jsonb_set(e, '{rawScore}', '0'::jsonb), '{score20}', '0'::jsonb);
  END IF;

  payload := p_submission || jsonb_build_object(
    'answers', coalesce(saved_answers, '{}'::jsonb),
    'score', e -> 'rawScore',
    'max_score', e -> 'maxScore',
    'score_20', e -> 'score20',
    'feedback', e -> 'feedback'
  );

  SELECT public.submit_quiz_presence_submission_legacy_unsafe(payload)
    INTO result;

  -- Verrouiller la participation dès que la copie est remise.
  UPDATE public.quiz_participants
  SET presence_status = 'completed',
      final_status = v_status,
      final_score = coalesce((result ->> 'score_20')::numeric, 0),
      attendance_locked_at = coalesce(attendance_locked_at, now())
  WHERE quiz_id = v_quiz_id
    AND student_id = sid
    AND presence_status IN ('present', 'retry_authorized');

  -- Réconcilier aussi les indicateurs de résultat avec la meilleure tentative,
  -- sans toucher aux réponses ni aux lignes d'historique.
  UPDATE public.quiz_submissions s
  SET is_counted = (
    s.id = (
      SELECT candidate.id
      FROM public.quiz_submissions candidate
      WHERE candidate.quiz_id = v_quiz_id AND candidate.student_id = sid
      ORDER BY candidate.score_20 DESC,
               candidate.submitted_at DESC NULLS LAST,
               candidate.attempt_number DESC,
               candidate.id DESC
      LIMIT 1
    )
  )
  WHERE s.quiz_id = v_quiz_id AND s.student_id = sid;

  SELECT score_20 INTO v_best_score
  FROM public.quiz_submissions
  WHERE quiz_id = v_quiz_id AND student_id = sid AND is_counted = TRUE
  ORDER BY attempt_number DESC
  LIMIT 1;

  SELECT coalesce((
    SELECT is_counted
    FROM public.quiz_submissions
    WHERE quiz_id = v_quiz_id
      AND student_id = sid
      AND attempt_number = (result ->> 'attempt_number')::integer
    LIMIT 1
  ), FALSE) INTO v_is_counted;

  -- Le résumé de participation doit refléter la note de référence, pas
  -- systématiquement la note de la dernière tentative.
  IF nullif(result ->> 'participant_id', '') IS NOT NULL THEN
    UPDATE public.quiz_participants
    SET final_score = v_best_score
    WHERE id = (result ->> 'participant_id')::uuid;
  END IF;

  RETURN coalesce(result, '{}'::jsonb) ||
    jsonb_build_object('is_counted', v_is_counted, 'best_score_20', v_best_score);
END;
$function$
;

REVOKE ALL ON FUNCTION public.get_student_active_launch(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_active_launch(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_quiz_presence_submission(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_quiz_presence_submission(JSONB) TO authenticated;
NOTIFY pgrst, 'reload schema';
