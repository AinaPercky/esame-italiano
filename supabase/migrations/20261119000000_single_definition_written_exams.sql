-- A written exam has one current definition. The two A1/L135 JSON templates
-- remain static application templates and never become database records.
-- Archived legacy rows are retained only when historical attempts still reference them.

drop trigger if exists written_exam_versions_immutable on public.written_exam_versions;
drop trigger if exists written_questions_immutable on public.written_exam_questions;
drop trigger if exists written_answer_keys_immutable on public.written_exam_answer_keys;
drop trigger if exists written_exam_version_classes_immutable on public.written_exam_version_classes;

create or replace function public.guard_written_exam_version_immutable()
returns trigger
language plpgsql
set search_path = ''
as $guard$
begin
  if tg_op='DELETE' then
    if exists(select 1 from public.written_exam_attempts a where a.version_id=old.id) then
      raise exception 'La définition de cet examen est conservée car des tentatives y sont rattachées.';
    end if;
    return old;
  end if;

  if new.exam_id is distinct from old.exam_id or new.version_number is distinct from old.version_number then
    raise exception 'L’identité de la définition d’un examen ne peut pas être modifiée.';
  end if;

  if exists(select 1 from public.written_exam_attempts a where a.version_id=old.id)
     and (to_jsonb(new)-array['locked_at','shuffle_questions','navigation_mode']) is distinct from (to_jsonb(old)-array['locked_at','shuffle_questions','navigation_mode']) then
    raise exception 'Le contenu d’un examen ayant des tentatives est verrouillé pour préserver les copies.';
  end if;
  return new;
end
$guard$;

create or replace function public.guard_written_question_published_version()
returns trigger
language plpgsql
set search_path = ''
as $guard$
declare
  v_old_section uuid;
  v_new_section uuid;
  v_old_version uuid;
  v_new_version uuid;
begin
  if tg_op<>'INSERT' then v_old_section:=old.section_id; end if;
  if tg_op<>'DELETE' then v_new_section:=new.section_id; end if;
  if v_old_section is not null then
    select version_id into v_old_version from public.written_exam_sections where id=v_old_section;
  end if;
  if v_new_section is not null then
    select version_id into v_new_version from public.written_exam_sections where id=v_new_section;
  end if;
  if exists(select 1 from public.written_exam_attempts a where a.version_id in (v_old_version,v_new_version)) then
    raise exception 'Le contenu d’un examen ayant des tentatives est verrouillé. Créez un nouvel examen pour un autre sujet.';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end
$guard$;

create or replace function public.guard_written_answer_key_published_version()
returns trigger
language plpgsql
set search_path = ''
as $guard$
declare
  v_old_version uuid;
  v_new_version uuid;
begin
  if tg_op<>'INSERT' then
    select s.version_id into v_old_version
    from public.written_exam_questions q
    join public.written_exam_sections s on s.id=q.section_id
    where q.id=old.question_id;
  end if;
  if tg_op<>'DELETE' then
    select s.version_id into v_new_version
    from public.written_exam_questions q
    join public.written_exam_sections s on s.id=q.section_id
    where q.id=new.question_id;
  end if;
  if exists(select 1 from public.written_exam_attempts a where a.version_id in (v_old_version,v_new_version)) then
    raise exception 'Le corrigé d’un examen ayant des tentatives est verrouillé.';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end
$guard$;

create or replace function public.guard_written_version_class_immutable()
returns trigger
language plpgsql
set search_path = ''
as $guard$
declare
  v_old_id uuid;
  v_new_id uuid;
begin
  if tg_op<>'INSERT' then v_old_id:=old.version_id; end if;
  if tg_op<>'DELETE' then v_new_id:=new.version_id; end if;
  if exists(select 1 from public.written_exam_attempts a where a.version_id in (v_old_id,v_new_id)) then
    raise exception 'Les classes d’un examen ayant des tentatives ne peuvent plus être modifiées.';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end
$guard$;

create or replace function public.guard_written_exam_section_attempts()
returns trigger
language plpgsql
set search_path = ''
as $guard$
declare
  v_old_version uuid;
  v_new_version uuid;
begin
  if tg_op<>'INSERT' then v_old_version:=old.version_id; end if;
  if tg_op<>'DELETE' then v_new_version:=new.version_id; end if;
  if exists(select 1 from public.written_exam_attempts a where a.version_id in (v_old_version,v_new_version)) then
    raise exception 'Les sections d’un examen ayant des tentatives ne peuvent plus être modifiées.';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end
$guard$;

create trigger written_exam_versions_immutable
before update or delete on public.written_exam_versions
for each row execute function public.guard_written_exam_version_immutable();
create trigger written_questions_immutable
before insert or update or delete on public.written_exam_questions
for each row execute function public.guard_written_question_published_version();
create trigger written_answer_keys_immutable
before insert or update or delete on public.written_exam_answer_keys
for each row execute function public.guard_written_answer_key_published_version();
create trigger written_exam_version_classes_immutable
before insert or update or delete on public.written_exam_version_classes
for each row execute function public.guard_written_version_class_immutable();

drop trigger if exists written_exam_sections_attempts_guard on public.written_exam_sections;
create trigger written_exam_sections_attempts_guard
before insert or update or delete on public.written_exam_sections
for each row execute function public.guard_written_exam_section_attempts();

