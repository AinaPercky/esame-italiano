-- Unification complète et idempotente de la normalisation et de la notation
-- des réponses entre Quiz, Exercices et Examens écrits :
-- 1. Suppression des caractères invisibles et espaces insécables (\u200B-\u200D, \uFEFF, \u00A0, \u202F),
--    normalisation Unicode NFC, unification des apostrophes/guillemets.
-- 2. Tolérance des suffixes monétaires (« euro », « euros », « € ») et de la variante -trè / -tré
--    sur les nombres italiens composés (0 à 999) tout en préservant les accents distinctifs (« caffè »).
-- 3. Désambiguïsation des réponses multiples d'un même trou vs. questions réellement multi-trous
--    (« Case 1 / Case 2 ») dans quiz_expected_answers_list, quiz_sanitize_questions,
--    exercise_sanitize_question_for_batch, exercise_question_for_student,
--    quiz_grade_question, exercise_grade_question et written_exam_auto_question_score.
-- 4. Correction du bug d'arrondi flottant (1/3 + 1/3 + 1/3 < 1) dans exercise_grade_question.

CREATE OR REPLACE FUNCTION public.quiz_norm_answer(p_val TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    regexp_replace(
      replace(
        replace(
          translate(
            translate(
              lower(btrim(normalize(coalesce(p_val, ''), NFC))),
              chr(8203) || chr(8204) || chr(8205) || chr(65279),
              ''
            ),
            chr(8217) || chr(8216) || chr(96) || chr(171) || chr(187) || chr(8220) || chr(8221),
            repeat(chr(39), 3) || repeat(chr(34), 4)
          ),
          chr(160), ' '
        ),
        chr(8239), ' '
      ),
      chr(39) || '\s+', chr(39), 'g'
    ),
    '\s+', ' ', 'g'
  );
$$;

