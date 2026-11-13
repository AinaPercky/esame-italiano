-- Module Exercices PerckyLingua
-- Content is versioned; student-facing question payloads are returned only by RPCs.
create extension if not exists pgcrypto;

create or replace function public.exercise_is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'ainapercky@gmail.com';
$$;

create or replace function public.exercise_current_student_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select s.id
  from public.students s
  where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and coalesce(s.validation_status, 'approved') = 'approved'
  order by s.created_at desc
  limit 1;
$$;

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 180),
  description text,
  category text not null default 'Autre',
  level text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.exercise_versions (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (exercise_id, version_number),
  check (jsonb_typeof(content -> 'questions') = 'array')
);

alter table public.exercises
  add constraint exercises_current_version_fk
  foreign key (current_version_id) references public.exercise_versions(id) on delete restrict;

create table if not exists public.exercise_class_assignments (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (exercise_id, class_id)
);

create table if not exists public.exercise_attempts (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  version_id uuid not null references public.exercise_versions(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete cascade,
  question_order jsonb not null check (jsonb_typeof(question_order) = 'array'),
  current_question_index integer not null default 0 check (current_question_index >= 0),
  current_question_started_at timestamptz not null default now(),
  current_question_deadline_at timestamptz not null,
  answers jsonb not null default '{}'::jsonb,
  score numeric(10,2) not null default 0,
  max_score numeric(10,2) not null default 0,
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.exercise_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exercise_attempts(id) on delete cascade,
  question_id text not null,
  answer jsonb,
  is_correct boolean not null default false,
  points_awarded numeric(10,2) not null default 0,
  max_points numeric(10,2) not null default 0,
  timed_out boolean not null default false,
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index if not exists exercise_assignments_class_idx on public.exercise_class_assignments(class_id, exercise_id);
create index if not exists exercise_attempts_student_idx on public.exercise_attempts(student_id, started_at desc);
create index if not exists exercise_attempts_exercise_idx on public.exercise_attempts(exercise_id, status, started_at desc);
create index if not exists exercise_answers_attempt_idx on public.exercise_answers(attempt_id);

alter table public.exercises enable row level security;
alter table public.exercise_versions enable row level security;
alter table public.exercise_class_assignments enable row level security;
alter table public.exercise_attempts enable row level security;
alter table public.exercise_answers enable row level security;

drop policy if exists exercises_teacher_manage on public.exercises;
create policy exercises_teacher_manage on public.exercises
for all to authenticated
using (public.exercise_is_teacher())
with check (public.exercise_is_teacher() and created_by = auth.uid());

drop policy if exists exercises_student_assigned_read on public.exercises;
create policy exercises_student_assigned_read on public.exercises
for select to authenticated
using (
  status = 'published'
  and exists (
    select 1
    from public.exercise_class_assignments a
    join public.students s on s.class_id = a.class_id
    where a.exercise_id = exercises.id
      and s.id = public.exercise_current_student_id()
  )
);

drop policy if exists exercise_versions_teacher_manage on public.exercise_versions;
create policy exercise_versions_teacher_manage on public.exercise_versions
for all to authenticated
using (public.exercise_is_teacher())
with check (public.exercise_is_teacher() and created_by = auth.uid());

drop policy if exists exercise_assignments_teacher_manage on public.exercise_class_assignments;
create policy exercise_assignments_teacher_manage on public.exercise_class_assignments
for all to authenticated
using (public.exercise_is_teacher())
with check (public.exercise_is_teacher());

drop policy if exists exercise_assignments_student_read on public.exercise_class_assignments;
create policy exercise_assignments_student_read on public.exercise_class_assignments
for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = public.exercise_current_student_id()
      and s.class_id = exercise_class_assignments.class_id
  )
);

drop policy if exists exercise_attempts_participant_read on public.exercise_attempts;
create policy exercise_attempts_participant_read on public.exercise_attempts
for select to authenticated
using (student_id = public.exercise_current_student_id() or public.exercise_is_teacher());

drop policy if exists exercise_answers_participant_read on public.exercise_answers;
create policy exercise_answers_participant_read on public.exercise_answers
for select to authenticated
using (
  exists (
    select 1 from public.exercise_attempts a
    where a.id = exercise_answers.attempt_id
      and (a.student_id = public.exercise_current_student_id() or public.exercise_is_teacher())
  )
);

