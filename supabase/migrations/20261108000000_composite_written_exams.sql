-- Composite written exams: additive, isolated schema. Never alters oral exams or quiz tables.
create extension if not exists pgcrypto;

create or replace function public.written_exam_is_teacher()
returns boolean language sql stable security definer set search_path = ''
as $written$
  select lower(coalesce(auth.jwt()->>'email','')) = 'ainapercky@gmail.com';
$written$;
revoke all on function public.written_exam_is_teacher() from public;
grant execute on function public.written_exam_is_teacher() to authenticated;

create table if not exists public.written_exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  level text,
  target_language text not null default 'it',
  instruction_language text not null default 'fr',
  duration_minutes integer not null check (duration_minutes > 0),
  opens_at timestamptz,
  closes_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft','scheduled','published','open','closed','grading','results_published')),
  display_scale numeric(8,2) check (display_scale is null or display_scale>0),
  max_attempts integer not null default 1 check (max_attempts between 1 and 10),
  shuffle_sections boolean not null default true,
  shuffle_questions boolean not null default true,
  shuffle_options boolean not null default true,
  navigation_mode text not null default 'free' check (navigation_mode in ('free','sequential')),
  show_score_after_publish boolean not null default true,
  show_corrections_after_publish boolean not null default false,
  integrity_settings jsonb not null default '{"fullscreen":false,"warn_on_tab_switch":true,"watermark":false}'::jsonb,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.written_exam_classes (
  exam_id uuid not null references public.written_exams(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete restrict,
  primary key (exam_id,class_id)
);

create table if not exists public.written_exam_versions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.written_exams(id) on delete cascade,
  version_number integer not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  raw_max numeric(9,2) not null default 0,
  title text not null default '',
  description text not null default '',
  level text,
  target_language text not null default 'it',
  instruction_language text not null default 'fr',
  duration_minutes integer not null default 90 check (duration_minutes>0),
  display_scale numeric(8,2) check (display_scale is null or display_scale>0),
  opens_at timestamptz,
  closes_at timestamptz,
  shuffle_sections boolean not null default true,
  shuffle_questions boolean not null default true,
  shuffle_options boolean not null default true,
  navigation_mode text not null default 'free' check (navigation_mode in ('free','sequential')),
  integrity_settings jsonb not null default '{}'::jsonb,
  max_attempts integer not null default 1 check (max_attempts between 1 and 10),
  show_score_after_publish boolean not null default true,
  show_corrections_after_publish boolean not null default false,
  published_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(exam_id,version_number),
  unique(exam_id,id)
);

create table if not exists public.written_exam_version_classes (
  version_id uuid not null references public.written_exam_versions(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete restrict,
  primary key(version_id,class_id)
);

create table if not exists public.written_exam_sections (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.written_exam_versions(id) on delete cascade,
  section_key text not null,
  title text not null,
  instructions text not null default '',
  group_name text,
  category text,
  max_points numeric(9,2) not null default 0 check (max_points >= 0),
  position integer not null,
  shuffle boolean not null default true,
  fixed_position boolean not null default false,
  support_text text,
  support_url text,
  unique(version_id,section_key),
  unique(version_id,position)
);

create table if not exists public.written_exam_questions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.written_exam_sections(id) on delete cascade,
  question_key text not null,
  position integer not null,
  question_type text not null check (question_type in ('qcm','text','reorder')),
  prompt text not null,
  points numeric(9,2) not null check (points > 0),
  public_data jsonb not null default '{}'::jsonb,
  manual_review boolean not null default false,
  shuffle_options boolean not null default true,
  source_quiz_id text,
  source_question_id text,
  created_at timestamptz not null default now(),
  unique(section_id,question_key),
  unique(section_id,position)
);

create table if not exists public.written_exam_answer_keys (
  question_id uuid primary key references public.written_exam_questions(id) on delete cascade,
  answer_key jsonb not null,
  explanation text
);

create table if not exists public.written_exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.written_exams(id) on delete restrict,
  version_id uuid not null references public.written_exam_versions(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete cascade,
  attempt_number integer not null default 1,
  status text not null default 'in_progress'
    check (status in ('in_progress','submitted','timed_out','needs_review','graded')),
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  order_manifest jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  auto_score numeric(9,2) not null default 0,
  manual_scores jsonb not null default '{}'::jsonb,
  raw_score numeric(9,2),
  raw_max numeric(9,2) not null,
  normalized_score numeric(9,2),
  needs_manual_review boolean not null default false,
  results_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(exam_id,student_id,attempt_number),
  constraint written_attempt_version_matches_exam foreign key(exam_id,version_id) references public.written_exam_versions(exam_id,id) on delete restrict
);
create unique index if not exists written_exam_one_active_attempt
  on public.written_exam_attempts(exam_id,student_id) where status='in_progress';

create table if not exists public.written_exam_section_results (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.written_exam_attempts(id) on delete cascade,
  section_id uuid not null references public.written_exam_sections(id) on delete restrict,
  raw_score numeric(9,2) not null default 0,
  raw_max numeric(9,2) not null default 0,
  manual_score numeric(9,2) not null default 0,
  unique(attempt_id,section_id)
);

create table if not exists public.written_exam_integrity_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.written_exam_attempts(id) on delete cascade,
  event_type text not null check (event_type in ('visibility_hidden','window_blur','fullscreen_exit','fullscreen_enter','copy_attempt','paste_attempt','connection_lost','connection_restored')),
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);

create index if not exists written_exams_status_idx on public.written_exams(status,opens_at,closes_at);
create index if not exists written_exam_classes_class_idx on public.written_exam_classes(class_id);
create index if not exists written_exam_versions_exam_idx on public.written_exam_versions(exam_id,version_number desc);
create index if not exists written_exam_sections_version_idx on public.written_exam_sections(version_id,position);
create index if not exists written_exam_questions_section_idx on public.written_exam_questions(section_id,position);
create index if not exists written_exam_attempts_student_idx on public.written_exam_attempts(student_id,started_at desc);
create index if not exists written_exam_attempts_exam_idx on public.written_exam_attempts(exam_id,status);

-- Published definitions are immutable. Edits create a new draft version.
create or replace function public.guard_written_exam_published_version()
returns trigger language plpgsql set search_path = public as $written$
declare v_old_version uuid; v_new_version uuid;
begin
 if tg_op<>'INSERT' then v_old_version:=old.version_id; end if;
 if tg_op<>'DELETE' then v_new_version:=new.version_id; end if;
 if exists(select 1 from public.written_exam_versions where id in (v_old_version,v_new_version) and status='published') then
   raise exception 'Une version publiée est immuable. Créez une nouvelle version brouillon.';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $written$;
create or replace function public.guard_written_question_published_version()
returns trigger language plpgsql set search_path = public as $written$
declare v_old_section uuid; v_new_section uuid; v_old_version uuid; v_new_version uuid;
begin
 if tg_op<>'INSERT' then v_old_section:=old.section_id; end if;
 if tg_op<>'DELETE' then v_new_section:=new.section_id; end if;
 if v_old_section is not null then select version_id into v_old_version from public.written_exam_sections where id=v_old_section; end if;
 if v_new_section is not null then select version_id into v_new_version from public.written_exam_sections where id=v_new_section; end if;
 if exists(select 1 from public.written_exam_versions where id in (v_old_version,v_new_version) and status='published') then
   raise exception 'Une version publiée est immuable. Créez une nouvelle version brouillon.';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $written$;
create or replace function public.guard_written_answer_key_published_version()
returns trigger language plpgsql set search_path = public as $written$
declare v_old_question uuid; v_new_question uuid; v_old_version uuid; v_new_version uuid;
begin
 if tg_op<>'INSERT' then v_old_question:=old.question_id; end if;
 if tg_op<>'DELETE' then v_new_question:=new.question_id; end if;
 if v_old_question is not null then
   select s.version_id into v_old_version from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where q.id=v_old_question;
 end if;
 if v_new_question is not null then
   select s.version_id into v_new_version from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where q.id=v_new_question;
 end if;
 if exists(select 1 from public.written_exam_versions where id in (v_old_version,v_new_version) and status='published') then
   raise exception 'Une version publiée est immuable. Créez une nouvelle version brouillon.';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $written$;
drop trigger if exists written_questions_immutable on public.written_exam_questions;
create trigger written_questions_immutable before insert or update or delete on public.written_exam_questions
for each row execute function public.guard_written_question_published_version();
drop trigger if exists written_answer_keys_immutable on public.written_exam_answer_keys;
create trigger written_answer_keys_immutable before insert or update or delete on public.written_exam_answer_keys
for each row execute function public.guard_written_answer_key_published_version();

create or replace function public.guard_written_exam_version_immutable()
returns trigger language plpgsql set search_path = public as $written$
begin
 if tg_op='DELETE' then
   if old.status='published' then raise exception 'Une version publiée ne peut pas être supprimée.'; end if;
   return old;
 end if;
 if old.status='published' and (
   new.exam_id is distinct from old.exam_id or new.version_number is distinct from old.version_number or
   new.status is distinct from old.status or new.raw_max is distinct from old.raw_max or
   new.title is distinct from old.title or new.description is distinct from old.description or new.level is distinct from old.level or
   new.target_language is distinct from old.target_language or new.instruction_language is distinct from old.instruction_language or
   new.duration_minutes is distinct from old.duration_minutes or new.display_scale is distinct from old.display_scale or
   new.opens_at is distinct from old.opens_at or new.closes_at is distinct from old.closes_at or
   new.shuffle_sections is distinct from old.shuffle_sections or new.shuffle_questions is distinct from old.shuffle_questions or
   new.shuffle_options is distinct from old.shuffle_options or new.navigation_mode is distinct from old.navigation_mode or new.integrity_settings is distinct from old.integrity_settings or
   new.max_attempts is distinct from old.max_attempts or new.show_score_after_publish is distinct from old.show_score_after_publish or
   new.show_corrections_after_publish is distinct from old.show_corrections_after_publish or new.published_at is distinct from old.published_at
 ) then raise exception 'Une version publiée est immuable.'; end if;
 return new;