CREATE OR REPLACE FUNCTION public.quiz_italian_number_value(p_text TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text TEXT := public.quiz_norm_answer(p_text);
  v_value INTEGER;
BEGIN
  -- « euro / euros / € » est un complément monétaire facultatif, pas une partie du nombre.
  v_text := btrim(regexp_replace(v_text, '(?:\s+(?:euro|euros)|\s*€)$', '', 'i'));
  IF v_text ~ '^[0-9]{1,3}$' THEN
    RETURN v_text::INTEGER;
  END IF;
  IF length(v_text) > 3 AND right(v_text, 3) = 'trè' THEN
    v_text := left(v_text, length(v_text) - 1) || 'é';
  END IF;

  SELECT n INTO v_value
  FROM generate_series(0, 999) AS n
  WHERE public.quiz_italian_number_words(n) = v_text
  LIMIT 1;
  RETURN v_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.quiz_text_matches(p_student TEXT, p_expected TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_student TEXT := public.quiz_norm_answer(p_student);
  v_expected TEXT := public.quiz_norm_answer(p_expected);
  v_student_nopunct TEXT;
  v_expected_nopunct TEXT;
  v_alt TEXT;
  v_alt_count INTEGER := 0;
  v_student_number INTEGER;
  v_expected_number INTEGER;
  v_alternative_pattern CONSTANT TEXT := '(?i)\s*[/;|]\s*|\s+(ou|oppure|o)\s+';
BEGIN
  IF v_student = '' OR v_expected = '' THEN RETURN FALSE; END IF;
  IF v_student = v_expected THEN RETURN TRUE; END IF;
  v_student_nopunct := btrim(regexp_replace(v_student, '[.?!;:]+$', ''));
  v_expected_nopunct := btrim(regexp_replace(v_expected, '[.?!;:]+$', ''));
  IF v_student_nopunct <> '' AND v_student_nopunct = v_expected_nopunct THEN RETURN TRUE; END IF;

  -- Équivalence exacte entre chiffres et nombres cardinaux italiens (0 à 999).
  v_student_number := public.quiz_italian_number_value(v_student_nopunct);
  v_expected_number := public.quiz_italian_number_value(v_expected_nopunct);
  IF v_student_number IS NOT NULL AND v_student_number = v_expected_number THEN
    RETURN TRUE;
  END IF;

  FOR v_alt IN
    SELECT btrim(regexp_replace(public.quiz_norm_answer(part), '[.?!;:]+$', ''))
    FROM regexp_split_to_table(coalesce(p_expected, ''), v_alternative_pattern) AS part
  LOOP
    IF v_alt <> '' THEN v_alt_count := v_alt_count + 1; END IF;
  END LOOP;
  IF v_alt_count > 1 THEN
    RETURN EXISTS (
      SELECT 1
      FROM regexp_split_to_table(coalesce(p_expected, ''), v_alternative_pattern) AS part
      WHERE btrim(part) <> ''
        AND (
          btrim(regexp_replace(public.quiz_norm_answer(part), '[.?!;:]+$', '')) = v_student_nopunct
          OR (
            v_student_number IS NOT NULL
            AND public.quiz_italian_number_value(
              btrim(regexp_replace(public.quiz_norm_answer(part), '[.?!;:]+$', ''))
            ) = v_student_number
          )
        )
    );
  END IF;
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.quiz_prompt_blank_count(p_prompt TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce((
    SELECT count(*)::integer
    FROM regexp_matches(
      btrim(coalesce(p_prompt, '')),
      '([_]{2,}|\[_+\]|\[\s*\]|\[[0-9]+\]|\.{3,}|\((?:_{2,}|\.{2,}|\s*)\)|\[(?:\.{2,}|\s*)\])',
      'g'
    )
  ), 0);
$$;

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

CREATE OR REPLACE FUNCTION public.quiz_sanitize_questions(p_questions JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result JSONB := '[]'::jsonb;
  v_q JSONB;
  v_clean JSONB;
  v_type TEXT;
  v_vt JSONB;
  v_mt JSONB;
  v_phrases JSONB;
  v_items JSONB;
  v_blank_count INTEGER;
BEGIN
  IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array' THEN
    RETURN '[]'::jsonb;
  END IF;

  FOR v_q IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
    v_type := coalesce(v_q ->> 'type', 'qcm');
    v_clean := (v_q - 'correct_answer' - 'answers' - 'acceptedAnswers' - 'accepted_answers' - 'explanation' - 'phrases' - 'error_category_map');

    IF v_type = 'text' THEN
      v_blank_count := greatest(1, jsonb_array_length(public.quiz_expected_answers_list(v_q)));
      v_clean := v_clean || jsonb_build_object('blank_count', v_blank_count);
    ELSIF v_type = 'reorder' AND jsonb_typeof(v_q -> 'items') = 'array' THEN
      SELECT coalesce(jsonb_agg(item.value ORDER BY md5(coalesce(v_q ->> 'id', '') || ':' || coalesce(item.value ->> 'id', item.value::text))), '[]'::jsonb)
      INTO v_items
      FROM jsonb_array_elements(v_q -> 'items') AS item(value);
      v_clean := v_clean || jsonb_build_object('items', v_items);
    ELSIF v_type = 'verbes_trous' AND jsonb_typeof(v_q -> 'verbes_trous') = 'object' THEN
      v_vt := (v_q -> 'verbes_trous');
      IF jsonb_typeof(v_vt -> 'phrases') = 'array' THEN
        SELECT coalesce(jsonb_agg(
          jsonb_build_object(
            'id', p.value -> 'id',
            'debut', coalesce(p.value ->> 'debut', ''),
            'fin', coalesce(p.value ->> 'fin', '')
          )
        ), '[]'::jsonb)
        INTO v_phrases
        FROM jsonb_array_elements(v_vt -> 'phrases') WITH ORDINALITY AS p(value, ord);
        v_vt := jsonb_set(v_vt, '{phrases}', v_phrases, true);
      END IF;
      v_clean := jsonb_set(v_clean, '{verbes_trous}', v_vt, true);
    ELSIF v_type = 'mots_trous' AND jsonb_typeof(v_q -> 'mots_trous') = 'object' THEN
      v_mt := (v_q -> 'mots_trous');
      IF jsonb_typeof(v_mt -> 'phrases') = 'array' THEN
        SELECT coalesce(jsonb_agg(
          jsonb_build_object(
            'id', p.value -> 'id',
            'debut', coalesce(p.value ->> 'debut', ''),
            'fin', coalesce(p.value ->> 'fin', '')
          )
        ), '[]'::jsonb)
        INTO v_phrases
        FROM jsonb_array_elements(v_mt -> 'phrases') WITH ORDINALITY AS p(value, ord);
        v_mt := jsonb_set(v_mt, '{phrases}', v_phrases, true);
      END IF;
      v_clean := jsonb_set(v_clean, '{mots_trous}', v_mt, true);
    END IF;

    v_result := v_result || jsonb_build_array(v_clean);
  END LOOP;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.quiz_grade_question(p_question JSONB, p_answer TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_type TEXT := coalesce(p_question ->> 'type', 'qcm');
  v_max NUMERIC := greatest(0, coalesce((p_question ->> 'points')::numeric, 1));
  v_ans TEXT := btrim(coalesce(p_answer, ''));
  v_expected TEXT := btrim(coalesce(p_question ->> 'correct_answer', ''));
  v_explanation TEXT := nullif(btrim(coalesce(p_question ->> 'explanation', '')), '');
  v_correct BOOLEAN := FALSE;
  v_points NUMERIC := 0;
  v_expected_display TEXT := '';
  v_student_display TEXT := v_ans;
  v_expected_list JSONB;
  v_student_list JSONB;
  v_total_blanks INTEGER;
  v_correct_blanks INTEGER := 0;
  v_idx INTEGER;
  v_points_per_blank NUMERIC;
  v_expected_ids JSONB;
  v_student_ids JSONB;
  v_vt JSONB;
  v_phrases JSONB;
  v_ppp NUMERIC;
  v_phrase JSONB;
  v_ans_obj JSONB := '{}'::jsonb;
  v_phrase_ans JSONB;
  v_used_verbs TEXT[] := ARRAY[]::TEXT[];
  v_chosen_verb TEXT;
  v_chosen_norm TEXT;
  v_typed_text TEXT;
  v_typed_norm TEXT;
  v_exp_verb TEXT;
  v_exp_verb_norm TEXT;
  v_p_verb INTEGER;
  v_p_conj INTEGER;
  v_p_total NUMERIC;
  v_vt_expected_parts TEXT[] := ARRAY[]::TEXT[];
  v_vt_student_parts TEXT[] := ARRAY[]::TEXT[];
  v_expected_part TEXT;
  v_student_part TEXT;
  v_ans_resolved TEXT;
BEGIN
  IF v_type = 'qcm' THEN
    IF v_expected ~ '^[0-9]+$' AND jsonb_typeof(p_question -> 'options') = 'array' THEN
      v_expected := coalesce(p_question -> 'options' ->> (v_expected::integer), v_expected);
    END IF;
    v_ans_resolved := v_ans;
    IF v_ans ~ '^[0-9]+$' AND jsonb_typeof(p_question -> 'options') = 'array'
       AND public.quiz_norm_answer(v_ans) <> public.quiz_norm_answer(v_expected) THEN
      v_ans_resolved := coalesce(p_question -> 'options' ->> (v_ans::integer), v_ans);
    END IF;
    v_correct := public.quiz_norm_answer(v_ans_resolved) <> ''
      AND public.quiz_norm_answer(v_ans_resolved) = public.quiz_norm_answer(v_expected);
    v_points := CASE WHEN v_correct THEN v_max ELSE 0 END;
    v_expected_display := v_expected;
    v_student_display := v_ans_resolved;

  ELSIF v_type = 'reorder' THEN
    IF jsonb_typeof(p_question -> 'items') = 'array' THEN
      BEGIN
        IF left(v_expected, 1) = '[' THEN
          v_expected_ids := v_expected::jsonb;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_expected_ids := NULL;
      END;
      IF v_expected_ids IS NULL OR jsonb_typeof(v_expected_ids) <> 'array' OR jsonb_array_length(v_expected_ids) = 0 THEN
        SELECT coalesce(jsonb_agg(item -> 'id' ORDER BY ord), '[]'::jsonb)
        INTO v_expected_ids
        FROM jsonb_array_elements(p_question -> 'items') WITH ORDINALITY AS t(item, ord);
      END IF;

      BEGIN
        v_student_ids := v_ans::jsonb;
      EXCEPTION WHEN OTHERS THEN
        v_student_ids := '[]'::jsonb;
      END;
      IF jsonb_typeof(v_student_ids) <> 'array' THEN
        v_student_ids := '[]'::jsonb;
      END IF;

      v_correct := jsonb_array_length(v_expected_ids) > 0
        AND jsonb_array_length(v_student_ids) = jsonb_array_length(v_expected_ids)
        AND v_student_ids = v_expected_ids;
      v_points := CASE WHEN v_correct THEN v_max ELSE 0 END;

      SELECT coalesce(string_agg(item ->> 'text', ' → ' ORDER BY eid.ord), '')
      INTO v_expected_display
      FROM jsonb_array_elements_text(v_expected_ids) WITH ORDINALITY AS eid(val, ord)
      JOIN jsonb_array_elements(p_question -> 'items') AS item ON item ->> 'id' = eid.val;

      SELECT coalesce(string_agg(item ->> 'text', ' → ' ORDER BY sid.ord), '')
      INTO v_student_display
      FROM jsonb_array_elements_text(v_student_ids) WITH ORDINALITY AS sid(val, ord)
      JOIN jsonb_array_elements(p_question -> 'items') AS item ON item ->> 'id' = sid.val;
    END IF;

  ELSIF v_type = 'verbes_trous' AND jsonb_typeof(p_question -> 'verbes_trous') = 'object' THEN
    v_vt := p_question -> 'verbes_trous';
    v_phrases := coalesce(v_vt -> 'phrases', '[]'::jsonb);
    v_ppp := coalesce((v_vt ->> 'points_par_phrase')::numeric, (p_question ->> 'points_par_phrase')::numeric, 3);
    v_max := greatest(0, jsonb_array_length(v_phrases) * v_ppp);

    BEGIN
      IF v_ans <> '' THEN
        v_ans_obj := v_ans::jsonb;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_ans_obj := '{}'::jsonb;
    END;
    IF jsonb_typeof(v_ans_obj) <> 'object' THEN
      v_ans_obj := '{}'::jsonb;
    END IF;

    FOR v_idx IN 0 .. greatest(-1, jsonb_array_length(v_phrases) - 1) LOOP
      v_phrase := v_phrases -> v_idx;
      v_exp_verb := btrim(coalesce(v_phrase ->> 'verbe', ''));
      v_exp_verb_norm := public.quiz_norm_answer(v_exp_verb);

      IF (v_ans_obj ? 'choices') OR (v_ans_obj ? 'saisies') THEN
        v_chosen_verb := coalesce(v_ans_obj -> 'choices' ->> (v_idx::text), v_ans_obj -> 'choices' ->> (v_phrase ->> 'id'), '');
        v_typed_text := coalesce(v_ans_obj -> 'saisies' ->> (v_idx::text), v_ans_obj -> 'saisies' ->> (v_phrase ->> 'id'), '');
      ELSE
        v_phrase_ans := v_ans_obj -> (v_phrase ->> 'id');
        v_chosen_verb := coalesce(v_phrase_ans ->> 'verbe_choisi', '');
        v_typed_text := coalesce(v_phrase_ans ->> 'texte_saisi', '');
      END IF;

      v_chosen_norm := public.quiz_norm_answer(v_chosen_verb);
      v_typed_norm := btrim(regexp_replace(public.quiz_norm_answer(v_typed_text), '[.?!;:]+$', ''));

      IF v_chosen_norm <> '' AND v_chosen_norm = ANY(v_used_verbs) THEN
        v_p_verb := 0;
        v_p_conj := 0;
      ELSE
        IF v_chosen_norm <> '' THEN
          v_used_verbs := array_append(v_used_verbs, v_chosen_norm);
        END IF;
        v_p_verb := CASE WHEN v_chosen_norm <> '' AND v_chosen_norm = v_exp_verb_norm THEN 1 ELSE 0 END;
        v_p_conj := CASE
          WHEN v_chosen_norm <> '' AND v_typed_norm <> '' AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(coalesce(v_phrase -> 'reponses', '[]'::jsonb)) AS r(val)
            CROSS JOIN LATERAL regexp_split_to_table(coalesce(r.val, ''), '\s*[/;|]\s*') AS alt(part)
            WHERE btrim(regexp_replace(public.quiz_norm_answer(alt.part), '[.?!;:]+$', '')) = v_typed_norm
          ) THEN 2
          ELSE 0
        END;
      END IF;

      v_p_total := least(v_ppp, (v_p_verb + v_p_conj)::numeric);
      v_points := v_points + v_p_total;

      v_vt_expected_parts := array_append(
        v_vt_expected_parts,
        v_exp_verb || ' → ' || coalesce((SELECT string_agg(r, ' / ') FROM jsonb_array_elements_text(coalesce(v_phrase -> 'reponses', '[]'::jsonb)) AS r), '')
      );
      v_vt_student_parts := array_append(
        v_vt_student_parts,
        coalesce(nullif(btrim(v_chosen_verb), ''), '—') || ' → ' || coalesce(nullif(btrim(v_typed_text), ''), '—')
      );
    END LOOP;

    v_correct := (v_max > 0 AND v_points = v_max);
    v_expected_display := array_to_string(v_vt_expected_parts, ' · ');
    v_student_display := array_to_string(v_vt_student_parts, ' · ');

  ELSIF v_type = 'mots_trous' AND jsonb_typeof(p_question -> 'mots_trous') = 'object' THEN
    v_vt := p_question -> 'mots_trous';
    v_phrases := coalesce(v_vt -> 'phrases', '[]'::jsonb);
    v_ppp := greatest(1, coalesce((v_vt ->> 'points_par_phrase')::numeric, (p_question ->> 'points_par_phrase')::numeric, 1));
    v_max := greatest(0, jsonb_array_length(v_phrases) * v_ppp);

    BEGIN
      IF v_ans <> '' THEN
        v_ans_obj := v_ans::jsonb;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_ans_obj := '{}'::jsonb;
    END;
    IF jsonb_typeof(v_ans_obj) <> 'object' THEN
      v_ans_obj := '{}'::jsonb;
    END IF;

    FOR v_idx IN 0 .. greatest(-1, jsonb_array_length(v_phrases) - 1) LOOP
      v_phrase := v_phrases -> v_idx;
      v_exp_verb := btrim(coalesce(v_phrase ->> 'mot', ''));
      v_exp_verb_norm := public.quiz_norm_answer(v_exp_verb);

      IF (v_ans_obj ? 'choices') AND jsonb_typeof(v_ans_obj -> 'choices') = 'object' THEN
        IF jsonb_typeof(v_ans_obj -> 'choices' -> (v_phrase ->> 'id')) = 'object' THEN
          v_chosen_verb := coalesce(v_ans_obj -> 'choices' -> (v_phrase ->> 'id') ->> 'mot_choisi', v_ans_obj -> 'choices' -> (v_phrase ->> 'id') ->> 'mot', '');
        ELSIF jsonb_typeof(v_ans_obj -> 'choices' -> (v_idx::text)) = 'object' THEN
          v_chosen_verb := coalesce(v_ans_obj -> 'choices' -> (v_idx::text) ->> 'mot_choisi', v_ans_obj -> 'choices' -> (v_idx::text) ->> 'mot', '');
        ELSE
          v_chosen_verb := coalesce(v_ans_obj -> 'choices' ->> (v_phrase ->> 'id'), v_ans_obj -> 'choices' ->> (v_idx::text), '');
        END IF;
      ELSE
        IF jsonb_typeof(v_ans_obj -> (v_phrase ->> 'id')) = 'object' THEN
          v_chosen_verb := coalesce(v_ans_obj -> (v_phrase ->> 'id') ->> 'mot_choisi', v_ans_obj -> (v_phrase ->> 'id') ->> 'mot', v_ans_obj -> (v_phrase ->> 'id') ->> 'word', '');
        ELSE
          v_chosen_verb := coalesce(v_ans_obj ->> (v_phrase ->> 'id'), '');
        END IF;
      END IF;

      v_chosen_norm := public.quiz_norm_answer(v_chosen_verb);
      v_p_total := 0;

      IF v_chosen_norm <> ''
         AND NOT (v_chosen_norm = ANY(v_used_verbs))
         AND (
           jsonb_typeof(v_vt -> 'banque') <> 'array'
           OR jsonb_array_length(v_vt -> 'banque') = 0
           OR EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(v_vt -> 'banque') AS b
             WHERE public.quiz_norm_answer(b) = v_chosen_norm
           )
         ) THEN
        v_used_verbs := array_append(v_used_verbs, v_chosen_norm);
        IF v_exp_verb_norm <> '' AND v_chosen_norm = v_exp_verb_norm THEN
          v_p_total := v_ppp;
        END IF;
      END IF;

      v_points := v_points + v_p_total;
      v_vt_expected_parts := array_append(
        v_vt_expected_parts,
        (v_idx + 1) || '. ' || coalesce(nullif(btrim(v_exp_verb), ''), '—')
      );
      v_vt_student_parts := array_append(
        v_vt_student_parts,
        (v_idx + 1) || '. ' || coalesce(nullif(btrim(v_chosen_verb), ''), '—')
      );
    END LOOP;

    v_correct := (v_max > 0 AND v_points = v_max);
    v_expected_display := array_to_string(v_vt_expected_parts, ' · ');
    v_student_display := array_to_string(v_vt_student_parts, ' · ');

  ELSE
    -- Type texte : trou unique ou trous multiples
    v_expected_list := public.quiz_expected_answers_list(p_question);
    v_total_blanks := greatest(1, jsonb_array_length(v_expected_list));

    BEGIN
      IF left(v_ans, 1) = '[' THEN
        v_student_list := v_ans::jsonb;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_student_list := NULL;
    END;

    IF v_student_list IS NULL OR jsonb_typeof(v_student_list) <> 'array' THEN
      IF v_total_blanks > 1 AND position(' | ' IN v_ans) > 0 THEN
        SELECT coalesce(jsonb_agg(to_jsonb(part)), '[]'::jsonb)
        INTO v_student_list
        FROM regexp_split_to_table(v_ans, '\s*\|\s*') AS part;
      ELSE
        v_student_list := jsonb_build_array(v_ans);
      END IF;
    END IF;

    IF v_total_blanks <= 1 THEN
      v_expected_part := coalesce(v_expected_list ->> 0, v_expected);
      v_student_part := coalesce(v_student_list ->> 0, v_ans);
      v_correct := public.quiz_text_matches(v_student_part, v_expected_part);
      v_points := CASE WHEN v_correct THEN v_max ELSE 0 END;
      v_expected_display := v_expected_part;
      v_student_display := v_student_part;
    ELSE
      v_max := greatest(v_max, v_total_blanks::numeric);
      v_points_per_blank := v_max / v_total_blanks::numeric;
      FOR v_idx IN 0 .. (v_total_blanks - 1) LOOP
        v_expected_part := coalesce(v_expected_list ->> v_idx, '');
        v_student_part := coalesce(v_student_list ->> v_idx, '');
        IF public.quiz_text_matches(v_student_part, v_expected_part) THEN
          v_correct_blanks := v_correct_blanks + 1;
        END IF;
        v_vt_expected_parts := array_append(v_vt_expected_parts, 'Case ' || (v_idx + 1) || ': ' || v_expected_part);
        v_vt_student_parts := array_append(v_vt_student_parts, 'Case ' || (v_idx + 1) || ': ' || coalesce(nullif(btrim(v_student_part), ''), '—'));
      END LOOP;
      v_correct := (v_correct_blanks = v_total_blanks);
      v_points := CASE
        WHEN v_correct THEN v_max
        ELSE round((v_correct_blanks * v_points_per_blank)::numeric, 2)
      END;
      v_expected_display := array_to_string(v_vt_expected_parts, ' · ');
      v_student_display := array_to_string(v_vt_student_parts, ' · ');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'correct', v_correct,
    'points', v_points,
    'maxPoints', v_max,
    'expected', coalesce(v_expected_display, ''),
    'studentAnswer', coalesce(v_student_display, ''),
    'explanation', v_explanation
  );
END;
$$;

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
  v_safe JSONB := coalesce(p_question, '{}'::jsonb) - 'correct_answer' - 'answers' - 'acceptedAnswers' - 'accepted_answers' - 'explanation' - 'phrases' - 'error_category_map';
  v_vt JSONB;
  v_mt JSONB;
  v_phrases JSONB;
  v_blank_count INTEGER;
BEGIN
  IF coalesce(p_question ->> 'type', '') = 'text' THEN
    v_blank_count := greatest(1, jsonb_array_length(public.quiz_expected_answers_list(p_question)));
    v_safe := jsonb_set(v_safe, '{blank_count}', to_jsonb(v_blank_count), true);
  END IF;

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

  IF jsonb_typeof(p_question -> 'mots_trous') = 'object' THEN
    v_mt := p_question -> 'mots_trous';
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'id', phrase.value -> 'id',
        'debut', coalesce(phrase.value ->> 'debut', ''),
        'fin', coalesce(phrase.value ->> 'fin', '')
      ) ORDER BY phrase.ordinality
    ), '[]'::jsonb)
    INTO v_phrases
    FROM jsonb_array_elements(coalesce(v_mt -> 'phrases', '[]'::jsonb))
      WITH ORDINALITY AS phrase(value, ordinality);

    v_mt := jsonb_build_object(
      'titre', v_mt -> 'titre',
      'consigne', v_mt -> 'consigne',
      'points_par_phrase', v_mt -> 'points_par_phrase',
      'banque', v_mt -> 'banque',
      'phrases', v_phrases
    );
    v_safe := jsonb_set(v_safe, '{mots_trous}', v_mt, true);
  END IF;

  RETURN v_safe;
