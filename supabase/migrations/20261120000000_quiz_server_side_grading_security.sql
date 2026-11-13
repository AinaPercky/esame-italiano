-- PerckyLingua — Sécurité des quiz & correction côté serveur (PostgreSQL)
-- Migration additive et idempotente :
-- 1. Ne supprime ni ne modifie les quiz ou résultats historiques.
-- 2. Supprime l'accès direct en lecture aux clés de réponses pour anon/élèves via RLS.
-- 3. Fournit les catalogues sécurisés (get_public_quiz_catalog, get_student_quiz_catalog, get_public_quiz)
--    et la correction serveur (evaluate_quiz_question, evaluate_public_quiz_question, submit_quiz_submission, submit_quiz_presence_submission).

-- Helper d'identification professeur/élève (idempotent)
CREATE OR REPLACE FUNCTION public.quiz_is_teacher()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'authenticated'
    AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'ainapercky@gmail.com';
$$;

CREATE OR REPLACE FUNCTION public.quiz_current_student_id()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_id TEXT;
BEGIN
  IF auth.role() <> 'authenticated' OR v_email = '' THEN
    RAISE EXCEPTION 'Session étudiant authentifiée requise.';
  END IF;
  SELECT id::text INTO v_id FROM public.students WHERE lower(email) = v_email LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Aucune fiche étudiant associée à cette session.';
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.quiz_norm_answer(p_val TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    regexp_replace(
      replace(
        translate(
          lower(btrim(coalesce(p_val, ''))),
          chr(8217) || chr(8216) || chr(96) || chr(171) || chr(187) || chr(8220) || chr(8221),
          repeat(chr(39), 3) || repeat(chr(34), 4)
        ),
        chr(160), ' '
      ),
      chr(39) || '\s+', chr(39), 'g'
    ),
    '\s+', ' ', 'g'
  );
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
BEGIN
  IF v_student = '' OR v_expected = '' THEN
    RETURN FALSE;
  END IF;

  IF v_student = v_expected THEN
    RETURN TRUE;
  END IF;

  v_student_nopunct := btrim(regexp_replace(v_student, '[.?!;:]+$', ''));
  v_expected_nopunct := btrim(regexp_replace(v_expected, '[.?!;:]+$', ''));

  IF v_student_nopunct <> '' AND v_student_nopunct = v_expected_nopunct THEN
    RETURN TRUE;
  END IF;

  FOR v_alt IN
    SELECT btrim(regexp_replace(public.quiz_norm_answer(part), '[.?!;:]+$', ''))
    FROM regexp_split_to_table(coalesce(p_expected, ''), '\s*[/;|]\s*') AS part
  LOOP
    IF v_alt <> '' THEN
      v_alt_count := v_alt_count + 1;
    END IF;
  END LOOP;

  IF v_alt_count > 1 THEN
    RETURN EXISTS (
      SELECT 1
      FROM regexp_split_to_table(coalesce(p_expected, ''), '\s*[/;|]\s*') AS part
      WHERE btrim(regexp_replace(public.quiz_norm_answer(part), '[.?!;:]+$', '')) = v_student_nopunct
        AND btrim(part) <> ''
    );
  END IF;

  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.quiz_expected_answers_list(p_question JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_raw TEXT := btrim(coalesce(p_question ->> 'correct_answer', ''));
  v_parsed JSONB;
  v_parts JSONB;
BEGIN
  IF jsonb_typeof(p_question -> 'answers') = 'array' AND jsonb_array_length(p_question -> 'answers') > 0 THEN
    SELECT coalesce(jsonb_agg(
      CASE
        WHEN jsonb_typeof(elem) = 'array' THEN (
          SELECT string_agg(val, ' / ')
          FROM jsonb_array_elements_text(elem) AS val
        )
        ELSE btrim(elem #>> '{}')
      END
    ), '[]'::jsonb)
    INTO v_parts
    FROM jsonb_array_elements(p_question -> 'answers') AS elem;
    RETURN v_parts;
  END IF;

  IF left(v_raw, 1) = '[' AND right(v_raw, 1) = ']' THEN
    BEGIN
      v_parsed := v_raw::jsonb;
      IF jsonb_typeof(v_parsed) = 'array' AND jsonb_array_length(v_parsed) > 0 THEN
        SELECT coalesce(jsonb_agg(
          CASE
            WHEN jsonb_typeof(elem) = 'array' THEN (
              SELECT string_agg(val, ' / ')
              FROM jsonb_array_elements_text(elem) AS val
            )
            ELSE btrim(elem #>> '{}')
          END
        ), '[]'::jsonb)
        INTO v_parts
        FROM jsonb_array_elements(v_parsed) AS elem;
        RETURN v_parts;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF position('|' IN v_raw) > 0 THEN
    SELECT coalesce(jsonb_agg(to_jsonb(btrim(part))), '[]'::jsonb)
    INTO v_parts
    FROM regexp_split_to_table(v_raw, '\s*\|\s*') AS part
    WHERE btrim(part) <> '';
    IF jsonb_array_length(v_parts) > 1 THEN
      RETURN v_parts;
    END IF;
  END IF;

  IF position(' // ' IN v_raw) > 0 THEN
    SELECT coalesce(jsonb_agg(to_jsonb(btrim(part))), '[]'::jsonb)
    INTO v_parts
    FROM regexp_split_to_table(v_raw, '\s*//\s*') AS part
    WHERE btrim(part) <> '';
    IF jsonb_array_length(v_parts) > 1 THEN
      RETURN v_parts;
    END IF;
  END IF;

  RETURN jsonb_build_array(v_raw);
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
  v_phrases JSONB;
  v_items JSONB;
  v_blank_count INTEGER;
BEGIN
  IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array' THEN
    RETURN '[]'::jsonb;
  END IF;

  FOR v_q IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
    v_type := coalesce(v_q ->> 'type', 'qcm');
    v_clean := (v_q - 'correct_answer' - 'answers' - 'explanation' - 'phrases');

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
BEGIN
  IF v_type = 'qcm' THEN
    IF v_expected ~ '^[0-9]+$' AND jsonb_typeof(p_question -> 'options') = 'array' THEN
      v_expected := coalesce(p_question -> 'options' ->> (v_expected::integer), v_expected);
    END IF;
    v_correct := public.quiz_norm_answer(v_ans) <> '' AND public.quiz_norm_answer(v_ans) = public.quiz_norm_answer(v_expected);
    v_points := CASE WHEN v_correct THEN v_max ELSE 0 END;
    v_expected_display := v_expected;
    v_student_display := v_ans;

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
      v_typed_norm := public.quiz_norm_answer(v_typed_text);

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
            SELECT 1 FROM jsonb_array_elements_text(coalesce(v_phrase -> 'reponses', '[]'::jsonb)) AS r
            WHERE public.quiz_norm_answer(r) = v_typed_norm
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

  ELSE
    -- Type text (trou unique ou trous multiples)
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
      v_points := round((v_correct_blanks * v_points_per_blank)::numeric, 2);
      v_correct := (v_correct_blanks = v_total_blanks);
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

CREATE OR REPLACE FUNCTION public.get_public_quiz_catalog()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'public_id', q.public_id,
      'is_public', q.is_public,
      'attendance_mode', q.attendance_mode,
      'class_id', q.class_id,
      'class_ids', q.class_ids,
      'category', q.category,
      'level', q.level,
      'title', q.title,
      'description', q.description,
      'created_at', q.created_at,
      'duration_minutes', q.duration_minutes,
      'status', q.status,
      'launched_at', q.launched_at,
      'expires_at', q.expires_at,
      'questions', public.quiz_sanitize_questions(q.questions),
      'total_points', q.total_points
    ) ORDER BY q.created_at DESC
  ), '[]'::jsonb)
  FROM public.quizzes q
  WHERE q.is_public = TRUE
    AND q.public_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_public_quiz(p_public_id TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', q.id,
    'public_id', q.public_id,
    'is_public', q.is_public,
    'attendance_mode', q.attendance_mode,
    'class_id', q.class_id,
    'class_ids', q.class_ids,
    'category', q.category,
    'level', q.level,
    'title', q.title,
    'description', q.description,
    'created_at', q.created_at,
    'duration_minutes', q.duration_minutes,
    'status', q.status,
    'launched_at', q.launched_at,
    'expires_at', q.expires_at,
    'questions', public.quiz_sanitize_questions(q.questions),
    'total_points', q.total_points
  )
  FROM public.quizzes q
  WHERE q.is_public = TRUE
    AND (q.public_id::text = btrim(coalesce(p_public_id, '')) OR q.id = btrim(coalesce(p_public_id, '')))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_student_quiz_catalog()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_student_id UUID;
  v_result JSONB;
