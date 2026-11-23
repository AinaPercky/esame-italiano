-- Fix quiz grading to use the shared expected-answer interpretation.
-- Identical flat entries are legacy duplicate variants, not separate blanks.
CREATE OR REPLACE FUNCTION public.quiz_expected_answers_list(p_question JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE AS $function$
DECLARE
  v_raw TEXT := btrim(coalesce(p_question ->> 'correct_answer', ''));
  v_parts JSONB;
  v_has_nested BOOLEAN := false;
  v_distinct_count INTEGER := 0;
BEGIN
  IF jsonb_typeof(p_question -> 'answers') = 'array' AND jsonb_array_length(p_question -> 'answers') > 0 THEN
    SELECT coalesce(bool_or(jsonb_typeof(elem) = 'array'), false),
           count(DISTINCT btrim(elem #>> '{}'))
      INTO v_has_nested, v_distinct_count
      FROM jsonb_array_elements(p_question -> 'answers') AS e(elem);
    IF v_has_nested THEN
      SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(elem)='array'
        THEN to_jsonb((SELECT string_agg(value,' / ') FROM jsonb_array_elements_text(elem) a(value)))
        ELSE to_jsonb(btrim(elem #>> '{}')) END),'[]'::jsonb)
      INTO v_parts FROM jsonb_array_elements(p_question->'answers') e(elem);
      RETURN v_parts;
    END IF;
    IF v_distinct_count=1 THEN
      RETURN jsonb_build_array(to_jsonb(btrim(p_question->'answers'->>0)));
    END IF;
    IF coalesce((p_question->>'blank_count')::integer,1)>1 THEN
      RETURN p_question->'answers';
    END IF;
    SELECT jsonb_build_array(to_jsonb(string_agg(btrim(elem #>> '{}'),' / ' ORDER BY ord)))
    INTO v_parts FROM jsonb_array_elements(p_question->'answers') WITH ORDINALITY a(elem,ord);
    RETURN coalesce(v_parts,'[]'::jsonb);
  END IF;
  IF left(v_raw,1)='[' AND right(v_raw,1)=']' THEN
    BEGIN
      v_parts:=v_raw::jsonb;
      IF jsonb_typeof(v_parts)='array' AND jsonb_array_length(v_parts)>0 THEN
        IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_parts) e(elem) WHERE jsonb_typeof(elem)='array') THEN
          RETURN (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(elem)='array'
            THEN to_jsonb((SELECT string_agg(value,' / ') FROM jsonb_array_elements_text(elem) a(value)))
            ELSE to_jsonb(btrim(elem #>> '{}')) END),'[]'::jsonb)
            FROM jsonb_array_elements(v_parts) e(elem));
        END IF;
        RETURN jsonb_build_array(to_jsonb((SELECT string_agg(btrim(elem #>> '{}'),' / ') FROM jsonb_array_elements(v_parts) e(elem))));
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  IF position('|' IN v_raw)>0 THEN
    SELECT coalesce(jsonb_agg(to_jsonb(btrim(part))),'[]'::jsonb) INTO v_parts
    FROM regexp_split_to_table(v_raw,'\\s*\\|\\s*') p(part) WHERE btrim(part)<>'';
    IF jsonb_array_length(v_parts)>1 THEN RETURN v_parts; END IF;
  END IF;
  IF position(' // ' IN v_raw)>0 THEN
    SELECT coalesce(jsonb_agg(to_jsonb(btrim(part))),'[]'::jsonb) INTO v_parts
    FROM regexp_split_to_table(v_raw,'\\s*//\\s*') p(part) WHERE btrim(part)<>'';
    IF jsonb_array_length(v_parts)>1 THEN RETURN v_parts; END IF;
  END IF;
  RETURN jsonb_build_array(v_raw);
END $function$;

CREATE OR REPLACE FUNCTION public.quiz_grade_question(q jsonb, answer text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
 t TEXT := coalesce(q->>'type','text'); raw TEXT := btrim(coalesce(answer,''));
 expected TEXT := btrim(coalesce(q->>'correct_answer',''));
 pts NUMERIC := coalesce(nullif((q->>'points')::numeric,0),1);
 maxpts NUMERIC := pts; earned NUMERIC := 0; ok BOOLEAN := FALSE;
 exp_display TEXT := expected; student_display TEXT := raw;
 exp_parts JSONB := '[]'; stu_parts JSONB := '[]'; item JSONB; phrase JSONB; ans JSONB;
 choices JSONB; saisies JSONB; correct_order JSONB := '[]'; student_order JSONB := '[]';
 item_ids JSONB := '[]'; used TEXT[] := ARRAY[]::TEXT[];
 chosen TEXT; typed TEXT; expverb TEXT; n INTEGER := 0; idx INTEGER := 0;
 correct_n INTEGER := 0; per_phrase NUMERIC := 3; phrase_score NUMERIC;
 part TEXT; part_ok BOOLEAN;
BEGIN
 IF t='qcm' THEN
   ok := public.quiz_norm_answer(raw)=public.quiz_norm_answer(expected)
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(coalesce(q->'options','[]'::jsonb)) WITH ORDINALITY opt(value,ord)
       WHERE public.quiz_norm_answer(raw)=public.quiz_norm_answer(
         CASE WHEN jsonb_typeof(opt.value)='object'
           THEN coalesce(opt.value->>'id',opt.value->>'label','')
           ELSE opt.value #>> '{}' END)
       AND public.quiz_norm_answer(expected)=public.quiz_norm_answer(
         CASE WHEN jsonb_typeof(opt.value)='object'
           THEN coalesce(opt.value->>'id',opt.value->>'label','')
           ELSE opt.value #>> '{}' END)
     );
   earned := CASE WHEN ok THEN pts ELSE 0 END;
 ELSIF t='reorder' THEN
   SELECT coalesce(jsonb_agg(value->>'id' ORDER BY ord),'[]') INTO item_ids
   FROM jsonb_array_elements(coalesce(q->'items','[]')) WITH ORDINALITY x(value,ord);
   BEGIN correct_order := (q->>'correct_answer')::jsonb; EXCEPTION WHEN OTHERS THEN correct_order := item_ids; END;
   IF jsonb_typeof(correct_order)<>'array' OR jsonb_array_length(correct_order)<>jsonb_array_length(item_ids) THEN correct_order:=item_ids; END IF;
   BEGIN student_order := raw::jsonb; EXCEPTION WHEN OTHERS THEN student_order:='[]'; END;
   IF jsonb_typeof(student_order)<>'array' THEN student_order:='[]'; END IF;
   ok := student_order=correct_order AND jsonb_array_length(student_order)=jsonb_array_length(item_ids);
   earned := CASE WHEN ok THEN pts ELSE 0 END;
   SELECT coalesce(string_agg(i.value->>'text',' → ' ORDER BY x.ord),'') INTO exp_display
   FROM jsonb_array_elements_text(correct_order) WITH ORDINALITY x(id,ord)
   JOIN jsonb_array_elements(coalesce(q->'items','[]')) i(value) ON i.value->>'id'=x.id;
   SELECT coalesce(string_agg(i.value->>'text',' → ' ORDER BY x.ord),'') INTO student_display
   FROM jsonb_array_elements_text(student_order) WITH ORDINALITY x(id,ord)
   JOIN jsonb_array_elements(coalesce(q->'items','[]')) i(value) ON i.value->>'id'=x.id;
 ELSIF t='verbes_trous' AND q ? 'verbes_trous' THEN
   exp_display := '';
   per_phrase := coalesce(nullif((q#>>'{verbes_trous,points_par_phrase}')::numeric,0),3);
   BEGIN ans:=raw::jsonb; EXCEPTION WHEN OTHERS THEN ans:='{}'; END;
   choices:=coalesce(ans->'choices','{}'); saisies:=coalesce(ans->'saisies','{}');
   FOR phrase,idx IN SELECT value,ord::integer FROM jsonb_array_elements(coalesce(q#>'{verbes_trous,phrases}','[]')) WITH ORDINALITY AS x(value,ord) LOOP
     IF coalesce(phrase->>'verbe','')='' OR jsonb_typeof(phrase->'reponses')<>'array' THEN CONTINUE; END IF;
     n:=n+1;
     IF ans ? 'choices' OR ans ? 'saisies' THEN
       chosen:=coalesce(choices->>(idx-1)::text,choices->>(phrase->>'id'));
       typed:=coalesce(saisies->>(idx-1)::text,saisies->>(phrase->>'id'),'');
     ELSE
       item:=coalesce(ans->(phrase->>'id'),'{}');
       chosen:=item->>'verbe_choisi'; typed:=coalesce(item->>'texte_saisi','');
     END IF;
     chosen:=public.quiz_norm_answer(chosen); typed:=public.quiz_norm_answer(typed);
     expverb:=public.quiz_norm_answer(phrase->>'verbe'); phrase_score:=0;
     IF chosen<>'' AND chosen=expverb AND NOT chosen=ANY(used) THEN phrase_score:=phrase_score+1; END IF;
     IF chosen<>'' AND NOT chosen=ANY(used) AND EXISTS(
       SELECT 1 FROM jsonb_array_elements_text(phrase->'reponses') r WHERE public.quiz_norm_answer(r.value)=typed AND typed<>''
     ) THEN phrase_score:=phrase_score+2; END IF;
     IF chosen<>'' THEN used:=array_append(used,chosen); END IF;
     earned:=earned+least(per_phrase,phrase_score);
     exp_display:=concat_ws(' · ',nullif(exp_display,''),phrase->>'verbe'||' → '||(SELECT string_agg(value,' / ') FROM jsonb_array_elements_text(phrase->'reponses')));
   END LOOP;
   maxpts:=n*per_phrase; ok:=n>0 AND earned=maxpts;
 ELSE
   exp_display := '';
   exp_parts := public.quiz_expected_answers_list(q);
   IF jsonb_array_length(exp_parts)=0 THEN exp_parts:=jsonb_build_array(expected); END IF;
   BEGIN stu_parts:=raw::jsonb; IF jsonb_typeof(stu_parts)<>'array' THEN stu_parts:='[]'; END IF;
   EXCEPTION WHEN OTHERS THEN
     IF jsonb_array_length(exp_parts)>1 AND position(' | ' IN raw)>0 THEN
       SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO stu_parts FROM regexp_split_to_table(raw,'\s*\|\s*') x;
     ELSE stu_parts:=jsonb_build_array(raw); END IF;
   END;
   n:=greatest(1,jsonb_array_length(exp_parts));
   FOR idx IN 0..n-1 LOOP
     item:=exp_parts->idx;
     IF jsonb_typeof(item)='array' THEN
       part_ok:=EXISTS(SELECT 1 FROM jsonb_array_elements_text(item) AS a(value) WHERE public.quiz_text_matches(coalesce(stu_parts->>idx,''),a.value));
       part:=(SELECT string_agg(value,' / ') FROM jsonb_array_elements_text(item));
     ELSE
       part:=coalesce(item#>>'{}',''); part_ok:=public.quiz_text_matches(coalesce(stu_parts->>idx,''),part);
     END IF;
     IF part_ok THEN correct_n:=correct_n+1; END IF;
     exp_display:=concat_ws(' · ',nullif(exp_display,''),CASE WHEN n>1 THEN 'Case '|| (idx+1)||': ' ELSE '' END||part);
   END LOOP;
   IF n>1 THEN
     maxpts:=greatest(pts,n); earned:=round(correct_n*maxpts/n,2);
     student_display:='';
     FOR idx IN 0..n-1 LOOP student_display:=concat_ws(' · ',nullif(student_display,''),'Case '||(idx+1)||': '||coalesce(stu_parts->>idx,'—')); END LOOP;
   ELSE earned:=CASE WHEN correct_n=1 THEN pts ELSE 0 END; END IF;
   ok:=correct_n=n;
 END IF;
 RETURN jsonb_build_object('correct',ok,'points',round(earned,2),'maxPoints',round(maxpts,2),'expected',coalesce(exp_display,expected),'studentAnswer',student_display,'explanation',q->'explanation');
END $function$

NOTIFY pgrst,'reload schema';