end $written$;
drop trigger if exists written_exam_versions_immutable on public.written_exam_versions;
create trigger written_exam_versions_immutable before update or delete on public.written_exam_versions
for each row execute function public.guard_written_exam_version_immutable();

create or replace function public.guard_written_version_class_immutable()
returns trigger language plpgsql set search_path = public as $written$
declare v_old_id uuid; v_new_id uuid;
begin
 if tg_op<>'INSERT' then v_old_id:=old.version_id; end if;
 if tg_op<>'DELETE' then v_new_id:=new.version_id; end if;
 if exists(select 1 from public.written_exam_versions where id in (v_old_id,v_new_id) and status='published') then
   raise exception 'Les classes d’une version publiée sont immuables.';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $written$;
drop trigger if exists written_exam_version_classes_immutable on public.written_exam_version_classes;
create trigger written_exam_version_classes_immutable before insert or update or delete on public.written_exam_version_classes
for each row execute function public.guard_written_version_class_immutable();

-- All tables are private by default. Students use only the RPCs below.
do $written$
declare t text;
begin
 foreach t in array array['written_exams','written_exam_classes','written_exam_versions','written_exam_version_classes','written_exam_sections','written_exam_questions','written_exam_answer_keys','written_exam_attempts','written_exam_section_results','written_exam_integrity_events'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('drop policy if exists written_teacher_all on public.%I',t);
   execute format('create policy written_teacher_all on public.%I for all to authenticated using (public.written_exam_is_teacher()) with check (public.written_exam_is_teacher())',t);
 end loop;
end $written$;

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
     v_key := coalesce(v_question->'answer_key',jsonb_strip_nulls(jsonb_build_object('correctOptionId',v_question->'correctOptionId','acceptedAnswers',v_question->'acceptedAnswers','correctOrder',v_question->'correctOrder','answers',v_question->'answers','correct_answer',v_question->'correct_answer')));
     if jsonb_typeof(v_key)<>'object' then raise exception 'La clé de correction doit être un objet JSON.'; end if;
     -- Allowlist only fields needed by the student UI; never forward arbitrary imported option/item properties.
     v_public := jsonb_strip_nulls(jsonb_build_object(
       'type',v_question->>'type',
       'blank_count',case when coalesce(v_question->>'blank_count','') ~ '^[0-9]+(section_id,question_key,position,question_type,prompt,points,public_data,manual_review,shuffle_options,source_quiz_id,source_question_id)
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

create or replace function public.get_written_exam_definition(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare v_result jsonb;
begin
 if not public.written_exam_is_teacher() then raise exception 'Accès enseignant requis.'; end if;
 select to_jsonb(e) || jsonb_build_object('class_ids',coalesce((select jsonb_agg(class_id) from public.written_exam_classes where exam_id=e.id),'[]'::jsonb),
 'versions',coalesce((select jsonb_agg(to_jsonb(v) order by v.version_number desc) from public.written_exam_versions v where v.exam_id=e.id),'[]'::jsonb))
 into v_result from public.written_exams e where e.id=p_exam_id;
 return v_result;
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
 select coalesce(sum(q.points),0),count(*),count(*) filter(where q.prompt='' or q.public_data->>'type' not in ('qcm','text','reorder'))
 into v_raw,v_count,v_bad from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where s.version_id=p_version_id;
 if v_count=0 or v_bad>0 then raise exception 'L’examen contient des questions invalides ou est vide.'; end if;
 if exists(select 1 from public.written_exam_sections s where s.version_id=p_version_id and s.max_points>0 and (select coalesce(sum(q.points),0) from public.written_exam_questions q where q.section_id=s.id)>s.max_points) then raise exception 'Le total des questions dépasse le plafond d’une section.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where s.version_id=p_version_id and q.question_type='qcm' and (
   jsonb_typeof(q.public_data->'options')<>'array'
   or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(q.public_data->'options')='array' then q.public_data->'options' else '[]'::jsonb end) o where nullif(btrim(o->>'id'),'') is null or nullif(btrim(o->>'label'),'') is null)
   or (select count(distinct o->>'id') from jsonb_array_elements(case when jsonb_typeof(q.public_data->'options')='array' then q.public_data->'options' else '[]'::jsonb end) o)<>(case when jsonb_typeof(q.public_data->'options')='array' then jsonb_array_length(q.public_data->'options') else 0 end)
 )) then raise exception 'Chaque option QCM doit avoir un identifiant et un libellé uniques.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where s.version_id=p_version_id and q.question_type='reorder' and (
   jsonb_typeof(q.public_data->'items')<>'array'
   or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(q.public_data->'items')='array' then q.public_data->'items' else '[]'::jsonb end) o where nullif(btrim(o->>'id'),'') is null or nullif(btrim(o->>'text'),'') is null)
   or (select count(distinct o->>'id') from jsonb_array_elements(case when jsonb_typeof(q.public_data->'items')='array' then q.public_data->'items' else '[]'::jsonb end) o)<>(case when jsonb_typeof(q.public_data->'items')='array' then jsonb_array_length(q.public_data->'items') else 0 end)
 )) then raise exception 'Chaque élément à réordonner doit avoir un identifiant et un texte uniques.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and q.question_type='qcm' and not q.manual_review and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(q.public_data->'options')='array' then q.public_data->'options' else '[]'::jsonb end) o where o->>'id'=k.answer_key->>'correctOptionId')) then raise exception 'Un QCM possède une clé qui ne correspond à aucune option.'; end if;
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
     or (q.public_data ? 'blank_count' and (case when jsonb_typeof(k.answer_key->'answers')='array' then jsonb_array_length(k.answer_key->'answers') else 0 end)<>(q.public_data->>'blank_count')::integer)
     or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(k.answer_key->'answers')='array' then k.answer_key->'answers' else '[]'::jsonb end) blank where jsonb_typeof(blank)<>'array' or jsonb_array_length(blank)=0 or exists(select 1 from jsonb_array_elements(blank) variant where jsonb_typeof(variant)<>'string' or nullif(btrim(variant#>>'{}'),'') is null))
   ))
 )) then raise exception 'Les réponses acceptées ou variantes de trous sont invalides.'; end if;

 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and q.question_type='reorder' and not q.manual_review and (
   (case when jsonb_typeof(k.answer_key->'correctOrder')='array' then jsonb_array_length(k.answer_key->'correctOrder') else -1 end)<>(case when jsonb_typeof(q.public_data->'items')='array' then jsonb_array_length(q.public_data->'items') else 0 end) or
   exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(k.answer_key->'correctOrder')='array' then k.answer_key->'correctOrder' else '[]'::jsonb end) id where not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(q.public_data->'items')='array' then q.public_data->'items' else '[]'::jsonb end) item where item->>'id'=id)) or
   exists(select 1 from jsonb_array_elements(case when jsonb_typeof(q.public_data->'items')='array' then q.public_data->'items' else '[]'::jsonb end) item where not exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(k.answer_key->'correctOrder')='array' then k.answer_key->'correctOrder' else '[]'::jsonb end) id where id=item->>'id'))
 )) then raise exception 'Une question de réordonnement possède un ordre invalide.'; end if;
 if exists(select 1 from public.written_exam_sections where version_id=p_version_id and support_url is not null and support_url !~* '^https?://') then raise exception 'Les documents supports doivent utiliser une URL HTTP ou HTTPS.'; end if;
 if v_raw<=0 then raise exception 'Le barème doit être supérieur à zéro.'; end if;
 if v_exam.opens_at is not null and v_exam.closes_at is not null and v_exam.closes_at<=v_exam.opens_at then raise exception 'La date de fermeture doit suivre la date d’ouverture.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and q.question_type='qcm' and (case when jsonb_typeof(q.public_data->'options')='array' then jsonb_array_length(q.public_data->'options') else 0 end)<2) then raise exception 'Un QCM doit proposer au moins deux options.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and q.question_type='text' and not q.manual_review and not (k.answer_key ? 'acceptedAnswers' or k.answer_key ? 'answers')) then raise exception 'Une question texte doit posséder une réponse attendue ou être corrigée manuellement.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and q.question_type='reorder' and jsonb_array_length(coalesce(q.public_data->'items','[]'::jsonb))<2) then raise exception 'Une question de réordonnement doit contenir au moins deux éléments.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id left join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and k.question_id is null) then raise exception 'Clé de correction manquante.'; end if;
 update public.written_exam_versions set status='published',published_at=now(),raw_max=v_raw where id=p_version_id and exam_id=p_exam_id and status='draft';
 if not found then raise exception 'Version non modifiable ou introuvable.'; end if;
 update public.written_exams set title=v_version.title,description=v_version.description,level=v_version.level,target_language=v_version.target_language,instruction_language=v_version.instruction_language,duration_minutes=v_version.duration_minutes,opens_at=v_version.opens_at,closes_at=v_version.closes_at,display_scale=v_version.display_scale,max_attempts=v_version.max_attempts,shuffle_sections=v_version.shuffle_sections,shuffle_questions=v_version.shuffle_questions,shuffle_options=v_version.shuffle_options,navigation_mode=v_version.navigation_mode,show_score_after_publish=v_version.show_score_after_publish,show_corrections_after_publish=v_version.show_corrections_after_publish,integrity_settings=v_version.integrity_settings,status=case when v_version.opens_at is not null and v_version.opens_at>now() then 'scheduled' else 'published' end,updated_at=now() where id=p_exam_id;
 return jsonb_build_object('published',true,'raw_max',v_raw,'version_id',p_version_id);
end $written$;

