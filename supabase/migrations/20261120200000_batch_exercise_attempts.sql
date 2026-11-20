-- PerckyLingua — démarrage et remise groupés des exercices.
-- Le navigateur reçoit uniquement les questions nettoyées ; la correction et les échéances
-- restent autoritaires côté PostgreSQL. Les RPC historiques sont conservées pour reprise
-- des tentatives démarrées avant cette migration.

ALTER TABLE public.exercise_attempts
  ADD COLUMN IF NOT EXISTS batch_mode BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.exercise_sanitize_question_for_batch(
  p_question JSONB,
  p_option_order JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_safe JSONB := coalesce(p_question, '{}'::jsonb) - 'correct_answer' - 'answers' - 'explanation' - 'phrases';
  v_vt JSONB;
  v_phrases JSONB;
BEGIN
  IF p_question ? 'options' THEN
    v_safe := jsonb_set(v_safe, '{options}', coalesce(p_option_order, p_question -> 'options', '[]'::jsonb), true);
  END IF;

  IF jsonb_typeof(p_question -> 'verbes_trous') = 'object' THEN
    v_vt := p_question -> 'verbes_trous';
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'id', phrase.value -> 'id',
        'debut', coalesce(phrase.value ->> 'debut', ''),
        'fin', coalesce(phrase.value ->> 'fin', '')
      ) ORDER BY phrase.ordinality
    ), '[]'::jsonb)
    INTO v_phrases
    FROM jsonb_array_elements(coalesce(v_vt -> 'phrases', '[]'::jsonb))
      WITH ORDINALITY AS phrase(value, ordinality);

    v_vt := jsonb_build_object(
      'titre', v_vt -> 'titre',
      'consigne', v_vt -> 'consigne',
      'points_par_phrase', v_vt -> 'points_par_phrase',
      'banque', v_vt -> 'banque',
      'phrases', v_phrases
    );
    v_safe := jsonb_set(v_safe, '{verbes_trous}', v_vt, true);
  END IF;

  RETURN v_safe;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_exercise_attempt_bundle(p_attempt_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_attempt public.exercise_attempts%ROWTYPE;
  v_content JSONB;
  v_question JSONB;
  v_question_id TEXT;
  v_questions JSONB := '[]'::jsonb;
  v_elapsed_seconds INTEGER := 0;
  v_duration INTEGER;
  v_deadline TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_attempt
  FROM public.exercise_attempts
  WHERE id = p_attempt_id
    AND student_id = public.exercise_current_student_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tentative introuvable ou accès interdit.';
  END IF;
  IF NOT v_attempt.batch_mode THEN
    RETURN NULL;
  END IF;
  IF v_attempt.status <> 'in_progress' THEN
    RETURN jsonb_build_object(
      'completed', TRUE,
      'attempt_id', v_attempt.id,
      'score', v_attempt.score,
      'max_score', v_attempt.max_score,
      'completed_at', v_attempt.completed_at
    );
  END IF;

  SELECT content INTO v_content
  FROM public.exercise_versions
  WHERE id = v_attempt.version_id;

  FOR v_question_id IN
    SELECT value FROM jsonb_array_elements_text(v_attempt.question_order)
  LOOP
    SELECT q.value INTO v_question
    FROM jsonb_array_elements(v_content -> 'questions') q(value)
    WHERE q.value ->> 'id' = v_question_id;

    IF v_question IS NULL THEN
      RAISE EXCEPTION 'Question introuvable dans la version de l’exercice.';
    END IF;

    v_duration := greatest(1, coalesce((v_question ->> 'time_limit_seconds')::integer, 1));
    v_elapsed_seconds := v_elapsed_seconds + v_duration;
    v_deadline := v_attempt.started_at + make_interval(secs => v_elapsed_seconds);

    v_questions := v_questions || jsonb_build_array(jsonb_build_object(
      'question', public.exercise_sanitize_question_for_batch(
        v_question,
        v_attempt.option_orders -> v_question_id
      ),
      'question_number', jsonb_array_length(v_questions) + 1,
      'question_count', jsonb_array_length(v_attempt.question_order),
      'deadline_at', v_deadline,
      'seconds_remaining', greatest(0, floor(extract(epoch from (v_deadline - clock_timestamp())))::integer)
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'exercise_id', v_attempt.exercise_id,
    'started_at', v_attempt.started_at,
    'server_now', clock_timestamp(),
    'questions', v_questions
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_exercise_attempt_batch(p_exercise_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_started JSONB;
  v_attempt_id UUID;
BEGIN
  -- Reuse the existing validated start flow (class access, immutable version,
  -- random question order, shuffled options, and server-side first deadline).
  v_started := public.start_exercise_attempt(p_exercise_id);
  v_attempt_id := (v_started ->> 'attempt_id')::uuid;

  UPDATE public.exercise_attempts
  SET batch_mode = TRUE
  WHERE id = v_attempt_id
    AND student_id = public.exercise_current_student_id()
    AND status = 'in_progress';

  RETURN public.get_exercise_attempt_bundle(v_attempt_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_exercise_attempt_batch(
  p_attempt_id UUID,
  p_answers JSONB
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
  v_question_id TEXT;
  v_answer JSONB;
  v_grade JSONB;
  v_feedback JSONB := '{}'::jsonb;
  v_answers JSONB := coalesce(p_answers, '{}'::jsonb);
  v_elapsed_seconds INTEGER := 0;
  v_duration INTEGER;
  v_deadline TIMESTAMPTZ;
  v_timed_out BOOLEAN;
  v_has_answer BOOLEAN;
  v_score NUMERIC := 0;
  v_max_points NUMERIC;
  v_completed_at TIMESTAMPTZ;
BEGIN
  IF jsonb_typeof(v_answers) <> 'object' THEN
    RAISE EXCEPTION 'Format des réponses invalide.';
  END IF;

  SELECT * INTO v_attempt
  FROM public.exercise_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND OR v_attempt.student_id <> public.exercise_current_student_id() THEN
    RAISE EXCEPTION 'Tentative introuvable ou accès interdit.';
  END IF;

  IF NOT v_attempt.batch_mode THEN
    RAISE EXCEPTION 'Cette tentative utilise encore le parcours de validation historique.';
  END IF;

  SELECT content INTO v_content
  FROM public.exercise_versions
  WHERE id = v_attempt.version_id;

  IF v_attempt.status = 'completed' THEN
    -- Rebuild the correction payload after a lost network response so retries
    -- remain idempotent and still render the detailed review.
    FOR v_question_id IN
      SELECT value FROM jsonb_array_elements_text(v_attempt.question_order)
    LOOP
      SELECT q.value INTO v_question
      FROM jsonb_array_elements(v_content -> 'questions') q(value)
      WHERE q.value ->> 'id' = v_question_id;

      SELECT answer, timed_out INTO v_answer, v_timed_out
      FROM public.exercise_answers
      WHERE attempt_id = v_attempt.id AND question_id = v_question_id;

      IF coalesce(v_timed_out, FALSE) THEN
        v_grade := jsonb_build_object(
          'correct', FALSE,
          'points', 0,
          'max_points', coalesce((v_question ->> 'points')::numeric, 0),
          'expected', coalesce(v_question -> 'answers', v_question -> 'correct_answer', v_question #> '{verbes_trous,phrases}'),
          'explanation', v_question -> 'explanation'
        );
      ELSE
        v_grade := public.exercise_grade_question(v_question, coalesce(v_answer, 'null'::jsonb));
      END IF;

      v_grade := v_grade || jsonb_build_object(
        'timed_out', coalesce(v_timed_out, FALSE),
        'question_id', v_question_id,
        'student_answer', v_answer
      );
      v_feedback := v_feedback || jsonb_build_object(v_question_id, v_grade);
    END LOOP;

    RETURN jsonb_build_object(
      'completed', TRUE,
      'attempt_id', v_attempt.id,
      'score', v_attempt.score,
      'max_score', v_attempt.max_score,
      'completed_at', v_attempt.completed_at,
      'feedback', v_feedback
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(v_answers) AS supplied(question_id)
    WHERE NOT (v_attempt.question_order ? supplied.question_id)
  ) THEN
    RAISE EXCEPTION 'Une réponse est associée à une question inconnue.';
  END IF;

  v_max_points := v_attempt.max_score;

  FOR v_question_id IN
    SELECT value FROM jsonb_array_elements_text(v_attempt.question_order)
  LOOP
    SELECT q.value INTO v_question
    FROM jsonb_array_elements(v_content -> 'questions') q(value)
    WHERE q.value ->> 'id' = v_question_id;

    IF v_question IS NULL THEN
      RAISE EXCEPTION 'Question introuvable dans la version de l’exercice.';
    END IF;

    v_duration := greatest(1, coalesce((v_question ->> 'time_limit_seconds')::integer, 1));
    v_elapsed_seconds := v_elapsed_seconds + v_duration;
    v_deadline := v_attempt.started_at + make_interval(secs => v_elapsed_seconds);
    v_answer := v_answers -> v_question_id;
    v_has_answer := v_answer IS NOT NULL
      AND v_answer <> 'null'::jsonb
      AND (jsonb_typeof(v_answer) <> 'string' OR btrim(v_answer #>> '{}') <> '');

    -- Le navigateur progresse sans RPC intermédiaire. Les réponses déjà saisies
    -- restent évaluées à la remise finale ; seules les questions laissées vides
    -- après leur échéance cumulative sont marquées timeout côté serveur.
    v_timed_out := NOT v_has_answer AND clock_timestamp() > v_deadline;

    IF v_timed_out THEN
      v_grade := jsonb_build_object(
        'correct', FALSE,
        'points', 0,
        'max_points', coalesce((v_question ->> 'points')::numeric, 0),
        'expected', coalesce(v_question -> 'answers', v_question -> 'correct_answer', v_question #> '{verbes_trous,phrases}'),
        'explanation', v_question -> 'explanation'
      );
    ELSE
      v_grade := public.exercise_grade_question(v_question, coalesce(v_answer, 'null'::jsonb));
    END IF;

    v_grade := v_grade || jsonb_build_object(
      'timed_out', v_timed_out,
      'question_id', v_question_id,
      'student_answer', v_answer
    );

    INSERT INTO public.exercise_answers(
      attempt_id, question_id, answer, is_correct, points_awarded, max_points, timed_out
    ) VALUES (
      v_attempt.id,
      v_question_id,
      v_answer,
      coalesce((v_grade ->> 'correct')::boolean, FALSE),
      coalesce((v_grade ->> 'points')::numeric, 0),
      coalesce((v_grade ->> 'max_points')::numeric, 0),
      v_timed_out
    )
    ON CONFLICT (attempt_id, question_id) DO UPDATE SET
      answer = EXCLUDED.answer,
      is_correct = EXCLUDED.is_correct,
      points_awarded = EXCLUDED.points_awarded,
      max_points = EXCLUDED.max_points,
      timed_out = EXCLUDED.timed_out,
      answered_at = clock_timestamp();

    v_score := v_score + coalesce((v_grade ->> 'points')::numeric, 0);
    v_feedback := v_feedback || jsonb_build_object(v_question_id, v_grade);
  END LOOP;

  UPDATE public.exercise_attempts
  SET answers = v_answers,
      score = round(v_score, 2),
      status = 'completed',
      completed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE id = v_attempt.id
  RETURNING completed_at INTO v_completed_at;

  RETURN jsonb_build_object(
    'completed', TRUE,
    'attempt_id', v_attempt.id,
    'score', round(v_score, 2),
    'max_score', v_max_points,
    'completed_at', v_completed_at,
    'feedback', v_feedback
  );
END;
$$;

REVOKE ALL ON FUNCTION public.exercise_sanitize_question_for_batch(JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_exercise_attempt_bundle(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_exercise_attempt_batch(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_exercise_attempt_batch(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exercise_attempt_bundle(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_exercise_attempt_batch(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_exercise_attempt_batch(UUID, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