-- Prefer a definition already referenced by attempts; otherwise keep the newest draft,
-- then the newest published definition. Older rows are archived, never deleted.
with ranked as (
  select v.id,
         row_number() over (
           partition by v.exam_id
           order by case
                      when exists(select 1 from public.written_exam_attempts a where a.version_id=v.id) then 0
                      when v.status='draft' then 1
                      when v.status='published' then 2
                      else 3
                    end,
                    v.version_number desc, v.created_at desc
         ) as position
  from public.written_exam_versions v
  where v.status in ('draft','published')
)
update public.written_exam_versions v
set status='archived'
from ranked r
where r.id=v.id and r.position>1;

create unique index if not exists written_exam_one_current_definition
on public.written_exam_versions(exam_id)
where status in ('draft','published');

-- Keep the parent lifecycle state consistent with the single active definition.
-- A published definition referenced by attempts remains the student's copy source.
update public.written_exams e
set status='published'
where e.status='draft'
  and exists (
    select 1 from public.written_exam_versions v
    where v.exam_id=e.id and v.status='published'
      and exists(select 1 from public.written_exam_attempts a where a.version_id=v.id)
  );

-- If only a draft definition remains, the exam must not appear as publishable.
update public.written_exams e
set status='draft'
where e.status in ('published','scheduled','open')
  and exists(select 1 from public.written_exam_versions v where v.exam_id=e.id and v.status='draft')
  and not exists(select 1 from public.written_exam_versions v where v.exam_id=e.id and v.status='published');

create or replace function public.list_available_written_exams()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $written$
declare
  v_student public.students%rowtype;
  v_result jsonb;
begin
  select * into v_student
  from public.students
  where lower(email)=lower(auth.jwt()->>'email')
    and coalesce(validation_status,'approved')='approved'
  limit 1;

  if not found then
    raise exception 'Fiche élève active introuvable.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,
    'title',v.title,
    'description',v.description,
    'level',v.level,
    'target_language',v.target_language,
    'instruction_language',v.instruction_language,
    'duration_minutes',v.duration_minutes,
    'display_scale',v.display_scale,
    'status',e.status,
    'opens_at',v.opens_at,
    'closes_at',v.closes_at,
    'raw_max',v.raw_max,
    'version_id',v.id,
    'class_eligible',exists(
      select 1 from public.written_exam_version_classes ec
      where ec.version_id=v.id and ec.class_id=v_student.class_id
    ),
    'integrity_settings',v.integrity_settings,
    'max_attempts',v.max_attempts,
    'navigation_mode',v.navigation_mode,
    'sections',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'title',s.title,
        'group_name',s.group_name,
        'instructions',s.instructions,
        'max_points',s.max_points,
        'support_text',s.support_text,
        'support_url',s.support_url
      ) order by s.position),'[]'::jsonb)
      from public.written_exam_sections s where s.version_id=v.id
    ),
    'attempts_used',(
      select count(*) from public.written_exam_attempts x
      where x.exam_id=e.id and x.student_id=v_student.id
    ),
    'attempt_status',a.status,
    'attempt_version_id',a.version_id,
    'attempt_raw_max',a.raw_max,
    'attempt_display_scale',av.display_scale,
    'results_published',coalesce(a.results_published,false),
    'raw_score',case
      when a.results_published and coalesce(av.show_score_after_publish,v.show_score_after_publish)
      then a.raw_score else null end,
    'normalized_score',case
      when a.results_published and coalesce(av.show_score_after_publish,v.show_score_after_publish)
      then a.normalized_score else null end,
    'show_score_after_publish',coalesce(av.show_score_after_publish,v.show_score_after_publish),
    'show_corrections_after_publish',case
      when a.results_published then coalesce(e.show_corrections_after_publish,true)
      else coalesce(av.show_corrections_after_publish,v.show_corrections_after_publish)
    end
  ) order by v.opens_at nulls first,e.created_at desc),'[]'::jsonb)
  into v_result
  from public.written_exams e
  left join lateral (
    select *
    from public.written_exam_attempts aa
    where aa.exam_id=e.id and aa.student_id=v_student.id
    order by aa.attempt_number desc
    limit 1
  ) a on true
  join lateral (
    select vv.*
    from public.written_exam_versions vv
    where vv.id=coalesce(a.version_id,(
      select current_definition.id
      from public.written_exam_versions current_definition
      where current_definition.exam_id=e.id
        and current_definition.status='published'
        and exists(
          select 1 from public.written_exam_version_classes ec
          where ec.version_id=current_definition.id and ec.class_id=v_student.class_id
        )
      order by current_definition.version_number desc
      limit 1
    ))
  ) v on true
  left join public.written_exam_versions av on av.id=a.version_id
  where (
    (a.status='in_progress' and e.status in ('published','scheduled','open'))
    or (e.status in ('published','scheduled','open')
      and (v.opens_at is null or v.opens_at<=now())
      and (v.closes_at is null or v.closes_at>now()))
    or (a.id is not null and e.status in ('published','scheduled','open','closed','grading','results_published','draft'))
  );

  return v_result;
end
$written$;



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
 order by version_number desc
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
     -- Allowlist only fields needed by the student UI; never forward arbitrary imported option/item properties.
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



revoke all on function public.list_available_written_exams() from public;
grant execute on function public.list_available_written_exams() to authenticated;
notify pgrst,'reload schema';