create or replace function public.list_available_written_exams()
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare v_student public.students%rowtype; v_result jsonb;
begin
 select * into v_student from public.students where lower(email)=lower(auth.jwt()->>'email') and coalesce(validation_status,'approved')='approved' limit 1;
 if not found then raise exception 'Fiche élève active introuvable.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',e.id,'title',v.title,'description',v.description,'level',v.level,
   'target_language',v.target_language,'instruction_language',v.instruction_language,
   'duration_minutes',v.duration_minutes,'display_scale',v.display_scale,'status',e.status,
   'opens_at',v.opens_at,'closes_at',v.closes_at,'raw_max',v.raw_max,'version_id',v.id,
   'integrity_settings',v.integrity_settings,'max_attempts',v.max_attempts,'navigation_mode',v.navigation_mode,
   'sections',(select coalesce(jsonb_agg(jsonb_build_object('title',s.title,'group_name',s.group_name,'instructions',s.instructions,'max_points',s.max_points,'support_text',s.support_text,'support_url',s.support_url) order by s.position),'[]'::jsonb) from public.written_exam_sections s where s.version_id=v.id),
   'attempts_used',(select count(*) from public.written_exam_attempts x where x.exam_id=e.id and x.student_id=v_student.id),
   'attempt_status',a.status,'attempt_version_id',a.version_id,'attempt_raw_max',a.raw_max,'attempt_display_scale',av.display_scale,'results_published',coalesce(a.results_published,false),
   'raw_score',case when a.results_published and coalesce(av.show_score_after_publish,v.show_score_after_publish) then a.raw_score else null end,
   'normalized_score',case when a.results_published and coalesce(av.show_score_after_publish,v.show_score_after_publish) then a.normalized_score else null end,
   'show_score_after_publish',coalesce(av.show_score_after_publish,v.show_score_after_publish),'show_corrections_after_publish',coalesce(av.show_corrections_after_publish,v.show_corrections_after_publish)
 ) order by v.opens_at nulls first,e.created_at desc),'[]'::jsonb) into v_result
 from public.written_exams e
 join lateral (
   select vv.* from public.written_exam_versions vv
   where vv.exam_id=e.id and vv.status='published'
     and (
       exists(select 1 from public.written_exam_version_classes ec where ec.version_id=vv.id and ec.class_id=v_student.class_id)
       or exists(select 1 from public.written_exam_attempts aa where aa.exam_id=e.id and aa.student_id=v_student.id and aa.version_id=vv.id and aa.status='in_progress')
       or (
         not exists(select 1 from public.written_exam_versions vx join public.written_exam_version_classes cx on cx.version_id=vx.id where vx.exam_id=e.id and vx.status='published' and cx.class_id=v_student.class_id)
         and vv.id=(select aa.version_id from public.written_exam_attempts aa where aa.exam_id=e.id and aa.student_id=v_student.id order by aa.attempt_number desc limit 1)
       )
     )
   order by case when exists(select 1 from public.written_exam_attempts aa where aa.exam_id=e.id and aa.student_id=v_student.id and aa.version_id=vv.id and aa.status='in_progress') then 0 else 1 end,
     vv.version_number desc limit 1
 ) v on true
 left join lateral (
   select * from public.written_exam_attempts aa
   where aa.exam_id=e.id and aa.student_id=v_student.id
   order by aa.attempt_number desc limit 1
 ) a on true
 left join public.written_exam_versions av on av.id=a.version_id
 where (
   (a.status='in_progress' and e.status in ('published','scheduled','open'))
   or (e.status in ('published','scheduled','open') and (v.opens_at is null or v.opens_at<=now()) and (v.closes_at is null or v.closes_at>now()))
   or (a.id is not null and e.status in ('published','scheduled','open','closed','grading','results_published'))
 );
 return v_result;
end $written$;

create or replace function public.start_written_exam(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare
 v_student public.students%rowtype; v_exam public.written_exams%rowtype; v_version public.written_exam_versions%rowtype;
 v_attempt public.written_exam_attempts%rowtype; v_manifest jsonb; v_sections jsonb; v_attempt_no integer; v_has_attempt boolean:=false;
begin
 select * into v_student from public.students where lower(email)=lower(auth.jwt()->>'email') and coalesce(validation_status,'approved')='approved' limit 1;
 if not found then raise exception 'Fiche élève active introuvable.'; end if;
 select * into v_exam from public.written_exams where id=p_exam_id and status in ('published','open','scheduled') for update;
 if not found then raise exception 'Examen fermé ou indisponible.'; end if;
 select * into v_attempt from public.written_exam_attempts where exam_id=p_exam_id and student_id=v_student.id and status='in_progress' limit 1;
 v_has_attempt:=found;
 if v_has_attempt then
   select * into v_version from public.written_exam_versions where id=v_attempt.version_id;
 else
   select * into v_version from public.written_exam_versions where exam_id=p_exam_id and status='published' order by version_number desc limit 1;
 end if;
 if not found then raise exception 'Aucune version publiée.'; end if;
 if not exists(select 1 from public.written_exam_version_classes where version_id=v_version.id and class_id=v_student.class_id) then raise exception 'Cet examen n’est pas destiné à votre classe.'; end if;
 if not v_has_attempt and v_version.opens_at is not null and v_version.opens_at>now() then raise exception 'L’examen n’est pas encore ouvert.'; end if;
 if not v_has_attempt and v_version.closes_at is not null and v_version.closes_at<=now() then raise exception 'La période de cet examen est terminée.'; end if;
 if v_has_attempt then
   if v_attempt.deadline_at<=now() then
     -- Le runner soumettra immédiatement les dernières réponses déjà persistées; ne pas annuler la transaction ici.
     null;
   end if;
 else
   select count(*)+1 into v_attempt_no from public.written_exam_attempts where exam_id=p_exam_id and student_id=v_student.id;
   if v_attempt_no>v_version.max_attempts then raise exception 'Nombre maximal de tentatives atteint.'; end if;
   select jsonb_build_object(
     'sections',to_jsonb(array(select s.id::text from public.written_exam_sections s join (select coalesce(group_name,section_key) as group_key,min(position) as group_position,bool_or(fixed_position) as group_fixed,random() as group_random from public.written_exam_sections where version_id=v_version.id group by coalesce(group_name,section_key)) g on g.group_key=coalesce(s.group_name,s.section_key) where s.version_id=v_version.id order by case when v_version.shuffle_sections and not g.group_fixed then g.group_random else g.group_position::double precision end,s.position)),
     'questions',coalesce((select jsonb_object_agg(s.id::text,(select coalesce(jsonb_agg(q.id::text order by case when v_version.shuffle_questions and s.shuffle then random() else q.position::double precision end),'[]'::jsonb) from public.written_exam_questions q where q.section_id=s.id)) from public.written_exam_sections s where s.version_id=v_version.id),'{}'::jsonb),
     'options',coalesce((select jsonb_object_agg(q.id::text,(select coalesce(jsonb_agg(o.value->>'id' order by case when v_version.shuffle_options and q.shuffle_options then random() else o.ordinality::double precision end),'[]'::jsonb) from jsonb_array_elements(q.public_data->'options') with ordinality o(value,ordinality))) from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where s.version_id=v_version.id and jsonb_typeof(q.public_data->'options')='array'),'{}'::jsonb),
     'items',coalesce((select jsonb_object_agg(q.id::text,(select coalesce(jsonb_agg(o.value->>'id' order by case when v_version.shuffle_options and q.shuffle_options then random() else o.ordinality::double precision end),'[]'::jsonb) from jsonb_array_elements(q.public_data->'items') with ordinality o(value,ordinality))) from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where s.version_id=v_version.id and jsonb_typeof(q.public_data->'items')='array'),'{}'::jsonb)
   ) into v_manifest;
   insert into public.written_exam_attempts(exam_id,version_id,student_id,attempt_number,deadline_at,order_manifest,raw_max)
   values(p_exam_id,v_version.id,v_student.id,v_attempt_no,now()+make_interval(mins=>v_version.duration_minutes),v_manifest,v_version.raw_max)
   returning * into v_attempt;
   update public.written_exam_versions set locked_at=coalesce(locked_at,now()) where id=v_version.id;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',s.id,'section_key',s.section_key,'title',s.title,'instructions',s.instructions,'category',s.category,
   'max_points',s.max_points,'position',s.position,'support_text',s.support_text,'support_url',s.support_url,'group_name',s.group_name,
   'questions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'question_key',q.question_key,'type',q.question_type,'prompt',q.prompt,'points',q.points,'public_data',q.public_data) order by q.position) from public.written_exam_questions q where q.section_id=s.id),'[]'::jsonb)
 ) order by s.position),'[]'::jsonb) into v_sections from public.written_exam_sections s where s.version_id=v_version.id;
 return jsonb_build_object('attempt_id',v_attempt.id,'status',v_attempt.status,'deadline_at',v_attempt.deadline_at,'started_at',v_attempt.started_at,'answers',v_attempt.answers,'order_manifest',v_attempt.order_manifest,
 'exam',jsonb_build_object('id',v_exam.id,'title',v_version.title,'description',v_version.description,'level',v_version.level,'target_language',v_version.target_language,'instruction_language',v_version.instruction_language,'duration_minutes',v_version.duration_minutes,'raw_max',v_version.raw_max,'display_scale',v_version.display_scale,'navigation_mode',v_version.navigation_mode,'integrity_settings',v_version.integrity_settings),'sections',v_sections);
end $written$;

