-- Unifie l'interprétation des réponses : tableau plat = variantes d'une réponse ;
-- tableaux imbriqués ou blank_count > 1 = plusieurs cases distinctes.
CREATE OR REPLACE FUNCTION public.quiz_expected_answers_list(p_question JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_raw TEXT := btrim(coalesce(p_question ->> 'correct_answer', ''));
  v_parts JSONB;
  v_has_nested BOOLEAN := false;
BEGIN
  IF jsonb_typeof(p_question -> 'answers') = 'array' AND jsonb_array_length(p_question -> 'answers') > 0 THEN
    SELECT coalesce(bool_or(jsonb_typeof(elem) = 'array'), false)
      INTO v_has_nested
      FROM jsonb_array_elements(p_question -> 'answers') AS e(elem);
    IF v_has_nested OR coalesce((p_question ->> 'blank_count')::integer, 1) > 1 THEN
      SELECT coalesce(jsonb_agg(
        CASE WHEN jsonb_typeof(elem) = 'array'
          THEN to_jsonb((SELECT string_agg(value, ' / ') FROM jsonb_array_elements_text(elem) AS a(value)))
          ELSE to_jsonb(btrim(elem #>> '{}'))
        END
      ), '[]'::jsonb)
      INTO v_parts
      FROM jsonb_array_elements(p_question -> 'answers') AS e(elem);
      RETURN v_parts;
    END IF;
    SELECT jsonb_build_array(to_jsonb(string_agg(btrim(elem #>> '{}'), ' / ' ORDER BY ord)))
      INTO v_parts
      FROM jsonb_array_elements(p_question -> 'answers') WITH ORDINALITY AS a(elem, ord);
    RETURN coalesce(v_parts, '[]'::jsonb);
  END IF;
  IF left(v_raw, 1) = '[' AND right(v_raw, 1) = ']' THEN
    BEGIN
      v_parts := v_raw::jsonb;
      IF jsonb_typeof(v_parts) = 'array' AND jsonb_array_length(v_parts) > 0 THEN
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_parts) AS e(elem) WHERE jsonb_typeof(elem) = 'array') THEN
          RETURN (SELECT coalesce(jsonb_agg(
            CASE WHEN jsonb_typeof(elem) = 'array'
              THEN to_jsonb((SELECT string_agg(value, ' / ') FROM jsonb_array_elements_text(elem) AS a(value)))
              ELSE to_jsonb(btrim(elem #>> '{}'))
            END
          ), '[]'::jsonb) FROM jsonb_array_elements(v_parts) AS e(elem));
        END IF;
        RETURN jsonb_build_array(to_jsonb((SELECT string_agg(btrim(elem #>> '{}'), ' / ') FROM jsonb_array_elements(v_parts) AS e(elem))));
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  IF position('|' IN v_raw) > 0 THEN
    SELECT coalesce(jsonb_agg(to_jsonb(btrim(part))), '[]'::jsonb)
      INTO v_parts
      FROM regexp_split_to_table(v_raw, '\s*\|\s*') AS p(part)
      WHERE btrim(part) <> '';
    IF jsonb_array_length(v_parts) > 1 THEN RETURN v_parts; END IF;
  END IF;
  IF position(' // ' IN v_raw) > 0 THEN
    SELECT coalesce(jsonb_agg(to_jsonb(btrim(part))), '[]'::jsonb)
      INTO v_parts
      FROM regexp_split_to_table(v_raw, '\s*//\s*') AS p(part)
      WHERE btrim(part) <> '';
    IF jsonb_array_length(v_parts) > 1 THEN RETURN v_parts; END IF;
  END IF;
  RETURN jsonb_build_array(v_raw);
END;
$$;

-- Harmonise les réponses alternatives dans les exercices et conserve les points partiels.
create or replace function public.exercise_grade_question(p_question jsonb, p_answer jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_type text := coalesce(p_question ->> 'type', '');
  v_expected jsonb := '[]'::jsonb;
  v_student jsonb := p_answer;
  v_correct integer := 0;
  v_total integer := 0;
  v_points numeric := greatest(0, coalesce((p_question ->> 'points')::numeric, 0));
  v_awarded numeric := 0;
  v_expected_text text;
  v_student_text text;
  v_item jsonb;
  v_phrase jsonb;
  v_responses jsonb;
  v_expected_order jsonb := '[]'::jsonb;
  v_chosen_verb text;
  v_expected_verb text;
  v_typed_text text;
  v_phrase_points numeric;
  v_used_verbs text[] := ARRAY[]::text[];
begin
  if v_type = 'qcm' then
    v_expected_text := trim(coalesce(p_question ->> 'correct_answer', ''));
    v_student_text := trim(coalesce(p_answer #>> '{}', ''));
    if v_student_text = v_expected_text then v_correct := 1;
    elsif v_student_text ~ '^[0-9]+$' then
      begin
        if (p_question -> 'options' ->> v_student_text::integer) = v_expected_text then v_correct := 1; end if;
      exception when others then null;
      end;
    end if;
    v_total := 1;
    v_awarded := case when v_correct = 1 then v_points else 0 end;
  elsif v_type = 'text' then
    if jsonb_typeof(p_question -> 'answers') = 'array' and jsonb_array_length(p_question -> 'answers') > 0 then
      IF coalesce((p_question ->> 'blank_count')::integer, 1) > 1
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_question -> 'answers') entry WHERE jsonb_typeof(entry) = 'array') THEN
        -- Explicit multi-blank contract: one outer entry per blank, nested arrays are accepted variants.
        v_expected := p_question -> 'answers';
      ELSE
        -- Legacy flat arrays are accepted variants for one answer, not separate required blanks.
        v_expected := jsonb_build_array(p_question -> 'answers');
      END IF;
    else
      select coalesce(jsonb_agg(to_jsonb(trim(part))), '[]'::jsonb)
      into v_expected
      from regexp_split_to_table(coalesce(p_question ->> 'correct_answer',''), '\s*[|;]\s*') as part
      where trim(part) <> '';
    end if;
    if jsonb_typeof(v_student) = 'string' then
      begin v_student := (v_student #>> '{}')::jsonb;
      exception when others then v_student := jsonb_build_array(v_student #>> '{}'); end;
    end if;
    if jsonb_typeof(v_student) <> 'array' then v_student := jsonb_build_array(coalesce(v_student #>> '{}','')); end if;
    v_total := greatest(1, jsonb_array_length(v_expected));
    for v_item, v_correct in
      select e.value, e.ordinality::integer
      from jsonb_array_elements(v_expected) with ordinality e(value, ordinality)
    loop
      v_student_text := public.quiz_norm_answer(coalesce(v_student ->> (v_correct - 1), ''));
      if jsonb_typeof(v_item) = 'array' then
        if exists (
          select 1 from jsonb_array_elements_text(v_item) a(value)
          where public.quiz_norm_answer(a.value) = v_student_text
        ) then v_awarded := v_awarded + (v_points / v_total); end if;
      else
        v_expected_text := public.quiz_norm_answer(coalesce(v_item #>> '{}', ''));
        if v_student_text = v_expected_text or exists (
          select 1 from regexp_split_to_table(coalesce(v_item #>> '{}',''), '\s*[/;|]\s*') a
          where public.quiz_norm_answer(a) = v_student_text
        ) then v_awarded := v_awarded + (v_points / v_total); end if;
      end if;
    end loop;
    v_correct := case when v_awarded >= v_points then 1 else 0 end;
  elsif v_type = 'reorder' then
    select coalesce(jsonb_agg(case when jsonb_typeof(x.value) = 'object' then x.value -> 'id' else x.value end order by x.ordinality), '[]'::jsonb)
    into v_expected_order
    from jsonb_array_elements(coalesce(p_question -> 'items','[]'::jsonb)) with ordinality x(value, ordinality);
    if jsonb_typeof(v_student) = 'string' then
      begin v_student := (v_student #>> '{}')::jsonb; exception when others then null; end;
    end if;
    v_total := 1;
    if v_student = v_expected_order then v_correct := 1; v_awarded := v_points; end if;
  elsif v_type = 'verbes_trous' then
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
      v_expected_verb := public.quiz_norm_answer(coalesce(v_phrase ->> 'verbe', ''));
      v_chosen_verb := public.quiz_norm_answer(coalesce(
        v_student -> 'choices' ->> (v_correct - 1),
        v_student -> 'choices' ->> (v_phrase ->> 'id'),
        v_student -> (v_phrase ->> 'id') ->> 'verbe_choisi',
        ''
      ));
      v_typed_text := public.quiz_norm_answer(coalesce(
        v_student -> 'saisies' ->> (v_correct - 1),
        v_student -> 'saisies' ->> (v_phrase ->> 'id'),
        v_student -> (v_phrase ->> 'id') ->> 'texte_saisi',
        v_student ->> (v_phrase ->> 'id'),
        v_student ->> (v_correct - 1),
        ''
      ));

      IF v_chosen_verb <> '' AND v_chosen_verb = ANY(v_used_verbs) THEN
        v_chosen_verb := '';
        v_typed_text := '';
      ELSIF v_chosen_verb <> '' THEN
        v_used_verbs := array_append(v_used_verbs, v_chosen_verb);
      END IF;

      IF v_expected_verb = '' THEN
        IF v_typed_text <> '' AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(v_responses) r(value)
          WHERE public.quiz_norm_answer(r.value) = v_typed_text
        ) THEN
          v_awarded := v_awarded + v_phrase_points;
        END IF;
      ELSE
        IF v_chosen_verb <> '' AND v_chosen_verb = v_expected_verb THEN
          v_awarded := v_awarded + (v_phrase_points / 3);
        END IF;

        IF v_chosen_verb <> '' AND v_typed_text <> '' AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(v_responses) r(value)
          WHERE public.quiz_norm_answer(r.value) = v_typed_text
        ) THEN
          v_awarded := v_awarded + (v_phrase_points * 2 / 3);
        END IF;
      END IF;
    end loop;
    v_correct := case when v_awarded >= v_points then 1 else 0 end;
  elsif v_type = 'mots_trous' then
    if jsonb_typeof(v_student) = 'string' then
      begin v_student := (v_student #>> '{}')::jsonb;
      exception when others then v_student := '{}'::jsonb; end;
    end if;
    if jsonb_typeof(v_student) <> 'object' then
      v_student := '{}'::jsonb;
    end if;

    v_total := greatest(1, jsonb_array_length(coalesce(p_question #> '{mots_trous,phrases}','[]'::jsonb)));
    v_phrase_points := CASE WHEN v_total > 0 THEN v_points / v_total ELSE 0 END;
    v_used_verbs := ARRAY[]::text[];

    for v_phrase, v_correct in
      select p.value, p.ordinality::integer
      from jsonb_array_elements(coalesce(p_question #> '{mots_trous,phrases}','[]'::jsonb)) with ordinality p(value, ordinality)
    loop
      v_expected_verb := public.quiz_norm_answer(coalesce(v_phrase ->> 'mot', ''));

      if (v_student ? 'choices') and jsonb_typeof(v_student -> 'choices') = 'object' then
        if jsonb_typeof(v_student -> 'choices' -> (v_phrase ->> 'id')) = 'object' then
          v_chosen_verb := coalesce(v_student -> 'choices' -> (v_phrase ->> 'id') ->> 'mot_choisi', v_student -> 'choices' -> (v_phrase ->> 'id') ->> 'mot', '');
        elsif jsonb_typeof(v_student -> 'choices' -> (v_correct - 1)) = 'object' then
          v_chosen_verb := coalesce(v_student -> 'choices' -> (v_correct - 1) ->> 'mot_choisi', v_student -> 'choices' -> (v_correct - 1) ->> 'mot', '');
        else
          v_chosen_verb := coalesce(v_student -> 'choices' ->> (v_phrase ->> 'id'), v_student -> 'choices' ->> (v_correct - 1), '');
        end if;
      else
        if jsonb_typeof(v_student -> (v_phrase ->> 'id')) = 'object' then
          v_chosen_verb := coalesce(v_student -> (v_phrase ->> 'id') ->> 'mot_choisi', v_student -> (v_phrase ->> 'id') ->> 'mot', v_student -> (v_phrase ->> 'id') ->> 'word', '');
        else
          v_chosen_verb := coalesce(v_student ->> (v_phrase ->> 'id'), v_student ->> (v_correct - 1), '');
        end if;
      end if;

      v_chosen_verb := public.quiz_norm_answer(v_chosen_verb);

      if v_chosen_verb <> ''
         and not (v_chosen_verb = ANY(v_used_verbs))
         and (
           jsonb_typeof(p_question #> '{mots_trous,banque}') <> 'array'
           or jsonb_array_length(p_question #> '{mots_trous,banque}') = 0
           or exists (
             select 1
             from jsonb_array_elements_text(p_question #> '{mots_trous,banque}') b(value)
             where public.quiz_norm_answer(b.value) = v_chosen_verb
           )
         ) then
        v_used_verbs := array_append(v_used_verbs, v_chosen_verb);
        if v_expected_verb <> '' and v_chosen_verb = v_expected_verb then
          v_awarded := v_awarded + v_phrase_points;
        end if;
      end if;
    end loop;
    v_correct := case when v_awarded >= v_points then 1 else 0 end;
  else
    raise exception 'Type de question non pris en charge: %', v_type;
  end if;

  return jsonb_build_object(
    'correct', (v_correct = 1),
    'points', round(v_awarded, 2),
    'max_points', round(v_points, 2),
    'expected', coalesce(p_question -> 'answers', p_question -> 'correct_answer', p_question #> '{verbes_trous,phrases}', p_question #> '{mots_trous,phrases}'),
    'explanation', p_question -> 'explanation'
  );
end;
$$;

NOTIFY pgrst, 'reload schema';

