-- PerckyLingua — correction groupée des quiz publics.
-- Les réponses restent côté client jusqu'à la remise ; aucune clé de réponse n'est exposée.
-- Une seule RPC calcule l'ensemble du résultat côté PostgreSQL.

CREATE OR REPLACE FUNCTION public.evaluate_public_quiz_answers(
  p_public_id TEXT,
  p_answers JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz public.quizzes%ROWTYPE;
  v_question JSONB;
  v_eval JSONB;
  v_feedback JSONB := '{}'::jsonb;
  v_raw_score NUMERIC := 0;
  v_max_score NUMERIC := 0;
  v_question_id TEXT;
BEGIN
  IF jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Format des réponses invalide.';
  END IF;

  SELECT * INTO v_quiz
  FROM public.quizzes q
  WHERE q.is_public = TRUE
    AND (q.public_id::text = btrim(coalesce(p_public_id, '')) OR q.id = btrim(coalesce(p_public_id, '')))
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz public introuvable.';
  END IF;

  FOR v_question IN
    SELECT value FROM jsonb_array_elements(coalesce(v_quiz.questions, '[]'::jsonb))
  LOOP
    v_question_id := v_question ->> 'id';
    IF v_question_id IS NULL OR v_question_id = '' THEN
      RAISE EXCEPTION 'Une question du quiz ne possède pas d’identifiant.';
    END IF;

    v_eval := public.quiz_grade_question(v_question, p_answers ->> v_question_id);
    v_raw_score := v_raw_score + coalesce((v_eval ->> 'points')::numeric, 0);
    v_max_score := v_max_score + coalesce((v_eval ->> 'maxPoints')::numeric, 0);

    v_feedback := v_feedback || jsonb_build_object(
      v_question_id,
      jsonb_build_object(
        'correct', coalesce((v_eval ->> 'correct')::boolean, false),
        'points', coalesce((v_eval ->> 'points')::numeric, 0),
        'maxPoints', coalesce((v_eval ->> 'maxPoints')::numeric, 0),
        'expected', coalesce(v_eval ->> 'expected', ''),
        'studentAnswer', coalesce(v_eval ->> 'studentAnswer', ''),
        'explanation', v_eval -> 'explanation'
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'rawScore', round(v_raw_score, 2),
    'maxScore', coalesce(nullif(v_quiz.total_points, 0), v_max_score, 20),
    'feedback', v_feedback
  );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_public_quiz_answers(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_public_quiz_answers(TEXT, JSONB) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