create or replace function public.save_written_exam_answers(p_attempt_id uuid,p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare v_student_id uuid; v_attempt public.written_exam_attempts%rowtype; v_key text;
begin
 select id into v_student_id from public.students where lower(email)=lower(auth.jwt()->>'email') and coalesce(validation_status,'approved')='approved' limit 1;
 select * into v_attempt from public.written_exam_attempts where id=p_attempt_id and student_id=v_student_id for update;
 if not found or v_attempt.status<>'in_progress' then raise exception 'Tentative introuvable ou terminée.'; end if;
 if jsonb_typeof(coalesce(p_answers,'{}'::jsonb))<>'object' then raise exception 'Les réponses doivent être un objet JSON.'; end if;
 if pg_column_size(coalesce(p_answers,'{}'::jsonb))>65536 then raise exception 'Les réponses dépassent la taille autorisée.'; end if;
 if not exists(select 1 from public.written_exams where id=v_attempt.exam_id and status in ('published','open','scheduled')) then raise exception 'Examen clôturé.'; end if;
 if v_attempt.deadline_at<=now() then update public.written_exam_attempts set status='timed_out',submitted_at=now() where id=p_attempt_id; raise exception 'Temps écoulé.'; end if;
 for v_key in select jsonb_object_keys(coalesce(p_answers,'{}'::jsonb)) loop
   if not exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where s.version_id=v_attempt.version_id and q.id::text=v_key) then raise exception 'Réponse associée à une question inconnue.'; end if;
 end loop;
 update public.written_exam_attempts set answers=coalesce(p_answers,'{}'::jsonb),updated_at=now() where id=p_attempt_id;
 return jsonb_build_object('saved',true,'deadline_at',v_attempt.deadline_at);
end $written$;

