-- Support complet du type de question « mots_trous » (Mots à trous avec banque)
-- pour les Quiz, Exercices et Examens écrits.
-- Migration strictement additive : ne modifie aucune tentative, version ou règle existante.

-- ============================================================================
-- 1. QUIZ : nettoyage des données envoyées aux élèves & correction serveur
-- ============================================================================

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
    v_clean := (v_q - 'correct_answer' - 'answers' - 'explanation' - 'phrases' - 'error_category_map');

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
  v_safe JSONB := coalesce(p_question, '{}'::jsonb) - 'correct_answer' - 'answers' - 'explanation' - 'phrases' - 'error_category_map';
  v_vt JSONB;
  v_mt JSONB;
  v_phrases JSONB;
BEGIN
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

create or replace function public.exercise_question_for_student(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $exercise$
declare
  v_attempt public.exercise_attempts%rowtype;
  v_content jsonb;
  v_question jsonb;
  v_question_id text;
  v_safe jsonb;
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

  v_safe := v_question - 'correct_answer' - 'answers' - 'explanation' - 'phrases' - 'error_category_map';
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
      v_expected := p_question -> 'answers';
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
      v_student_text := lower(regexp_replace(trim(coalesce(v_student ->> (v_correct - 1),'')), '\s+', ' ', 'g'));
      v_expected_text := lower(regexp_replace(trim(coalesce(v_item #>> '{}','')), '\s+', ' ', 'g'));
      if v_student_text = v_expected_text or exists (
        select 1 from regexp_split_to_table(coalesce(v_item #>> '{}',''), '\s*[/;|]\s*') a
        where lower(regexp_replace(trim(a), '\s+', ' ', 'g')) = v_student_text
      ) then v_awarded := v_awarded + (v_points / v_total); end if;
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
          WHERE lower(regexp_replace(trim(r.value), '[[:space:]]+', ' ', 'g')) = v_typed_text
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
          WHERE lower(regexp_replace(trim(r.value), '[[:space:]]+', ' ', 'g')) = v_typed_text
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

create or replace function public.submit_exercise_answer(p_attempt_id uuid, p_answer jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_attempt public.exercise_attempts%rowtype;
  v_content jsonb;
  v_question jsonb;
  v_question_id text;
  v_grade jsonb;
  v_existing public.exercise_answers%rowtype;
  v_timed_out boolean;
  v_points numeric;
begin
  select * into v_attempt from public.exercise_attempts where id = p_attempt_id for update;
  if not found or (v_attempt.student_id <> public.exercise_current_student_id() and not public.exercise_is_teacher()) then
    raise exception 'Tentative introuvable ou accès interdit.';
  end if;
  if v_attempt.status <> 'in_progress' then raise exception 'Cette tentative est déjà terminée.'; end if;

  v_question_id := v_attempt.question_order ->> v_attempt.current_question_index;
  select content into v_content from public.exercise_versions where id = v_attempt.version_id;
  select q.value into v_question from jsonb_array_elements(v_content -> 'questions') q(value) where q.value ->> 'id' = v_question_id;
  select * into v_existing from public.exercise_answers where attempt_id = p_attempt_id and question_id = v_question_id;
  if found then
    return jsonb_build_object(
      'correct', v_existing.is_correct,
      'points', v_existing.points_awarded,
      'max_points', v_existing.max_points,
      'expected', coalesce(v_question -> 'answers', v_question -> 'correct_answer', v_question #> '{verbes_trous,phrases}', v_question #> '{mots_trous,phrases}'),
      'explanation', v_question -> 'explanation',
      'timed_out', v_existing.timed_out,
      'question_id', v_question_id,
      'student_answer', v_existing.answer
    );
  end if;
  v_timed_out := now() > v_attempt.current_question_deadline_at;
  v_grade := case when v_timed_out
    then jsonb_build_object('correct',false,'points',0,'max_points',coalesce((v_question ->> 'points')::numeric,0),'expected',coalesce(v_question -> 'answers',v_question -> 'correct_answer',v_question #> '{verbes_trous,phrases}',v_question #> '{mots_trous,phrases}'),'explanation',v_question -> 'explanation')
    else public.exercise_grade_question(v_question, coalesce(p_answer,'null'::jsonb))
  end;
  v_points := coalesce((v_grade ->> 'points')::numeric,0);

  insert into public.exercise_answers(attempt_id, question_id, answer, is_correct, points_awarded, max_points, timed_out)
  values (p_attempt_id, v_question_id, p_answer, coalesce((v_grade ->> 'correct')::boolean,false), v_points,
    coalesce((v_grade ->> 'max_points')::numeric,0), v_timed_out);

  update public.exercise_attempts
  set answers = answers || jsonb_build_object(v_question_id, p_answer),
      score = score + v_points,
      updated_at = now()
  where id = p_attempt_id;

  return v_grade || jsonb_build_object('timed_out',v_timed_out,'question_id',v_question_id,'student_answer',p_answer);
end;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_exercise_attempt_question(
  p_attempt_id UUID,
  p_question_id TEXT,
  p_answer JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_attempt public.exercise_attempts%ROWTYPE;
  v_content JSONB;
  v_question JSONB;
  v_grade JSONB;
  v_deadline TIMESTAMPTZ;
  v_elapsed_seconds INTEGER := 0;
  v_duration INTEGER;
  v_id TEXT;
  v_has_answer BOOLEAN;
  v_timed_out BOOLEAN;
BEGIN
  SELECT * INTO v_attempt
  FROM public.exercise_attempts
  WHERE id = p_attempt_id
    AND student_id = public.exercise_current_student_id()
  FOR UPDATE;

  IF NOT FOUND OR v_attempt.status <> 'in_progress' OR NOT v_attempt.batch_mode THEN
    RAISE EXCEPTION 'Tentative introuvable, terminée ou non compatible.';
  END IF;

  IF NOT (v_attempt.question_order ? p_question_id) THEN
    RAISE EXCEPTION 'Question inconnue pour cette tentative.';
  END IF;

  SELECT content INTO v_content
  FROM public.exercise_versions
  WHERE id = v_attempt.version_id;

  SELECT q.value INTO v_question
  FROM jsonb_array_elements(v_content -> 'questions') q(value)
  WHERE q.value ->> 'id' = p_question_id;

  IF v_question IS NULL THEN
    RAISE EXCEPTION 'Question introuvable dans la version de l’exercice.';
  END IF;

  FOREACH v_id IN ARRAY ARRAY(
    SELECT jsonb_array_elements_text(v_attempt.question_order)
  )
  LOOP
    SELECT greatest(1, coalesce((q.value ->> 'time_limit_seconds')::integer, 1))
    INTO v_duration
    FROM jsonb_array_elements(v_content -> 'questions') q(value)
    WHERE q.value ->> 'id' = v_id;
    v_elapsed_seconds := v_elapsed_seconds + coalesce(v_duration, 1);
    IF v_id = p_question_id THEN
      EXIT;
    END IF;
  END LOOP;

  v_deadline := v_attempt.started_at + make_interval(secs => v_elapsed_seconds);
  v_has_answer := p_answer IS NOT NULL
    AND p_answer <> 'null'::jsonb
    AND (jsonb_typeof(p_answer) <> 'string' OR btrim(p_answer #>> '{}') <> '');
  v_timed_out := NOT v_has_answer AND clock_timestamp() >= v_deadline;

  IF v_timed_out THEN
    v_grade := jsonb_build_object(
      'correct', FALSE,
      'points', 0,
      'max_points', coalesce((v_question ->> 'points')::numeric, 0),
      'expected', coalesce(v_question -> 'answers', v_question -> 'correct_answer', v_question #> '{verbes_trous,phrases}', v_question #> '{mots_trous,phrases}'),
      'explanation', v_question -> 'explanation'
    );
  ELSE
    v_grade := public.exercise_grade_question(v_question, coalesce(p_answer, 'null'::jsonb));
  END IF;

  RETURN v_grade || jsonb_build_object(
    'timed_out', v_timed_out,
    'question_id', p_question_id,
    'student_answer', p_answer
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_exercise_attempt_batch(
  p_attempt_id UUID,
  p_answers JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_attempt public.exercise_attempts%ROWTYPE;
  v_content JSONB;
  v_question JSONB;
  v_question_id TEXT;
  v_answer JSONB;
  v_grade JSONB;
  v_feedback JSONB := '{}'::jsonb;
  v_answers JSONB := coalesce(p_answers, '{}'::jsonb);
  v_elapsed_seconds INTEGER := 0;
  v_duration INTEGER;
  v_deadline TIMESTAMPTZ;
  v_timed_out BOOLEAN;
  v_has_answer BOOLEAN;
  v_score NUMERIC := 0;
  v_max_points NUMERIC;
  v_completed_at TIMESTAMPTZ;
BEGIN
  IF jsonb_typeof(v_answers) <> 'object' THEN
    RAISE EXCEPTION 'Format des réponses invalide.';
  END IF;

  SELECT * INTO v_attempt
  FROM public.exercise_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND OR v_attempt.student_id <> public.exercise_current_student_id() THEN
    RAISE EXCEPTION 'Tentative introuvable ou accès interdit.';
  END IF;

  IF NOT v_attempt.batch_mode THEN
    RAISE EXCEPTION 'Cette tentative utilise encore le parcours de validation historique.';
  END IF;

  SELECT content INTO v_content
  FROM public.exercise_versions
  WHERE id = v_attempt.version_id;

  IF v_attempt.status = 'completed' THEN
    FOR v_question_id IN
      SELECT value FROM jsonb_array_elements_text(v_attempt.question_order)
    LOOP
      SELECT q.value INTO v_question
      FROM jsonb_array_elements(v_content -> 'questions') q(value)
      WHERE q.value ->> 'id' = v_question_id;

      SELECT answer, timed_out INTO v_answer, v_timed_out
      FROM public.exercise_answers
      WHERE attempt_id = v_attempt.id AND question_id = v_question_id;

      IF coalesce(v_timed_out, FALSE) THEN
        v_grade := jsonb_build_object(
          'correct', FALSE,
          'points', 0,
          'max_points', coalesce((v_question ->> 'points')::numeric, 0),
          'expected', coalesce(v_question -> 'answers', v_question -> 'correct_answer', v_question #> '{verbes_trous,phrases}', v_question #> '{mots_trous,phrases}'),
          'explanation', v_question -> 'explanation'
        );
      ELSE
        v_grade := public.exercise_grade_question(v_question, coalesce(v_answer, 'null'::jsonb));
      END IF;

      v_grade := v_grade || jsonb_build_object(
        'timed_out', coalesce(v_timed_out, FALSE),
        'question_id', v_question_id,
        'student_answer', v_answer
      );
      v_feedback := v_feedback || jsonb_build_object(v_question_id, v_grade);
    END LOOP;

    RETURN jsonb_build_object(
      'completed', TRUE,
      'attempt_id', v_attempt.id,
      'score', v_attempt.score,
      'max_score', v_attempt.max_score,
      'completed_at', v_attempt.completed_at,
      'feedback', v_feedback
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(v_answers) AS supplied(question_id)
    WHERE NOT (v_attempt.question_order ? supplied.question_id)
  ) THEN
    RAISE EXCEPTION 'Une réponse est associée à une question inconnue.';
  END IF;

  v_max_points := v_attempt.max_score;

  FOR v_question_id IN
    SELECT value FROM jsonb_array_elements_text(v_attempt.question_order)
  LOOP
    SELECT q.value INTO v_question
    FROM jsonb_array_elements(v_content -> 'questions') q(value)
    WHERE q.value ->> 'id' = v_question_id;

    IF v_question IS NULL THEN
      RAISE EXCEPTION 'Question introuvable dans la version de l’exercice.';
    END IF;

    v_duration := greatest(1, coalesce((v_question ->> 'time_limit_seconds')::integer, 1));
    v_elapsed_seconds := v_elapsed_seconds + v_duration;
    v_deadline := v_attempt.started_at + make_interval(secs => v_elapsed_seconds);
    v_answer := v_answers -> v_question_id;
    v_has_answer := v_answer IS NOT NULL
      AND v_answer <> 'null'::jsonb
      AND (jsonb_typeof(v_answer) <> 'string' OR btrim(v_answer #>> '{}') <> '');

    v_timed_out := NOT v_has_answer AND clock_timestamp() > v_deadline;

    IF v_timed_out THEN
      v_grade := jsonb_build_object(
        'correct', FALSE,
        'points', 0,
        'max_points', coalesce((v_question ->> 'points')::numeric, 0),
        'expected', coalesce(v_question -> 'answers', v_question -> 'correct_answer', v_question #> '{verbes_trous,phrases}', v_question #> '{mots_trous,phrases}'),
        'explanation', v_question -> 'explanation'
      );
    ELSE
      v_grade := public.exercise_grade_question(v_question, coalesce(v_answer, 'null'::jsonb));
    END IF;

    v_grade := v_grade || jsonb_build_object(
      'timed_out', v_timed_out,
      'question_id', v_question_id,
      'student_answer', v_answer
    );

    INSERT INTO public.exercise_answers(
      attempt_id, question_id, answer, is_correct, points_awarded, max_points, timed_out
    ) VALUES (
      v_attempt.id,
      v_question_id,
      v_answer,
      coalesce((v_grade ->> 'correct')::boolean, FALSE),
      coalesce((v_grade ->> 'points')::numeric, 0),
      coalesce((v_grade ->> 'max_points')::numeric, 0),
      v_timed_out
    )
    ON CONFLICT (attempt_id, question_id) DO UPDATE SET
      answer = EXCLUDED.answer,
      is_correct = EXCLUDED.is_correct,
      points_awarded = EXCLUDED.points_awarded,
      max_points = EXCLUDED.max_points,
      timed_out = EXCLUDED.timed_out,
      answered_at = clock_timestamp();

    v_score := v_score + coalesce((v_grade ->> 'points')::numeric, 0);
    v_feedback := v_feedback || jsonb_build_object(v_question_id, v_grade);
  END LOOP;

  UPDATE public.exercise_attempts
  SET answers = v_answers,
      score = round(v_score, 2),
      status = 'completed',
      completed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE id = v_attempt.id
  RETURNING completed_at INTO v_completed_at;

  RETURN jsonb_build_object(
    'completed', TRUE,
    'attempt_id', v_attempt.id,
    'score', round(v_score, 2),
    'max_score', v_max_points,
    'completed_at', v_completed_at,
    'feedback', v_feedback
  );
END;
$$;

create or replace function public.get_student_exercise_attempt_details(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_attempt public.exercise_attempts%rowtype;
  v_content jsonb;
  v_questions jsonb;
begin
  select *
    into v_attempt
    from public.exercise_attempts
   where id = p_attempt_id
     and student_id = public.exercise_current_student_id();

  if not found then
    raise exception 'Tentative introuvable ou accès interdit.';
  end if;

  select content
    into v_content
    from public.exercise_versions
   where id = v_attempt.version_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'question_id', q.value ->> 'id',
        'question', q.value ->> 'question',
        'type', q.value ->> 'type',
        'points', coalesce((q.value ->> 'points')::numeric, 0),
        'answer', ans.answer,
        'correct', ans.is_correct,
        'points_awarded', ans.points_awarded,
        'max_points', ans.max_points,
        'timed_out', ans.timed_out,
        'expected', coalesce(q.value -> 'answers', q.value -> 'correct_answer', q.value #> '{verbes_trous,phrases}', q.value #> '{mots_trous,phrases}'),
        'explanation', q.value -> 'explanation',
        'options', q.value -> 'options',
        'items', q.value -> 'items',
        'verbes_trous', q.value -> 'verbes_trous',
        'mots_trous', q.value -> 'mots_trous'
      )
      order by ord.position
    ),
    '[]'::jsonb
  )
  into v_questions
  from jsonb_array_elements(v_attempt.question_order) with ordinality as ord(question_id, position)
  join jsonb_array_elements(v_content -> 'questions') as q(value)
    on q.value ->> 'id' = ord.question_id #>> '{}'
  left join public.exercise_answers ans
    on ans.attempt_id = v_attempt.id
   and ans.question_id = ord.question_id #>> '{}';

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'exercise_id', v_attempt.exercise_id,
    'score', v_attempt.score,
    'max_score', v_attempt.max_score,
    'status', v_attempt.status,
    'started_at', v_attempt.started_at,
    'completed_at', v_attempt.completed_at,
    'questions', v_questions
  );
end;
$$;

-- ============================================================================
-- 3. EXAMENS ÉCRITS : contrainte, définition, validation, correction & timers
-- ============================================================================

alter table public.written_exam_questions
  drop constraint if exists written_exam_questions_question_type_check;
alter table public.written_exam_questions
  add constraint written_exam_questions_question_type_check
  check (question_type in ('qcm','text','reorder','verbes_trous','mots_trous'));

create or replace function public.save_written_exam_definition(p_exam_id uuid,p_definition jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare
 v_exam_id uuid := coalesce(p_exam_id,gen_random_uuid());
 v_version_id uuid; v_version_no integer; v_section jsonb; v_question jsonb;
 v_section_id uuid; v_question_id uuid; v_key jsonb; v_public jsonb; v_raw numeric:=0;
 v_class_id uuid; v_status text; v_section_position integer:=0; v_question_position integer:=0;
begin
 if not public.written_exam_is_teacher() then raise exception 'Accès enseignant requis.'; end if;
 if nullif(btrim(p_definition->>'title'),'') is null then raise exception 'Le titre est obligatoire.'; end if;
 if coalesce((p_definition->>'duration_minutes')::integer,0) < 1 then raise exception 'Durée invalide.'; end if;
 if jsonb_typeof(p_definition->'sections') <> 'array' or jsonb_array_length(p_definition->'sections')=0 then raise exception 'Ajoutez au moins une section.'; end if;
 if p_exam_id is not null and exists(select 1 from public.written_exam_attempts where exam_id=v_exam_id) then
   raise exception 'Cet examen possède déjà des tentatives. Son contenu est verrouillé pour préserver les copies et les corrections. Créez un nouvel examen pour un autre sujet.';
 end if;
 insert into public.written_exams(id,title,description,level,target_language,instruction_language,duration_minutes,opens_at,closes_at,status,display_scale,max_attempts,shuffle_sections,shuffle_questions,shuffle_options,navigation_mode,show_score_after_publish,show_corrections_after_publish,integrity_settings,updated_at)
 values(v_exam_id,btrim(p_definition->>'title'),coalesce(p_definition->>'description',''),nullif(p_definition->>'level',''),coalesce(p_definition->>'target_language','it'),coalesce(p_definition->>'instruction_language','fr'),(p_definition->>'duration_minutes')::integer,nullif(p_definition->>'opens_at','')::timestamptz,nullif(p_definition->>'closes_at','')::timestamptz,'draft',nullif(p_definition->>'display_scale','')::numeric,coalesce((p_definition->>'max_attempts')::integer,1),coalesce((p_definition->>'shuffle_sections')::boolean,true),coalesce((p_definition->>'shuffle_questions')::boolean,true),coalesce((p_definition->>'shuffle_options')::boolean,true),coalesce(p_definition->>'navigation_mode','free'),coalesce((p_definition->>'show_score_after_publish')::boolean,true),coalesce((p_definition->>'show_corrections_after_publish')::boolean,false),coalesce(p_definition->'integrity_settings','{}'::jsonb),now())
 on conflict(id) do update set title=excluded.title,description=excluded.description,level=excluded.level,target_language=excluded.target_language,instruction_language=excluded.instruction_language,duration_minutes=excluded.duration_minutes,opens_at=excluded.opens_at,closes_at=excluded.closes_at,status='draft',display_scale=excluded.display_scale,max_attempts=excluded.max_attempts,shuffle_sections=excluded.shuffle_sections,shuffle_questions=excluded.shuffle_questions,shuffle_options=excluded.shuffle_options,navigation_mode=excluded.navigation_mode,show_score_after_publish=excluded.show_score_after_publish,show_corrections_after_publish=excluded.show_corrections_after_publish,integrity_settings=excluded.integrity_settings,updated_at=now()
 where public.written_exam_is_teacher();
 delete from public.written_exam_classes where exam_id=v_exam_id;
 for v_class_id in select value::uuid from jsonb_array_elements_text(coalesce(p_definition->'class_ids','[]'::jsonb)) loop
   insert into public.written_exam_classes(exam_id,class_id) values(v_exam_id,v_class_id);
 end loop;

 select id,version_number into v_version_id,v_version_no
 from public.written_exam_versions
 where exam_id=v_exam_id
 order by case when status='draft' then 0 when status='published' then 1 else 2 end,
          version_number desc
 limit 1 for update;
 if v_version_id is null then
   v_version_no:=1;
   insert into public.written_exam_versions(exam_id,version_number,status)
   values(v_exam_id,v_version_no,'draft') returning id into v_version_id;
 else
   update public.written_exam_versions
   set status='draft',published_at=null,locked_at=null
   where id=v_version_id;
   delete from public.written_exam_sections where version_id=v_version_id;
 end if;

 for v_section in select value from jsonb_array_elements(p_definition->'sections') loop
   insert into public.written_exam_sections(version_id,section_key,title,instructions,category,max_points,position,shuffle,fixed_position,support_text,support_url,group_name)
   values(v_version_id,coalesce(v_section->>'id',gen_random_uuid()::text),btrim(v_section->>'title'),coalesce(v_section->>'instructions',''),nullif(v_section->>'category',''),coalesce((v_section->>'points')::numeric,0),v_section_position,coalesce((v_section->>'shuffle')::boolean,true),coalesce((v_section->>'fixed_position')::boolean,false),nullif(v_section->>'support_text',''),nullif(v_section->>'support_url',''),nullif(v_section->>'group_name',''))
   returning id into v_section_id;
   v_question_position:=0;
   for v_question in select value from jsonb_array_elements(coalesce(v_section->'questions','[]'::jsonb)) loop
     if nullif(btrim(v_question->>'prompt'),'') is null then raise exception 'Une question ne possède pas d’énoncé.'; end if;
     if coalesce((v_question->>'points')::numeric,0) <= 0 then raise exception 'Barème de question invalide.'; end if;
     if v_question ? 'blank_count' and (case when jsonb_typeof(v_question->'blank_count')='number' then (v_question->>'blank_count')::numeric<1 or (v_question->>'blank_count')::numeric<>trunc((v_question->>'blank_count')::numeric) else true end) then
       raise exception 'Le nombre de trous doit être un entier positif.';
     end if;
     v_key := coalesce(v_question->'answer_key',jsonb_strip_nulls(jsonb_build_object('correctOptionId',v_question->'correctOptionId','acceptedAnswers',v_question->'acceptedAnswers','correctOrder',v_question->'correctOrder','answers',v_question->'answers','correct_answer',v_question->'correct_answer')));
     if jsonb_typeof(v_key)<>'object' then raise exception 'La clé de correction doit être un objet JSON.'; end if;
     v_public := jsonb_strip_nulls(jsonb_build_object(
       'type',v_question->>'type',
       'blank_count',case when jsonb_typeof(v_question->'blank_count')='number' then (v_question->>'blank_count')::integer else null end,
       'shuffle_options',coalesce((v_question->>'shuffle_options')::boolean,true),
       'verbes_trous',case when v_question->>'type'='verbes_trous' then jsonb_build_object(
         'titre',coalesce(v_question->'verbes_trous'->>'titre',''),
         'consigne',coalesce(v_question->'verbes_trous'->>'consigne',''),
         'points_par_phrase',coalesce((v_question->'verbes_trous'->>'points_par_phrase')::integer,3),
         'banque',case when jsonb_typeof(v_question->'verbes_trous'->'banque')='array' then v_question->'verbes_trous'->'banque' else '[]'::jsonb end,
         'phrases',(select coalesce(jsonb_agg(jsonb_build_object('id',p.value->'id','debut',p.value->>'debut','fin',p.value->>'fin') order by p.ordinality),'[]'::jsonb)
           from jsonb_array_elements(case when jsonb_typeof(v_question->'verbes_trous'->'phrases')='array' then v_question->'verbes_trous'->'phrases' else '[]'::jsonb end) with ordinality p(value,ordinality))
       ) else null end,
       'mots_trous',case when v_question->>'type'='mots_trous' then jsonb_build_object(
         'titre',coalesce(v_question->'mots_trous'->>'titre',''),
         'consigne',coalesce(v_question->'mots_trous'->>'consigne',''),
         'points_par_phrase',greatest(1,coalesce((v_question->'mots_trous'->>'points_par_phrase')::integer,1)),
         'banque',case when jsonb_typeof(v_question->'mots_trous'->'banque')='array' then v_question->'mots_trous'->'banque' else '[]'::jsonb end,
         'phrases',(select coalesce(jsonb_agg(jsonb_build_object('id',p.value->'id','debut',p.value->>'debut','fin',p.value->>'fin') order by p.ordinality),'[]'::jsonb)
           from jsonb_array_elements(case when jsonb_typeof(v_question->'mots_trous'->'phrases')='array' then v_question->'mots_trous'->'phrases' else '[]'::jsonb end) with ordinality p(value,ordinality))
       ) else null end,
       'options',case when v_question->>'type'='qcm' then (
         select coalesce(jsonb_agg(jsonb_build_object('id',o.value->>'id','label',o.value->>'label') order by o.ordinality),'[]'::jsonb)
         from jsonb_array_elements(case when jsonb_typeof(v_question->'options')='array' then v_question->'options' else '[]'::jsonb end) with ordinality as o(value,ordinality)
       ) else null end,
       'items',case when v_question->>'type'='reorder' then (
         select coalesce(jsonb_agg(jsonb_build_object('id',o.value->>'id','text',o.value->>'text') order by o.ordinality),'[]'::jsonb)
         from jsonb_array_elements(case when jsonb_typeof(v_question->'items')='array' then v_question->'items' else '[]'::jsonb end) with ordinality as o(value,ordinality)
       ) else null end
     ));
     insert into public.written_exam_questions(section_id,question_key,position,question_type,prompt,points,public_data,manual_review,shuffle_options,source_quiz_id,source_question_id)
     values(v_section_id,coalesce(v_question->>'id',gen_random_uuid()::text),v_question_position,v_question->>'type',btrim(v_question->>'prompt'),(v_question->>'points')::numeric,v_public,coalesce((v_question->>'manual_review')::boolean,false),coalesce((v_question->>'shuffle_options')::boolean,true),nullif(v_question->>'source_quiz_id',''),nullif(v_question->>'source_question_id',''))
     returning id into v_question_id;
     if v_key='{}'::jsonb and coalesce((v_question->>'manual_review')::boolean,false)=false then raise exception 'Clé de correction manquante pour la question %.',v_question->>'prompt'; end if;
     insert into public.written_exam_answer_keys(question_id,answer_key,explanation) values(v_question_id,v_key,nullif(v_question->>'explanation',''));
     v_raw := v_raw + (v_question->>'points')::numeric;
     v_question_position:=v_question_position+1;
   end loop;
   v_section_position:=v_section_position+1;
 end loop;
 update public.written_exam_versions set raw_max=v_raw,
 title=btrim(p_definition->>'title'),description=coalesce(p_definition->>'description',''),level=nullif(p_definition->>'level',''),target_language=coalesce(p_definition->>'target_language','it'),instruction_language=coalesce(p_definition->>'instruction_language','fr'),
 duration_minutes=(p_definition->>'duration_minutes')::integer,
 display_scale=nullif(p_definition->>'display_scale','')::numeric,
 opens_at=nullif(p_definition->>'opens_at','')::timestamptz,
 closes_at=nullif(p_definition->>'closes_at','')::timestamptz,
 shuffle_sections=coalesce((p_definition->>'shuffle_sections')::boolean,true),
 shuffle_questions=coalesce((p_definition->>'shuffle_questions')::boolean,true),
 shuffle_options=coalesce((p_definition->>'shuffle_options')::boolean,true),
 navigation_mode=coalesce(p_definition->>'navigation_mode','free'),
 integrity_settings=coalesce(p_definition->'integrity_settings','{}'::jsonb),
 max_attempts=coalesce((p_definition->>'max_attempts')::integer,1),
 show_score_after_publish=coalesce((p_definition->>'show_score_after_publish')::boolean,true),
 show_corrections_after_publish=coalesce((p_definition->>'show_corrections_after_publish')::boolean,false)
 where id=v_version_id;
 delete from public.written_exam_version_classes where version_id=v_version_id;
 for v_class_id in select value::uuid from jsonb_array_elements_text(coalesce(p_definition->'class_ids','[]'::jsonb)) loop
   insert into public.written_exam_version_classes(version_id,class_id) values(v_version_id,v_class_id);
 end loop;
 update public.written_exams set status=case when exists(select 1 from public.written_exam_versions where exam_id=v_exam_id and status='published') then status else 'draft' end where id=v_exam_id and status <> 'closed';
 return jsonb_build_object('exam_id',v_exam_id,'version_id',v_version_id,'version_number',v_version_no,'raw_max',v_raw);
end $written$;

create or replace function public.publish_written_exam(p_exam_id uuid,p_version_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare v_raw numeric; v_count integer; v_bad integer; v_exam public.written_exams%rowtype; v_version public.written_exam_versions%rowtype;
begin
 if not public.written_exam_is_teacher() then raise exception 'Accès enseignant requis.'; end if;
 select * into v_exam from public.written_exams where id=p_exam_id for update;
 if not found then raise exception 'Examen introuvable.'; end if;
 select * into v_version from public.written_exam_versions where id=p_version_id and exam_id=p_exam_id and status='draft' for update;
 if not found then raise exception 'Cette version brouillon ne correspond pas à cet examen.'; end if;
 if not exists(select 1 from public.written_exam_version_classes where version_id=p_version_id) then raise exception 'Associez au moins une classe à cette version.'; end if;
 select coalesce(sum(q.points),0),count(*),count(*) filter(where q.prompt='' or q.public_data->>'type' not in ('qcm','text','reorder','verbes_trous','mots_trous'))
 into v_raw,v_count,v_bad from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where s.version_id=p_version_id;
 if v_count=0 or v_bad>0 then raise exception 'L’examen contient des questions invalides ou est vide.'; end if;
 if exists(select 1 from public.written_exam_sections s where s.version_id=p_version_id and s.max_points>0 and (select coalesce(sum(q.points),0) from public.written_exam_questions q where q.section_id=s.id)>s.max_points) then raise exception 'Le total des questions dépasse le plafond d’une section.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and q.question_type='qcm' and not q.manual_review and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(q.public_data->'options')='array' then q.public_data->'options' else '[]'::jsonb end) o where o->>'id'=k.answer_key->>'correctOptionId')) then raise exception 'Un QCM possède une clé qui ne correspond à aucune option.'; end if;

 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where s.version_id=p_version_id and q.question_type='qcm' and (
   (case when jsonb_typeof(q.public_data->'options')='array' then jsonb_array_length(q.public_data->'options') else 0 end)<2
   or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(q.public_data->'options')='array' then q.public_data->'options' else '[]'::jsonb end) o where nullif(btrim(o->>'id'),'') is null or nullif(btrim(o->>'label'),'') is null)
   or (select count(distinct o->>'id') from jsonb_array_elements(case when jsonb_typeof(q.public_data->'options')='array' then q.public_data->'options' else '[]'::jsonb end) o)<>(case when jsonb_typeof(q.public_data->'options')='array' then jsonb_array_length(q.public_data->'options') else 0 end)
 )) then raise exception 'Chaque option QCM doit avoir un identifiant et un libellé uniques.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where s.version_id=p_version_id and q.question_type='reorder' and (
   (case when jsonb_typeof(q.public_data->'items')='array' then jsonb_array_length(q.public_data->'items') else 0 end)<2
   or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(q.public_data->'items')='array' then q.public_data->'items' else '[]'::jsonb end) o where nullif(btrim(o->>'id'),'') is null or nullif(btrim(o->>'text'),'') is null)
   or (select count(distinct o->>'id') from jsonb_array_elements(case when jsonb_typeof(q.public_data->'items')='array' then q.public_data->'items' else '[]'::jsonb end) o)<>(case when jsonb_typeof(q.public_data->'items')='array' then jsonb_array_length(q.public_data->'items') else 0 end)
 )) then raise exception 'Chaque élément à réordonner doit avoir un identifiant et un texte uniques.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and q.question_type='reorder' and not q.manual_review and (case when jsonb_typeof(k.answer_key->'correctOrder')='array' then jsonb_array_length(k.answer_key->'correctOrder') else -1 end)<>(case when jsonb_typeof(q.public_data->'items')='array' then jsonb_array_length(q.public_data->'items') else 0 end)) then raise exception 'Une question de réordonnement possède un ordre incomplet.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and q.question_type='text' and not q.manual_review and not (
   (case when jsonb_typeof(k.answer_key->'acceptedAnswers')='array' then jsonb_array_length(k.answer_key->'acceptedAnswers')>0 else false end) or
   (case when jsonb_typeof(k.answer_key->'answers')='array' then jsonb_array_length(k.answer_key->'answers')>0 else false end)
 )) then raise exception 'Une question texte ne possède aucune réponse acceptée.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and q.question_type='text' and not q.manual_review and (
   (k.answer_key ? 'acceptedAnswers' and (
     jsonb_typeof(k.answer_key->'acceptedAnswers')<>'array'
     or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(k.answer_key->'acceptedAnswers')='array' then k.answer_key->'acceptedAnswers' else '[]'::jsonb end) a where jsonb_typeof(a)<>'string' or nullif(btrim(a#>>'{}'),'') is null)
   ))
   or (k.answer_key ? 'answers' and (
     jsonb_typeof(k.answer_key->'answers')<>'array'
     or (case when jsonb_typeof(k.answer_key->'answers')='array' then jsonb_array_length(k.answer_key->'answers') else 0 end)=0
     or (case when jsonb_typeof(q.public_data->'blank_count')='number' then (q.public_data->>'blank_count')::integer else 1 end)<>(case when jsonb_typeof(k.answer_key->'answers')='array' then jsonb_array_length(k.answer_key->'answers') else 0 end)
     or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(k.answer_key->'answers')='array' then k.answer_key->'answers' else '[]'::jsonb end) blank where jsonb_typeof(blank)<>'array' or (case when jsonb_typeof(blank)='array' then jsonb_array_length(blank)=0 else true end) or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(blank)='array' then blank else '[]'::jsonb end) variant where jsonb_typeof(variant)<>'string' or nullif(btrim(variant#>>'{}'),'') is null))
   ))
 )) then raise exception 'Les réponses acceptées ou variantes de trous sont invalides.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and q.question_type='reorder' and not q.manual_review and (
   (case when jsonb_typeof(k.answer_key->'correctOrder')='array' then jsonb_array_length(k.answer_key->'correctOrder') else -1 end)<>(case when jsonb_typeof(q.public_data->'items')='array' then jsonb_array_length(q.public_data->'items') else 0 end) or
   exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(k.answer_key->'correctOrder')='array' then k.answer_key->'correctOrder' else '[]'::jsonb end) as correct_id(value) where not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(q.public_data->'items')='array' then q.public_data->'items' else '[]'::jsonb end) as item(value) where item.value->>'id'=correct_id.value)) or
   exists(select 1 from jsonb_array_elements(case when jsonb_typeof(q.public_data->'items')='array' then q.public_data->'items' else '[]'::jsonb end) as item(value) where not exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(k.answer_key->'correctOrder')='array' then k.answer_key->'correctOrder' else '[]'::jsonb end) as correct_id(value) where correct_id.value=item.value->>'id'))
 )) then raise exception 'Une question de réordonnement possède un ordre invalide.'; end if;
 if exists(select 1 from public.written_exam_sections where version_id=p_version_id and support_url is not null and support_url !~* '^https?://') then raise exception 'Les documents supports doivent utiliser une URL HTTP ou HTTPS.'; end if;
 if v_raw<=0 then raise exception 'Le barème doit être supérieur à zéro.'; end if;
 if v_exam.opens_at is not null and v_exam.closes_at is not null and v_exam.closes_at<=v_exam.opens_at then raise exception 'La date de fermeture doit suivre la date d’ouverture.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and q.question_type='qcm' and (case when jsonb_typeof(q.public_data->'options')='array' then jsonb_array_length(q.public_data->'options') else 0 end)<2) then raise exception 'Un QCM doit proposer au moins deux options.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and q.question_type='text' and not q.manual_review and not (k.answer_key ? 'acceptedAnswers' or k.answer_key ? 'answers')) then raise exception 'Une question texte doit posséder une réponse attendue ou être corrigée manuellement.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and q.question_type='reorder' and (case when jsonb_typeof(q.public_data->'items')='array' then jsonb_array_length(q.public_data->'items') else 0 end)<2) then raise exception 'Une question de réordonnement doit contenir au moins deux éléments.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id left join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and k.question_id is null) then raise exception 'Clé de correction manquante.'; end if;
 update public.written_exam_versions set status='published',published_at=now(),raw_max=v_raw where id=p_version_id and exam_id=p_exam_id and status='draft';
 if not found then raise exception 'Version non modifiable ou introuvable.'; end if;
 update public.written_exams set title=v_version.title,description=v_version.description,level=v_version.level,target_language=v_version.target_language,instruction_language=v_version.instruction_language,duration_minutes=v_version.duration_minutes,opens_at=v_version.opens_at,closes_at=v_version.closes_at,display_scale=v_version.display_scale,max_attempts=v_version.max_attempts,shuffle_sections=v_version.shuffle_sections,shuffle_questions=v_version.shuffle_questions,shuffle_options=v_version.shuffle_options,navigation_mode=v_version.navigation_mode,show_score_after_publish=v_version.show_score_after_publish,show_corrections_after_publish=v_version.show_corrections_after_publish,integrity_settings=v_version.integrity_settings,status=case when v_version.opens_at is not null and v_version.opens_at>now() then 'scheduled' else 'published' end,updated_at=now() where id=p_exam_id;
 return jsonb_build_object('published',true,'raw_max',v_raw,'version_id',p_version_id);
end $written$;

create or replace function public.validate_mots_trous_published_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $validate$
declare
  v_q record;
  v_public jsonb;
  v_key jsonb;
  v_bank jsonb;
  v_phrases jsonb;
  v_keys jsonb;
  v_count integer;
  v_bank_count integer;
  v_unique_bank integer;
  v_unique_expected integer;
  v_ppp integer;
  v_expected record;
begin
  if new.status <> 'published' or old.status = 'published' then
    return new;
  end if;

  for v_q in
    select q.id, q.points, q.manual_review, q.public_data, k.answer_key
    from public.written_exam_questions q
    join public.written_exam_sections s on s.id=q.section_id
    left join public.written_exam_answer_keys k on k.question_id=q.id
    where s.version_id=new.id and q.question_type='mots_trous'
  loop
    v_public := v_q.public_data->'mots_trous';
    v_key := v_q.answer_key;
    if jsonb_typeof(v_public) is distinct from 'object' or jsonb_typeof(v_key->'phrases') is distinct from 'array' then
      raise exception 'Question « mots à trous avec banque » : configuration ou corrigé manquant.';
    end if;
    if v_q.manual_review then
      raise exception 'Question « mots à trous avec banque » : la correction est automatique; désactivez la correction manuelle.';
    end if;
    v_ppp := coalesce((v_public->>'points_par_phrase')::integer, 1);
    if v_ppp < 1 or ((v_public ? 'points_par_phrase') and (v_public->>'points_par_phrase')::numeric <> v_ppp) then
      raise exception 'Question « mots à trous avec banque » : points_par_phrase doit être un entier supérieur ou égal à 1.';
    end if;
    v_bank := v_public->'banque';
    v_phrases := v_public->'phrases';
    v_keys := v_key->'phrases';
    if jsonb_typeof(v_bank) is distinct from 'array' or jsonb_typeof(v_phrases) is distinct from 'array' or jsonb_typeof(v_keys) is distinct from 'array' then
      raise exception 'Question « mots à trous avec banque » : banque et phrases doivent être des listes.';
    end if;
    v_count := jsonb_array_length(v_phrases);
    v_bank_count := jsonb_array_length(v_bank);
    if v_count<1 or v_bank_count<v_count or jsonb_array_length(v_keys)<>v_count then
      raise exception 'Question « mots à trous avec banque » : la banque doit contenir au moins autant de mots que de phrases.';
    end if;
    if exists(select 1 from jsonb_array_elements(v_bank) b where jsonb_typeof(b.value)<>'string' or nullif(btrim(b.value#>>'{}'),'') is null) then
      raise exception 'Question « mots à trous avec banque » : la banque doit contenir uniquement des mots non vides.';
    end if;
    select count(distinct public.quiz_norm_answer(value)) into v_unique_bank
    from jsonb_array_elements_text(v_bank);
    if v_unique_bank<>v_bank_count then
      raise exception 'Question « mots à trous avec banque » : la banque contient des doublons.';
    end if;
    select count(distinct public.quiz_norm_answer(coalesce(value->>'mot',''))) into v_unique_expected
    from jsonb_array_elements(v_keys);
    if v_unique_expected<>v_count then
      raise exception 'Question « mots à trous avec banque » : chaque phrase doit avoir un mot attendu différent.';
    end if;
    if (select count(distinct value->>'id') from jsonb_array_elements(v_phrases))<>v_count
      or exists(select 1 from jsonb_array_elements(v_phrases) p where nullif(btrim(p.value->>'id'),'') is null)
      or (select count(distinct value->>'id') from jsonb_array_elements(v_keys))<>v_count
      or exists(select 1 from jsonb_array_elements(v_keys) k where nullif(btrim(k.value->>'id'),'') is null)
      or exists(select 1 from jsonb_array_elements(v_phrases) p where not exists(select 1 from jsonb_array_elements(v_keys) k where p.value->>'id'=k.value->>'id'))
      or exists(select 1 from jsonb_array_elements(v_keys) k where not exists(select 1 from jsonb_array_elements(v_phrases) p where p.value->>'id'=k.value->>'id')) then
      raise exception 'Question « mots à trous avec banque » : les identifiants des phrases et des réponses doivent correspondre exactement et être uniques.';
    end if;
    if v_q.points<>v_count*v_ppp then
      raise exception 'Question « mots à trous avec banque » : le barème doit être égal au nombre de phrases multiplié par points_par_phrase.';
    end if;
    for v_expected in select value from jsonb_array_elements(v_keys)
    loop
      if nullif(btrim(v_expected.value->>'mot'),'') is null
        or not exists(select 1 from jsonb_array_elements_text(v_bank) b where public.quiz_norm_answer(b)=public.quiz_norm_answer(v_expected.value->>'mot'))
      then
        raise exception 'Question « mots à trous avec banque » : chaque phrase doit avoir un mot attendu présent dans la banque.';
      end if;
    end loop;
  end loop;
  return new;
end
$validate$;

drop trigger if exists written_exam_validate_mots_trous on public.written_exam_versions;
create trigger written_exam_validate_mots_trous
before update of status on public.written_exam_versions
for each row execute function public.validate_mots_trous_published_version();

create or replace function public.written_exam_auto_question_score(
  p_question_id uuid,
  p_answer jsonb
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $written$
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
begin
  select q.question_type,q.points,q.public_data,k.answer_key
  into v_q
  from public.written_exam_questions q
  join public.written_exam_answer_keys k on k.question_id=q.id
  where q.id=p_question_id;

  if not found then
    return 0;
  end if;
  v_key:=coalesce(v_q.answer_key,'{}'::jsonb);

  if v_q.question_type='qcm' then
    return case when coalesce(p_answer#>>'{}','')=coalesce(v_key->>'correctOptionId','')
      then v_q.points else 0 end;
  elsif v_q.question_type='text' then
    if jsonb_typeof(v_key->'answers')='array' then
      v_expected:=v_key->'answers';
      if jsonb_typeof(p_answer)='array' then
        v_actual:=p_answer;
      elsif jsonb_typeof(p_answer)='string' and left(coalesce(p_answer#>>'{}',''),1)='[' then
        begin
          v_actual:=(p_answer#>>'{}')::jsonb;
        exception when others then
          v_actual:=jsonb_build_array(p_answer);
        end;
      else
        v_actual:=jsonb_build_array(p_answer);
      end if;
      v_count:=jsonb_array_length(v_expected);
      if v_count=0 then return 0; end if;
      for v_idx in 0..v_count-1 loop
        if jsonb_typeof(v_expected->v_idx)='array' then
          if exists(
            select 1 from jsonb_array_elements_text(v_expected->v_idx) e
            where lower(regexp_replace(btrim(e),'\s+',' ','g'))=
              lower(regexp_replace(btrim(coalesce(v_actual->>v_idx,'')),'\s+',' ','g'))
          ) then v_hits:=v_hits+1; end if;
        elsif lower(regexp_replace(btrim(coalesce(v_expected->>v_idx,'')),'\s+',' ','g'))=
          lower(regexp_replace(btrim(coalesce(v_actual->>v_idx,'')),'\s+',' ','g')) then
          v_hits:=v_hits+1;
        end if;
      end loop;
      return round(v_q.points*v_hits/nullif(v_count,0),2);
    end if;
    v_answer_text:=coalesce(p_answer#>>'{}','');
    if exists(
      select 1 from jsonb_array_elements_text(coalesce(v_key->'acceptedAnswers','[]'::jsonb)) e
      where lower(regexp_replace(btrim(e),'\s+',' ','g'))=
        lower(regexp_replace(btrim(v_answer_text),'\s+',' ','g'))
    ) then return v_q.points; end if;
    return 0;
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
      v_chosen:=lower(regexp_replace(btrim(coalesce(v_phrase_answer->>'verbe_choisi','')),'\s+',' ','g'));
      v_expected_verb:=lower(regexp_replace(btrim(coalesce(v_phrase->>'verbe','')),'\s+',' ','g'));
      v_typed:=lower(regexp_replace(btrim(coalesce(v_phrase_answer->>'texte_saisi','')),'\s+',' ','g'));
      if v_chosen<>'' and not (v_chosen=any(v_used))
        and exists(
          select 1 from jsonb_array_elements_text(coalesce(v_q.public_data->'verbes_trous'->'banque','[]'::jsonb)) b(value)
          where lower(regexp_replace(btrim(b.value),'\s+',' ','g'))=v_chosen
        ) then
        v_used:=array_append(v_used,v_chosen);
        if v_chosen=v_expected_verb then v_points:=v_points+1; end if;
        if v_typed<>'' and exists(
          select 1 from jsonb_array_elements_text(coalesce(v_phrase->'reponses','[]'::jsonb)) a(value)
          where lower(regexp_replace(btrim(a.value),'\s+',' ','g'))=v_typed
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
        and exists(
          select 1 from jsonb_array_elements_text(coalesce(v_q.public_data->'mots_trous'->'banque','[]'::jsonb)) b(value)
          where public.quiz_norm_answer(b.value)=v_chosen
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

create or replace function public.save_written_exam_question_answer(
  p_attempt_id uuid,
  p_question_id text,
  p_answer jsonb,
  p_advance boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $written$
declare
  v_student_id uuid;
  v_attempt public.written_exam_attempts%rowtype;
  v_question_index integer;
  v_question_offset integer;
  v_question_seconds integer;
  v_question_count integer;
  v_active_question_index integer;
  v_next_offset integer;
begin
  select id into v_student_id
  from public.students
  where lower(email)=lower(auth.jwt()->>'email')
    and coalesce(validation_status,'approved')='approved'
  limit 1;

  if v_student_id is null then
    raise exception 'Fiche élève active introuvable.';
  end if;

  select * into v_attempt
  from public.written_exam_attempts
  where id=p_attempt_id and student_id=v_student_id
  for update;

  if not found or v_attempt.status<>'in_progress' then
    raise exception 'Tentative introuvable ou déjà terminée.';
  end if;

  if v_attempt.deadline_at<=now() then
    return jsonb_build_object('saved',false,'expired',true);
  end if;

  if v_attempt.question_timer_started_at is null then
    raise exception 'Chronomètre individuel non initialisé.';
  end if;

  with ordered_questions as (
    select
      q.id::text as question_id,
      (row_number() over(order by sec.section_ord,oq.question_ord)-1)::integer as question_index,
      coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
        case when q.question_type in ('text','verbes_trous','mots_trous') then 32 else 17 end)::integer as seconds,
      coalesce(
        sum(coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
          case when q.question_type in ('text','verbes_trous','mots_trous') then 32 else 17 end))
          over(order by sec.section_ord,oq.question_ord
            rows between unbounded preceding and 1 preceding),
        0
      )::integer as offset_seconds
    from jsonb_array_elements_text(v_attempt.order_manifest->'sections')
      with ordinality as sec(section_id,section_ord)
    cross join lateral jsonb_array_elements_text(
      v_attempt.order_manifest->'questions'->(sec.section_id)
    ) with ordinality as oq(question_id,question_ord)
    join public.written_exam_questions q on q.id::text=oq.question_id
  )
  select question_index,offset_seconds,seconds
    into v_question_index,v_question_offset,v_question_seconds
  from ordered_questions
  where question_id=p_question_id;

  if v_question_index is null then
    raise exception 'Question inconnue pour cette tentative.';
  end if;

  with ordered_questions as (
    select
      (row_number() over(order by sec.section_ord,oq.question_ord)-1)::integer as question_index,
      coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
        case when q.question_type in ('text','verbes_trous','mots_trous') then 32 else 17 end)::integer as seconds,
      coalesce(
        sum(coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
          case when q.question_type in ('text','verbes_trous','mots_trous') then 32 else 17 end))
          over(order by sec.section_ord,oq.question_ord
            rows between unbounded preceding and 1 preceding),
        0
      )::integer as offset_seconds
    from jsonb_array_elements_text(v_attempt.order_manifest->'sections')
      with ordinality as sec(section_id,section_ord)
    cross join lateral jsonb_array_elements_text(
      v_attempt.order_manifest->'questions'->(sec.section_id)
    ) with ordinality as oq(question_id,question_ord)
    join public.written_exam_questions q on q.id::text=oq.question_id
  )
  select count(*)::integer into v_question_count from ordered_questions;

  with ordered_questions as (
    select
      (row_number() over(order by sec.section_ord,oq.question_ord)-1)::integer as question_index,
      coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
        case when q.question_type in ('text','verbes_trous','mots_trous') then 32 else 17 end)::integer as seconds,
      coalesce(
        sum(coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
          case when q.question_type in ('text','verbes_trous','mots_trous') then 32 else 17 end))
          over(order by sec.section_ord,oq.question_ord
            rows between unbounded preceding and 1 preceding),
        0
      )::integer as offset_seconds
    from jsonb_array_elements_text(v_attempt.order_manifest->'sections')
      with ordinality as sec(section_id,section_ord)
    cross join lateral jsonb_array_elements_text(
      v_attempt.order_manifest->'questions'->(sec.section_id)
    ) with ordinality as oq(question_id,question_ord)
    join public.written_exam_questions q on q.id::text=oq.question_id
  )
  select question_index into v_active_question_index
  from ordered_questions
  where now()>=v_attempt.question_timer_started_at+make_interval(secs=>offset_seconds)
    and now()<v_attempt.question_timer_started_at+make_interval(secs=>(offset_seconds+seconds))
  limit 1;

  if v_active_question_index is distinct from v_question_index
     and not (
       (p_advance and v_active_question_index=(v_question_index+1))
       or (
         v_question_index=v_question_count-1
         and v_active_question_index is null
         and v_attempt.answers ? p_question_id
         and v_attempt.answers->p_question_id=coalesce(p_answer,'null'::jsonb)
       )
     ) then
    return jsonb_build_object('saved',false,'expired',true,'reason','question_not_active');
  end if;

  update public.written_exam_attempts
  set answers=jsonb_set(
        coalesce(answers,'{}'::jsonb),
        array[p_question_id],
        coalesce(p_answer,'null'::jsonb),
        true
      ),
      updated_at=now()
  where id=p_attempt_id;

  if p_advance and v_active_question_index=v_question_index then
    select v_question_offset+v_question_seconds into v_next_offset;
    if v_question_index+1<v_question_count then
      update public.written_exam_attempts
      set question_timer_started_at=now()-make_interval(secs=>v_next_offset),
          updated_at=now()
      where id=p_attempt_id;
    end if;
  end if;

  return jsonb_build_object(
    'saved',true,
    'advanced',p_advance,
    'next_question_index',case when p_advance then least(v_question_index+1,v_question_count) else v_question_index end
  );
end
$written$;

create or replace function public.advance_written_exam_question(
  p_attempt_id uuid,
  p_question_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $written$
declare
  v_student_id uuid;
  v_attempt public.written_exam_attempts%rowtype;
  v_question_index integer;
  v_question_offset integer;
  v_question_seconds integer;
  v_question_count integer;
  v_active_question_index integer;
  v_next_offset integer;
begin
  select id into v_student_id
  from public.students
  where lower(email)=lower(auth.jwt()->>'email')
    and coalesce(validation_status,'approved')='approved'
  limit 1;
  if v_student_id is null then raise exception 'Fiche élève active introuvable.'; end if;

  select * into v_attempt
  from public.written_exam_attempts
  where id=p_attempt_id and student_id=v_student_id
  for update;
  if not found or v_attempt.status<>'in_progress' then
    raise exception 'Tentative introuvable ou déjà terminée.';
  end if;
  if v_attempt.deadline_at<=now() then
    return jsonb_build_object('advanced',false,'expired',true);
  end if;
  if v_attempt.question_timer_started_at is null then
    raise exception 'Chronomètre individuel non initialisé.';
  end if;

  with ordered_questions as (
    select q.id::text as question_id,
      (row_number() over(order by sec.section_ord,oq.question_ord)-1)::integer as question_index,
      coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
        case when q.question_type in ('text','verbes_trous','mots_trous') then 32 else 17 end)::integer as seconds,
      coalesce(sum(coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
        case when q.question_type in ('text','verbes_trous','mots_trous') then 32 else 17 end))
        over(order by sec.section_ord,oq.question_ord rows between unbounded preceding and 1 preceding),0)::integer as offset_seconds
    from jsonb_array_elements_text(v_attempt.order_manifest->'sections')
      with ordinality as sec(section_id,section_ord)
    cross join lateral jsonb_array_elements_text(v_attempt.order_manifest->'questions'->(sec.section_id))
      with ordinality as oq(question_id,question_ord)
    join public.written_exam_questions q on q.id::text=oq.question_id
  )
  select question_index,offset_seconds,seconds
  into v_question_index,v_question_offset,v_question_seconds
  from ordered_questions where question_id=p_question_id;
  if v_question_index is null then raise exception 'Question inconnue pour cette tentative.'; end if;

  with ordered_questions as (
    select (row_number() over(order by sec.section_ord,oq.question_ord)-1)::integer as question_index,
      coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
        case when q.question_type in ('text','verbes_trous','mots_trous') then 32 else 17 end)::integer as seconds,
      coalesce(sum(coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
        case when q.question_type in ('text','verbes_trous','mots_trous') then 32 else 17 end))
        over(order by sec.section_ord,oq.question_ord rows between unbounded preceding and 1 preceding),0)::integer as offset_seconds
    from jsonb_array_elements_text(v_attempt.order_manifest->'sections')
      with ordinality as sec(section_id,section_ord)
    cross join lateral jsonb_array_elements_text(v_attempt.order_manifest->'questions'->(sec.section_id))
      with ordinality as oq(question_id,question_ord)
    join public.written_exam_questions q on q.id::text=oq.question_id
  )
  select count(*)::integer into v_question_count from ordered_questions;

  with ordered_questions as (
    select (row_number() over(order by sec.section_ord,oq.question_ord)-1)::integer as question_index,
      coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
        case when q.question_type in ('text','verbes_trous','mots_trous') then 32 else 17 end)::integer as seconds,
      coalesce(sum(coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
        case when q.question_type in ('text','verbes_trous','mots_trous') then 32 else 17 end))
        over(order by sec.section_ord,oq.question_ord rows between unbounded preceding and 1 preceding),0)::integer as offset_seconds
    from jsonb_array_elements_text(v_attempt.order_manifest->'sections')
      with ordinality as sec(section_id,section_ord)
    cross join lateral jsonb_array_elements_text(v_attempt.order_manifest->'questions'->(sec.section_id))
      with ordinality as oq(question_id,question_ord)
    join public.written_exam_questions q on q.id::text=oq.question_id
  )
  select question_index into v_active_question_index
  from ordered_questions
  where now()>=v_attempt.question_timer_started_at+make_interval(secs=>offset_seconds)
    and now()<v_attempt.question_timer_started_at+make_interval(secs=>(offset_seconds+seconds))
  limit 1;

  if v_active_question_index=v_question_index+1 then
    return jsonb_build_object('advanced',true,'next_question_index',v_question_index+1,
      'question_timer_started_at',v_attempt.question_timer_started_at,'idempotent',true);
  end if;
  if v_active_question_index is distinct from v_question_index then
    return jsonb_build_object('advanced',false,'active_question_index',v_active_question_index);
  end if;

  if v_question_index+1<v_question_count then
    v_next_offset:=v_question_offset+v_question_seconds;
    update public.written_exam_attempts
    set question_timer_started_at=now()-make_interval(secs=>v_next_offset),updated_at=now()
    where id=p_attempt_id
    returning question_timer_started_at into v_attempt.question_timer_started_at;
  end if;

  return jsonb_build_object('advanced',true,'next_question_index',least(v_question_index+1,v_question_count),
    'question_timer_started_at',coalesce(v_attempt.question_timer_started_at,now()));
end
$written$;

create or replace function public.submit_written_exam_with_answers(
  p_attempt_id uuid,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $written$
declare
  v_student_id uuid;
  v_attempt public.written_exam_attempts%rowtype;
  v_key text;
  v_answer_index integer;
  v_max_allowed_index integer;
  v_result jsonb;
begin
  select id into v_student_id
  from public.students
  where lower(email)=lower(auth.jwt()->>'email')
    and coalesce(validation_status,'approved')='approved'
  limit 1;
  if v_student_id is null then raise exception 'Fiche élève active introuvable.'; end if;

  if jsonb_typeof(coalesce(p_answers,'{}'::jsonb))<>'object' then
    raise exception 'Les réponses de l’examen doivent être un objet JSON.';
  end if;
  if octet_length(coalesce(p_answers,'{}'::jsonb)::text)>2000000 then
    raise exception 'La copie dépasse la taille maximale autorisée.';
  end if;

  select * into v_attempt
  from public.written_exam_attempts
  where id=p_attempt_id and student_id=v_student_id
  for update;
  if not found then raise exception 'Tentative introuvable.'; end if;

  if v_attempt.status<>'in_progress' then
    if v_attempt.submitted_at is not null then
      return jsonb_build_object('submitted',true,'already_submitted',true,
        'status',v_attempt.status,'raw_score',v_attempt.raw_score,'normalized_score',v_attempt.normalized_score);
    end if;
    raise exception 'Tentative déjà terminée.';
  end if;
  if not exists(select 1 from public.written_exams where id=v_attempt.exam_id and status in ('published','open','scheduled')) then
    raise exception 'Examen clôturé.';
  end if;

  if v_attempt.question_timer_started_at is null then
    raise exception 'Chronomètre individuel non initialisé.';
  end if;

  with ordered_questions as (
    select q.id::text as question_id,
      (row_number() over(order by sec.section_ord,oq.question_ord)-1)::integer as question_index,
      coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
        case when q.question_type in ('text','verbes_trous','mots_trous') then 32 else 17 end)::integer as seconds,
      coalesce(sum(coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
        case when q.question_type in ('text','verbes_trous','mots_trous') then 32 else 17 end))
        over(order by sec.section_ord,oq.question_ord rows between unbounded preceding and 1 preceding),0)::integer as offset_seconds
    from jsonb_array_elements_text(v_attempt.order_manifest->'sections')
      with ordinality as sec(section_id,section_ord)
    cross join lateral jsonb_array_elements_text(v_attempt.order_manifest->'questions'->(sec.section_id))
      with ordinality as oq(question_id,question_ord)
    join public.written_exam_questions q on q.id::text=oq.question_id
  )
  select coalesce(max(question_index),-1) into v_max_allowed_index
  from ordered_questions
  where least(now(),v_attempt.deadline_at)>=v_attempt.question_timer_started_at+make_interval(secs=>offset_seconds);

  for v_key in select jsonb_object_keys(coalesce(p_answers,'{}'::jsonb)) loop
    with ordered_questions as (
      select q.id::text as question_id,
        (row_number() over(order by sec.section_ord,oq.question_ord)-1)::integer as question_index
      from jsonb_array_elements_text(v_attempt.order_manifest->'sections')
        with ordinality as sec(section_id,section_ord)
      cross join lateral jsonb_array_elements_text(v_attempt.order_manifest->'questions'->(sec.section_id))
        with ordinality as oq(question_id,question_ord)
      join public.written_exam_questions q on q.id::text=oq.question_id
    )
    select question_index into v_answer_index
    from ordered_questions where question_id=v_key;
    if v_answer_index is null then
      raise exception 'Réponse associée à une question inconnue.';
    end if;
    if v_answer_index>v_max_allowed_index then
      raise exception 'Une réponse concerne une question dont le délai n’a pas encore commencé.';
    end if;
  end loop;

  update public.written_exam_attempts
  set answers=coalesce(p_answers,'{}'::jsonb),updated_at=now()
  where id=p_attempt_id;

  v_result:=public.submit_written_exam(p_attempt_id);
  return v_result;
end
$written$;

notify pgrst, 'reload schema';
