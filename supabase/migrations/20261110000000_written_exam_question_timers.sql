-- Per-question timers and mandatory per-attempt question randomization for written exams.
-- The timer is part of public_data (never an answer key) and is returned by the existing student RPC.

create or replace function public.force_written_exam_question_shuffle()
returns trigger
language plpgsql
set search_path = ''
as $written$
begin
  new.shuffle_questions := true;
  new.navigation_mode := 'sequential';
  return new;
end
$written$;

drop trigger if exists written_exam_question_shuffle_required on public.written_exam_versions;
create trigger written_exam_question_shuffle_required
before insert or update on public.written_exam_versions
for each row execute function public.force_written_exam_question_shuffle();

create or replace function public.force_written_exam_section_question_shuffle()
returns trigger
language plpgsql
set search_path = ''
as $written$
begin
  new.shuffle := true;
  return new;
end
$written$;

drop trigger if exists written_exam_section_question_shuffle_required on public.written_exam_sections;
create trigger written_exam_section_question_shuffle_required
before insert or update on public.written_exam_sections
for each row execute function public.force_written_exam_section_question_shuffle();

-- Bring already-published templates into the mandatory anti-cheat order for future attempts.
-- Existing attempts retain their immutable order_manifest.
alter table public.written_exam_versions disable trigger written_exam_versions_immutable;
update public.written_exam_versions
set shuffle_questions=true, navigation_mode='sequential';
alter table public.written_exam_versions enable trigger written_exam_versions_immutable;

update public.written_exam_sections set shuffle=true;


alter table public.written_exam_attempts
  add column if not exists question_timer_started_at timestamptz;

create or replace function public.get_or_start_written_exam_question_timer(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $written$
declare
  v_student_id uuid;
  v_started_at timestamptz;
begin
  select id into v_student_id
  from public.students
  where lower(email)=lower(auth.jwt()->>'email')
    and coalesce(validation_status,'approved')='approved'
  limit 1;
  if v_student_id is null then
    raise exception 'Fiche élève active introuvable.';
  end if;

  update public.written_exam_attempts
  set question_timer_started_at=coalesce(question_timer_started_at,now()),
      updated_at=now()
  where id=p_attempt_id
    and student_id=v_student_id
    and status='in_progress'
  returning question_timer_started_at into v_started_at;

  if v_started_at is null then
    raise exception 'Tentative introuvable ou déjà terminée.';
  end if;
  return jsonb_build_object('question_timer_started_at',v_started_at);
end
$written$;

revoke all on function public.get_or_start_written_exam_question_timer(uuid) from public;
grant execute on function public.get_or_start_written_exam_question_timer(uuid) to authenticated;

create or replace function public.save_written_exam_question_answer(
  p_attempt_id uuid,
  p_question_id text,
  p_answer jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $written$
declare
  v_student_id uuid;
  v_attempt public.written_exam_attempts%rowtype;
  v_current_question_id text;
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
      coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,case when q.question_type in ('text','verbes_trous') then 32 else 17 end) as seconds,
      coalesce(
        sum(coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,case when q.question_type in ('text','verbes_trous') then 32 else 17 end))
          over (
            order by sec.section_ord, oq.question_ord
            rows between unbounded preceding and 1 preceding
          ),
        0
      ) as offset_seconds
    from jsonb_array_elements_text(v_attempt.order_manifest->'sections')
      with ordinality as sec(section_id,section_ord)
    cross join lateral jsonb_array_elements_text(
      v_attempt.order_manifest->'questions'->(sec.section_id)
    ) with ordinality as oq(question_id,question_ord)
    join public.written_exam_questions q on q.id::text=oq.question_id
  )
  select question_id into v_current_question_id
  from ordered_questions
  where now() >= v_attempt.question_timer_started_at + make_interval(secs=>offset_seconds)
    and now() < v_attempt.question_timer_started_at + make_interval(secs=>(offset_seconds+seconds))
  limit 1;

  if v_current_question_id is null or v_current_question_id<>p_question_id then
    return jsonb_build_object('saved',false,'expired',true);
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

  return jsonb_build_object('saved',true);
end
$written$;

revoke all on function public.save_written_exam_question_answer(uuid,text,jsonb) from public;
grant execute on function public.save_written_exam_question_answer(uuid,text,jsonb) to authenticated;

-- Students must save only the question whose server-side timer is currently active.
revoke all on function public.save_written_exam_answers(uuid,jsonb) from authenticated;

create or replace function public.save_written_exam_question_time_limits(
  p_version_id uuid,
  p_time_limits jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $written$
declare
  v_entry record;
  v_seconds integer;
  v_updated integer;
begin
  if not public.written_exam_is_teacher() then
    raise exception 'Accès enseignant requis.';
  end if;
  if jsonb_typeof(coalesce(p_time_limits, '{}'::jsonb)) <> 'object' then
    raise exception 'Format des limites de temps invalide.';
  end if;
  if not exists (
    select 1 from public.written_exam_versions
    where id = p_version_id and status = 'draft'
  ) then
    raise exception 'Les limites de temps ne peuvent être modifiées que sur un brouillon.';
  end if;

  for v_entry in select key, value from jsonb_each(coalesce(p_time_limits, '{}'::jsonb))
  loop
    v_seconds := (v_entry.value #>> '{}')::integer;
    if v_seconds < 1 or v_seconds > 3600 then
      raise exception 'Chaque question doit avoir une limite entre 1 et 3600 secondes.';
    end if;

    update public.written_exam_questions q
    set public_data = coalesce(q.public_data, '{}'::jsonb)
      || jsonb_build_object('time_limit_seconds', v_seconds)
    from public.written_exam_sections s
    where q.section_id = s.id
      and s.version_id = p_version_id
      and q.question_key = v_entry.key;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'Question introuvable pour la limite de temps : %.', v_entry.key;
    end if;
  end loop;

  return jsonb_build_object('saved', true, 'questions_updated', jsonb_object_length(coalesce(p_time_limits, '{}'::jsonb)));
end
$written$;

revoke all on function public.save_written_exam_question_time_limits(uuid,jsonb) from public;
grant execute on function public.save_written_exam_question_time_limits(uuid,jsonb) to authenticated;

notify pgrst, 'reload schema';