grant select, insert, update, delete on public.exercises to authenticated;
grant select, insert, update, delete on public.exercise_versions to authenticated;
grant select, insert, update, delete on public.exercise_class_assignments to authenticated;
grant select on public.exercise_attempts, public.exercise_answers to authenticated;

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
  v_ids jsonb := '[]'::jsonb;
begin
  if v_type = 'qcm' then
    v_expected_text := trim(coalesce(p_question ->> 'correct_answer', ''));
    v_student_text := trim(coalesce(p_answer #>> '{}', ''));
    if v_student_text = v_expected_text then
      v_correct := 1;
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
      begin
        v_student := (v_student #>> '{}')::jsonb;
      exception when others then
        v_student := jsonb_build_array(v_student #>> '{}');
      end;
    end if;
    if jsonb_typeof(v_student) <> 'array' then v_student := jsonb_build_array(coalesce(v_student #>> '{}','')); end if;
    v_total := greatest(1, jsonb_array_length(v_expected));
    for v_item, v_correct in
      select e.value, e.ordinality::integer
      from jsonb_array_elements(v_expected) with ordinality e(value, ordinality)
    loop
      v_student_text := lower(regexp_replace(trim(coalesce(v_student ->> (v_correct - 1),'')), '\s+', ' ', 'g'));
      v_expected_text := lower(regexp_replace(trim(coalesce(v_item #>> '{}','')), '\s+', ' ', 'g'));
      if v_student_text = v_expected_text then
        v_correct := v_correct; -- keep loop variable assigned
        v_awarded := v_awarded + (v_points / v_total);
      else
        -- Multiple accepted variants in one blank.
        if exists (
          select 1 from regexp_split_to_table(coalesce(v_item #>> '{}',''), '\s*[/;|]\s*') a
          where lower(regexp_replace(trim(a), '\s+', ' ', 'g')) = v_student_text
        ) then v_awarded := v_awarded + (v_points / v_total); end if;
      end if;
    end loop;
    v_correct := case when v_awarded >= v_points then 1 else 0 end;
  elsif v_type = 'reorder' then
    select coalesce(jsonb_agg(
      case when jsonb_typeof(x.value) = 'object' then x.value -> 'id' else x.value end
      order by x.ordinality
    ), '[]'::jsonb)
    into v_expected_order
    from jsonb_array_elements(coalesce(p_question -> 'items','[]'::jsonb)) with ordinality x(value, ordinality);
    if jsonb_typeof(v_student) = 'string' then
      begin v_student := (v_student #>> '{}')::jsonb; exception when others then null; end;
    end if;
    v_total := 1;
    if v_student = v_expected_order then v_correct := 1; v_awarded := v_points; end if;
  elsif v_type = 'verbes_trous' then
    if jsonb_typeof(v_student) = 'string' then
      begin v_student := (v_student #>> '{}')::jsonb; exception when others then v_student := jsonb_build_array(v_student #>> '{}'); end;
    end if;
    v_total := greatest(1, jsonb_array_length(coalesce(p_question #> '{verbes_trous,phrases}','[]'::jsonb)));
    for v_phrase, v_correct in
      select p.value, p.ordinality::integer
      from jsonb_array_elements(coalesce(p_question #> '{verbes_trous,phrases}','[]'::jsonb)) with ordinality p(value, ordinality)
    loop
      v_responses := coalesce(v_phrase -> 'reponses', '[]'::jsonb);
      v_student_text := lower(regexp_replace(trim(coalesce(v_student ->> (v_correct - 1),'')), '\s+', ' ', 'g'));
      if exists (
        select 1 from jsonb_array_elements_text(v_responses) r(value)
        where lower(regexp_replace(trim(r.value), '\s+', ' ', 'g')) = v_student_text
      ) then v_awarded := v_awarded + (v_points / v_total); end if;
    end loop;
    v_correct := case when v_awarded >= v_points then 1 else 0 end;
  else
    raise exception 'Type de question non pris en charge: %', v_type;
  end if;

  return jsonb_build_object(
    'correct', (v_correct = 1),
    'points', round(v_awarded, 2),
    'max_points', round(v_points, 2),
    'expected', coalesce(p_question -> 'answers', p_question -> 'correct_answer', p_question #> '{verbes_trous,phrases}'),
    'explanation', p_question -> 'explanation'
  );
end;
$$;

create or replace function public.exercise_question_for_student(p_attempt_id uuid)
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

  v_safe := v_question - 'correct_answer' - 'answers' - 'explanation';
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
$$;

create or replace function public.start_exercise_attempt(p_exercise_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_student_id uuid := public.exercise_current_student_id();
  v_exercise public.exercises%rowtype;
  v_version public.exercise_versions%rowtype;
  v_order jsonb;
  v_attempt public.exercise_attempts%rowtype;
  v_total numeric := 0;
  v_first jsonb;
  v_question jsonb;
begin
  if v_student_id is null then raise exception 'Profil étudiant validé introuvable.'; end if;
  select e.* into v_exercise
  from public.exercises e
  join public.exercise_class_assignments a on a.exercise_id = e.id
  join public.students s on s.class_id = a.class_id
  where e.id = p_exercise_id and e.status = 'published' and s.id = v_student_id
  limit 1;
  if not found then raise exception 'Cet exercice n’est pas disponible pour votre classe.'; end if;

  select * into v_version from public.exercise_versions where id = v_exercise.current_version_id;
  if not found then raise exception 'Version de l’exercice introuvable.'; end if;
  if jsonb_array_length(v_version.content -> 'questions') = 0 then raise exception 'Cet exercice ne contient aucune question.'; end if;

  select jsonb_agg(q.value ->> 'id' order by random()),
         coalesce(sum((q.value ->> 'points')::numeric),0)
  into v_order, v_total
  from jsonb_array_elements(v_version.content -> 'questions') q(value);
  if exists (
    select 1 from jsonb_array_elements(v_version.content -> 'questions') q(value)
    where coalesce((q.value ->> 'time_limit_seconds')::integer,0) <= 0
  ) then raise exception 'Chaque question doit avoir un temps imparti strictement positif.'; end if;

  v_question := (select q.value from jsonb_array_elements(v_version.content -> 'questions') q(value) where q.value ->> 'id' = v_order ->> 0);
  insert into public.exercise_attempts(
    exercise_id, version_id, student_id, question_order, current_question_index,
    current_question_started_at, current_question_deadline_at, max_score
  ) values (
    p_exercise_id, v_version.id, v_student_id, v_order, 0,
    now(), now() + make_interval(secs => (v_question ->> 'time_limit_seconds')::integer), v_total
  ) returning * into v_attempt;

  return public.exercise_question_for_student(v_attempt.id);
end;
$$;

create or replace function public.get_exercise_current_question(p_attempt_id uuid)
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  select public.exercise_question_for_student(p_attempt_id);
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
  v_timed_out boolean;
  v_points numeric;
begin
  select * into v_attempt from public.exercise_attempts where id = p_attempt_id for update;
  if not found or (v_attempt.student_id <> public.exercise_current_student_id() and not public.exercise_is_teacher()) then
    raise exception 'Tentative introuvable ou accès interdit.';
  end if;
  if v_attempt.status <> 'in_progress' then raise exception 'Cette tentative est déjà terminée.'; end if;

  v_question_id := v_attempt.question_order ->> v_attempt.current_question_index;
  if exists (select 1 from public.exercise_answers where attempt_id = p_attempt_id and question_id = v_question_id) then
    raise exception 'La réponse à cette question a déjà été validée.';
  end if;

  select content into v_content from public.exercise_versions where id = v_attempt.version_id;
  select q.value into v_question from jsonb_array_elements(v_content -> 'questions') q(value) where q.value ->> 'id' = v_question_id;
  v_timed_out := now() > v_attempt.current_question_deadline_at;
  v_grade := case when v_timed_out
    then jsonb_build_object('correct',false,'points',0,'max_points',coalesce((v_question ->> 'points')::numeric,0),'expected',coalesce(v_question -> 'answers',v_question -> 'correct_answer',v_question #> '{verbes_trous,phrases}'),'explanation',v_question -> 'explanation')
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

  return v_grade || jsonb_build_object('timed_out',v_timed_out,'question_id',v_question_id);
end;
$$;

create or replace function public.advance_exercise_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_attempt public.exercise_attempts%rowtype;
  v_content jsonb;
  v_next_id text;
  v_next_question jsonb;
begin
  select * into v_attempt from public.exercise_attempts where id = p_attempt_id for update;
  if not found or (v_attempt.student_id <> public.exercise_current_student_id() and not public.exercise_is_teacher()) then
    raise exception 'Tentative introuvable ou accès interdit.';
  end if;
  if v_attempt.status <> 'in_progress' then raise exception 'Cette tentative est déjà terminée.'; end if;
  if not exists (
    select 1 from public.exercise_answers
    where attempt_id = p_attempt_id and question_id = v_attempt.question_order ->> v_attempt.current_question_index
  ) then raise exception 'Validez votre réponse avant de passer à la question suivante.'; end if;

  if v_attempt.current_question_index + 1 >= jsonb_array_length(v_attempt.question_order) then
    update public.exercise_attempts set status='completed', completed_at=now(), updated_at=now() where id=p_attempt_id;
    return jsonb_build_object('completed',true,'attempt_id',p_attempt_id);
  end if;

  select content into v_content from public.exercise_versions where id = v_attempt.version_id;
  v_next_id := v_attempt.question_order ->> (v_attempt.current_question_index + 1);
  select q.value into v_next_question from jsonb_array_elements(v_content -> 'questions') q(value) where q.value ->> 'id' = v_next_id;

  update public.exercise_attempts
  set current_question_index = current_question_index + 1,
      current_question_started_at = now(),
      current_question_deadline_at = now() + make_interval(secs => (v_next_question ->> 'time_limit_seconds')::integer),
      updated_at = now()
  where id = p_attempt_id;

  return public.exercise_question_for_student(p_attempt_id);
end;
$$;

create or replace function public.list_student_exercises()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_student_id uuid := public.exercise_current_student_id();
  v_result jsonb;
begin
  if v_student_id is null then raise exception 'Profil étudiant validé introuvable.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'title', e.title, 'description', e.description,
    'category', e.category, 'level', e.level, 'assigned_at', a.assigned_at,
    'attempt_count', (select count(*) from public.exercise_attempts at where at.exercise_id=e.id and at.student_id=v_student_id),
    'active_attempt_id', (select at.id from public.exercise_attempts at where at.exercise_id=e.id and at.student_id=v_student_id and at.status='in_progress' order by at.started_at desc limit 1)
  ) order by a.assigned_at desc), '[]'::jsonb)
  into v_result
  from public.exercises e
  join public.exercise_class_assignments a on a.exercise_id=e.id
  join public.students s on s.class_id=a.class_id
  where s.id=v_student_id and e.status='published';
  return v_result;
end;
$$;

create or replace function public.get_student_exercise_results()
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'exercise_id',a.exercise_id,'score',a.score,'max_score',a.max_score,
    'status',a.status,'started_at',a.started_at,'completed_at',a.completed_at,
    'answers',a.answers
  ) order by a.started_at desc),'[]'::jsonb)
  from public.exercise_attempts a
  where a.student_id=public.exercise_current_student_id();
$$;

create or replace function public.get_teacher_exercise_attempts(p_exercise_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_result jsonb;
begin
  if not public.exercise_is_teacher() then raise exception 'Accès professeur requis.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'attempt_id',a.id,'student_id',s.id,'student_name',s.first_name || ' ' || s.last_name,
    'student_number',s.student_number,'class_name',c.name,'score',a.score,'max_score',a.max_score,
    'status',a.status,'started_at',a.started_at,'completed_at',a.completed_at,'answers',a.answers,
    'details',(select coalesce(jsonb_agg(jsonb_build_object('question_id',ans.question_id,'answer',ans.answer,'correct',ans.is_correct,'points',ans.points_awarded,'max_points',ans.max_points,'timed_out',ans.timed_out) order by ans.answered_at),'[]'::jsonb) from public.exercise_answers ans where ans.attempt_id=a.id)
  ) order by a.started_at desc),'[]'::jsonb)
  into v_result
  from public.exercise_attempts a
  join public.students s on s.id=a.student_id
  join public.classes c on c.id=s.class_id
  where a.exercise_id=p_exercise_id;
  return v_result;
end;
$$;

grant execute on function public.start_exercise_attempt(uuid) to authenticated;
grant execute on function public.get_exercise_current_question(uuid) to authenticated;
grant execute on function public.submit_exercise_answer(uuid,jsonb) to authenticated;
grant execute on function public.advance_exercise_attempt(uuid) to authenticated;
grant execute on function public.list_student_exercises() to authenticated;
grant execute on function public.get_student_exercise_results() to authenticated;
grant execute on function public.get_teacher_exercise_attempts(uuid) to authenticated;


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
       or coalesce(q.value ->> 'type','') not in ('qcm','text','reorder','verbes_trous')
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

grant execute on function public.save_exercise_definition(uuid,jsonb,jsonb,uuid[]) to authenticated;


-- Restore the feedback screen after a refresh without restarting the question timer.
create or replace function public.exercise_question_for_student(p_attempt_id uuid)
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
  v_safe jsonb;
  v_answer public.exercise_answers%rowtype;
  v_payload jsonb;
begin
  select * into v_attempt from public.exercise_attempts where id = p_attempt_id;
  if not found or (v_attempt.student_id <> public.exercise_current_student_id() and not public.exercise_is_teacher()) then
    raise exception 'Tentative introuvable ou accès interdit.';
  end if;
  if v_attempt.status <> 'in_progress' then raise exception 'Cette tentative est terminée.'; end if;

  select content into v_content from public.exercise_versions where id = v_attempt.version_id;
  v_question_id := v_attempt.question_order ->> v_attempt.current_question_index;
  select q into v_question
  from jsonb_array_elements(v_content -> 'questions') q
  where q ->> 'id' = v_question_id;
  if v_question is null then raise exception 'Question introuvable dans la version de l’exercice.'; end if;

  v_safe := v_question - 'correct_answer' - 'answers' - 'explanation';
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

  v_payload := jsonb_build_object(
    'attempt_id', v_attempt.id,
    'question', v_safe,
    'question_number', v_attempt.current_question_index + 1,
    'question_count', jsonb_array_length(v_attempt.question_order),
    'deadline_at', v_attempt.current_question_deadline_at,
    'seconds_remaining', greatest(0, floor(extract(epoch from (v_attempt.current_question_deadline_at - now())))::integer),
    'server_now', now()
  );

  select * into v_answer from public.exercise_answers
  where attempt_id = p_attempt_id and question_id = v_question_id;
  if found then
    v_payload := v_payload || jsonb_build_object('correction', jsonb_build_object(
      'correct', v_answer.is_correct,
      'points', v_answer.points_awarded,
      'max_points', v_answer.max_points,
      'expected', coalesce(v_question -> 'answers', v_question -> 'correct_answer', v_question #> '{verbes_trous,phrases}'),
      'explanation', v_question -> 'explanation',
      'timed_out', v_answer.timed_out,
      'question_id', v_question_id
    ));
  end if;
  return v_payload;
end;
$$;

-- Verbes à trous answers are JSON objects keyed by phrase id.
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
    v_total := greatest(1, jsonb_array_length(coalesce(p_question #> '{verbes_trous,phrases}','[]'::jsonb)));
    for v_phrase, v_correct in
      select p.value, p.ordinality::integer
      from jsonb_array_elements(coalesce(p_question #> '{verbes_trous,phrases}','[]'::jsonb)) with ordinality p(value, ordinality)
    loop
      v_responses := coalesce(v_phrase -> 'reponses', '[]'::jsonb);
      v_student_text := lower(regexp_replace(trim(coalesce(
        v_student -> (v_phrase ->> 'id') ->> 'texte_saisi',
        v_student ->> (v_phrase ->> 'id'),
        v_student ->> (v_correct - 1),
        ''
      )), '\s+', ' ', 'g'));
      if exists (
        select 1 from jsonb_array_elements_text(v_responses) r(value)
        where lower(regexp_replace(trim(r.value), '\s+', ' ', 'g')) = v_student_text
      ) then v_awarded := v_awarded + (v_points / v_total); end if;
    end loop;
    v_correct := case when v_awarded >= v_points then 1 else 0 end;
  else
    raise exception 'Type de question non pris en charge: %', v_type;
  end if;

  return jsonb_build_object(
    'correct', (v_correct = 1),
    'points', round(v_awarded, 2),
    'max_points', round(v_points, 2),
    'expected', coalesce(p_question -> 'answers', p_question -> 'correct_answer', p_question #> '{verbes_trous,phrases}'),
    'explanation', p_question -> 'explanation'
  );
end;
$$;


-- Freeze a shuffled option order per attempt, so refreshes do not reshuffle choices.
alter table public.exercise_attempts
  add column if not exists option_orders jsonb not null default '{}'::jsonb;

create or replace function public.start_exercise_attempt(p_exercise_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_student_id uuid := public.exercise_current_student_id();
  v_exercise public.exercises%rowtype;
  v_version public.exercise_versions%rowtype;
  v_order jsonb;
  v_option_orders jsonb;
  v_attempt public.exercise_attempts%rowtype;
  v_total numeric := 0;
  v_question jsonb;
begin
  if v_student_id is null then raise exception 'Profil étudiant validé introuvable.'; end if;
  select e.* into v_exercise
  from public.exercises e
  join public.exercise_class_assignments a on a.exercise_id = e.id
  join public.students s on s.class_id = a.class_id
  where e.id = p_exercise_id and e.status = 'published' and s.id = v_student_id
  limit 1;
  if not found then raise exception 'Cet exercice n’est pas disponible pour votre classe.'; end if;

  select * into v_version from public.exercise_versions where id = v_exercise.current_version_id;
  if not found then raise exception 'Version de l’exercice introuvable.'; end if;
  if jsonb_array_length(v_version.content -> 'questions') = 0 then raise exception 'Cet exercice ne contient aucune question.'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_version.content -> 'questions') q(value)
    where coalesce((q.value ->> 'time_limit_seconds')::integer,0) <= 0
  ) then raise exception 'Chaque question doit avoir un temps imparti strictement positif.'; end if;

  select jsonb_agg(q.value ->> 'id' order by random()),
         coalesce(sum((q.value ->> 'points')::numeric),0)
  into v_order, v_total
  from jsonb_array_elements(v_version.content -> 'questions') q(value);

  select coalesce(jsonb_object_agg(q.value ->> 'id', shuffled.options), '{}'::jsonb)
  into v_option_orders
  from jsonb_array_elements(v_version.content -> 'questions') q(value)
  cross join lateral (
    select jsonb_agg(o.value order by random()) as options
    from jsonb_array_elements(coalesce(q.value -> 'options','[]'::jsonb)) o(value)
  ) shuffled
  where jsonb_typeof(q.value -> 'options') = 'array';

  select q.value into v_question
  from jsonb_array_elements(v_version.content -> 'questions') q(value)
  where q.value ->> 'id' = v_order ->> 0;

  insert into public.exercise_attempts(
    exercise_id, version_id, student_id, question_order, option_orders, current_question_index,
    current_question_started_at, current_question_deadline_at, max_score
  ) values (
    p_exercise_id, v_version.id, v_student_id, v_order, v_option_orders, 0,
    now(), now() + make_interval(secs => (v_question ->> 'time_limit_seconds')::integer), v_total
  ) returning * into v_attempt;

  return public.exercise_question_for_student(v_attempt.id);
end;
$$;

-- Replace the payload function to use the frozen shuffled options.
create or replace function public.exercise_question_for_student(p_attempt_id uuid)
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
  v_safe jsonb;
  v_answer public.exercise_answers%rowtype;
  v_payload jsonb;
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

  v_safe := v_question - 'correct_answer' - 'answers' - 'explanation';
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

  v_payload := jsonb_build_object(
    'attempt_id', v_attempt.id,
    'question', v_safe,
    'question_number', v_attempt.current_question_index + 1,
    'question_count', jsonb_array_length(v_attempt.question_order),
    'deadline_at', v_attempt.current_question_deadline_at,
    'seconds_remaining', greatest(0, floor(extract(epoch from (v_attempt.current_question_deadline_at - now())))::integer),
    'server_now', now()
  );

  select * into v_answer from public.exercise_answers
  where attempt_id = p_attempt_id and question_id = v_question_id;
  if found then
    v_payload := v_payload || jsonb_build_object('correction', jsonb_build_object(
      'correct', v_answer.is_correct,
      'points', v_answer.points_awarded,
      'max_points', v_answer.max_points,
      'expected', coalesce(v_question -> 'answers', v_question -> 'correct_answer', v_question #> '{verbes_trous,phrases}'),
      'explanation', v_question -> 'explanation',
      'timed_out', v_answer.timed_out,
      'question_id', v_question_id
    ));
  end if;
  return v_payload;
end;
$$;
