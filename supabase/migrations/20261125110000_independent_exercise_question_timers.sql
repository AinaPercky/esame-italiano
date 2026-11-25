-- Chronomètre indépendant par question pour le parcours groupé des exercices.
-- Chaque transition démarre une nouvelle échéance côté PostgreSQL.
-- Les secondes inutilisées d'une question ne sont jamais reportées.

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
  v_question_index INTEGER := 0;
  v_deadline TIMESTAMPTZ;
  v_server_now TIMESTAMPTZ := clock_timestamp();
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

    v_deadline := CASE
      WHEN v_question_index = v_attempt.current_question_index
        THEN v_attempt.current_question_deadline_at
      ELSE NULL
    END;

    v_questions := v_questions || jsonb_build_array(jsonb_build_object(
      'question', public.exercise_sanitize_question_for_batch(
        v_question,
        v_attempt.option_orders -> v_question_id
      ),
      'question_number', v_question_index + 1,
      'question_count', jsonb_array_length(v_attempt.question_order),
      'deadline_at', v_deadline,
      'seconds_remaining', CASE
        WHEN v_deadline IS NULL THEN 0
        ELSE greatest(0, ceil(extract(epoch from (v_deadline - v_server_now)))::integer)
      END
    ));

    v_question_index := v_question_index + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'exercise_id', v_attempt.exercise_id,
    'started_at', v_attempt.started_at,
    'server_now', v_server_now,
    'current_question_index', v_attempt.current_question_index,
    'questions', v_questions
  );
END;
$$;