create or replace function public.submit_written_exam(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare
 v_student_id uuid; v_is_teacher boolean:=public.written_exam_is_teacher();
 v_attempt public.written_exam_attempts%rowtype; v_version public.written_exam_versions%rowtype;
 v_q record; v_answer jsonb; v_key jsonb; v_score numeric:=0; v_needs_review boolean:=false;
 v_expected jsonb; v_actual jsonb; v_count integer; v_hits integer; v_idx integer; v_total numeric; v_expired boolean;
begin
 if not v_is_teacher then
   select id into v_student_id from public.students where lower(email)=lower(auth.jwt()->>'email') and coalesce(validation_status,'approved')='approved' limit 1;
   select * into v_attempt from public.written_exam_attempts where id=p_attempt_id and student_id=v_student_id for update;
 else
   select * into v_attempt from public.written_exam_attempts where id=p_attempt_id for update;
 end if;
 if not found or v_attempt.status<>'in_progress' then raise exception 'Tentative introuvable ou déjà soumise.'; end if;
 v_expired:=v_attempt.deadline_at<=now();
 if v_is_teacher and not v_expired then raise exception 'Un enseignant ne peut finaliser que les tentatives arrivées à échéance ou clôturées.'; end if;
 if not v_is_teacher and not exists(select 1 from public.written_exams where id=v_attempt.exam_id and status in ('published','open','scheduled')) then raise exception 'Examen clôturé.'; end if;
 select * into v_version from public.written_exam_versions where id=v_attempt.version_id;
 delete from public.written_exam_section_results where attempt_id=p_attempt_id;
 for v_q in select q.*,s.id as section_id from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where s.version_id=v_attempt.version_id order by s.position,q.position loop
   v_answer:=v_attempt.answers->v_q.id::text; select answer_key into v_key from public.written_exam_answer_keys where question_id=v_q.id;
   v_total:=0;
   if v_q.manual_review then v_needs_review:=true;
   elsif v_q.question_type='qcm' then
     if coalesce(v_answer#>>'{}','')=coalesce(v_key->>'correctOptionId','') then v_total:=v_q.points; end if;
   elsif v_q.question_type='text' then
     if v_key ? 'answers' then
       v_expected:=v_key->'answers';
       if jsonb_typeof(v_answer)='array' then v_actual:=v_answer;
       elsif jsonb_typeof(v_answer)='string' and left(v_answer#>>'{}',1)='[' then v_actual:=(v_answer#>>'{}')::jsonb;
       else v_actual:=jsonb_build_array(v_answer); end if;
       v_count:=jsonb_array_length(v_expected); v_hits:=0;
       for v_idx in 0..v_count-1 loop
         if jsonb_typeof(v_expected->v_idx)='array' then
           if exists(select 1 from jsonb_array_elements_text(v_expected->v_idx) e where lower(regexp_replace(btrim(e),'\s+',' ','g'))=lower(regexp_replace(btrim(coalesce(v_actual->>v_idx,'')),'\s+',' ','g'))) then v_hits:=v_hits+1; end if;
         elsif lower(regexp_replace(btrim(coalesce(v_expected->>v_idx,'')),'\s+',' ','g'))=lower(regexp_replace(btrim(coalesce(v_actual->>v_idx,'')),'\s+',' ','g')) then v_hits:=v_hits+1; end if;
       end loop;
       v_total:=round(v_q.points*v_hits/nullif(v_count,0),2);
     else
       v_expected:=coalesce(v_key->'acceptedAnswers','[]'::jsonb);
       if jsonb_typeof(v_expected)='array' and exists(select 1 from jsonb_array_elements_text(v_expected) e where lower(regexp_replace(btrim(e),'\s+',' ','g'))=lower(regexp_replace(btrim(coalesce(v_answer#>>'{}','')),'\s+',' ','g'))) then v_total:=v_q.points; end if;
     end if;
   elsif v_q.question_type='reorder' then
     v_expected:=v_key->'correctOrder';
     if jsonb_typeof(v_answer)='array' then v_actual:=v_answer;
     elsif jsonb_typeof(v_answer)='string' and left(v_answer#>>'{}',1)='[' then v_actual:=(v_answer#>>'{}')::jsonb;
     else v_actual:='[]'::jsonb; end if;
     v_count:=jsonb_array_length(v_expected); v_hits:=0;
     for v_idx in 0..v_count-1 loop if v_actual->>v_idx=v_expected->>v_idx then v_hits:=v_hits+1; end if; end loop;
     v_total:=round(v_q.points*v_hits/nullif(v_count,0),2);
   end if;
   v_score:=v_score+v_total;
   insert into public.written_exam_section_results(attempt_id,section_id,raw_score,raw_max)
   values(p_attempt_id,v_q.section_id,v_total,v_q.points)
   on conflict(attempt_id,section_id) do update set raw_score=public.written_exam_section_results.raw_score+excluded.raw_score,raw_max=public.written_exam_section_results.raw_max+excluded.raw_max;
 end loop;
 update public.written_exam_attempts set status=case when v_expired then 'timed_out' when v_needs_review then 'needs_review' else 'graded' end,
 submitted_at=now(),auto_score=v_score,raw_score=case when v_needs_review then null else v_score end,
 normalized_score=case when not v_needs_review and raw_max>0 and v_version.display_scale is not null then round(v_score/raw_max*v_version.display_scale,2) else null end,
 needs_manual_review=v_needs_review,updated_at=now() where id=p_attempt_id;
 return jsonb_build_object('submitted',true,'needs_review',v_needs_review,'timed_out',v_expired);
end $written$;

create or replace function public.grade_written_exam_attempt(p_attempt_id uuid,p_manual_scores jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare v_attempt public.written_exam_attempts%rowtype; v_version public.written_exam_versions%rowtype; v_entry record; v_points numeric; v_total numeric; v_required integer; v_provided integer;
begin
 if not public.written_exam_is_teacher() then raise exception 'Accès enseignant requis.'; end if;
 select * into v_attempt from public.written_exam_attempts where id=p_attempt_id for update;
 if not found or v_attempt.status not in ('needs_review','submitted','graded','timed_out') then raise exception 'Tentative non corrigeable.'; end if;
 if jsonb_typeof(coalesce(p_manual_scores,'{}'::jsonb))<>'object' then raise exception 'Les notes manuelles doivent être un objet JSON.'; end if;
 for v_entry in select key,value from jsonb_each(coalesce(p_manual_scores,'{}'::jsonb)) loop
   select q.points into v_points
   from public.written_exam_questions q
   join public.written_exam_sections s on s.id=q.section_id
   where q.id::text=v_entry.key and q.manual_review and s.version_id=v_attempt.version_id;
   if v_points is null then raise exception 'Question de correction manuelle inconnue pour cette tentative.'; end if;
   if jsonb_typeof(v_entry.value) not in ('number','string') or (v_entry.value#>>'{}')::numeric<0 or (v_entry.value#>>'{}')::numeric>v_points then raise exception 'Note manuelle hors barème.'; end if;
 end loop;
 select count(*) into v_required from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where s.version_id=v_attempt.version_id and q.manual_review;
 select count(*) into v_provided from jsonb_each(coalesce(p_manual_scores,'{}'::jsonb));
 if v_provided<>v_required then raise exception 'Attribuez une note à chaque question en correction manuelle.'; end if;
 update public.written_exam_attempts set manual_scores=coalesce(p_manual_scores,'{}'::jsonb) where id=p_attempt_id returning * into v_attempt;
 select coalesce(sum((value#>>'{}')::numeric),0) into v_total from jsonb_each(v_attempt.manual_scores);
 select * into v_version from public.written_exam_versions where id=v_attempt.version_id;
 update public.written_exam_section_results sr set
  manual_score=coalesce((select sum((entry.value#>>'{}')::numeric) from jsonb_each(coalesce(v_attempt.manual_scores,'{}'::jsonb)) entry join public.written_exam_questions q on q.id::text=entry.key where q.section_id=sr.section_id),0),
  raw_score=sr.raw_score-sr.manual_score+coalesce((select sum((entry.value#>>'{}')::numeric) from jsonb_each(coalesce(v_attempt.manual_scores,'{}'::jsonb)) entry join public.written_exam_questions q on q.id::text=entry.key where q.section_id=sr.section_id),0)
 where sr.attempt_id=p_attempt_id;
 update public.written_exam_attempts set raw_score=auto_score+v_total,
  normalized_score=case when raw_max>0 and v_version.display_scale is not null then round((auto_score+v_total)/raw_max*v_version.display_scale,2) else null end,
  status='graded',needs_manual_review=false,updated_at=now() where id=p_attempt_id;
 return jsonb_build_object('graded',true,'raw_score',v_attempt.auto_score+v_total,'raw_max',v_attempt.raw_max);
end $written$;

create or replace function public.publish_written_exam_results(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare v_attempt_id uuid;
begin
 if not public.written_exam_is_teacher() then raise exception 'Accès enseignant requis.'; end if;
 for v_attempt_id in select id from public.written_exam_attempts where exam_id=p_exam_id and status='in_progress' and deadline_at<=now() loop
   perform public.submit_written_exam(v_attempt_id);
 end loop;
 if exists(select 1 from public.written_exam_attempts where exam_id=p_exam_id and (needs_manual_review=true or status='in_progress')) then raise exception 'Certaines tentatives sont encore en cours ou attendent une correction.'; end if;
 update public.written_exam_attempts set results_published=true where exam_id=p_exam_id and status in ('graded','timed_out') and raw_score is not null;
 update public.written_exams set status='results_published',updated_at=now() where id=p_exam_id;
 return jsonb_build_object('published',true);
end $written$;

create or replace function public.get_my_written_exam_corrections(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare v_student_id uuid; v_attempt public.written_exam_attempts%rowtype; v_result jsonb;
begin
 select id into v_student_id from public.students where lower(email)=lower(auth.jwt()->>'email') and coalesce(validation_status,'approved')='approved' limit 1;
 if v_student_id is null then raise exception 'Fiche élève active introuvable.'; end if;
 select * into v_attempt from public.written_exam_attempts
 where exam_id=p_exam_id and student_id=v_student_id and results_published=true
 order by attempt_number desc limit 1;
 if not found then raise exception 'Résultats non publiés pour cet élève.'; end if;
 if not exists(select 1 from public.written_exam_versions where id=v_attempt.version_id and show_corrections_after_publish=true) then
   raise exception 'La correction détaillée n’a pas été publiée.';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'section_title',s.title,
   'questions',coalesce((select jsonb_agg(jsonb_build_object(
     'question_id',q.id,'prompt',q.prompt,'type',q.question_type,'points',q.points,'public_data',q.public_data,
     'student_answer',v_attempt.answers->q.id::text,
     'answer_key',k.answer_key,'explanation',k.explanation,
     'manual_score',v_attempt.manual_scores->q.id::text
   ) order by q.position) from public.written_exam_questions q join public.written_exam_answer_keys k on k.question_id=q.id where q.section_id=s.id),'[]'::jsonb)
 ) order by s.position),'[]'::jsonb)
 into v_result from public.written_exam_sections s where s.version_id=v_attempt.version_id;
 return v_result;
end $written$;

create or replace function public.close_written_exam(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare v_attempt_id uuid;
begin
 if not public.written_exam_is_teacher() then raise exception 'Accès enseignant requis.'; end if;
 update public.written_exams set status='closed',updated_at=now() where id=p_exam_id;
 if not found then raise exception 'Examen introuvable.'; end if;
 update public.written_exam_attempts set deadline_at=least(deadline_at,now()) where exam_id=p_exam_id and status='in_progress';
 for v_attempt_id in select id from public.written_exam_attempts where exam_id=p_exam_id and status='in_progress' loop
   perform public.submit_written_exam(v_attempt_id);
 end loop;
 if exists(select 1 from public.written_exam_attempts where exam_id=p_exam_id and needs_manual_review=true) then
   update public.written_exams set status='grading',updated_at=now() where id=p_exam_id;
 end if;
 return jsonb_build_object('closed',true);
end $written$;

create or replace function public.log_written_exam_integrity_event(p_attempt_id uuid,p_event_type text,p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $written$
declare v_student_id uuid;
begin
 select id into v_student_id from public.students where lower(email)=lower(auth.jwt()->>'email') and coalesce(validation_status,'approved')='approved' limit 1;
 if not exists(select 1 from public.written_exam_attempts a join public.written_exams e on e.id=a.exam_id where a.id=p_attempt_id and a.student_id=v_student_id and a.status='in_progress' and e.status in ('published','open','scheduled')) then raise exception 'Tentative indisponible.'; end if;
 insert into public.written_exam_integrity_events(attempt_id,event_type,details) values(p_attempt_id,p_event_type,left(coalesce(p_details,'{}'::jsonb)::text,2000)::jsonb);
end $written$;

-- Restrict direct table access; RPCs are the only student interface.
revoke all on public.written_exams,public.written_exam_classes,public.written_exam_versions,public.written_exam_version_classes,public.written_exam_sections,public.written_exam_questions,public.written_exam_answer_keys,public.written_exam_attempts,public.written_exam_section_results,public.written_exam_integrity_events from anon,authenticated;
grant select,insert,update,delete on public.written_exams,public.written_exam_classes,public.written_exam_versions,public.written_exam_version_classes,public.written_exam_sections,public.written_exam_questions,public.written_exam_answer_keys,public.written_exam_attempts,public.written_exam_section_results,public.written_exam_integrity_events to authenticated;
revoke all on function public.save_written_exam_definition(uuid,jsonb) from public;
revoke all on function public.get_written_exam_definition(uuid) from public;
revoke all on function public.publish_written_exam(uuid,uuid) from public;
revoke all on function public.list_available_written_exams() from public;
revoke all on function public.start_written_exam(uuid) from public;
revoke all on function public.save_written_exam_answers(uuid,jsonb) from public;
revoke all on function public.submit_written_exam(uuid) from public;
revoke all on function public.grade_written_exam_attempt(uuid,jsonb) from public;
revoke all on function public.publish_written_exam_results(uuid) from public;
revoke all on function public.close_written_exam(uuid) from public;
revoke all on function public.get_my_written_exam_corrections(uuid) from public;
revoke all on function public.log_written_exam_integrity_event(uuid,text,jsonb) from public;
grant execute on function public.save_written_exam_definition(uuid,jsonb) to authenticated;
grant execute on function public.get_written_exam_definition(uuid) to authenticated;
grant execute on function public.publish_written_exam(uuid,uuid) to authenticated;
grant execute on function public.list_available_written_exams() to authenticated;
grant execute on function public.start_written_exam(uuid) to authenticated;
grant execute on function public.save_written_exam_answers(uuid,jsonb) to authenticated;
grant execute on function public.submit_written_exam(uuid) to authenticated;
grant execute on function public.grade_written_exam_attempt(uuid,jsonb) to authenticated;
grant execute on function public.publish_written_exam_results(uuid) to authenticated;
grant execute on function public.close_written_exam(uuid) to authenticated;
grant execute on function public.get_my_written_exam_corrections(uuid) to authenticated;
grant execute on function public.log_written_exam_integrity_event(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
 then (v_question->>'blank_count')::integer else null end,
       'shuffle_options',coalesce((v_question->>'shuffle_options')::boolean,true),
       'options',case when v_question->>'type'='qcm' then (
         select coalesce(jsonb_agg(jsonb_build_object('id',o.value->>'id','label',o.value->>'label') order by o.ordinality),'[]'::jsonb)
         from jsonb_array_elements(case when jsonb_typeof(v_question->'options')='array' then v_question->'options' else '[]'::jsonb end) with ordinality o(value,ordinality)
       ) else null end,
       'items',case when v_question->>'type'='reorder' then (
         select coalesce(jsonb_agg(jsonb_build_object('id',o.value->>'id','text',o.value->>'text') order by o.ordinality),'[]'::jsonb)
         from jsonb_array_elements(case when jsonb_typeof(v_question->'items')='array' then v_question->'items' else '[]'::jsonb end) with ordinality o(value,ordinality)
       ) else null end
     ));
     insert into public.written_exam_questions(section_id,question_key,position,question_type,prompt,points,public_data,manual_review,shuffle_options,source_quiz_id,source_question_id)
     values(v_section_id,coalesce(v_question->>'id',gen_random_uuid()::text),coalesce((v_question->>'position')::integer,0),v_question->>'type',btrim(v_question->>'prompt'),(v_question->>'points')::numeric,v_public,coalesce((v_question->>'manual_review')::boolean,false),coalesce((v_question->>'shuffle_options')::boolean,true),nullif(v_question->>'source_quiz_id',''),nullif(v_question->>'source_question_id',''))
     returning id into v_question_id;
     if v_key='{}'::jsonb and coalesce((v_question->>'manual_review')::boolean,false)=false then raise exception 'Clé de correction manquante pour la question %.',v_question->>'prompt'; end if;
     insert into public.written_exam_answer_keys(question_id,answer_key,explanation) values(v_question_id,v_key,nullif(v_question->>'explanation',''));
     v_raw := v_raw + (v_question->>'points')::numeric;
   end loop;
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

create or replace function public.get_written_exam_definition(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare v_result jsonb;
begin
 if not public.written_exam_is_teacher() then raise exception 'Accès enseignant requis.'; end if;
 select to_jsonb(e) || jsonb_build_object('class_ids',coalesce((select jsonb_agg(class_id) from public.written_exam_classes where exam_id=e.id),'[]'::jsonb),
 'versions',coalesce((select jsonb_agg(to_jsonb(v) order by v.version_number desc) from public.written_exam_versions v where v.exam_id=e.id),'[]'::jsonb))
 into v_result from public.written_exams e where e.id=p_exam_id;
 return v_result;
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
 select coalesce(sum(q.points),0),count(*),count(*) filter(where q.prompt='' or q.public_data->>'type' not in ('qcm','text','reorder'))
 into v_raw,v_count,v_bad from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where s.version_id=p_version_id;
 if v_count=0 or v_bad>0 then raise exception 'L’examen contient des questions invalides ou est vide.'; end if;
 if exists(select 1 from public.written_exam_sections s where s.version_id=p_version_id and (select coalesce(sum(q.points),0) from public.written_exam_questions q where q.section_id=s.id)>s.max_points) then raise exception 'Le total des questions dépasse le plafond d’une section.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and q.question_type='qcm' and not q.manual_review and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(q.public_data->'options')='array' then q.public_data->'options' else '[]'::jsonb end) o where o->>'id'=k.answer_key->>'correctOptionId')) then raise exception 'Un QCM possède une clé qui ne correspond à aucune option.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and q.question_type='reorder' and not q.manual_review and (case when jsonb_typeof(k.answer_key->'correctOrder')='array' then jsonb_array_length(k.answer_key->'correctOrder') else -1 end)<>(case when jsonb_typeof(q.public_data->'items')='array' then jsonb_array_length(q.public_data->'items') else 0 end)) then raise exception 'Une question de réordonnement possède un ordre incomplet.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and q.question_type='text' and not q.manual_review and not (
   (case when jsonb_typeof(k.answer_key->'acceptedAnswers')='array' then jsonb_array_length(k.answer_key->'acceptedAnswers')>0 else false end) or
   (case when jsonb_typeof(k.answer_key->'answers')='array' then jsonb_array_length(k.answer_key->'answers')>0 else false end)
 )) then raise exception 'Une question texte ne possède aucune réponse acceptée.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and q.question_type='reorder' and not q.manual_review and (
   (case when jsonb_typeof(k.answer_key->'correctOrder')='array' then jsonb_array_length(k.answer_key->'correctOrder') else -1 end)<>(case when jsonb_typeof(q.public_data->'items')='array' then jsonb_array_length(q.public_data->'items') else 0 end) or
   exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(k.answer_key->'correctOrder')='array' then k.answer_key->'correctOrder' else '[]'::jsonb end) id where not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(q.public_data->'items')='array' then q.public_data->'items' else '[]'::jsonb end) item where item->>'id'=id)) or
   exists(select 1 from jsonb_array_elements(case when jsonb_typeof(q.public_data->'items')='array' then q.public_data->'items' else '[]'::jsonb end) item where not exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(k.answer_key->'correctOrder')='array' then k.answer_key->'correctOrder' else '[]'::jsonb end) id where id=item->>'id'))
 )) then raise exception 'Une question de réordonnement possède un ordre invalide.'; end if;
 if exists(select 1 from public.written_exam_sections where version_id=p_version_id and support_url is not null and support_url !~* '^https?://') then raise exception 'Les documents supports doivent utiliser une URL HTTP ou HTTPS.'; end if;
 if v_raw<=0 then raise exception 'Le barème doit être supérieur à zéro.'; end if;
 if v_exam.opens_at is not null and v_exam.closes_at is not null and v_exam.closes_at<=v_exam.opens_at then raise exception 'La date de fermeture doit suivre la date d’ouverture.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and q.question_type='qcm' and (case when jsonb_typeof(q.public_data->'options')='array' then jsonb_array_length(q.public_data->'options') else 0 end)<2) then raise exception 'Un QCM doit proposer au moins deux options.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and q.question_type='text' and not q.manual_review and not (k.answer_key ? 'acceptedAnswers' or k.answer_key ? 'answers')) then raise exception 'Une question texte doit posséder une réponse attendue ou être corrigée manuellement.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and q.question_type='reorder' and jsonb_array_length(coalesce(q.public_data->'items','[]'::jsonb))<2) then raise exception 'Une question de réordonnement doit contenir au moins deux éléments.'; end if;
 if exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id left join public.written_exam_answer_keys k on k.question_id=q.id where s.version_id=p_version_id and k.question_id is null) then raise exception 'Clé de correction manquante.'; end if;
 update public.written_exam_versions set status='published',published_at=now(),raw_max=v_raw where id=p_version_id and exam_id=p_exam_id and status='draft';
 if not found then raise exception 'Version non modifiable ou introuvable.'; end if;
 update public.written_exams set title=v_version.title,description=v_version.description,level=v_version.level,target_language=v_version.target_language,instruction_language=v_version.instruction_language,duration_minutes=v_version.duration_minutes,opens_at=v_version.opens_at,closes_at=v_version.closes_at,display_scale=v_version.display_scale,max_attempts=v_version.max_attempts,shuffle_sections=v_version.shuffle_sections,shuffle_questions=v_version.shuffle_questions,shuffle_options=v_version.shuffle_options,navigation_mode=v_version.navigation_mode,show_score_after_publish=v_version.show_score_after_publish,show_corrections_after_publish=v_version.show_corrections_after_publish,integrity_settings=v_version.integrity_settings,status=case when v_version.opens_at is not null and v_version.opens_at>now() then 'scheduled' else 'published' end,updated_at=now() where id=p_exam_id;
 return jsonb_build_object('published',true,'raw_max',v_raw,'version_id',p_version_id);
end $written$;

create or replace function public.list_available_written_exams()
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare v_student public.students%rowtype; v_result jsonb;
begin
 select * into v_student from public.students where lower(email)=lower(auth.jwt()->>'email') and coalesce(validation_status,'approved')='approved' limit 1;
 if not found then raise exception 'Fiche élève active introuvable.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',e.id,'title',v.title,'description',v.description,'level',v.level,
   'target_language',v.target_language,'instruction_language',v.instruction_language,
   'duration_minutes',v.duration_minutes,'display_scale',v.display_scale,'status',e.status,
   'opens_at',v.opens_at,'closes_at',v.closes_at,'raw_max',v.raw_max,'version_id',v.id,
   'integrity_settings',v.integrity_settings,'max_attempts',v.max_attempts,'navigation_mode',v.navigation_mode,
   'sections',(select coalesce(jsonb_agg(jsonb_build_object('title',s.title,'group_name',s.group_name,'instructions',s.instructions,'max_points',s.max_points,'support_text',s.support_text,'support_url',s.support_url) order by s.position),'[]'::jsonb) from public.written_exam_sections s where s.version_id=v.id),
   'attempts_used',(select count(*) from public.written_exam_attempts x where x.exam_id=e.id and x.student_id=v_student.id),
   'attempt_status',a.status,'attempt_version_id',a.version_id,'attempt_raw_max',a.raw_max,'attempt_display_scale',av.display_scale,'results_published',coalesce(a.results_published,false),
   'raw_score',case when a.results_published and coalesce(av.show_score_after_publish,v.show_score_after_publish) then a.raw_score else null end,
   'normalized_score',case when a.results_published and coalesce(av.show_score_after_publish,v.show_score_after_publish) then a.normalized_score else null end,
   'show_score_after_publish',coalesce(av.show_score_after_publish,v.show_score_after_publish),'show_corrections_after_publish',coalesce(av.show_corrections_after_publish,v.show_corrections_after_publish)
 ) order by v.opens_at nulls first,e.created_at desc),'[]'::jsonb) into v_result
 from public.written_exams e
 join lateral (
   select vv.* from public.written_exam_versions vv
   where vv.exam_id=e.id and vv.status='published'
     and exists(select 1 from public.written_exam_version_classes ec where ec.version_id=vv.id and ec.class_id=v_student.class_id)
   order by vv.version_number desc limit 1
 ) v on true
 left join lateral (
   select * from public.written_exam_attempts aa
   where aa.exam_id=e.id and aa.student_id=v_student.id
   order by aa.attempt_number desc limit 1
 ) a on true
 left join public.written_exam_versions av on av.id=a.version_id
 where (
   (a.status='in_progress' and e.status in ('published','scheduled','open'))
   or (e.status in ('published','scheduled','open') and (v.opens_at is null or v.opens_at<=now()) and (v.closes_at is null or v.closes_at>now()))
   or (a.id is not null and e.status in ('published','scheduled','open','closed','grading','results_published'))
 );
 return v_result;
end $written$;

create or replace function public.start_written_exam(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare
 v_student public.students%rowtype; v_exam public.written_exams%rowtype; v_version public.written_exam_versions%rowtype;
 v_attempt public.written_exam_attempts%rowtype; v_manifest jsonb; v_sections jsonb; v_attempt_no integer; v_has_attempt boolean:=false;
begin
 select * into v_student from public.students where lower(email)=lower(auth.jwt()->>'email') and coalesce(validation_status,'approved')='approved' limit 1;
 if not found then raise exception 'Fiche élève active introuvable.'; end if;
 select * into v_exam from public.written_exams where id=p_exam_id and status in ('published','open','scheduled') for update;
 if not found then raise exception 'Examen fermé ou indisponible.'; end if;
 select * into v_attempt from public.written_exam_attempts where exam_id=p_exam_id and student_id=v_student.id and status='in_progress' limit 1;
 v_has_attempt:=found;
 if v_has_attempt then
   select * into v_version from public.written_exam_versions where id=v_attempt.version_id;
 else
   select * into v_version from public.written_exam_versions where exam_id=p_exam_id and status='published' order by version_number desc limit 1;
 end if;
 if not found then raise exception 'Aucune version publiée.'; end if;
 if not exists(select 1 from public.written_exam_version_classes where version_id=v_version.id and class_id=v_student.class_id) then raise exception 'Cet examen n’est pas destiné à votre classe.'; end if;
 if not v_has_attempt and v_version.opens_at is not null and v_version.opens_at>now() then raise exception 'L’examen n’est pas encore ouvert.'; end if;
 if not v_has_attempt and v_version.closes_at is not null and v_version.closes_at<=now() then raise exception 'La période de cet examen est terminée.'; end if;
 if v_has_attempt then
   if v_attempt.deadline_at<=now() then
     -- Le runner soumettra immédiatement les dernières réponses déjà persistées; ne pas annuler la transaction ici.
     null;
   end if;
 else
   select count(*)+1 into v_attempt_no from public.written_exam_attempts where exam_id=p_exam_id and student_id=v_student.id;
   if v_attempt_no>v_version.max_attempts then raise exception 'Nombre maximal de tentatives atteint.'; end if;
   select jsonb_build_object(
     'sections',to_jsonb(array(select s.id::text from public.written_exam_sections s join (select coalesce(group_name,section_key) as group_key,min(position) as group_position,bool_or(fixed_position) as group_fixed,random() as group_random from public.written_exam_sections where version_id=v_version.id group by coalesce(group_name,section_key)) g on g.group_key=coalesce(s.group_name,s.section_key) where s.version_id=v_version.id order by case when v_version.shuffle_sections and not g.group_fixed then g.group_random else g.group_position::double precision end,s.position)),
     'questions',coalesce((select jsonb_object_agg(s.id::text,(select coalesce(jsonb_agg(q.id::text order by case when v_version.shuffle_questions and s.shuffle then random() else q.position::double precision end),'[]'::jsonb) from public.written_exam_questions q where q.section_id=s.id)) from public.written_exam_sections s where s.version_id=v_version.id),'{}'::jsonb),
     'options',coalesce((select jsonb_object_agg(q.id::text,(select coalesce(jsonb_agg(o.value->>'id' order by case when v_version.shuffle_options and q.shuffle_options then random() else o.ordinality::double precision end),'[]'::jsonb) from jsonb_array_elements(q.public_data->'options') with ordinality o(value,ordinality))) from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where s.version_id=v_version.id and jsonb_typeof(q.public_data->'options')='array'),'{}'::jsonb),
     'items',coalesce((select jsonb_object_agg(q.id::text,(select coalesce(jsonb_agg(o.value->>'id' order by case when v_version.shuffle_options and q.shuffle_options then random() else o.ordinality::double precision end),'[]'::jsonb) from jsonb_array_elements(q.public_data->'items') with ordinality o(value,ordinality))) from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where s.version_id=v_version.id and jsonb_typeof(q.public_data->'items')='array'),'{}'::jsonb)
   ) into v_manifest;
   insert into public.written_exam_attempts(exam_id,version_id,student_id,attempt_number,deadline_at,order_manifest,raw_max)
   values(p_exam_id,v_version.id,v_student.id,v_attempt_no,now()+make_interval(mins=>v_version.duration_minutes),v_manifest,v_version.raw_max)
   returning * into v_attempt;
   update public.written_exam_versions set locked_at=coalesce(locked_at,now()) where id=v_version.id;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',s.id,'section_key',s.section_key,'title',s.title,'instructions',s.instructions,'category',s.category,
   'max_points',s.max_points,'position',s.position,'support_text',s.support_text,'support_url',s.support_url,'group_name',s.group_name,
   'questions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'question_key',q.question_key,'type',q.question_type,'prompt',q.prompt,'points',q.points,'public_data',q.public_data) order by q.position) from public.written_exam_questions q where q.section_id=s.id),'[]'::jsonb)
 ) order by s.position),'[]'::jsonb) into v_sections from public.written_exam_sections s where s.version_id=v_version.id;
 return jsonb_build_object('attempt_id',v_attempt.id,'status',v_attempt.status,'deadline_at',v_attempt.deadline_at,'started_at',v_attempt.started_at,'answers',v_attempt.answers,'order_manifest',v_attempt.order_manifest,
 'exam',jsonb_build_object('id',v_exam.id,'title',v_version.title,'description',v_version.description,'level',v_version.level,'target_language',v_version.target_language,'instruction_language',v_version.instruction_language,'duration_minutes',v_version.duration_minutes,'raw_max',v_version.raw_max,'display_scale',v_version.display_scale,'navigation_mode',v_version.navigation_mode,'integrity_settings',v_version.integrity_settings),'sections',v_sections);
end $written$;

create or replace function public.save_written_exam_answers(p_attempt_id uuid,p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare v_student_id uuid; v_attempt public.written_exam_attempts%rowtype; v_key text;
begin
 select id into v_student_id from public.students where lower(email)=lower(auth.jwt()->>'email') and coalesce(validation_status,'approved')='approved' limit 1;
 select * into v_attempt from public.written_exam_attempts where id=p_attempt_id and student_id=v_student_id for update;
 if not found or v_attempt.status<>'in_progress' then raise exception 'Tentative introuvable ou terminée.'; end if;
 if not exists(select 1 from public.written_exams where id=v_attempt.exam_id and status in ('published','open','scheduled')) then raise exception 'Examen clôturé.'; end if;
 if v_attempt.deadline_at<=now() then update public.written_exam_attempts set status='timed_out',submitted_at=now() where id=p_attempt_id; raise exception 'Temps écoulé.'; end if;
 for v_key in select jsonb_object_keys(coalesce(p_answers,'{}'::jsonb)) loop
   if not exists(select 1 from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where s.version_id=v_attempt.version_id and q.id::text=v_key) then raise exception 'Réponse associée à une question inconnue.'; end if;
 end loop;
 update public.written_exam_attempts set answers=coalesce(p_answers,'{}'::jsonb),updated_at=now() where id=p_attempt_id;
 return jsonb_build_object('saved',true,'deadline_at',v_attempt.deadline_at);
end $written$;

create or replace function public.submit_written_exam(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare
 v_student_id uuid; v_is_teacher boolean:=public.written_exam_is_teacher();
 v_attempt public.written_exam_attempts%rowtype; v_version public.written_exam_versions%rowtype;
 v_q record; v_answer jsonb; v_key jsonb; v_score numeric:=0; v_needs_review boolean:=false;
 v_expected jsonb; v_actual jsonb; v_count integer; v_hits integer; v_idx integer; v_total numeric; v_expired boolean;
begin
 if not v_is_teacher then
   select id into v_student_id from public.students where lower(email)=lower(auth.jwt()->>'email') and coalesce(validation_status,'approved')='approved' limit 1;
   select * into v_attempt from public.written_exam_attempts where id=p_attempt_id and student_id=v_student_id for update;
 else
   select * into v_attempt from public.written_exam_attempts where id=p_attempt_id for update;
 end if;
 if not found or v_attempt.status<>'in_progress' then raise exception 'Tentative introuvable ou déjà soumise.'; end if;
 v_expired:=v_attempt.deadline_at<=now();
 if v_is_teacher and not v_expired then raise exception 'Un enseignant ne peut finaliser que les tentatives arrivées à échéance ou clôturées.'; end if;
 if not v_is_teacher and not exists(select 1 from public.written_exams where id=v_attempt.exam_id and status in ('published','open','scheduled')) then raise exception 'Examen clôturé.'; end if;
 select * into v_version from public.written_exam_versions where id=v_attempt.version_id;
 delete from public.written_exam_section_results where attempt_id=p_attempt_id;
 for v_q in select q.*,s.id as section_id from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where s.version_id=v_attempt.version_id order by s.position,q.position loop
   v_answer:=v_attempt.answers->v_q.id::text; select answer_key into v_key from public.written_exam_answer_keys where question_id=v_q.id;
   v_total:=0;
   if v_q.manual_review then v_needs_review:=true;
   elsif v_q.question_type='qcm' then
     if coalesce(v_answer#>>'{}','')=coalesce(v_key->>'correctOptionId','') then v_total:=v_q.points; end if;
   elsif v_q.question_type='text' then
     if v_key ? 'answers' then
       v_expected:=v_key->'answers';
       if jsonb_typeof(v_answer)='array' then v_actual:=v_answer;
       elsif jsonb_typeof(v_answer)='string' and left(v_answer#>>'{}',1)='[' then v_actual:=(v_answer#>>'{}')::jsonb;
       else v_actual:=jsonb_build_array(v_answer); end if;
       v_count:=jsonb_array_length(v_expected); v_hits:=0;
       for v_idx in 0..v_count-1 loop
         if jsonb_typeof(v_expected->v_idx)='array' then
           if exists(select 1 from jsonb_array_elements_text(v_expected->v_idx) e where lower(regexp_replace(btrim(e),'\s+',' ','g'))=lower(regexp_replace(btrim(coalesce(v_actual->>v_idx,'')),'\s+',' ','g'))) then v_hits:=v_hits+1; end if;
         elsif lower(regexp_replace(btrim(coalesce(v_expected->>v_idx,'')),'\s+',' ','g'))=lower(regexp_replace(btrim(coalesce(v_actual->>v_idx,'')),'\s+',' ','g')) then v_hits:=v_hits+1; end if;
       end loop;
       v_total:=round(v_q.points*v_hits/nullif(v_count,0),2);
     else
       v_expected:=coalesce(v_key->'acceptedAnswers','[]'::jsonb);
       if jsonb_typeof(v_expected)='array' and exists(select 1 from jsonb_array_elements_text(v_expected) e where lower(regexp_replace(btrim(e),'\s+',' ','g'))=lower(regexp_replace(btrim(coalesce(v_answer#>>'{}','')),'\s+',' ','g'))) then v_total:=v_q.points; end if;
     end if;
   elsif v_q.question_type='reorder' then
     v_expected:=v_key->'correctOrder';
     if jsonb_typeof(v_answer)='array' then v_actual:=v_answer;
     elsif jsonb_typeof(v_answer)='string' and left(v_answer#>>'{}',1)='[' then v_actual:=(v_answer#>>'{}')::jsonb;
     else v_actual:='[]'::jsonb; end if;
     v_count:=jsonb_array_length(v_expected); v_hits:=0;
     for v_idx in 0..v_count-1 loop if v_actual->>v_idx=v_expected->>v_idx then v_hits:=v_hits+1; end if; end loop;
     v_total:=round(v_q.points*v_hits/nullif(v_count,0),2);
   end if;
   v_score:=v_score+v_total;
   insert into public.written_exam_section_results(attempt_id,section_id,raw_score,raw_max)
   values(p_attempt_id,v_q.section_id,v_total,v_q.points)
   on conflict(attempt_id,section_id) do update set raw_score=public.written_exam_section_results.raw_score+excluded.raw_score,raw_max=public.written_exam_section_results.raw_max+excluded.raw_max;
 end loop;
 update public.written_exam_attempts set status=case when v_expired then 'timed_out' when v_needs_review then 'needs_review' else 'graded' end,
 submitted_at=now(),auto_score=v_score,raw_score=case when v_needs_review then null else v_score end,
 normalized_score=case when not v_needs_review and raw_max>0 and v_version.display_scale is not null then round(v_score/raw_max*v_version.display_scale,2) else null end,
 needs_manual_review=v_needs_review,updated_at=now() where id=p_attempt_id;
 return jsonb_build_object('submitted',true,'needs_review',v_needs_review,'timed_out',v_expired);
end $written$;

create or replace function public.grade_written_exam_attempt(p_attempt_id uuid,p_manual_scores jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare v_attempt public.written_exam_attempts%rowtype; v_version public.written_exam_versions%rowtype; v_entry record; v_points numeric; v_total numeric; v_required integer; v_provided integer;
begin
 if not public.written_exam_is_teacher() then raise exception 'Accès enseignant requis.'; end if;
 select * into v_attempt from public.written_exam_attempts where id=p_attempt_id for update;
 if not found or v_attempt.status not in ('needs_review','submitted','graded','timed_out') then raise exception 'Tentative non corrigeable.'; end if;
 if jsonb_typeof(coalesce(p_manual_scores,'{}'::jsonb))<>'object' then raise exception 'Les notes manuelles doivent être un objet JSON.'; end if;
 for v_entry in select key,value from jsonb_each(coalesce(p_manual_scores,'{}'::jsonb)) loop
   select q.points into v_points
   from public.written_exam_questions q
   join public.written_exam_sections s on s.id=q.section_id
   where q.id::text=v_entry.key and q.manual_review and s.version_id=v_attempt.version_id;
   if v_points is null then raise exception 'Question de correction manuelle inconnue pour cette tentative.'; end if;
   if jsonb_typeof(v_entry.value) not in ('number','string') or (v_entry.value#>>'{}')::numeric<0 or (v_entry.value#>>'{}')::numeric>v_points then raise exception 'Note manuelle hors barème.'; end if;
 end loop;
 select count(*) into v_required from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where s.version_id=v_attempt.version_id and q.manual_review;
 select count(*) into v_provided from jsonb_each(coalesce(p_manual_scores,'{}'::jsonb));
 if v_provided<>v_required then raise exception 'Attribuez une note à chaque question en correction manuelle.'; end if;
 update public.written_exam_attempts set manual_scores=coalesce(p_manual_scores,'{}'::jsonb) where id=p_attempt_id returning * into v_attempt;
 select coalesce(sum((value#>>'{}')::numeric),0) into v_total from jsonb_each(v_attempt.manual_scores);
 select * into v_version from public.written_exam_versions where id=v_attempt.version_id;
 update public.written_exam_section_results sr set
  manual_score=coalesce((select sum((entry.value#>>'{}')::numeric) from jsonb_each(coalesce(v_attempt.manual_scores,'{}'::jsonb)) entry join public.written_exam_questions q on q.id::text=entry.key where q.section_id=sr.section_id),0),
  raw_score=sr.raw_score-sr.manual_score+coalesce((select sum((entry.value#>>'{}')::numeric) from jsonb_each(coalesce(v_attempt.manual_scores,'{}'::jsonb)) entry join public.written_exam_questions q on q.id::text=entry.key where q.section_id=sr.section_id),0)
 where sr.attempt_id=p_attempt_id;
 update public.written_exam_attempts set raw_score=auto_score+v_total,
  normalized_score=case when raw_max>0 and v_version.display_scale is not null then round((auto_score+v_total)/raw_max*v_version.display_scale,2) else null end,
  status='graded',needs_manual_review=false,updated_at=now() where id=p_attempt_id;
 return jsonb_build_object('graded',true,'raw_score',v_attempt.auto_score+v_total,'raw_max',v_attempt.raw_max);
end $written$;

create or replace function public.publish_written_exam_results(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare v_attempt_id uuid;
begin
 if not public.written_exam_is_teacher() then raise exception 'Accès enseignant requis.'; end if;
 for v_attempt_id in select id from public.written_exam_attempts where exam_id=p_exam_id and status='in_progress' and deadline_at<=now() loop
   perform public.submit_written_exam(v_attempt_id);
 end loop;
 if exists(select 1 from public.written_exam_attempts where exam_id=p_exam_id and (needs_manual_review=true or status='in_progress')) then raise exception 'Certaines tentatives sont encore en cours ou attendent une correction.'; end if;
 update public.written_exam_attempts set results_published=true where exam_id=p_exam_id and status in ('graded','timed_out') and raw_score is not null;
 update public.written_exams set status='results_published',updated_at=now() where id=p_exam_id;
 return jsonb_build_object('published',true);
end $written$;

create or replace function public.get_my_written_exam_corrections(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare v_student_id uuid; v_attempt public.written_exam_attempts%rowtype; v_result jsonb;
begin
 select id into v_student_id from public.students where lower(email)=lower(auth.jwt()->>'email') and coalesce(validation_status,'approved')='approved' limit 1;
 if v_student_id is null then raise exception 'Fiche élève active introuvable.'; end if;
 select * into v_attempt from public.written_exam_attempts
 where exam_id=p_exam_id and student_id=v_student_id and results_published=true
 order by attempt_number desc limit 1;
 if not found then raise exception 'Résultats non publiés pour cet élève.'; end if;
 if not exists(select 1 from public.written_exam_versions where id=v_attempt.version_id and show_corrections_after_publish=true) then
   raise exception 'La correction détaillée n’a pas été publiée.';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'section_title',s.title,
   'questions',coalesce((select jsonb_agg(jsonb_build_object(
     'question_id',q.id,'prompt',q.prompt,'type',q.question_type,'points',q.points,'public_data',q.public_data,
     'student_answer',v_attempt.answers->q.id::text,
     'answer_key',k.answer_key,'explanation',k.explanation,
     'manual_score',v_attempt.manual_scores->q.id::text
   ) order by q.position) from public.written_exam_questions q join public.written_exam_answer_keys k on k.question_id=q.id where q.section_id=s.id),'[]'::jsonb)
 ) order by s.position),'[]'::jsonb)
 into v_result from public.written_exam_sections s where s.version_id=v_attempt.version_id;
 return v_result;
end $written$;

create or replace function public.close_written_exam(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare v_attempt_id uuid;
begin
 if not public.written_exam_is_teacher() then raise exception 'Accès enseignant requis.'; end if;
 update public.written_exams set status='closed',updated_at=now() where id=p_exam_id;
 if not found then raise exception 'Examen introuvable.'; end if;
 update public.written_exam_attempts set deadline_at=least(deadline_at,now()) where exam_id=p_exam_id and status='in_progress';
 for v_attempt_id in select id from public.written_exam_attempts where exam_id=p_exam_id and status='in_progress' loop
   perform public.submit_written_exam(v_attempt_id);
 end loop;
 if exists(select 1 from public.written_exam_attempts where exam_id=p_exam_id and needs_manual_review=true) then
   update public.written_exams set status='grading',updated_at=now() where id=p_exam_id;
 end if;
 return jsonb_build_object('closed',true);
end $written$;

create or replace function public.log_written_exam_integrity_event(p_attempt_id uuid,p_event_type text,p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $written$
declare v_student_id uuid;
begin
 select id into v_student_id from public.students where lower(email)=lower(auth.jwt()->>'email') and coalesce(validation_status,'approved')='approved' limit 1;
 if not exists(select 1 from public.written_exam_attempts a join public.written_exams e on e.id=a.exam_id where a.id=p_attempt_id and a.student_id=v_student_id and a.status='in_progress' and e.status in ('published','open','scheduled')) then raise exception 'Tentative indisponible.'; end if;
 insert into public.written_exam_integrity_events(attempt_id,event_type,details) values(p_attempt_id,p_event_type,left(coalesce(p_details,'{}'::jsonb)::text,2000)::jsonb);
end $written$;

-- Restrict direct table access; RPCs are the only student interface.
revoke all on public.written_exams,public.written_exam_classes,public.written_exam_versions,public.written_exam_version_classes,public.written_exam_sections,public.written_exam_questions,public.written_exam_answer_keys,public.written_exam_attempts,public.written_exam_section_results,public.written_exam_integrity_events from anon,authenticated;
grant select,insert,update,delete on public.written_exams,public.written_exam_classes,public.written_exam_versions,public.written_exam_version_classes,public.written_exam_sections,public.written_exam_questions,public.written_exam_answer_keys,public.written_exam_attempts,public.written_exam_section_results,public.written_exam_integrity_events to authenticated;
revoke all on function public.save_written_exam_definition(uuid,jsonb) from public;
revoke all on function public.get_written_exam_definition(uuid) from public;
revoke all on function public.publish_written_exam(uuid,uuid) from public;
revoke all on function public.list_available_written_exams() from public;
revoke all on function public.start_written_exam(uuid) from public;
revoke all on function public.save_written_exam_answers(uuid,jsonb) from public;
revoke all on function public.submit_written_exam(uuid) from public;
revoke all on function public.grade_written_exam_attempt(uuid,jsonb) from public;
revoke all on function public.publish_written_exam_results(uuid) from public;
revoke all on function public.close_written_exam(uuid) from public;
revoke all on function public.get_my_written_exam_corrections(uuid) from public;
revoke all on function public.log_written_exam_integrity_event(uuid,text,jsonb) from public;
grant execute on function public.save_written_exam_definition(uuid,jsonb) to authenticated;
grant execute on function public.get_written_exam_definition(uuid) to authenticated;
grant execute on function public.publish_written_exam(uuid,uuid) to authenticated;
grant execute on function public.list_available_written_exams() to authenticated;
grant execute on function public.start_written_exam(uuid) to authenticated;
grant execute on function public.save_written_exam_answers(uuid,jsonb) to authenticated;
grant execute on function public.submit_written_exam(uuid) to authenticated;
grant execute on function public.grade_written_exam_attempt(uuid,jsonb) to authenticated;
grant execute on function public.publish_written_exam_results(uuid) to authenticated;
grant execute on function public.close_written_exam(uuid) to authenticated;
grant execute on function public.get_my_written_exam_corrections(uuid) to authenticated;
grant execute on function public.log_written_exam_integrity_event(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
