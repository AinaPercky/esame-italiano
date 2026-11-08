-- Add verb-bank conjugation questions to composite written exams.
-- Existing question types and stored attempts remain untouched.
alter table public.written_exam_questions
  drop constraint if exists written_exam_questions_question_type_check;
alter table public.written_exam_questions
  add constraint written_exam_questions_question_type_check
  check (question_type in ('qcm','text','reorder','verbes_trous'));

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
 if exists(select 1 from public.written_exam_attempts where exam_id=v_exam_id) then
   if exists(select 1 from public.written_exam_versions where exam_id=v_exam_id and status='draft') then
     null;
   end if;
 end if;
 insert into public.written_exams(id,title,description,level,target_language,instruction_language,duration_minutes,opens_at,closes_at,status,display_scale,max_attempts,shuffle_sections,shuffle_questions,shuffle_options,navigation_mode,show_score_after_publish,show_corrections_after_publish,integrity_settings,updated_at)
 values(v_exam_id,btrim(p_definition->>'title'),coalesce(p_definition->>'description',''),nullif(p_definition->>'level',''),coalesce(p_definition->>'target_language','it'),coalesce(p_definition->>'instruction_language','fr'),(p_definition->>'duration_minutes')::integer,nullif(p_definition->>'opens_at','')::timestamptz,nullif(p_definition->>'closes_at','')::timestamptz,'draft',nullif(p_definition->>'display_scale','')::numeric,coalesce((p_definition->>'max_attempts')::integer,1),coalesce((p_definition->>'shuffle_sections')::boolean,true),coalesce((p_definition->>'shuffle_questions')::boolean,true),coalesce((p_definition->>'shuffle_options')::boolean,true),coalesce(p_definition->>'navigation_mode','free'),coalesce((p_definition->>'show_score_after_publish')::boolean,true),coalesce((p_definition->>'show_corrections_after_publish')::boolean,false),coalesce(p_definition->'integrity_settings','{}'::jsonb),now())
 on conflict(id) do update set title=excluded.title,description=excluded.description,level=excluded.level,target_language=excluded.target_language,instruction_language=excluded.instruction_language,duration_minutes=excluded.duration_minutes,opens_at=excluded.opens_at,closes_at=excluded.closes_at,display_scale=excluded.display_scale,max_attempts=excluded.max_attempts,shuffle_sections=excluded.shuffle_sections,shuffle_questions=excluded.shuffle_questions,shuffle_options=excluded.shuffle_options,navigation_mode=excluded.navigation_mode,show_score_after_publish=excluded.show_score_after_publish,show_corrections_after_publish=excluded.show_corrections_after_publish,integrity_settings=excluded.integrity_settings,updated_at=now()
 where public.written_exam_is_teacher();
 delete from public.written_exam_classes where exam_id=v_exam_id;
 for v_class_id in select value::uuid from jsonb_array_elements_text(coalesce(p_definition->'class_ids','[]'::jsonb)) loop
   insert into public.written_exam_classes(exam_id,class_id) values(v_exam_id,v_class_id);
 end loop;

 select id,version_number into v_version_id,v_version_no from public.written_exam_versions
 where exam_id=v_exam_id and status='draft' order by version_number desc limit 1 for update;
 if v_version_id is null then
   select coalesce(max(version_number),0)+1 into v_version_no from public.written_exam_versions where exam_id=v_exam_id;
   insert into public.written_exam_versions(exam_id,version_number,status) values(v_exam_id,v_version_no,'draft') returning id into v_version_id;
 else
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
     -- Allowlist only fields needed by the student UI; never forward arbitrary imported option/item properties.
     v_public := jsonb_strip_nulls(jsonb_build_object(
       'type',case when v_question->>'type'='verbes_trous' then 'text' else v_question->>'type' end,
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


create or replace function public.validate_verbes_trous_published_version()
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
  v_expected record;
begin
  if new.status <> 'published' or old.status = 'published' then
    return new;
  end if;

  for v_q in
    select q.id, q.points, q.public_data, k.answer_key
    from public.written_exam_questions q
    join public.written_exam_sections s on s.id=q.section_id
    left join public.written_exam_answer_keys k on k.question_id=q.id
    where s.version_id=new.id and q.question_type='verbes_trous'
  loop
    v_public := v_q.public_data->'verbes_trous';
    v_key := v_q.answer_key;
    if jsonb_typeof(v_public) is distinct from 'object' or jsonb_typeof(v_key->'phrases') is distinct from 'array' then
      raise exception 'Question « verbes à trous » : configuration ou corrigé manquant.';
    end if;
    v_bank := v_public->'banque';
    v_phrases := v_public->'phrases';
    v_keys := v_key->'phrases';
    if jsonb_typeof(v_bank) is distinct from 'array' or jsonb_typeof(v_phrases) is distinct from 'array' or jsonb_typeof(v_keys) is distinct from 'array' then
      raise exception 'Question « verbes à trous » : banque et phrases doivent être des listes.';
    end if;
    v_count := jsonb_array_length(v_phrases);
    v_bank_count := jsonb_array_length(v_bank);
    if v_count<1 or v_bank_count<v_count or jsonb_array_length(v_keys)<>v_count then
      raise exception 'Question « verbes à trous » : la banque doit contenir au moins autant de verbes que de phrases.';
    end if;
    if exists(select 1 from jsonb_array_elements_text(v_bank) b where nullif(btrim(b),'') is null) then
      raise exception 'Question « verbes à trous » : la banque contient un verbe vide.';
    end if;
    select count(distinct lower(btrim(value))) into v_unique_bank
    from jsonb_array_elements_text(v_bank);
    if v_unique_bank<>v_bank_count then
      raise exception 'Question « verbes à trous » : la banque contient des doublons.';
    end if;
    select count(distinct lower(btrim(coalesce(value->>'verbe','')))) into v_unique_expected
    from jsonb_array_elements(v_keys);
    if v_unique_expected<>v_count then
      raise exception 'Question « verbes à trous » : chaque phrase doit avoir un verbe attendu différent.';
    end if;
    if (select count(distinct value->>'id') from jsonb_array_elements(v_phrases))<>v_count
      or exists(select 1 from jsonb_array_elements(v_phrases) p where nullif(btrim(p.value->>'id'),'') is null)
      or exists(select 1 from jsonb_array_elements(v_keys) k where not exists(select 1 from jsonb_array_elements(v_phrases) p where p.value->>'id'=k.value->>'id')) then
      raise exception 'Question « verbes à trous » : les identifiants des phrases doivent être présents et uniques.';
    end if;
    if v_q.points<>v_count*3 then
      raise exception 'Question « verbes à trous » : le barème doit être de 3 points par phrase.';
    end if;
    for v_expected in select value from jsonb_array_elements(v_keys)
    loop
      if nullif(btrim(v_expected.value->>'verbe'),'') is null
        or not exists(select 1 from jsonb_array_elements_text(v_bank) b where lower(btrim(b))=lower(btrim(v_expected.value->>'verbe')))
      then
        raise exception 'Question « verbes à trous » : chaque phrase doit avoir un verbe présent dans la banque.';
      end if;
      if jsonb_typeof(v_expected.value->'reponses') is distinct from 'array' then
        raise exception 'Question « verbes à trous » : ajoutez une liste de conjugaisons acceptées pour chaque phrase.';
      end if;
      if jsonb_array_length(v_expected.value->'reponses')<1
        or not exists(select 1 from jsonb_array_elements_text(v_expected.value->'reponses') a where nullif(btrim(a),'') is not null)
      then
        raise exception 'Question « verbes à trous » : chaque phrase doit avoir au moins une conjugaison acceptée.';
      end if;
    end loop;
  end loop;
  return new;
end
$validate$;

drop trigger if exists written_exam_validate_verbes_trous on public.written_exam_versions;
create trigger written_exam_validate_verbes_trous
before update of status on public.written_exam_versions
for each row execute function public.validate_verbes_trous_published_version();

-- The existing submit RPC remains the authority for attempt ownership, timing and locking.
-- This trigger adds the 1+2 phrase-level score after the RPC has inserted section results.
create or replace function public.apply_verbes_trous_attempt_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $score$
declare
  v_q record;
  v_phrase jsonb;
  v_student_answer jsonb;
  v_phrase_answer jsonb;
  v_expected_verb text;
  v_chosen_verb text;
  v_typed text;
  v_phrase_points numeric;
  v_added numeric:=0;
  v_question_added numeric;
  v_section_id uuid;
  v_display_scale numeric;
  v_used_verbs text[];
begin
  if old.status<>'in_progress' or new.status='in_progress' then
    return new;
  end if;

  for v_q in
    select q.id,q.section_id,q.points,k.answer_key
    from public.written_exam_questions q
    join public.written_exam_sections s on s.id=q.section_id
    join public.written_exam_answer_keys k on k.question_id=q.id
    where s.version_id=new.version_id and q.question_type='verbes_trous'
  loop
    v_student_answer := new.answers->v_q.id::text;
    if jsonb_typeof(v_student_answer)='string' and left(coalesce(v_student_answer#>>'{}',''),1)='{'
    then
      v_student_answer := (v_student_answer#>>'{}')::jsonb;
    end if;
    v_question_added:=0;
    v_used_verbs:=array[]::text[];
    for v_phrase in select value from jsonb_array_elements(v_q.answer_key->'phrases')
    loop
      v_phrase_answer:=v_student_answer->(v_phrase->>'id');
      v_chosen_verb:=lower(regexp_replace(btrim(coalesce(v_phrase_answer->>'verbe_choisi','')),'\s+',' ','g'));
      v_expected_verb:=lower(regexp_replace(btrim(coalesce(v_phrase->>'verbe','')),'\s+',' ','g'));
      v_typed:=lower(regexp_replace(btrim(coalesce(v_phrase_answer->>'texte_saisi','')),'\s+',' ','g'));
      v_phrase_points:=0;
      if v_chosen_verb<>'' and not (v_chosen_verb=any(v_used_verbs)) then
        v_used_verbs:=array_append(v_used_verbs,v_chosen_verb);
        if v_chosen_verb=v_expected_verb then v_phrase_points:=v_phrase_points+1; end if;
        if v_typed<>'' and exists(
          select 1 from jsonb_array_elements_text(coalesce(v_phrase->'reponses','[]'::jsonb)) accepted(value)
          where lower(regexp_replace(btrim(accepted.value),'\s+',' ','g'))=v_typed
        ) then v_phrase_points:=v_phrase_points+2; end if;
      end if;
      v_question_added:=v_question_added+v_phrase_points;
    end loop;
    v_added:=v_added+v_question_added;
    update public.written_exam_section_results
      set raw_score=raw_score+v_question_added
      where attempt_id=new.id and section_id=v_q.section_id;
  end loop;

  if v_added>0 then
    select display_scale into v_display_scale from public.written_exam_versions where id=new.version_id;
    update public.written_exam_attempts
    set auto_score=coalesce(new.auto_score,0)+v_added,
        raw_score=case when new.needs_manual_review then null else coalesce(new.raw_score,0)+v_added end,
        normalized_score=case when not new.needs_manual_review and new.raw_max>0 and v_display_scale is not null
          then round((coalesce(new.raw_score,0)+v_added)/new.raw_max*v_display_scale,2) else null end,
        updated_at=now()
    where id=new.id;
  end if;
  return new;
end
$score$;

drop trigger if exists written_exam_verbes_trous_score on public.written_exam_attempts;
create trigger written_exam_verbes_trous_score
after update of status on public.written_exam_attempts
for each row execute function public.apply_verbes_trous_attempt_score();

notify pgrst,'reload schema';