END;
$$;

CREATE OR REPLACE FUNCTION public.exercise_question_for_student(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $exercise$
declare
  v_attempt public.exercise_attempts%rowtype;
  v_content jsonb;
  v_question jsonb;
  v_question_id text;
  v_safe jsonb;
  v_blank_count integer;
begin
  select * into v_attempt from public.exercise_attempts where id = p_attempt_id;
  if not found or (v_attempt.student_id <> public.exercise_current_student_id() and not public.exercise_is_teacher()) then
    raise exception 'Tentative introuvable ou accès interdit.';
  end if;
  if v_attempt.status <> 'in_progress' then raise exception 'Cette tentative est terminée.'; end if;

  select content into v_content from public.exercise_versions where id = v_attempt.version_id;
  v_question_id := v_attempt.question_order ->> v_attempt.current_question_index;
  select q.value into v_question
  from jsonb_array_elements(v_content -> 'questions') q(value)
  where q.value ->> 'id' = v_question_id;
  if v_question is null then raise exception 'Question introuvable dans la version de l’exercice.'; end if;

  v_safe := v_question - 'correct_answer' - 'answers' - 'acceptedAnswers' - 'accepted_answers' - 'explanation' - 'phrases' - 'error_category_map';
  if coalesce(v_question ->> 'type', '') = 'text' then
    v_blank_count := greatest(1, jsonb_array_length(public.quiz_expected_answers_list(v_question)));
    v_safe := jsonb_set(v_safe, '{blank_count}', to_jsonb(v_blank_count), true);
  end if;
  if v_question ? 'options' then
    v_safe := jsonb_set(v_safe, '{options}', coalesce(v_attempt.option_orders -> v_question_id, v_question -> 'options'));
  end if;
  if v_question -> 'verbes_trous' is not null then
    v_safe := jsonb_set(v_safe, '{verbes_trous}',
      jsonb_build_object(
        'titre', v_question #> '{verbes_trous,titre}',
        'consigne', v_question #> '{verbes_trous,consigne}',
        'points_par_phrase', v_question #> '{verbes_trous,points_par_phrase}',
        'banque', v_question #> '{verbes_trous,banque}',
        'phrases', coalesce((
          select jsonb_agg(jsonb_build_object('id', p.value -> 'id','debut',p.value -> 'debut','fin',p.value -> 'fin') order by p.ordinality)
          from jsonb_array_elements(v_question #> '{verbes_trous,phrases}') with ordinality p(value, ordinality)
        ), '[]'::jsonb)
      )
    );
  end if;
  if v_question -> 'mots_trous' is not null then
    v_safe := jsonb_set(v_safe, '{mots_trous}',
      jsonb_build_object(
        'titre', v_question #> '{mots_trous,titre}',
        'consigne', v_question #> '{mots_trous,consigne}',
        'points_par_phrase', v_question #> '{mots_trous,points_par_phrase}',
        'banque', v_question #> '{mots_trous,banque}',
        'phrases', coalesce((
          select jsonb_agg(jsonb_build_object('id', p.value -> 'id','debut',p.value -> 'debut','fin',p.value -> 'fin') order by p.ordinality)
          from jsonb_array_elements(v_question #> '{mots_trous,phrases}') with ordinality p(value, ordinality)
        ), '[]'::jsonb)
      )
    );
  end if;
  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'question', v_safe,
    'question_number', v_attempt.current_question_index + 1,
    'question_count', jsonb_array_length(v_attempt.question_order),
    'deadline_at', v_attempt.current_question_deadline_at,
    'seconds_remaining', greatest(0, floor(extract(epoch from (v_attempt.current_question_deadline_at - now())))::integer),
    'server_now', now()
  );
end;
$exercise$;

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

-- Préserve strictement les restrictions de sécurité sur les RPC privilégiées.
REVOKE ALL ON FUNCTION public.exercise_sanitize_question_for_batch(JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.exercise_question_for_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exercise_question_for_student(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.written_exam_auto_question_score(uuid, jsonb) FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.written_exam_auto_question_score(uuid, jsonb) TO service_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
