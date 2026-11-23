-- Aligne la correction automatique des examens écrits sur la normalisation Unicode
-- commune aux quiz et aux exercices. Les réponses restent comparées exactement après NFC.

DO $migration$
DECLARE
  v_definition TEXT;
  v_old TEXT;
  v_new TEXT;
BEGIN
  v_definition := pg_get_functiondef('public.written_exam_auto_question_score(uuid,jsonb)'::regprocedure);

  v_old := $old$lower(regexp_replace(btrim(e),'\s+',' ','g'))$old$;
  v_new := $new$public.quiz_norm_answer(e)$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Comparaison des réponses alternatives de l’examen introuvable.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$lower(regexp_replace(btrim(coalesce(v_actual->>v_idx,'')),'\s+',' ','g'))$old$;
  v_new := $new$public.quiz_norm_answer(coalesce(v_actual->>v_idx,''))$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Comparaison des réponses saisies de l’examen introuvable.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$lower(regexp_replace(btrim(coalesce(v_expected->>v_idx,'')),'\s+',' ','g'))$old$;
  v_new := $new$public.quiz_norm_answer(coalesce(v_expected->>v_idx,''))$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Comparaison des réponses attendues de l’examen introuvable.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$lower(regexp_replace(btrim(coalesce(v_phrase_answer->>'verbe_choisi','')),'\s+',' ','g'))$old$;
  v_new := $new$public.quiz_norm_answer(coalesce(v_phrase_answer->>'verbe_choisi',''))$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Normalisation du verbe choisi dans l’examen introuvable.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$lower(regexp_replace(btrim(coalesce(v_phrase->>'verbe','')),'\s+',' ','g'))$old$;
  v_new := $new$public.quiz_norm_answer(coalesce(v_phrase->>'verbe',''))$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Normalisation du verbe attendu dans l’examen introuvable.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$lower(regexp_replace(btrim(coalesce(v_phrase_answer->>'texte_saisi','')),'\s+',' ','g'))$old$;
  v_new := $new$public.quiz_norm_answer(coalesce(v_phrase_answer->>'texte_saisi',''))$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Normalisation de la conjugaison saisie dans l’examen introuvable.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$lower(regexp_replace(btrim(b.value),'\s+',' ','g'))$old$;
  v_new := $new$public.quiz_norm_answer(b.value)$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Normalisation de la banque de verbes de l’examen introuvable.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$lower(regexp_replace(btrim(a.value),'\s+',' ','g'))$old$;
  v_new := $new$public.quiz_norm_answer(a.value)$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Normalisation des réponses de conjugaison de l’examen introuvable.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  EXECUTE v_definition;
END
$migration$;

NOTIFY pgrst, 'reload schema';
