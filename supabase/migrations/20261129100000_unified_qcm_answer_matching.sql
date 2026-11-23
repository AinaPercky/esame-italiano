-- PerckyLingua: canonical QCM answer matching across quiz, exercise and written-exam grading.
-- Additive/idempotent migration. It does not rewrite historical attempts or answer keys.

CREATE OR REPLACE FUNCTION public.quiz_qcm_resolve_option(p_options jsonb, p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_option jsonb;
  v_index integer := 0;
  v_value text := public.quiz_norm_answer(p_value);
  v_id text;
  v_label text;
  v_option_value text;
BEGIN
  IF v_value = '' THEN RETURN NULL; END IF;
  -- quiz_grade_question may already have expanded a numeric correct_answer into a JSON option object.
  IF left(v_value, 1) = '{' THEN
    BEGIN
      v_option := v_value::jsonb;
      v_value := public.quiz_norm_answer(coalesce(v_option ->> 'id', v_option ->> 'value', v_option ->> 'label', v_option ->> 'text', v_value));
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  IF jsonb_typeof(p_options) <> 'array' THEN RETURN 'raw:' || v_value; END IF;

  FOR v_option IN SELECT value FROM jsonb_array_elements(p_options)
  LOOP
    IF jsonb_typeof(v_option) = 'object' THEN
      v_id := public.quiz_norm_answer(coalesce(v_option ->> 'id', v_option ->> 'value', ''));
      v_label := public.quiz_norm_answer(coalesce(v_option ->> 'label', v_option ->> 'text', ''));
      v_option_value := public.quiz_norm_answer(coalesce(v_option ->> 'value', ''));
    ELSE
      v_id := public.quiz_norm_answer(coalesce(v_option #>> '{}', ''));
      v_label := v_id;
      v_option_value := v_id;
    END IF;

    IF v_value = v_id OR v_value = v_label OR v_value = v_option_value
       OR v_value = v_index::text THEN
      RETURN 'option:' || v_index::text;
    END IF;
    v_index := v_index + 1;
  END LOOP;

  RETURN 'raw:' || v_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.quiz_qcm_answer_matches(
  p_options jsonb,
  p_expected text,
  p_student text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.quiz_norm_answer(coalesce(p_student, '')) <> ''
     AND public.quiz_qcm_resolve_option(coalesce(p_options, '[]'::jsonb), p_expected)
         = public.quiz_qcm_resolve_option(coalesce(p_options, '[]'::jsonb), p_student);
$$;

-- Patch the existing canonical quiz scorer without replacing its other question types.
DO $migration$
DECLARE
  v_definition text;
  v_updated text;
  v_old text;
  v_new text;
BEGIN
  v_definition := pg_get_functiondef('public.quiz_grade_question(jsonb,text)'::regprocedure);
  v_old := 'v_correct := public.quiz_norm_answer(v_ans) <> '''' AND public.quiz_norm_answer(v_ans) = public.quiz_norm_answer(v_expected);';
  v_new := 'v_correct := public.quiz_qcm_answer_matches(coalesce(p_question -> ''options'', ''[]''::jsonb), v_expected, v_ans);';
  v_updated := replace(v_definition, v_old, v_new);
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Patch quiz_grade_question introuvable : arrêt sans modification.';
  END IF;
  EXECUTE v_updated;

  v_definition := pg_get_functiondef('public.exercise_grade_question(jsonb,jsonb)'::regprocedure);
  v_old := 'if v_student_text = v_expected_text then v_correct := 1;';
  v_new := 'if public.quiz_qcm_answer_matches(coalesce(p_question -> ''options'', ''[]''::jsonb), v_expected_text, v_student_text) then v_correct := 1;';
  v_updated := replace(v_definition, v_old, v_new);
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Patch exercise_grade_question introuvable : arrêt sans modification.';
  END IF;
  EXECUTE v_updated;

  v_definition := pg_get_functiondef('public.written_exam_auto_question_score(uuid,jsonb)'::regprocedure);
  v_old := $old$if v_q.question_type='qcm' then
    return case when coalesce(p_answer#>>'{}','')=coalesce(v_key->>'correctOptionId','')
      then v_q.points else 0 end;$old$;
  v_new := $new$if v_q.question_type='qcm' then
    return case when public.quiz_qcm_answer_matches(
      coalesce(v_q.public_data->'options','[]'::jsonb),
      coalesce(v_key->>'correctOptionId',''),
      coalesce(p_answer#>>'{}','')
    ) then v_q.points else 0 end;$new$;
  v_updated := replace(v_definition, v_old, v_new);
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Patch written_exam_auto_question_score introuvable : arrêt sans modification.';
  END IF;
  EXECUTE v_updated;
END;
$migration$;

GRANT EXECUTE ON FUNCTION public.quiz_qcm_resolve_option(jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quiz_qcm_answer_matches(jsonb,text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
