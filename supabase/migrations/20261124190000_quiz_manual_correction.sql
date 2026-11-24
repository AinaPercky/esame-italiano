-- PerckyLingua — correction manuelle des copies de quiz par le professeur.
-- Migration additive : conserve les réponses, les snapshots et les tentatives existantes.
-- La clé de correction reste lisible uniquement par la RPC enseignant existante.

ALTER TABLE public.quiz_submissions
  ADD COLUMN IF NOT EXISTS manual_review jsonb;

COMMENT ON COLUMN public.quiz_submissions.manual_review IS
  'Correction manuelle du professeur : points par question, commentaires et date de vérification. Non exposée en lecture directe aux élèves.';

CREATE OR REPLACE FUNCTION public.review_quiz_submission(
  p_submission_id text,
  p_question_scores jsonb,
  p_question_comments jsonb DEFAULT '{}'::jsonb,
  p_general_comment text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  v_submission public.quiz_submissions%ROWTYPE;
  v_question jsonb;
  v_question_id text;
  v_max_points numeric;
  v_points numeric;
  v_auto_points numeric;
  v_total numeric := 0;
  v_total_max numeric := 0;
  v_feedback jsonb;
  v_manual_review jsonb;
  v_ranked record;
BEGIN
  IF NOT public.quiz_is_teacher() THEN
    RAISE EXCEPTION 'Autorisation professeur requise.';
  END IF;

  IF p_submission_id IS NULL OR btrim(p_submission_id) = '' THEN
    RAISE EXCEPTION 'Identifiant de copie manquant.';
  END IF;
  IF jsonb_typeof(coalesce(p_question_scores, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Les points par question doivent être un objet JSON.';
  END IF;
  IF jsonb_typeof(coalesce(p_question_comments, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Les commentaires par question doivent être un objet JSON.';
  END IF;
  IF length(coalesce(p_general_comment, '')) > 2000 THEN
    RAISE EXCEPTION 'Le commentaire général ne peut pas dépasser 2 000 caractères.';
  END IF;

  SELECT * INTO v_submission
  FROM public.quiz_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Copie de quiz introuvable.';
  END IF;
  IF v_submission.status = 'missed' THEN
    RAISE EXCEPTION 'Une absence sans réponse ne peut pas être corrigée.';
  END IF;
  IF v_submission.questions_snapshot IS NULL
     OR jsonb_typeof(v_submission.questions_snapshot) <> 'array'
     OR jsonb_array_length(v_submission.questions_snapshot) = 0 THEN
    RAISE EXCEPTION 'Le sujet original de cette copie est indisponible.';
  END IF;

  -- Refuser toute clé inconnue : le navigateur ne peut pas injecter de points hors sujet.
  FOR v_question_id IN SELECT jsonb_object_keys(coalesce(p_question_scores, '{}'::jsonb))
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_submission.questions_snapshot) q(value)
      WHERE q.value ->> 'id' = v_question_id
    ) THEN
      RAISE EXCEPTION 'Question inconnue dans la correction : %.', v_question_id;
    END IF;
  END LOOP;

  FOR v_question_id IN SELECT jsonb_object_keys(coalesce(p_question_comments, '{}'::jsonb))
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_submission.questions_snapshot) q(value)
      WHERE q.value ->> 'id' = v_question_id
    ) THEN
      RAISE EXCEPTION 'Question inconnue dans les commentaires : %.', v_question_id;
    END IF;
    IF length(coalesce(p_question_comments ->> v_question_id, '')) > 1000 THEN
      RAISE EXCEPTION 'Un commentaire de question dépasse 1 000 caractères.';
    END IF;
  END LOOP;

  v_feedback := coalesce(v_submission.feedback, '{}'::jsonb);

  FOR v_question IN
    SELECT value FROM jsonb_array_elements(v_submission.questions_snapshot)
  LOOP
    v_question_id := coalesce(v_question ->> 'id', '');
    IF v_question_id = '' THEN
      RAISE EXCEPTION 'Le snapshot contient une question sans identifiant.';
    END IF;

    v_max_points := greatest(0, coalesce(nullif(v_question ->> 'points', '')::numeric, 0));
    v_auto_points := coalesce(nullif(v_feedback #>> ARRAY[v_question_id, 'points'], '')::numeric, 0);
    v_points := CASE
      WHEN coalesce(p_question_scores, '{}'::jsonb) ? v_question_id
        THEN (p_question_scores ->> v_question_id)::numeric
      ELSE v_auto_points
    END;

    IF v_points IS NULL OR v_points < 0 OR v_points > v_max_points THEN
      RAISE EXCEPTION 'Points invalides pour la question % : valeur autorisée entre 0 et %.', v_question_id, v_max_points;
    END IF;

    v_total := v_total + v_points;
    v_total_max := v_total_max + v_max_points;
    v_feedback := jsonb_set(
      v_feedback,
      ARRAY[v_question_id],
      coalesce(v_feedback -> v_question_id, '{}'::jsonb) ||
        jsonb_build_object(
          'points', v_points,
          'maxPoints', v_max_points,
          'correct', (v_max_points > 0 AND v_points >= v_max_points)
        ),
      true
    );
  END LOOP;

  IF v_total_max <= 0 THEN
    v_total_max := greatest(0, coalesce(v_submission.max_score, 0));
  END IF;

  v_manual_review := jsonb_build_object(
    'question_scores', coalesce(p_question_scores, '{}'::jsonb),
    'question_comments', coalesce(p_question_comments, '{}'::jsonb),
    'general_comment', coalesce(p_general_comment, ''),
    'reviewed_at', clock_timestamp(),
    'reviewed_by', auth.uid()
  );

  UPDATE public.quiz_submissions
  SET score = v_total,
      max_score = v_total_max,
      score_20 = CASE WHEN v_total_max > 0 THEN round((v_total / v_total_max * 20)::numeric, 1) ELSE 0 END,
      feedback = v_feedback,
      manual_review = v_manual_review
  WHERE id = v_submission.id
  RETURNING * INTO v_submission;

  -- Recalculer la tentative de référence sans supprimer ni fusionner l'historique.
  WITH ranked AS (
    SELECT id,
      row_number() OVER (
        PARTITION BY quiz_id, student_id
        ORDER BY score_20 DESC,
          (status = 'missed') ASC,
          submitted_at DESC NULLS LAST,
          attempt_number DESC,
          id DESC
      ) AS position
    FROM public.quiz_submissions
    WHERE quiz_id = v_submission.quiz_id
      AND student_id = v_submission.student_id
  )
  UPDATE public.quiz_submissions s
  SET is_counted = (ranked.position = 1)
  FROM ranked
  WHERE s.id = ranked.id;

  -- Garder la table des tentatives synchronisée si elle existe sur cette base.
  IF to_regclass('public.quiz_attempts') IS NOT NULL THEN
    EXECUTE
      'UPDATE public.quiz_attempts
          SET score = $1, max_score = $2, score_20 = $3, feedback = $4
        WHERE quiz_id = $5 AND student_id = $6 AND attempt_number = $7'
    USING
      v_submission.score,
      v_submission.max_score,
      v_submission.score_20,
      v_submission.feedback,
      v_submission.quiz_id,
      v_submission.student_id,
      coalesce(v_submission.attempt_number, 1);
  END IF;

  SELECT * INTO v_submission
  FROM public.quiz_submissions
  WHERE id = p_submission_id;

  RETURN to_jsonb(v_submission);
END;
$function$;

REVOKE ALL ON FUNCTION public.review_quiz_submission(text, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_quiz_submission(text, jsonb, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
