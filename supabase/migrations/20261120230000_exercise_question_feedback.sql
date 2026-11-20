-- Feedback sécurisé question par question pour les exercices en mode batch.
-- La réponse attendue n'est révélée qu'après validation de la question concernée.
CREATE OR REPLACE FUNCTION public.evaluate_exercise_attempt_question(
  p_attempt_id UUID,
  p_question_id TEXT,
  p_answer JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_attempt public.exercise_attempts%ROWTYPE;
  v_content JSONB;
  v_question JSONB;
  v_grade JSONB;
  v_deadline TIMESTAMPTZ;
  v_elapsed_seconds INTEGER := 0;
  v_duration INTEGER;
  v_id TEXT;
  v_has_answer BOOLEAN;
  v_timed_out BOOLEAN;
BEGIN
  SELECT * INTO v_attempt
  FROM public.exercise_attempts
  WHERE id = p_attempt_id
    AND student_id = public.exercise_current_student_id()
  FOR UPDATE;

  IF NOT FOUND OR v_attempt.status <> 'in_progress' OR NOT v_attempt.batch_mode THEN
    RAISE EXCEPTION 'Tentative introuvable, terminée ou non compatible.';
  END IF;

  IF NOT (v_attempt.question_order ? p_question_id) THEN
    RAISE EXCEPTION 'Question inconnue pour cette tentative.';
  END IF;

  SELECT content INTO v_content
  FROM public.exercise_versions
  WHERE id = v_attempt.version_id;

  SELECT q.value INTO v_question
  FROM jsonb_array_elements(v_content -> 'questions') q(value)
  WHERE q.value ->> 'id' = p_question_id;

  IF v_question IS NULL THEN
    RAISE EXCEPTION 'Question introuvable dans la version de l’exercice.';
  END IF;

  FOREACH v_id IN ARRAY ARRAY(
    SELECT jsonb_array_elements_text(v_attempt.question_order)
  )
  LOOP
    SELECT greatest(1, coalesce((q.value ->> 'time_limit_seconds')::integer, 1))
    INTO v_duration
    FROM jsonb_array_elements(v_content -> 'questions') q(value)
    WHERE q.value ->> 'id' = v_id;
    v_elapsed_seconds := v_elapsed_seconds + coalesce(v_duration, 1);
    IF v_id = p_question_id THEN
      EXIT;
    END IF;
  END LOOP;

  v_deadline := v_attempt.started_at + make_interval(secs => v_elapsed_seconds);
  v_has_answer := p_answer IS NOT NULL
    AND p_answer <> 'null'::jsonb
    AND (jsonb_typeof(p_answer) <> 'string' OR btrim(p_answer #>> '{}') <> '');
  v_timed_out := NOT v_has_answer AND clock_timestamp() >= v_deadline;

  IF v_timed_out THEN
    v_grade := jsonb_build_object(
      'correct', FALSE,
      'points', 0,
      'max_points', coalesce((v_question ->> 'points')::numeric, 0),
      'expected', coalesce(v_question -> 'answers', v_question -> 'correct_answer', v_question #> '{verbes_trous,phrases}'),
      'explanation', v_question -> 'explanation'
    );
  ELSE
    v_grade := public.exercise_grade_question(v_question, coalesce(p_answer, 'null'::jsonb));
  END IF;

  RETURN v_grade || jsonb_build_object(
    'timed_out', v_timed_out,
    'question_id', p_question_id,
    'student_answer', p_answer
  );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_exercise_attempt_question(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_exercise_attempt_question(UUID, TEXT, JSONB) TO authenticated;
NOTIFY pgrst, 'reload schema';
