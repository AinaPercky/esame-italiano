-- Match the server-side exercise scorer to the pedagogical verb-bank rubric.
-- Each phrase awards 1 point for selecting its verb and 2 for its conjugation.
-- Reusing a verb in two blanks invalidates the repeated selection, as in noterQuiz().

DO $migration$
DECLARE
  v_definition TEXT;
  v_old TEXT;
  v_new TEXT;
  v_branch_start INTEGER;
  v_outer_else INTEGER;
BEGIN
  v_definition := pg_get_functiondef('public.exercise_grade_question(jsonb,jsonb)'::regprocedure);

  v_old := '  v_expected_order jsonb := ''[]''::jsonb;';
  v_new := $declaration$  v_expected_order jsonb := '[]'::jsonb;
  v_chosen_verb text;
  v_expected_verb text;
  v_typed_text text;
  v_phrase_points numeric;
  v_used_verbs text[] := ARRAY[]::text[];$declaration$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Déclaration du correcteur d’exercice inattendue; migration annulée.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  -- Replace the complete verb-bank branch, regardless of whether the installed
  -- scorer is the original array-only implementation or the later object-map one.
  v_branch_start := position('  elsif v_type = ''verbes_trous'' then' IN v_definition);
  v_outer_else := position(
    '  else' || chr(10) || '    raise exception ''Type de question non pris en charge: %'', v_type;'
    IN v_definition
  );
  IF v_branch_start = 0 OR v_outer_else <= v_branch_start THEN
    RAISE EXCEPTION 'Branche verbes_trous du correcteur inattendue; migration annulée.';
  END IF;

  v_new := $branch$  elsif v_type = 'verbes_trous' then
    if jsonb_typeof(v_student) = 'string' then
      begin v_student := (v_student #>> '{}')::jsonb;
      exception when others then v_student := '{}'::jsonb; end;
    end if;
    if jsonb_typeof(v_student) <> 'object' then
      v_student := '{}'::jsonb;
    end if;

    v_total := greatest(1, jsonb_array_length(coalesce(p_question #> '{verbes_trous,phrases}','[]'::jsonb)));
    v_phrase_points := CASE WHEN v_total > 0 THEN v_points / v_total ELSE 0 END;
    v_used_verbs := ARRAY[]::text[];

    for v_phrase, v_correct in
      select p.value, p.ordinality::integer
      from jsonb_array_elements(coalesce(p_question #> '{verbes_trous,phrases}','[]'::jsonb)) with ordinality p(value, ordinality)
    loop
      v_responses := coalesce(v_phrase -> 'reponses', '[]'::jsonb);
      v_expected_verb := lower(regexp_replace(trim(coalesce(v_phrase ->> 'verbe', '')), '[[:space:]]+', ' ', 'g'));
      v_chosen_verb := lower(regexp_replace(trim(coalesce(
        v_student -> 'choices' ->> (v_correct - 1),
        v_student -> 'choices' ->> (v_phrase ->> 'id'),
        v_student -> (v_phrase ->> 'id') ->> 'verbe_choisi',
        ''
      )), '[[:space:]]+', ' ', 'g'));
      v_typed_text := lower(regexp_replace(trim(coalesce(
        v_student -> 'saisies' ->> (v_correct - 1),
        v_student -> 'saisies' ->> (v_phrase ->> 'id'),
        v_student -> (v_phrase ->> 'id') ->> 'texte_saisi',
        v_student ->> (v_phrase ->> 'id'),
        v_student ->> (v_correct - 1),
        ''
      )), '[[:space:]]+', ' ', 'g'));

      -- A verb can only be used once across the complete verb-bank question.
      IF v_chosen_verb <> '' AND v_chosen_verb = ANY(v_used_verbs) THEN
        v_chosen_verb := '';
        v_typed_text := '';
      ELSIF v_chosen_verb <> '' THEN
        v_used_verbs := array_append(v_used_verbs, v_chosen_verb);
      END IF;

      IF v_chosen_verb <> '' AND v_chosen_verb = v_expected_verb THEN
        v_awarded := v_awarded + (v_phrase_points / 3);
      END IF;

      IF v_chosen_verb <> '' AND v_typed_text <> '' AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_responses) r(value)
        WHERE lower(regexp_replace(trim(r.value), '[[:space:]]+', ' ', 'g')) = v_typed_text
      ) THEN
        v_awarded := v_awarded + (v_phrase_points * 2 / 3);
      END IF;
    end loop;
    v_correct := case when v_awarded >= v_points then 1 else 0 end;
$branch$;

  v_definition := substring(v_definition FROM 1 FOR v_branch_start - 1)
    || v_new
    || substring(v_definition FROM v_outer_else);
  EXECUTE v_definition;
END
$migration$;