-- La correction ne peut porter que sur la question actuellement ouverte.
-- Une réponse reçue après l'échéance est systématiquement considérée expirée.
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

  IF v_attempt.question_order ->> v_attempt.current_question_index IS DISTINCT FROM p_question_id THEN
    RAISE EXCEPTION 'Cette question n’est pas actuellement ouverte.';
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

  v_timed_out := v_attempt.current_question_deadline_at IS NULL
    OR clock_timestamp() >= v_attempt.current_question_deadline_at;

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

  -- Figer la validation au moment où elle est reçue : l'écran de correction
  -- est sans limite de temps et ne doit pas faire expirer rétroactivement la réponse.
  INSERT INTO public.exercise_answers(
    attempt_id, question_id, answer, is_correct, points_awarded, max_points, timed_out
  ) VALUES (
    v_attempt.id, p_question_id, p_answer,
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

  UPDATE public.exercise_attempts
  SET answers = coalesce(answers, '{}'::jsonb) || jsonb_build_object(p_question_id, p_answer),
      updated_at = clock_timestamp()
  WHERE id = v_attempt.id;

  RETURN v_grade || jsonb_build_object(
    'timed_out', v_timed_out,
    'question_id', p_question_id,
    'student_answer', p_answer
  );
END;
$$;

-- Enregistre la réponse courante puis démarre le timer complet de la question suivante.
-- L'opération est idempotente si la réponse réseau de la transition a été perdue.
CREATE OR REPLACE FUNCTION public.advance_exercise_attempt_batch(
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
  v_next_question JSONB;
  v_answer JSONB := coalesce(p_answer, 'null'::jsonb);
  v_grade JSONB;
  v_timed_out BOOLEAN;
  v_next_started_at TIMESTAMPTZ;
  v_next_deadline TIMESTAMPTZ;
  v_current_id TEXT;
  v_next_id TEXT;
  v_next_duration INTEGER;
BEGIN
  SELECT * INTO v_attempt
  FROM public.exercise_attempts
  WHERE id = p_attempt_id
    AND student_id = public.exercise_current_student_id()
  FOR UPDATE;

  IF NOT FOUND OR v_attempt.status <> 'in_progress' OR NOT v_attempt.batch_mode THEN
    RAISE EXCEPTION 'Tentative introuvable, terminée ou non compatible.';
  END IF;

  v_current_id := v_attempt.question_order ->> v_attempt.current_question_index;

  -- Répétition sûre après un timeout réseau : la transition a déjà été validée.
  IF v_current_id IS DISTINCT FROM p_question_id THEN
    IF v_attempt.current_question_index > 0
       AND v_attempt.question_order ->> (v_attempt.current_question_index - 1) = p_question_id THEN
      RETURN jsonb_build_object(
        'advanced', TRUE,
        'idempotent', TRUE,
        'current_question_index', v_attempt.current_question_index,
        'deadline_at', v_attempt.current_question_deadline_at,
        'seconds_remaining', greatest(0, ceil(extract(epoch from (v_attempt.current_question_deadline_at - clock_timestamp())))::integer),
        'server_now', clock_timestamp()
      );
    END IF;
    RAISE EXCEPTION 'La question à valider n’est pas la question actuellement ouverte.';
  END IF;

  IF v_attempt.current_question_index + 1 >= jsonb_array_length(v_attempt.question_order) THEN
    RAISE EXCEPTION 'La dernière question doit être remise avec la tentative.';
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

  -- La réponse a été figée par evaluate_exercise_attempt_question.
  -- En cas d'appel direct, enregistrer une validation serveur à l'instant présent.
  SELECT answer, timed_out INTO v_answer, v_timed_out
  FROM public.exercise_answers
  WHERE attempt_id = v_attempt.id AND question_id = p_question_id;

  IF NOT FOUND THEN
    v_timed_out := v_attempt.current_question_deadline_at IS NULL
      OR clock_timestamp() >= v_attempt.current_question_deadline_at;
    IF v_timed_out THEN
      v_grade := jsonb_build_object(
        'correct', FALSE, 'points', 0,
        'max_points', coalesce((v_question ->> 'points')::numeric, 0),
        'expected', coalesce(v_question -> 'answers', v_question -> 'correct_answer', v_question #> '{verbes_trous,phrases}'),
        'explanation', v_question -> 'explanation'
      );
    ELSE
      v_grade := public.exercise_grade_question(v_question, v_answer);
    END IF;
    INSERT INTO public.exercise_answers(
      attempt_id, question_id, answer, is_correct, points_awarded, max_points, timed_out
    ) VALUES (
      v_attempt.id, p_question_id, v_answer,
      coalesce((v_grade ->> 'correct')::boolean, FALSE),
      coalesce((v_grade ->> 'points')::numeric, 0),
      coalesce((v_grade ->> 'max_points')::numeric, 0),
      v_timed_out
    );
  END IF;

  UPDATE public.exercise_attempts
  SET answers = coalesce(answers, '{}'::jsonb) || jsonb_build_object(p_question_id, v_answer),
      updated_at = clock_timestamp()
  WHERE id = v_attempt.id;

  v_next_id := v_attempt.question_order ->> (v_attempt.current_question_index + 1);

  SELECT q.value INTO v_next_question
  FROM jsonb_array_elements(v_content -> 'questions') q(value)
  WHERE q.value ->> 'id' = v_next_id;

  IF v_next_question IS NULL THEN
    RAISE EXCEPTION 'Question suivante introuvable dans la version de l’exercice.';
  END IF;

  v_next_duration := greatest(1, coalesce((v_next_question ->> 'time_limit_seconds')::integer, 1));
  v_next_started_at := clock_timestamp();
  v_next_deadline := v_next_started_at + make_interval(secs => v_next_duration);

  UPDATE public.exercise_attempts
  SET current_question_index = current_question_index + 1,
      current_question_started_at = v_next_started_at,
      current_question_deadline_at = v_next_deadline,
      updated_at = v_next_started_at
  WHERE id = v_attempt.id;

  RETURN jsonb_build_object(
    'advanced', TRUE,
    'current_question_index', v_attempt.current_question_index + 1,
    'deadline_at', v_next_deadline,
    'seconds_remaining', v_next_duration,
    'server_now', v_next_started_at
  );
END;
$$;

-- La remise finale ne peut intervenir qu'une fois la dernière question atteinte.
-- Les réponses précédentes proviennent des transitions enregistrées côté serveur.
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
  v_final_answers JSONB := '{}'::jsonb;
  v_timed_out BOOLEAN;
  v_score NUMERIC := 0;
  v_max_points NUMERIC;
  v_completed_at TIMESTAMPTZ;
  v_question_index INTEGER := 0;
  v_current_id TEXT;
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
          'correct', FALSE, 'points', 0,
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
      'completed', TRUE, 'attempt_id', v_attempt.id,
      'score', v_attempt.score, 'max_score', v_attempt.max_score,
      'completed_at', v_attempt.completed_at, 'feedback', v_feedback
    );
  END IF;

  IF v_attempt.current_question_index <> jsonb_array_length(v_attempt.question_order) - 1 THEN
    RAISE EXCEPTION 'La dernière question n’a pas encore été atteinte.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(v_answers) AS supplied(question_id)
    WHERE NOT (v_attempt.question_order ? supplied.question_id)
  ) THEN
    RAISE EXCEPTION 'Une réponse est associée à une question inconnue.';
  END IF;

  v_current_id := v_attempt.question_order ->> v_attempt.current_question_index;
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

    IF v_question_index < v_attempt.current_question_index THEN
      SELECT answer, timed_out INTO v_answer, v_timed_out
      FROM public.exercise_answers
      WHERE attempt_id = v_attempt.id AND question_id = v_question_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'La réponse d’une question précédente n’a pas été enregistrée.';
      END IF;
    ELSIF v_question_id = v_current_id THEN
      SELECT answer, timed_out INTO v_answer, v_timed_out
      FROM public.exercise_answers
      WHERE attempt_id = v_attempt.id AND question_id = v_question_id;

      IF NOT FOUND THEN
        v_answer := v_answers -> v_question_id;
        v_timed_out := v_attempt.current_question_deadline_at IS NULL
          OR clock_timestamp() >= v_attempt.current_question_deadline_at;
      END IF;
    ELSE
      RAISE EXCEPTION 'Une question non commencée ne peut pas être remise.';
    END IF;

    IF coalesce(v_timed_out, FALSE) THEN
      v_grade := jsonb_build_object(
        'correct', FALSE, 'points', 0,
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

    INSERT INTO public.exercise_answers(
      attempt_id, question_id, answer, is_correct, points_awarded, max_points, timed_out
    ) VALUES (
      v_attempt.id, v_question_id, v_answer,
      coalesce((v_grade ->> 'correct')::boolean, FALSE),
      coalesce((v_grade ->> 'points')::numeric, 0),
      coalesce((v_grade ->> 'max_points')::numeric, 0),
      coalesce(v_timed_out, FALSE)
    )
    ON CONFLICT (attempt_id, question_id) DO UPDATE SET
      answer = EXCLUDED.answer,
      is_correct = EXCLUDED.is_correct,
      points_awarded = EXCLUDED.points_awarded,
      max_points = EXCLUDED.max_points,
      timed_out = EXCLUDED.timed_out,
      answered_at = clock_timestamp();

    v_final_answers := v_final_answers || jsonb_build_object(v_question_id, v_answer);
    v_score := v_score + coalesce((v_grade ->> 'points')::numeric, 0);
    v_feedback := v_feedback || jsonb_build_object(v_question_id, v_grade);
    v_question_index := v_question_index + 1;
  END LOOP;

  UPDATE public.exercise_attempts
  SET answers = v_final_answers,
      score = round(v_score, 2),
      status = 'completed',
      completed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE id = v_attempt.id
  RETURNING completed_at INTO v_completed_at;

  RETURN jsonb_build_object(
    'completed', TRUE, 'attempt_id', v_attempt.id,
    'score', round(v_score, 2), 'max_score', v_max_points,
    'completed_at', v_completed_at, 'feedback', v_feedback
  );
END;
$$;

REVOKE ALL ON FUNCTION public.advance_exercise_attempt_batch(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_exercise_attempt_batch(UUID, TEXT, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.get_exercise_attempt_bundle(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.evaluate_exercise_attempt_question(UUID, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_exercise_attempt_batch(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exercise_attempt_bundle(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_exercise_attempt_question(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_exercise_attempt_batch(UUID, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
