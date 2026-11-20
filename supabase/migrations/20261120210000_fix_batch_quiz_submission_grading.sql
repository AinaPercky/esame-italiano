-- PerckyLingua: grade the complete answer payload for official quizzes.
-- Batch mode deliberately no longer writes quiz_question_evaluations question by question.
-- The server remains authoritative: it receives answers, then recalculates every point
-- from the private quiz definition before persisting the result.

DO $migration$
DECLARE
  v_definition TEXT;
  v_old TEXT;
  v_new TEXT;
BEGIN
  -- Standard authenticated quiz submission.
  v_definition := pg_get_functiondef('public.submit_quiz_submission(jsonb)'::regprocedure);
  v_old := $old$
    -- Ne jamais réutiliser les évaluations de la première tentative.
    SELECT coalesce(jsonb_object_agg(question_id, answer), '{}'::jsonb)
      INTO saved_answers
    FROM public.quiz_question_evaluations
    WHERE quiz_id = q.id
      AND student_id = sid
      AND attempt_number = attempt_no;
$old$;
  v_new := $new$
    -- Les réponses du navigateur sont des données, jamais une note de confiance.
    -- quiz_grade_all recalcule tous les points avec le corrigé privé de PostgreSQL.
    saved_answers := coalesce(p_submission -> 'answers', '{}'::jsonb);
    IF jsonb_typeof(saved_answers) <> 'object' THEN
      RAISE EXCEPTION 'Format des réponses invalide.';
    END IF;
$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Bloc de récupération des réponses standard inattendu; migration annulée.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$  IF v_status = 'timeout' THEN
    e := jsonb_set(jsonb_set(e, '{rawScore}', '0'::jsonb), '{score20}', '0'::jsonb);
  END IF;
$old$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Bloc timeout standard inattendu; migration annulée.';
  END IF;
  v_definition := replace(v_definition, v_old, $new$  -- Les réponses saisies avant la fin du temps restent notées.
  -- Les questions vides reçoivent naturellement zéro point dans quiz_grade_all.
$new$);
  EXECUTE v_definition;

  -- Strict-presence quiz submission (including teacher-authorized retries).
  v_definition := pg_get_functiondef('public.submit_quiz_presence_submission(jsonb)'::regprocedure);
  v_old := $old$
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
$old$;
  v_new := $new$
  -- Les réponses groupées sont corrigées à partir du corrigé privé du quiz.
  saved_answers := coalesce(p_submission -> 'answers', '{}'::jsonb);
  IF jsonb_typeof(saved_answers) <> 'object' THEN
    RAISE EXCEPTION 'Format des réponses invalide.';
  END IF;
  e := public.quiz_grade_all(v_quiz_id, saved_answers);
  -- Une expiration ne doit pas effacer les points déjà gagnés.
  -- Les questions non répondues reçoivent zéro point individuellement.
$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Bloc de récupération des réponses présence inattendu; migration annulée.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);
  EXECUTE v_definition;
END
$migration$;

NOTIFY pgrst, 'reload schema';