BEGIN
  IF auth.role() <> 'authenticated' OR v_email = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT s.id INTO v_student_id
  FROM public.students s
  WHERE lower(s.email) = v_email
    AND coalesce(s.validation_status, 'approved') = 'approved'
  ORDER BY s.created_at DESC
  LIMIT 1;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'public_id', q.public_id,
      'is_public', q.is_public,
      'attendance_mode', q.attendance_mode,
      'class_id', q.class_id,
      'class_ids', q.class_ids,
      'category', q.category,
      'level', q.level,
      'title', q.title,
      'description', q.description,
      'created_at', q.created_at,
      'duration_minutes', q.duration_minutes,
      'status', q.status,
      'launched_at', q.launched_at,
      'expires_at', q.expires_at,
      'questions', public.quiz_sanitize_questions(q.questions),
      'total_points', q.total_points
    ) ORDER BY q.created_at DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM public.quizzes q
  WHERE (
    (q.is_public = TRUE AND q.public_id IS NOT NULL)
    OR (
      v_student_id IS NOT NULL
      AND q.status IN ('launched', 'closed')
      AND (
        EXISTS (
          SELECT 1 FROM public.class_enrollments ce
          WHERE ce.student_id = v_student_id
            AND ce.status = 'active'
            AND ce.class_id::text = ANY(coalesce(nullif(q.class_ids, ARRAY[]::text[]), ARRAY[q.class_id]))
        )
        OR EXISTS (
          SELECT 1 FROM public.quiz_submissions sub
          WHERE sub.quiz_id = q.id
            AND sub.student_id = v_student_id::text
        )
      )
    )
  );

  RETURN coalesce(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_public_quiz_question(
  p_public_id TEXT,
  p_question_id TEXT,
  p_answer TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz public.quizzes%ROWTYPE;
  v_question JSONB;
BEGIN
  SELECT * INTO v_quiz
  FROM public.quizzes q
  WHERE q.is_public = TRUE
    AND (q.public_id::text = btrim(coalesce(p_public_id, '')) OR q.id = btrim(coalesce(p_public_id, '')))
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz public introuvable.';
  END IF;

  SELECT elem INTO v_question
  FROM jsonb_array_elements(coalesce(v_quiz.questions, '[]'::jsonb)) AS elem
  WHERE elem ->> 'id' = p_question_id
  LIMIT 1;

  IF v_question IS NULL THEN
    RAISE EXCEPTION 'Question introuvable dans ce quiz.';
  END IF;

  RETURN public.quiz_grade_question(v_question, p_answer);
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_quiz_question(
  p_quiz_id TEXT,
  p_question_id TEXT,
  p_answer TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_quiz public.quizzes%ROWTYPE;
  v_question JSONB;
  v_email TEXT := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_student_id UUID;
BEGIN
  SELECT * INTO v_quiz FROM public.quizzes WHERE id = p_quiz_id LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz introuvable.';
  END IF;

  IF NOT public.quiz_is_teacher() AND NOT v_quiz.is_public THEN
    IF auth.role() <> 'authenticated' OR v_email = '' THEN
      RAISE EXCEPTION 'Session étudiant requise.';
    END IF;
    SELECT s.id INTO v_student_id
    FROM public.students s
    WHERE lower(s.email) = v_email
      AND coalesce(s.validation_status, 'approved') = 'approved'
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_student_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.class_enrollments ce
      WHERE ce.student_id = v_student_id
        AND ce.status = 'active'
        AND ce.class_id::text = ANY(coalesce(nullif(v_quiz.class_ids, ARRAY[]::text[]), ARRAY[v_quiz.class_id]))
    ) THEN
      RAISE EXCEPTION 'Vous n’êtes pas inscrit dans une classe autorisée pour ce quiz.';
    END IF;
  END IF;

  SELECT elem INTO v_question
  FROM jsonb_array_elements(coalesce(v_quiz.questions, '[]'::jsonb)) AS elem
  WHERE elem ->> 'id' = p_question_id
  LIMIT 1;

  IF v_question IS NULL THEN
    RAISE EXCEPTION 'Question introuvable dans ce quiz.';
  END IF;

  RETURN public.quiz_grade_question(v_question, p_answer);
END;
$$;

-- Mettre à jour submit_quiz_submission et submit_quiz_presence_submission pour recalculer
-- les scores et feedback côté serveur à partir de quizzes.questions (sans jamais faire confiance au score navigateur).
CREATE OR REPLACE FUNCTION public.submit_quiz_submission(p_submission JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_quiz_id TEXT := p_submission ->> 'quiz_id';
  v_quiz public.quizzes%ROWTYPE;
  v_student_id TEXT := coalesce(nullif(p_submission ->> 'student_id', ''), public.quiz_current_student_id());
  v_answers JSONB := coalesce(p_submission -> 'answers', '{}'::jsonb);
  v_status TEXT := coalesce(nullif(p_submission ->> 'status', ''), 'completed');
  v_feedback JSONB := '{}'::jsonb;
  v_raw_score NUMERIC := 0;
  v_max_score NUMERIC;
  v_final_score NUMERIC;
  v_score20 NUMERIC;
  v_question JSONB;
  v_eval JSONB;
  v_submission_id TEXT;
BEGIN
  IF v_quiz_id IS NULL OR v_quiz_id = '' THEN
    RAISE EXCEPTION 'Identifiant de quiz manquant.';
  END IF;
  SELECT * INTO v_quiz FROM public.quizzes WHERE id = v_quiz_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz introuvable: %', v_quiz_id;
  END IF;
  IF v_quiz.status <> 'launched' THEN
    RAISE EXCEPTION 'Ce quiz est clôturé ou n''est pas lancé.';
  END IF;

  FOR v_question IN SELECT value FROM jsonb_array_elements(coalesce(v_quiz.questions, '[]'::jsonb)) LOOP
    v_eval := public.quiz_grade_question(v_question, v_answers ->> (v_question ->> 'id'));
    v_raw_score := v_raw_score + coalesce((v_eval ->> 'points')::numeric, 0);
    v_feedback := v_feedback || jsonb_build_object(
      v_question ->> 'id',
      jsonb_build_object(
        'correct', coalesce((v_eval ->> 'correct')::boolean, false),
        'points', coalesce((v_eval ->> 'points')::numeric, 0),
        'expected', coalesce(v_eval ->> 'expected', ''),
        'studentAnswer', coalesce(v_eval ->> 'studentAnswer', '')
      )
    );
  END LOOP;

  v_max_score := coalesce(v_quiz.total_points, 20);
  v_final_score := CASE WHEN v_status = 'timeout' THEN 0 ELSE v_raw_score END;
  v_score20 := CASE
    WHEN v_status = 'timeout' THEN 0
    WHEN v_max_score > 0 THEN round(((v_raw_score / v_max_score) * 20)::numeric, 1)
    ELSE 0
  END;

  INSERT INTO public.quiz_submissions (
    id, quiz_id, quiz_title, student_id, student_name, student_number, class_id, class_name,
    started_at, submitted_at, answers, score, max_score, score_20, status, feedback, date, attempt_number
  ) VALUES (
    coalesce(nullif(p_submission ->> 'id', ''), 'sub_' || gen_random_uuid()::text),
    v_quiz_id,
    v_quiz.title,
    v_student_id,
    coalesce(p_submission ->> 'student_name', ''),
    p_submission ->> 'student_number',
    p_submission ->> 'class_id',
    p_submission ->> 'class_name',
    coalesce(nullif(p_submission ->> 'started_at', '')::timestamptz, now()),
    coalesce(nullif(p_submission ->> 'submitted_at', '')::timestamptz, now()),
    v_answers,
    v_final_score,
    v_max_score,
    v_score20,
    v_status,
    v_feedback,
    coalesce(nullif(p_submission ->> 'date', '')::date, current_date),
    1
  )
  ON CONFLICT (quiz_id, student_id, attempt_number) DO NOTHING
  RETURNING id INTO v_submission_id;

  IF v_submission_id IS NULL THEN
    RAISE EXCEPTION 'Une soumission existe déjà pour cet élève et ce quiz.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_quiz_presence_submission(p_submission JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_student TEXT := public.quiz_current_student_id();
  v_quiz public.quizzes%ROWTYPE;
  v_participant public.quiz_participants%ROWTYPE;
  v_launch public.quiz_launches%ROWTYPE;
  v_attempt_no INTEGER;
  v_status TEXT := coalesce(p_submission ->> 'status', 'completed');
  v_answers JSONB := coalesce(p_submission -> 'answers', '{}'::jsonb);
  v_feedback JSONB := '{}'::jsonb;
  v_raw_score NUMERIC := 0;
  v_score NUMERIC := 0;
  v_max NUMERIC := 20;
  v_score20 NUMERIC := 0;
  v_question JSONB;
  v_eval JSONB;
  v_is_counted BOOLEAN;
  v_existing public.quiz_attempts%ROWTYPE;
  v_attempt public.quiz_attempts%ROWTYPE;
  v_class_name TEXT;
BEGIN
  SELECT * INTO v_quiz
  FROM public.quizzes
  WHERE id = p_submission ->> 'quiz_id'
  FOR UPDATE;
  IF NOT FOUND OR v_quiz.status <> 'launched' THEN
    RAISE EXCEPTION 'Quiz non lancé.';
  END IF;

  SELECT * INTO v_launch
  FROM public.quiz_launches
  WHERE quiz_id = v_quiz.id AND status = 'launched'
  ORDER BY launched_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aucun lancement actif.'; END IF;

  SELECT * INTO v_participant
  FROM public.quiz_participants
  WHERE launch_id = v_launch.id AND student_id = v_student
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participation introuvable pour ce lancement.'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.class_enrollments ce
    WHERE ce.student_id::text = v_student AND ce.status = 'active'
      AND ce.class_id::text = ANY(coalesce(nullif(v_quiz.class_ids, ARRAY[]::text[]), ARRAY[v_quiz.class_id]))
  ) THEN
    RAISE EXCEPTION 'Vous n’êtes plus inscrit dans une classe autorisée pour ce quiz.';
  END IF;
  SELECT c.name INTO v_class_name FROM public.classes c WHERE c.id::text = v_participant.class_id;

  IF v_participant.presence_status IN ('completed', 'timeout') THEN
    SELECT * INTO v_existing
    FROM public.quiz_attempts
    WHERE participant_id = v_participant.id
      AND status IN ('completed', 'timeout')
    ORDER BY attempt_number DESC
    LIMIT 1;
    IF FOUND THEN RETURN to_jsonb(v_existing); END IF;
  END IF;

  IF v_participant.presence_status NOT IN ('present', 'retry_authorized') THEN
    RAISE EXCEPTION 'Présence non confirmée ou participation verrouillée.';
  END IF;
  IF v_participant.presence_confirmed_at IS NULL
     OR v_participant.presence_deadline_at IS NULL
     OR clock_timestamp() < v_participant.presence_deadline_at THEN
    RAISE EXCEPTION 'La fenêtre d’initialisation de la présence n’est pas terminée.';
  END IF;
  IF v_status NOT IN ('completed', 'timeout') THEN
    RAISE EXCEPTION 'Statut de soumission invalide.';
  END IF;
  IF v_participant.presence_status = 'present' AND EXISTS (
    SELECT 1 FROM public.quiz_attempts a
    WHERE a.quiz_id = v_quiz.id AND a.student_id = v_student
  ) THEN
    RAISE EXCEPTION 'Une tentative existe déjà; une autorisation est requise.';
  END IF;

  -- Calcul autoritaire de la note et du feedback côté serveur
  FOR v_question IN SELECT value FROM jsonb_array_elements(coalesce(v_quiz.questions, '[]'::jsonb)) LOOP
    v_eval := public.quiz_grade_question(v_question, v_answers ->> (v_question ->> 'id'));
    v_raw_score := v_raw_score + coalesce((v_eval ->> 'points')::numeric, 0);
    v_feedback := v_feedback || jsonb_build_object(
      v_question ->> 'id',
      jsonb_build_object(
        'correct', coalesce((v_eval ->> 'correct')::boolean, false),
        'points', coalesce((v_eval ->> 'points')::numeric, 0),
        'expected', coalesce(v_eval ->> 'expected', ''),
        'studentAnswer', coalesce(v_eval ->> 'studentAnswer', '')
      )
    );
  END LOOP;

  v_max := coalesce(v_quiz.total_points, 20);
  v_score := CASE WHEN v_status = 'timeout' THEN 0 ELSE v_raw_score END;
  v_score20 := CASE
    WHEN v_status = 'timeout' THEN 0
    WHEN v_max > 0 THEN round(((v_raw_score / v_max) * 20)::numeric, 1)
    ELSE 0
  END;

  SELECT greatest(
    coalesce((SELECT max(a.attempt_number) FROM public.quiz_attempts a
              WHERE a.quiz_id = v_quiz.id AND a.student_id = v_student), 0),
    coalesce((SELECT max(s.attempt_number) FROM public.quiz_submissions s
              WHERE s.quiz_id = v_quiz.id AND s.student_id = v_student), 0)
  ) + 1 INTO v_attempt_no;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.quiz_submissions s
    WHERE s.quiz_id = v_quiz.id AND s.student_id = v_student
      AND s.is_counted = TRUE AND s.score_20 > v_score20
  ) INTO v_is_counted;

  INSERT INTO public.quiz_attempts (
    quiz_id, launch_id, participant_id, student_id, attempt_number, answers, score, max_score,
    score_20, status, feedback, started_at, submitted_at
  ) VALUES (
    v_quiz.id, v_launch.id, v_participant.id, v_student, v_attempt_no,
    v_answers, v_score, v_max, v_score20, v_status,
    v_feedback,
    coalesce(nullif(p_submission ->> 'started_at', '')::timestamptz, v_participant.presence_confirmed_at),
    clock_timestamp()
  ) RETURNING * INTO v_attempt;

  UPDATE public.quiz_participants
  SET presence_status = CASE WHEN v_status = 'timeout' THEN 'timeout' ELSE 'completed' END,
      final_status = v_status,
      final_score = v_score20
  WHERE id = v_participant.id;

  IF v_participant.presence_status = 'retry_authorized' THEN
    UPDATE public.quiz_retry_grants
    SET used_at = coalesce(used_at, clock_timestamp())
    WHERE id = (
      SELECT g.id FROM public.quiz_retry_grants g
      WHERE g.quiz_id = v_quiz.id AND g.student_id = v_student AND g.used_at IS NULL
        AND (g.launch_id IS NULL OR g.launch_id = v_launch.id)
      ORDER BY g.created_at
      LIMIT 1
    );
  END IF;

  IF v_is_counted THEN
    UPDATE public.quiz_submissions
    SET is_counted = FALSE
    WHERE quiz_id = v_quiz.id AND student_id = v_student AND is_counted = TRUE;
  END IF;

  INSERT INTO public.quiz_submissions (
    id, quiz_id, quiz_title, student_id, student_name, student_number, class_id, class_name,
    started_at, submitted_at, answers, score, max_score, score_20, status, feedback, date,
    attempt_number, is_counted
  ) VALUES (
    coalesce(nullif(p_submission ->> 'id', ''), 'sub_' || v_attempt.id::text),
    v_quiz.id, v_quiz.title, v_student,
    coalesce(p_submission ->> 'student_name', ''), p_submission ->> 'student_number',
    coalesce(v_participant.class_id, p_submission ->> 'class_id'), coalesce(v_class_name, p_submission ->> 'class_name'),
    v_attempt.started_at, v_attempt.submitted_at,
    v_answers, v_score, v_max, v_score20, v_status,
    v_feedback, current_date,
    v_attempt_no, v_is_counted
  )
  ON CONFLICT (quiz_id, student_id, attempt_number) DO UPDATE SET
    quiz_title = EXCLUDED.quiz_title,
    student_name = EXCLUDED.student_name,
    student_number = EXCLUDED.student_number,
    class_id = EXCLUDED.class_id,
    class_name = EXCLUDED.class_name,
    started_at = EXCLUDED.started_at,
    submitted_at = EXCLUDED.submitted_at,
    answers = EXCLUDED.answers,
    score = EXCLUDED.score,
    max_score = EXCLUDED.max_score,
    score_20 = EXCLUDED.score_20,
    status = EXCLUDED.status,
    feedback = EXCLUDED.feedback,
    date = EXCLUDED.date,
    is_counted = EXCLUDED.is_counted;

  RETURN to_jsonb(v_attempt);
END;
$function$;

-- RLS stricte sur public.quizzes : seul le professeur lit/modifie la table brute
-- contenant les corrigés; anon et étudiants utilisent les RPC sécurisées.
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Quizzes full access" ON public.quizzes;
DROP POLICY IF EXISTS "quizzes_teacher_manage" ON public.quizzes;
CREATE POLICY "quizzes_teacher_manage" ON public.quizzes
  FOR ALL TO authenticated
  USING (public.quiz_is_teacher())
  WITH CHECK (public.quiz_is_teacher());

REVOKE ALL ON FUNCTION public.quiz_is_teacher() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_quiz_catalog() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_quiz(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_quiz_catalog() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.evaluate_public_quiz_question(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.evaluate_quiz_question(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_quiz_submission(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_quiz_presence_submission(JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.quiz_is_teacher() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_quiz_catalog() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_quiz(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_public_quiz_question(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_quiz_catalog() TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_quiz_question(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_submission(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_presence_submission(JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
