-- Database-side fix for legacy multi-blank answers in exercises, quizzes and written exams.
-- No table data or schema is altered. Expected slots are inferred from prompt placeholders
-- when legacy rows do not have blank_count. A single answer with alternatives stays one slot.

CREATE OR REPLACE FUNCTION public.quiz_expected_answers_list(p_question JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_raw TEXT := btrim(coalesce(p_question ->> 'correct_answer', ''));
  v_raw_items JSONB := NULL;
  v_from_accepted_variants BOOLEAN := FALSE;
  v_cleaned JSONB := '[]'::jsonb;
  v_has_nested BOOLEAN := FALSE;
  v_explicit_blank_count INTEGER := NULL;
  v_prompt_text TEXT := btrim(coalesce(p_question ->> 'question', p_question ->> 'prompt', ''));
  v_prompt_blanks INTEGER := 0;
  v_is_multi_blank BOOLEAN := FALSE;
  v_parsed JSONB;
  v_parts JSONB;
  v_collapsed TEXT;
BEGIN
  IF (p_question ->> 'blank_count') ~ '^[0-9]+$' THEN
    v_explicit_blank_count := (p_question ->> 'blank_count')::integer;
  END IF;
  v_prompt_blanks := public.quiz_prompt_blank_count(v_prompt_text);

  IF jsonb_typeof(p_question -> 'answers') = 'array' AND jsonb_array_length(p_question -> 'answers') > 0 THEN
    v_raw_items := p_question -> 'answers';
  ELSIF jsonb_typeof(p_question -> 'acceptedAnswers') = 'array' AND jsonb_array_length(p_question -> 'acceptedAnswers') > 0 THEN
    v_raw_items := p_question -> 'acceptedAnswers';
    v_from_accepted_variants := TRUE;
  ELSIF jsonb_typeof(p_question -> 'accepted_answers') = 'array' AND jsonb_array_length(p_question -> 'accepted_answers') > 0 THEN
    v_raw_items := p_question -> 'accepted_answers';
    v_from_accepted_variants := TRUE;
  ELSIF left(v_raw, 1) = '[' AND right(v_raw, 1) = ']' THEN
    BEGIN
      v_parsed := v_raw::jsonb;
      IF jsonb_typeof(v_parsed) = 'array' AND jsonb_array_length(v_parsed) > 0 THEN
        v_raw_items := v_parsed;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_raw_items := NULL;
    END;
  ELSIF position('|' IN v_raw) > 0 THEN
    SELECT coalesce(jsonb_agg(to_jsonb(btrim(part)) ORDER BY ord), '[]'::jsonb)
    INTO v_parts
    FROM regexp_split_to_table(v_raw, '\s*\|\s*') WITH ORDINALITY AS t(part, ord)
    WHERE btrim(part) <> '';
    IF jsonb_array_length(v_parts) > 1 THEN
      v_raw_items := v_parts;
    END IF;
  ELSIF position('//' IN v_raw) > 0 THEN
    SELECT coalesce(jsonb_agg(to_jsonb(btrim(part)) ORDER BY ord), '[]'::jsonb)
    INTO v_parts
    FROM regexp_split_to_table(v_raw, '\s*//\s*') WITH ORDINALITY AS t(part, ord)
    WHERE btrim(part) <> '';
    IF jsonb_array_length(v_parts) > 1 THEN
      v_raw_items := v_parts;
    END IF;
  ELSIF (v_prompt_blanks >= 2 OR coalesce(v_explicit_blank_count, 0) > 1)
        AND position('/' IN v_raw) > 0 THEN
    SELECT coalesce(jsonb_agg(to_jsonb(btrim(part)) ORDER BY ord), '[]'::jsonb)
    INTO v_parts
    FROM regexp_split_to_table(v_raw, '\s*/\s*') WITH ORDINALITY AS t(part, ord)
    WHERE btrim(part) <> '';
    IF jsonb_array_length(v_parts) =
       greatest(1, coalesce(nullif(v_explicit_blank_count, 0), nullif(v_prompt_blanks, 0), 1)) THEN
      v_raw_items := v_parts;
    END IF;
  END IF;

  IF v_raw_items IS NULL THEN
    RETURN jsonb_build_array(v_raw);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_raw_items) AS elem
    WHERE jsonb_typeof(elem) = 'array'
  ) INTO v_has_nested;

  SELECT coalesce(jsonb_agg(to_jsonb(t.txt) ORDER BY t.ord), '[]'::jsonb)
  INTO v_cleaned
  FROM (
    SELECT
      ord,
      CASE
        WHEN jsonb_typeof(elem) = 'array' THEN coalesce((
          SELECT string_agg(nullif(btrim(val), ''), ' / ' ORDER BY sub_ord)
          FROM jsonb_array_elements_text(elem) WITH ORDINALITY AS sub(val, sub_ord)
          WHERE btrim(val) <> ''
        ), '')
        ELSE btrim(elem #>> '{}')
      END AS txt
    FROM jsonb_array_elements(v_raw_items) WITH ORDINALITY AS items(elem, ord)
  ) AS t
  WHERE t.txt <> '';

  IF jsonb_array_length(v_cleaned) = 0 THEN
    RETURN jsonb_build_array('');
  ELSIF jsonb_array_length(v_cleaned) = 1 THEN
    -- Split a legacy compacted answer only when the delimiter count matches
    -- the number of independent blanks. Never split accepted variants.
    IF NOT v_has_nested
       AND NOT v_from_accepted_variants
       AND greatest(1, coalesce(nullif(v_explicit_blank_count, 0), nullif(v_prompt_blanks, 0), 1)) > 1 THEN
      SELECT coalesce(jsonb_agg(to_jsonb(btrim(part)) ORDER BY ord), '[]'::jsonb)
      INTO v_parts
      FROM regexp_split_to_table(v_cleaned ->> 0, '\s*(//|[|/])\s*')
        WITH ORDINALITY AS split(part, ord)
      WHERE btrim(part) <> '';
      IF jsonb_array_length(v_parts) =
         greatest(1, coalesce(nullif(v_explicit_blank_count, 0), nullif(v_prompt_blanks, 0), 1)) THEN
        RETURN v_parts;
      END IF;
    END IF;
    RETURN v_cleaned;
  END IF;

  v_is_multi_blank :=
    v_has_nested
    OR (v_explicit_blank_count IS NOT NULL AND v_explicit_blank_count > 1)
    OR v_prompt_blanks >= 2
    OR (NOT v_from_accepted_variants AND v_prompt_text = '' AND coalesce(v_explicit_blank_count, 0) <> 1);

  IF v_is_multi_blank THEN
    RETURN v_cleaned;
  END IF;

  SELECT coalesce(string_agg(val, ' / ' ORDER BY ord), '')
  INTO v_collapsed
  FROM jsonb_array_elements_text(v_cleaned) WITH ORDINALITY AS c(val, ord);

  RETURN jsonb_build_array(v_collapsed);
END;
$$;


CREATE OR REPLACE FUNCTION public.exercise_grade_question(p_question jsonb, p_answer jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
declare
  v_type text := coalesce(p_question ->> 'type', '');
  v_expected jsonb := '[]'::jsonb;
  v_student jsonb := p_answer;
  v_correct integer := 0;
  v_hits integer := 0;
  v_total integer := 0;
  v_points numeric := greatest(0, coalesce((p_question ->> 'points')::numeric, 0));
  v_awarded numeric := 0;
  v_expected_text text;
  v_student_text text;
  v_idx integer;
  v_phrase jsonb;
  v_responses jsonb;
  v_expected_order jsonb := '[]'::jsonb;
  v_chosen_verb text;
  v_expected_verb text;
  v_typed_text text;
  v_phrase_points numeric;
  v_used_verbs text[] := ARRAY[]::text[];
  v_vt_units integer := 0;
  v_vt_max_units integer := 0;
begin
  if v_type = 'qcm' then
    v_expected_text := trim(coalesce(p_question ->> 'correct_answer', ''));
    if v_expected_text ~ '^[0-9]+$' and jsonb_typeof(p_question -> 'options') = 'array' then
      v_expected_text := coalesce(p_question -> 'options' ->> (v_expected_text::integer), v_expected_text);
    end if;
    v_student_text := trim(coalesce(p_answer #>> '{}', ''));
    if public.quiz_norm_answer(v_student_text) <> ''
       and public.quiz_norm_answer(v_student_text) = public.quiz_norm_answer(v_expected_text) then
      v_correct := 1;
    elsif v_student_text ~ '^[0-9]+$' and jsonb_typeof(p_question -> 'options') = 'array' then
      begin
        if public.quiz_norm_answer(p_question -> 'options' ->> v_student_text::integer) = public.quiz_norm_answer(v_expected_text) then
          v_correct := 1;
        end if;
      exception when others then null;
      end;
    end if;
    v_total := 1;
    v_awarded := case when v_correct = 1 then v_points else 0 end;

  elsif v_type = 'text' then
    v_expected := public.quiz_expected_answers_list(p_question);
    v_total := greatest(1, jsonb_array_length(v_expected));

    if jsonb_typeof(v_student) = 'string' then
      begin
        if left(btrim(v_student #>> '{}'), 1) = '[' then
          v_student := (v_student #>> '{}')::jsonb;
        else
          v_student := jsonb_build_array(v_student #>> '{}');
        end if;
      exception when others then
        v_student := jsonb_build_array(v_student #>> '{}');
      end;
    end if;
    if jsonb_typeof(v_student) <> 'array' then
      v_student := jsonb_build_array(coalesce(v_student #>> '{}', ''));
    end if;
    if v_total > 1 and jsonb_array_length(v_student) = 1 and position(' | ' in coalesce(v_student ->> 0, '')) > 0 then
      select coalesce(jsonb_agg(to_jsonb(part)), '[]'::jsonb)
      into v_student
      from regexp_split_to_table(v_student ->> 0, '\s*\|\s*') as part;
    end if;

    for v_idx in 0 .. (v_total - 1) loop
      v_expected_text := coalesce(v_expected ->> v_idx, '');
      v_student_text := coalesce(v_student ->> v_idx, '');
      if public.quiz_text_matches(v_student_text, v_expected_text) then
        v_hits := v_hits + 1;
      end if;
    end loop;

    v_correct := case when v_hits = v_total then 1 else 0 end;
    v_awarded := case
      when v_hits = v_total then v_points
      else v_points * v_hits / v_total
    end;

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
    v_vt_max_units := v_total * 3;

    for v_phrase, v_idx in
      select p.value, p.ordinality::integer
      from jsonb_array_elements(coalesce(p_question #> '{verbes_trous,phrases}','[]'::jsonb)) with ordinality p(value, ordinality)
    loop
      v_responses := coalesce(v_phrase -> 'reponses', '[]'::jsonb);
      v_expected_verb := public.quiz_norm_answer(coalesce(v_phrase ->> 'verbe', ''));
      v_chosen_verb := public.quiz_norm_answer(coalesce(
        v_student -> 'choices' ->> (v_idx - 1),
        v_student -> 'choices' ->> (v_phrase ->> 'id'),
        v_student -> (v_phrase ->> 'id') ->> 'verbe_choisi',
        ''
      ));
      v_typed_text := btrim(regexp_replace(public.quiz_norm_answer(coalesce(
        v_student -> 'saisies' ->> (v_idx - 1),
        v_student -> 'saisies' ->> (v_phrase ->> 'id'),
        v_student -> (v_phrase ->> 'id') ->> 'texte_saisi',
        v_student ->> (v_phrase ->> 'id'),
        v_student ->> (v_idx - 1),
        ''
      )), '[.?!;:]+$', ''));

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
          CROSS JOIN LATERAL regexp_split_to_table(coalesce(r.value, ''), '\s*[/;|]\s*') AS alt(part)
          WHERE btrim(regexp_replace(public.quiz_norm_answer(alt.part), '[.?!;:]+$', '')) = v_typed_text
        ) THEN
          v_vt_units := v_vt_units + 3;
        END IF;
      ELSE
        IF v_chosen_verb <> '' AND v_chosen_verb = v_expected_verb THEN
          v_vt_units := v_vt_units + 1;
        END IF;

        IF v_chosen_verb <> '' AND v_typed_text <> '' AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(v_responses) r(value)
          CROSS JOIN LATERAL regexp_split_to_table(coalesce(r.value, ''), '\s*[/;|]\s*') AS alt(part)
          WHERE btrim(regexp_replace(public.quiz_norm_answer(alt.part), '[.?!;:]+$', '')) = v_typed_text
        ) THEN
          v_vt_units := v_vt_units + 2;
        END IF;
      END IF;
    end loop;
    v_correct := case when v_vt_max_units > 0 and v_vt_units = v_vt_max_units then 1 else 0 end;
    v_awarded := case
      when v_correct = 1 then v_points
      when v_vt_max_units > 0 then v_points * v_vt_units / v_vt_max_units
      else 0
    end;

  elsif v_type = 'mots_trous' then
    if jsonb_typeof(v_student) = 'string' then
      begin v_student := (v_student #>> '{}')::jsonb;
      exception when others then v_student := '{}'::jsonb; end;
    end if;
    if jsonb_typeof(v_student) <> 'object' then
      v_student := '{}'::jsonb;
    end if;

    v_total := greatest(1, jsonb_array_length(coalesce(p_question #> '{mots_trous,phrases}','[]'::jsonb)));
    v_used_verbs := ARRAY[]::text[];

    for v_phrase, v_idx in
      select p.value, p.ordinality::integer
      from jsonb_array_elements(coalesce(p_question #> '{mots_trous,phrases}','[]'::jsonb)) with ordinality p(value, ordinality)
    loop
      v_expected_verb := public.quiz_norm_answer(coalesce(v_phrase ->> 'mot', ''));

      if (v_student ? 'choices') and jsonb_typeof(v_student -> 'choices') = 'object' then
        if jsonb_typeof(v_student -> 'choices' -> (v_phrase ->> 'id')) = 'object' then
          v_chosen_verb := coalesce(v_student -> 'choices' -> (v_phrase ->> 'id') ->> 'mot_choisi', v_student -> 'choices' -> (v_phrase ->> 'id') ->> 'mot', '');
        elsif jsonb_typeof(v_student -> 'choices' -> (v_idx - 1)) = 'object' then
          v_chosen_verb := coalesce(v_student -> 'choices' -> (v_idx - 1) ->> 'mot_choisi', v_student -> 'choices' -> (v_idx - 1) ->> 'mot', '');
        else
          v_chosen_verb := coalesce(v_student -> 'choices' ->> (v_phrase ->> 'id'), v_student -> 'choices' ->> (v_idx - 1), '');
        end if;
      else
        if jsonb_typeof(v_student -> (v_phrase ->> 'id')) = 'object' then
          v_chosen_verb := coalesce(v_student -> (v_phrase ->> 'id') ->> 'mot_choisi', v_student -> (v_phrase ->> 'id') ->> 'mot', v_student -> (v_phrase ->> 'id') ->> 'word', '');
        else
          v_chosen_verb := coalesce(v_student ->> (v_phrase ->> 'id'), v_student ->> (v_idx - 1), '');
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
          v_hits := v_hits + 1;
        end if;
      end if;
    end loop;
    v_correct := case when v_hits = v_total then 1 else 0 end;
    v_awarded := case
      when v_hits = v_total then v_points
      else v_points * v_hits / v_total
    end;
  else
    raise exception 'Type de question non pris en charge: %', v_type;
  end if;

  return jsonb_build_object(
    'correct', (v_correct = 1),
    'points', round(v_awarded, 2),
    'max_points', round(v_points, 2),
    'expected', case
      when v_type = 'text' then
        case
          when jsonb_array_length(v_expected) <= 1 then coalesce(v_expected -> 0, p_question -> 'correct_answer')
          else v_expected
        end
      else coalesce(p_question -> 'answers', p_question -> 'correct_answer', p_question #> '{verbes_trous,phrases}', p_question #> '{mots_trous,phrases}')
    end,
    'explanation', p_question -> 'explanation'
  );
end;
$$;
CREATE OR REPLACE FUNCTION public.written_exam_auto_question_score(
  p_question_id uuid,
  p_answer jsonb
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $written$
declare
  v_q record;
  v_key jsonb;
  v_expected jsonb;
  v_actual jsonb;
  v_count integer;
  v_hits integer:=0;
  v_idx integer;
  v_points numeric:=0;
  v_ppp numeric:=1;
  v_answer_text text;
  v_phrase jsonb;
  v_phrase_answer jsonb;
  v_chosen text;
  v_expected_verb text;
  v_typed text;
  v_used text[]:=array[]::text[];
  v_expected_label text;
begin
  select q.question_type,q.prompt,q.points,q.public_data,k.answer_key
  into v_q
  from public.written_exam_questions q
  join public.written_exam_answer_keys k on k.question_id=q.id
  where q.id=p_question_id;

  if not found then
    return 0;
  end if;
  v_key:=coalesce(v_q.answer_key,'{}'::jsonb);

  if v_q.question_type='qcm' then
    v_answer_text := coalesce(p_answer#>>'{}','');
    if v_answer_text = coalesce(v_key->>'correctOptionId','') then
      return v_q.points;
    end if;
    select o->>'label' into v_expected_label
    from jsonb_array_elements(coalesce(v_q.public_data->'options','[]'::jsonb)) o
    where o->>'id' = coalesce(v_key->>'correctOptionId','')
    limit 1;
    if v_expected_label is not null
       and public.quiz_norm_answer(v_expected_label) = public.quiz_norm_answer(v_answer_text) then
      return v_q.points;
    end if;
    return 0;

  elsif v_q.question_type='text' then
    v_expected := public.quiz_expected_answers_list(jsonb_build_object(
      'question', coalesce(v_q.prompt, ''),
      'answers', v_key->'answers',
      'acceptedAnswers', v_key->'acceptedAnswers',
      'accepted_answers', v_key->'accepted_answers',
      'correct_answer', v_key->'correct_answer',
      'blank_count', v_q.public_data->'blank_count'
    ));
    v_count := jsonb_array_length(v_expected);
    if v_count = 0 then return 0; end if;

    if jsonb_typeof(p_answer)='array' then
      v_actual:=p_answer;
    elsif jsonb_typeof(p_answer)='string' and left(btrim(coalesce(p_answer#>>'{}','')),1)='[' then
      begin
        v_actual:=(p_answer#>>'{}')::jsonb;
      exception when others then
        v_actual:=jsonb_build_array(p_answer#>>'{}');
      end;
    else
      v_actual:=jsonb_build_array(coalesce(p_answer#>>'{}',''));
    end if;
    if jsonb_typeof(v_actual) <> 'array' then
      v_actual := jsonb_build_array(coalesce(p_answer#>>'{}',''));
    end if;

    if v_count = 1 then
      v_answer_text := coalesce(v_actual->>0, p_answer#>>'{}', '');
      if public.quiz_text_matches(v_answer_text, coalesce(v_expected->>0, '')) then
        return v_q.points;
      end if;
      return 0;
    end if;

    if jsonb_array_length(v_actual) = 1 and position(' | ' in coalesce(v_actual->>0,'')) > 0 then
      select coalesce(jsonb_agg(to_jsonb(part)),'[]'::jsonb)
      into v_actual
      from regexp_split_to_table(v_actual->>0,'\s*\|\s*') as part;
    end if;

    for v_idx in 0..v_count-1 loop
      if public.quiz_text_matches(coalesce(v_actual->>v_idx,''), coalesce(v_expected->>v_idx,'')) then
        v_hits := v_hits + 1;
      end if;
    end loop;
    return case
      when v_hits = v_count then v_q.points
      else round(v_q.points*v_hits/nullif(v_count,0),2)
    end;

  elsif v_q.question_type='reorder' then
    v_expected:=coalesce(v_key->'correctOrder','[]'::jsonb);
    if jsonb_typeof(p_answer)='array' then
      v_actual:=p_answer;
    elsif jsonb_typeof(p_answer)='string' and left(coalesce(p_answer#>>'{}',''),1)='[' then
      begin
        v_actual:=(p_answer#>>'{}')::jsonb;
      exception when others then
        v_actual:='[]'::jsonb;
      end;
    else
      v_actual:='[]'::jsonb;
    end if;
    v_count:=jsonb_array_length(v_expected);
    if v_count=0 then return 0; end if;
    for v_idx in 0..v_count-1 loop
      if v_actual->>v_idx=v_expected->>v_idx then v_hits:=v_hits+1; end if;
    end loop;
    return round(v_q.points*v_hits/nullif(v_count,0),2);

  elsif v_q.question_type='verbes_trous' then
    if jsonb_typeof(p_answer)='string' and left(coalesce(p_answer#>>'{}',''),1)='{' then
      begin
        v_actual:=(p_answer#>>'{}')::jsonb;
      exception when others then
        v_actual:='{}'::jsonb;
      end;
    else
      v_actual:=coalesce(p_answer,'{}'::jsonb);
    end if;
    for v_phrase in select value from jsonb_array_elements(coalesce(v_key->'phrases','[]'::jsonb))
    loop
      v_phrase_answer:=v_actual->(v_phrase->>'id');
      v_chosen:=public.quiz_norm_answer(coalesce(v_phrase_answer->>'verbe_choisi',''));
      v_expected_verb:=public.quiz_norm_answer(coalesce(v_phrase->>'verbe',''));
      v_typed:=btrim(regexp_replace(public.quiz_norm_answer(coalesce(v_phrase_answer->>'texte_saisi','')),'[.?!;:]+$',''));
      if v_chosen<>'' and not (v_chosen=any(v_used))
        and (
          jsonb_typeof(v_q.public_data->'verbes_trous'->'banque')<>'array'
          or jsonb_array_length(v_q.public_data->'verbes_trous'->'banque')=0
          or exists(
            select 1 from jsonb_array_elements_text(coalesce(v_q.public_data->'verbes_trous'->'banque','[]'::jsonb)) b(value)
            where public.quiz_norm_answer(b.value)=v_chosen
          )
        ) then
        v_used:=array_append(v_used,v_chosen);
        if v_chosen=v_expected_verb then v_points:=v_points+1; end if;
        if v_typed<>'' and exists(
          select 1
          from jsonb_array_elements_text(coalesce(v_phrase->'reponses','[]'::jsonb)) a(value)
          cross join lateral regexp_split_to_table(coalesce(a.value,''),'\s*[/;|]\s*') as alt(part)
          where btrim(regexp_replace(public.quiz_norm_answer(alt.part),'[.?!;:]+$',''))=v_typed
        ) then v_points:=v_points+2; end if;
      end if;
    end loop;
    return least(v_q.points,v_points);

  elsif v_q.question_type='mots_trous' then
    if jsonb_typeof(p_answer)='string' and left(coalesce(p_answer#>>'{}',''),1)='{' then
      begin
        v_actual:=(p_answer#>>'{}')::jsonb;
      exception when others then
        v_actual:='{}'::jsonb;
      end;
    else
      v_actual:=coalesce(p_answer,'{}'::jsonb);
    end if;
    if jsonb_typeof(v_actual)<>'object' then
      v_actual:='{}'::jsonb;
    end if;
    v_ppp:=greatest(1,coalesce((v_q.public_data->'mots_trous'->>'points_par_phrase')::numeric,1));
    for v_phrase in select value from jsonb_array_elements(coalesce(v_key->'phrases','[]'::jsonb))
    loop
      v_phrase_answer:=v_actual->(v_phrase->>'id');
      if jsonb_typeof(v_phrase_answer)='object' then
        v_chosen:=coalesce(v_phrase_answer->>'mot_choisi',v_phrase_answer->>'mot',v_phrase_answer->>'word','');
      else
        v_chosen:=coalesce(v_actual->>(v_phrase->>'id'),'');
      end if;
      v_chosen:=public.quiz_norm_answer(v_chosen);
      v_expected_verb:=public.quiz_norm_answer(coalesce(v_phrase->>'mot',''));
      if v_chosen<>'' and not (v_chosen=any(v_used))
        and (
          jsonb_typeof(v_q.public_data->'mots_trous'->'banque')<>'array'
          or jsonb_array_length(v_q.public_data->'mots_trous'->'banque')=0
          or exists(
            select 1 from jsonb_array_elements_text(coalesce(v_q.public_data->'mots_trous'->'banque','[]'::jsonb)) b(value)
            where public.quiz_norm_answer(b.value)=v_chosen
          )
        ) then
        v_used:=array_append(v_used,v_chosen);
        if v_expected_verb<>'' and v_chosen=v_expected_verb then
          v_points:=v_points+v_ppp;
        end if;
      end if;
    end loop;
    return least(v_q.points,v_points);
  end if;
  return 0;
end
$written$;

-- Keep this privileged scoring helper unavailable as a direct public RPC.
REVOKE EXECUTE ON FUNCTION public.written_exam_auto_question_score(uuid, jsonb) FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.written_exam_auto_question_score(uuid, jsonb) TO service_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
