-- PerckyLingua — correction du meilleur score et fiabilisation des soumissions
-- Fonctions appliquées sur Supabase le 15/11/2026.
-- Les tentatives historiques sont conservées; une seule ligne est comptabilisée.
-- La fonction classique change de VOID vers JSONB : recréer sa signature.
DROP FUNCTION IF EXISTS public.submit_quiz_submission(JSONB);
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

CREATE OR REPLACE FUNCTION public.submit_quiz_submission(p_submission jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  q public.quizzes%ROWTYPE;
  sid TEXT;
  cids TEXT[];
  e JSONB;
  payload JSONB;
  v_status TEXT := coalesce(p_submission ->> 'status', 'completed');
  saved_answers JSONB := '{}'::jsonb;
  attempt_no INTEGER := 1;
  submission_id TEXT := coalesce(nullif(p_submission ->> 'id', ''), 'sub_' || gen_random_uuid()::text);
  saved_row public.quiz_submissions%ROWTYPE;
BEGIN
  SELECT * INTO q
  FROM public.quizzes
  WHERE id = p_submission ->> 'quiz_id'
  FOR UPDATE;

  IF NOT FOUND OR q.status <> 'launched' THEN
    RAISE EXCEPTION 'Quiz indisponible.';
  END IF;

  -- Idempotence : un nouvel envoi réseau du même résultat ne crée pas une
  -- deuxième tentative et retourne la ligne déjà persistée.
  SELECT * INTO saved_row
  FROM public.quiz_submissions
  WHERE id = submission_id AND quiz_id = q.id;
  IF FOUND THEN
    RETURN to_jsonb(saved_row);
  END IF;

  IF auth.uid() IS NOT NULL THEN
    sid := public.quiz_current_student_id();

    SELECT array_agg(DISTINCT class_id::text)
      INTO cids
    FROM public.class_enrollments
    WHERE student_id::text = sid AND status = 'active';

    IF coalesce(array_length(cids, 1), 0) = 0 THEN
      SELECT ARRAY[class_id::text] INTO cids
      FROM public.students
      WHERE id::text = sid;
    END IF;

    IF NOT (
      coalesce(cids, ARRAY[]::text[])
      && coalesce(nullif(q.class_ids, ARRAY[]::text[]), ARRAY[q.class_id])
    ) THEN
      RAISE EXCEPTION 'Accès refusé.';
    END IF;

    -- Le numéro de tentative est calculé pour CE quiz et CET élève.
    SELECT greatest(
      coalesce((SELECT max(a.attempt_number)
                FROM public.quiz_attempts a
                WHERE a.quiz_id = q.id AND a.student_id = sid), 0),
      coalesce((SELECT max(s.attempt_number)
                FROM public.quiz_submissions s
                WHERE s.quiz_id = q.id AND s.student_id = sid), 0)
    ) + 1
    INTO attempt_no;

    -- Ne jamais réutiliser les évaluations de la première tentative.
    SELECT coalesce(jsonb_object_agg(question_id, answer), '{}'::jsonb)
      INTO saved_answers
    FROM public.quiz_question_evaluations
    WHERE quiz_id = q.id
      AND student_id = sid
      AND attempt_number = attempt_no;
  ELSE
    IF NOT coalesce(q.is_public, FALSE) THEN
      RAISE EXCEPTION 'Connexion étudiant requise.';
    END IF;

    sid := p_submission ->> 'student_id';
    IF coalesce(sid, '') = '' THEN
      RAISE EXCEPTION 'Identifiant étudiant requis.';
    END IF;
    saved_answers := coalesce(p_submission -> 'answers', '{}'::jsonb);

    SELECT coalesce(max(s.attempt_number), 0) + 1
      INTO attempt_no
    FROM public.quiz_submissions s
    WHERE s.quiz_id = q.id AND s.student_id = sid;
  END IF;

  e := public.quiz_grade_all(q.id, coalesce(saved_answers, '{}'::jsonb));
  IF v_status = 'timeout' THEN
    e := jsonb_set(jsonb_set(e, '{rawScore}', '0'::jsonb), '{score20}', '0'::jsonb);
  END IF;

  payload := p_submission || jsonb_build_object(
    'id', submission_id,
    'student_id', sid,
    'answers', coalesce(saved_answers, '{}'::jsonb),
    'score', e -> 'rawScore',
    'max_score', e -> 'maxScore',
    'score_20', e -> 'score20',
    'feedback', e -> 'feedback'
  );

  -- La fonction historique conserve ses contrôles d'accès et la création de
  -- la tentative. Le verrou sur le quiz sérialise les soumissions concurrentes.
  PERFORM public.submit_quiz_submission_legacy_unsafe(payload);

  -- Une seule note de référence par élève/quiz : la meilleure note, et en cas
  -- d'égalité la tentative la plus récente. Les autres copies restent intactes.
  UPDATE public.quiz_submissions s
  SET is_counted = (
    s.id = (
      SELECT candidate.id
      FROM public.quiz_submissions candidate
      WHERE candidate.quiz_id = q.id AND candidate.student_id = sid
      ORDER BY candidate.score_20 DESC,
               candidate.submitted_at DESC NULLS LAST,
               candidate.attempt_number DESC,
               candidate.id DESC
      LIMIT 1
    )
  )
  WHERE s.quiz_id = q.id AND s.student_id = sid;

  SELECT * INTO saved_row
  FROM public.quiz_submissions
  WHERE id = submission_id AND quiz_id = q.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La soumission du quiz n’a pas été persistée.';
  END IF;

  RETURN to_jsonb(saved_row);
END;
$function$
;

REVOKE ALL ON FUNCTION public.submit_quiz_submission(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_quiz_submission(JSONB) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_quiz_presence_submission(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_quiz_presence_submission(JSONB) TO authenticated;
NOTIFY pgrst, 'reload schema';
