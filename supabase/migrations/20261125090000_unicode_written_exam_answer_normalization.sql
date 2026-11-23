-- Aligne la correction automatique des examens écrits sur la normalisation Unicode
-- commune aux quiz et aux exercices. Les réponses restent comparées exactement après NFC.

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
            where public.quiz_norm_answer(e)=
              public.quiz_norm_answer(coalesce(v_actual->>v_idx,''))
          ) then v_hits:=v_hits+1; end if;
        elsif public.quiz_norm_answer(coalesce(v_expected->>v_idx,''))=
          public.quiz_norm_answer(coalesce(v_actual->>v_idx,'')) then
          v_hits:=v_hits+1;
        end if;
      end loop;
      return round(v_q.points*v_hits/nullif(v_count,0),2);
    end if;
    v_answer_text:=coalesce(p_answer#>>'{}','');
    if exists(
      select 1 from jsonb_array_elements_text(coalesce(v_key->'acceptedAnswers','[]'::jsonb)) e
      where public.quiz_norm_answer(e)=
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
      v_chosen:=public.quiz_norm_answer(coalesce(v_phrase_answer->>'verbe_choisi',''));
      v_expected_verb:=public.quiz_norm_answer(coalesce(v_phrase->>'verbe',''));
      v_typed:=public.quiz_norm_answer(coalesce(v_phrase_answer->>'texte_saisi',''));
      if v_chosen<>'' and not (v_chosen=any(v_used))
        and exists(
          select 1 from jsonb_array_elements_text(coalesce(v_q.public_data->'verbes_trous'->'banque','[]'::jsonb)) b(value)
          where public.quiz_norm_answer(b.value)=v_chosen
        ) then
        v_used:=array_append(v_used,v_chosen);
        if v_chosen=v_expected_verb then v_points:=v_points+1; end if;
        if v_typed<>'' and exists(
          select 1 from jsonb_array_elements_text(coalesce(v_phrase->'reponses','[]'::jsonb)) a(value)
          where public.quiz_norm_answer(a.value)=v_typed
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

NOTIFY pgrst, 'reload schema';
