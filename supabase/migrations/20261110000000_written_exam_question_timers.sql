-- Per-question timers and mandatory per-attempt question randomization for written exams.
-- The timer is part of public_data (never an answer key) and is returned by the existing student RPC.

create or replace function public.force_written_exam_question_shuffle()
returns trigger
language plpgsql
set search_path = ''
as $written$
begin
  new.shuffle_questions := true;
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
