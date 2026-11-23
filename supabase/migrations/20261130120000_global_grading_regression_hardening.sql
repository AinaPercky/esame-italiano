CREATE OR REPLACE FUNCTION public.quiz_prompt_blank_count(p_prompt text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $function$
  SELECT coalesce((SELECT count(*)::integer FROM regexp_matches(
    btrim(coalesce(p_prompt,'')), '(_{2,}|\[\s*\]|\[[0-9]+\]|\.{3,})', 'g'
  )),0);
$function$;

CREATE OR REPLACE FUNCTION public.quiz_expected_answers_list(p_question jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $function$
DECLARE
  v_items jsonb;
  v_raw text := btrim(coalesce(p_question ->> 'correct_answer',''));
  v_prompt_blanks integer := public.quiz_prompt_blank_count(coalesce(p_question ->> 'question',p_question ->> 'prompt',''));
  v_blank_count integer := greatest(1,coalesce(nullif((p_question ->> 'blank_count')::integer,0),nullif(v_prompt_blanks,0),1));
  v_distinct_count integer := 0;
  v_has_nested boolean := false;
  v_result jsonb;
BEGIN
  IF jsonb_typeof(p_question->'answers')='array' AND jsonb_array_length(p_question->'answers')>0 THEN
    v_items:=p_question->'answers';
  ELSIF jsonb_typeof(p_question->'acceptedAnswers')='array' AND jsonb_array_length(p_question->'acceptedAnswers')>0 THEN
    SELECT jsonb_build_array(to_jsonb(string_agg(btrim(value),' / ' ORDER BY ord))) INTO v_result
    FROM jsonb_array_elements_text(p_question->'acceptedAnswers') WITH ORDINALITY a(value,ord) WHERE btrim(value)<>'';
    RETURN coalesce(v_result,jsonb_build_array(v_raw));
  ELSIF jsonb_typeof(p_question->'accepted_answers')='array' AND jsonb_array_length(p_question->'accepted_answers')>0 THEN
    SELECT jsonb_build_array(to_jsonb(string_agg(btrim(value),' / ' ORDER BY ord))) INTO v_result
    FROM jsonb_array_elements_text(p_question->'accepted_answers') WITH ORDINALITY a(value,ord) WHERE btrim(value)<>'';
    RETURN coalesce(v_result,jsonb_build_array(v_raw));
  ELSIF left(v_raw,1)='[' AND right(v_raw,1)=']' THEN
    BEGIN v_items:=v_raw::jsonb; IF jsonb_typeof(v_items)<>'array' THEN v_items:=NULL; END IF;
    EXCEPTION WHEN OTHERS THEN v_items:=NULL; END;
  ELSIF v_blank_count>1 AND position('|' IN v_raw)>0 THEN
    SELECT coalesce(jsonb_agg(to_jsonb(btrim(part)) ORDER BY ord),'[]'::jsonb) INTO v_items
    FROM regexp_split_to_table(v_raw,'\s*\|\s*') WITH ORDINALITY p(part,ord) WHERE btrim(part)<>'';
  END IF;

  IF v_items IS NULL OR jsonb_typeof(v_items)<>'array' OR jsonb_array_length(v_items)=0 THEN
    RETURN jsonb_build_array(v_raw);
  END IF;

  SELECT coalesce(bool_or(jsonb_typeof(elem)='array'),false),count(DISTINCT btrim(elem#>>'{}'))
  INTO v_has_nested,v_distinct_count FROM jsonb_array_elements(v_items) e(elem);

  IF v_has_nested THEN
    SELECT coalesce(jsonb_agg(
      CASE WHEN jsonb_typeof(elem)='array' THEN
        to_jsonb((SELECT string_agg(btrim(value),' / ' ORDER BY ord)
          FROM jsonb_array_elements_text(elem) WITH ORDINALITY a(value,ord) WHERE btrim(value)<>''))
      ELSE to_jsonb(btrim(elem#>>'{}')) END ORDER BY ord
    ),'[]'::jsonb) INTO v_result
    FROM jsonb_array_elements(v_items) WITH ORDINALITY e(elem,ord);
    RETURN v_result;
  END IF;

  IF v_distinct_count=1 THEN RETURN jsonb_build_array(to_jsonb(btrim(v_items->>0))); END IF;
  IF v_blank_count>1 THEN RETURN v_items; END IF;

  SELECT jsonb_build_array(to_jsonb(string_agg(btrim(elem#>>'{}'),' / ' ORDER BY ord)))
  INTO v_result FROM jsonb_array_elements(v_items) WITH ORDINALITY a(elem,ord);
  RETURN coalesce(v_result,jsonb_build_array(v_raw));
END;
$function$;


CREATE OR REPLACE FUNCTION public.quiz_grade_question(q jsonb, answer text)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_type TEXT := coalesce(q ->> 'type', 'qcm');
  v_max NUMERIC := greatest(0, coalesce((q ->> 'points')::numeric, 1));
  v_ans TEXT := btrim(coalesce(answer, ''));
  v_expected TEXT := btrim(coalesce(q ->> 'correct_answer', ''));
  v_explanation TEXT := nullif(btrim(coalesce(q ->> 'explanation', '')), '');
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
    v_correct := public.quiz_qcm_answer_matches(
      coalesce(q -> 'options', '[]'::jsonb),
      v_expected,
      v_ans
    );
    v_points := CASE WHEN v_correct THEN v_max ELSE 0 END;
    v_expected_display := v_expected;
    v_student_display := v_ans;

  ELSIF v_type = 'reorder' THEN
    IF jsonb_typeof(q -> 'items') = 'array' THEN
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
        FROM jsonb_array_elements(q -> 'items') WITH ORDINALITY AS t(item, ord);
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
      JOIN jsonb_array_elements(q -> 'items') AS item ON item ->> 'id' = eid.val;

      SELECT coalesce(string_agg(item ->> 'text', ' → ' ORDER BY sid.ord), '')
      INTO v_student_display
      FROM jsonb_array_elements_text(v_student_ids) WITH ORDINALITY AS sid(val, ord)
      JOIN jsonb_array_elements(q -> 'items') AS item ON item ->> 'id' = sid.val;
    END IF;

  ELSIF v_type = 'verbes_trous' AND jsonb_typeof(q -> 'verbes_trous') = 'object' THEN
    v_vt := q -> 'verbes_trous';
    v_phrases := coalesce(v_vt -> 'phrases', '[]'::jsonb);
    v_ppp := coalesce((v_vt ->> 'points_par_phrase')::numeric, (q ->> 'points_par_phrase')::numeric, 3);
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

  ELSIF v_type = 'mots_trous' AND jsonb_typeof(q -> 'mots_trous') = 'object' THEN
    v_vt := q -> 'mots_trous';
    v_phrases := coalesce(v_vt -> 'phrases', '[]'::jsonb);
    v_ppp := greatest(1, coalesce((v_vt ->> 'points_par_phrase')::numeric, (q ->> 'points_par_phrase')::numeric, 1));
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
    -- Type text (trou unique ou trous multiples)
    v_expected_list := public.quiz_expected_answers_list(q);
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

-- ============================================================================
-- 2. EXERCICES : sauvegarde, publication, nettoyage, correction et historique
-- ============================================================================

create or replace function public.save_exercise_definition(
  p_exercise_id uuid,
  p_metadata jsonb,
  p_content jsonb,
  p_class_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid := p_exercise_id;
  v_version_id uuid;
  v_version_number integer;
  v_question_count integer;
begin
  if not public.exercise_is_teacher() then raise exception 'Accès professeur requis.'; end if;
  if nullif(trim(p_metadata ->> 'title'),'') is null then raise exception 'Le titre est obligatoire.'; end if;
  if coalesce(jsonb_typeof(p_content -> 'questions'),'') <> 'array' then raise exception 'Le contenu doit contenir un tableau questions.'; end if;
  v_question_count := jsonb_array_length(p_content -> 'questions');
  if (select count(distinct q.value ->> 'id') from jsonb_array_elements(p_content -> 'questions') q(value)) <> v_question_count then
    raise exception 'Chaque question doit avoir un identifiant unique.';
  end if;
  if coalesce(nullif(p_metadata ->> 'status',''),'draft') not in ('draft','published','archived') then
    raise exception 'Statut d’exercice invalide.';
  end if;
  if p_metadata ->> 'status' = 'published' and coalesce(array_length(p_class_ids,1),0) = 0 then
    raise exception 'Attribuez au moins une classe avant de publier.';
  end if;
  if v_question_count < 1 then raise exception 'Ajoutez au moins une question.'; end if;
  if exists (
    select 1
    from jsonb_array_elements(p_content -> 'questions') q(value)
    where nullif(trim(q.value ->> 'id'),'') is null
       or coalesce((q.value ->> 'time_limit_seconds')::integer,0) <= 0
       or coalesce((q.value ->> 'points')::numeric,0) <= 0
       or coalesce(q.value ->> 'type','') not in ('qcm','text','reorder','verbes_trous','mots_trous')
  ) then
    raise exception 'Chaque question doit avoir un identifiant, un type compatible et un temps strictement positif.';
  end if;
  if coalesce(array_length(p_class_ids,1),0) > 0 and exists (
    select 1 from unnest(p_class_ids) c(id)
    where not exists (select 1 from public.classes cl where cl.id=c.id)
  ) then raise exception 'Une classe sélectionnée est introuvable.'; end if;

  if v_id is null then
    insert into public.exercises(title,description,category,level,status,created_by)
    values (
      trim(p_metadata ->> 'title'),
      nullif(trim(p_metadata ->> 'description'),''),
      coalesce(nullif(trim(p_metadata ->> 'category'),''),'Autre'),
      nullif(trim(p_metadata ->> 'level'),''),
      'draft',
      auth.uid()
    ) returning id into v_id;
    v_version_number := 1;
  else
    update public.exercises
    set title=trim(p_metadata ->> 'title'),
        description=nullif(trim(p_metadata ->> 'description'),''),
        category=coalesce(nullif(trim(p_metadata ->> 'category'),''),'Autre'),
        level=nullif(trim(p_metadata ->> 'level'),''),
        updated_at=now()
    where id=v_id and created_by=auth.uid();
    if not found then raise exception 'Exercice introuvable ou non modifiable.'; end if;
    select coalesce(max(version_number),0)+1 into v_version_number
    from public.exercise_versions where exercise_id=v_id;
  end if;

  insert into public.exercise_versions(exercise_id,version_number,content,created_by)
  values (v_id,v_version_number,p_content,auth.uid())
  returning id into v_version_id;

  update public.exercises
  set current_version_id=v_version_id,
      status=case when coalesce(array_length(p_class_ids,1),0)>0 then coalesce(nullif(p_metadata ->> 'status',''),'draft') else 'draft' end,
      published_at=case when coalesce(array_length(p_class_ids,1),0)>0 and p_metadata ->> 'status'='published' then coalesce(published_at,now()) else published_at end,
      updated_at=now()
  where id=v_id;

  delete from public.exercise_class_assignments where exercise_id=v_id;
  insert into public.exercise_class_assignments(exercise_id,class_id)
  select v_id, c.id from unnest(coalesce(p_class_ids,'{}'::uuid[])) c(id)
  on conflict do nothing;

  return v_id;
end;
$$;

create or replace function public.publish_exercise(p_exercise_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_exercise public.exercises%rowtype;
  v_content jsonb;
  v_question_count integer;
begin
  if not public.exercise_is_teacher() then
    raise exception 'Accès professeur requis.';
  end if;

  select * into v_exercise
  from public.exercises
  where id = p_exercise_id and created_by = auth.uid()
  for update;

  if not found then
    raise exception 'Exercice introuvable ou non modifiable.';
  end if;

  if v_exercise.current_version_id is null then
    raise exception 'Enregistrez le contenu de l’exercice avant de le publier.';
  end if;

  if not exists (
    select 1 from public.exercise_class_assignments
    where exercise_id = p_exercise_id
  ) then
    raise exception 'Attribuez au moins une classe avant de publier.';
  end if;

  select content into v_content
  from public.exercise_versions
  where id = v_exercise.current_version_id
    and exercise_id = p_exercise_id;

  if not found then
    raise exception 'Version de l’exercice introuvable.';
  end if;

  if coalesce(jsonb_typeof(v_content -> 'questions'), '') <> 'array' then
    raise exception 'Le contenu de l’exercice est invalide.';
  end if;

  v_question_count := jsonb_array_length(v_content -> 'questions');
  if v_question_count < 1 then
    raise exception 'Ajoutez au moins une question avant de publier.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_content -> 'questions') q(value)
    where nullif(trim(q.value ->> 'id'), '') is null
       or coalesce(q.value ->> 'type', '') not in ('qcm','text','reorder','verbes_trous','mots_trous')
       or coalesce((q.value ->> 'time_limit_seconds')::integer, 0) <= 0
       or coalesce((q.value ->> 'points')::numeric, 0) <= 0
  ) then
    raise exception 'Chaque question doit avoir un type, des points et un temps strictement positifs.';
  end if;

  update public.exercises
  set status = 'published',
      published_at = coalesce(published_at, now()),
      updated_at = now()
  where id = p_exercise_id;

  return p_exercise_id;
end;
$$;
-- Accept listed conjugation variants in quiz verb gaps.
DO $migration$
DECLARE d text; u text;
BEGIN
 d:=pg_get_functiondef('public.quiz_grade_question(jsonb,text)'::regprocedure);
 u:=replace(d,$old$WHERE public.quiz_norm_answer(r) = v_typed_norm$old$,$new$WHERE public.quiz_text_matches(v_typed_norm,r)$new$);
 IF u=d THEN RAISE EXCEPTION 'Quiz verbes_trous variant matcher anchor missing'; END IF;
 EXECUTE u;
END;
$migration$;

-- Written exams: mots_trous is already rendered by the student UI; enable it in storage.
ALTER TABLE public.written_exam_questions
 DROP CONSTRAINT IF EXISTS written_exam_questions_question_type_check;
ALTER TABLE public.written_exam_questions
 ADD CONSTRAINT written_exam_questions_question_type_check
 CHECK (question_type IN ('qcm','text','reorder','verbes_trous','mots_trous'));

DO $migration$
DECLARE d text; u text;
BEGIN
 d:=pg_get_functiondef('public.save_written_exam_definition(uuid,jsonb)'::regprocedure);
 u:=replace(d,
 $old$       ) else null end,
       'options',case when v_question->>'type'='qcm' then ($old$,
 $new$       ) else null end,
       'mots_trous',case when v_question->>'type'='mots_trous' then jsonb_build_object(
         'titre',coalesce(v_question->'mots_trous'->>'titre',''),
         'consigne',coalesce(v_question->'mots_trous'->>'consigne',''),
         'points_par_phrase',coalesce((v_question->'mots_trous'->>'points_par_phrase')::integer,1),
         'banque',case when jsonb_typeof(v_question->'mots_trous'->'banque')='array' then v_question->'mots_trous'->'banque' else '[]'::jsonb end,
         'phrases',(select coalesce(jsonb_agg(jsonb_build_object(
           'id',p.value->'id','debut',coalesce(p.value->>'debut',''),'fin',coalesce(p.value->>'fin','')
         ) order by p.ordinality),'[]'::jsonb)
         from jsonb_array_elements(case when jsonb_typeof(v_question->'mots_trous'->'phrases')='array' then v_question->'mots_trous'->'phrases' else '[]'::jsonb end) with ordinality p(value,ordinality))
       ) else null end,
       'options',case when v_question->>'type'='qcm' then ($new$);
 IF u=d THEN RAISE EXCEPTION 'save_written_exam_definition mots_trous payload anchor missing'; END IF;
 EXECUTE u;
END;
$migration$;

-- Written-exam text uses the same Unicode, punctuation, and Italian-number matcher.
DO $migration$
DECLARE d text; u text;
BEGIN
 d:=pg_get_functiondef('public.written_exam_auto_question_score(uuid,jsonb)'::regprocedure);
 u:=replace(d,
 $old$            where lower(regexp_replace(btrim(e),'\s+',' ','g'))=
              lower(regexp_replace(btrim(coalesce(v_actual->>v_idx,'')),'\s+',' ','g'))$old$,
 $new$            where public.quiz_text_matches(coalesce(v_actual->>v_idx,''),e)$new$);
 IF u=d THEN RAISE EXCEPTION 'Exam nested text matcher anchor missing'; END IF;
 d:=u;

 u:=replace(d,
 $old$        elsif lower(regexp_replace(btrim(coalesce(v_expected->>v_idx,'')),'\s+',' ','g'))=
          lower(regexp_replace(btrim(coalesce(v_actual->>v_idx,'')),'\s+',' ','g')) then$old$,
 $new$        elsif public.quiz_text_matches(coalesce(v_actual->>v_idx,''),coalesce(v_expected->>v_idx,'')) then$new$);
 IF u=d THEN RAISE EXCEPTION 'Exam simple text matcher anchor missing'; END IF;
 d:=u;

 u:=replace(d,
 $old$      where lower(regexp_replace(btrim(e),'\s+',' ','g'))=
        lower(regexp_replace(btrim(v_answer_text),'\s+',' ','g'))$old$,
 $new$      where public.quiz_text_matches(v_answer_text,e)$new$);
 IF u=d THEN RAISE EXCEPTION 'Exam acceptedAnswers matcher anchor missing'; END IF;
 d:=u;

 u:=replace(d,
 $old$  end if;
  return 0;
end
$function$$old$,
 $new$  elsif v_q.question_type='mots_trous' then
    if jsonb_typeof(p_answer)='string' and left(coalesce(p_answer#>>'{}',''),1)='{' then
      begin v_actual:=(p_answer#>>'{}')::jsonb;
      exception when others then v_actual:='{}'::jsonb; end;
    else v_actual:=coalesce(p_answer,'{}'::jsonb); end if;
    if jsonb_typeof(v_actual)<>'object' then v_actual:='{}'::jsonb; end if;
    for v_phrase in select value from jsonb_array_elements(coalesce(v_key->'phrases','[]'::jsonb))
    loop
      v_phrase_answer:=v_actual->(v_phrase->>'id');
      if jsonb_typeof(v_phrase_answer)='object' then
        v_chosen:=coalesce(v_phrase_answer->>'mot_choisi',v_phrase_answer->>'mot',v_phrase_answer->>'word','');
      else v_chosen:=coalesce(v_actual->>(v_phrase->>'id'),''); end if;
      v_chosen:=public.quiz_norm_answer(v_chosen);
      v_expected_verb:=public.quiz_norm_answer(coalesce(v_phrase->>'mot',''));
      if v_chosen<>'' and not (v_chosen=any(v_used))
        and (
          coalesce(jsonb_typeof(v_q.public_data->'mots_trous'->'banque')<>'array',true)
          or coalesce(jsonb_array_length(v_q.public_data->'mots_trous'->'banque'),0)=0
          or exists(select 1 from jsonb_array_elements_text(coalesce(v_q.public_data->'mots_trous'->'banque','[]'::jsonb)) b(value)
                    where public.quiz_norm_answer(b.value)=v_chosen)
        ) then
        v_used:=array_append(v_used,v_chosen);
        if v_expected_verb<>'' and v_chosen=v_expected_verb then
          v_points:=v_points+greatest(1,coalesce((v_q.public_data->'mots_trous'->>'points_par_phrase')::numeric,1));
        end if;
      end if;
    end loop;
    return least(v_q.points,v_points);
  end if;
  return 0;
end
$function$$new$);
 IF u=d THEN RAISE EXCEPTION 'Exam mots_trous grader anchor missing'; END IF;
 EXECUTE u;
END;
$migration$;

NOTIFY pgrst,'reload schema';
