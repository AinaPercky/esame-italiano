-- Enforce the same tab-switch anti-cheat policy as official quizzes for written exams.
alter table public.written_exam_attempts
  add column if not exists integrity_failed boolean not null default false,
  add column if not exists integrity_failed_at timestamptz,
  add column if not exists integrity_failure_reason text;

alter table public.written_exam_integrity_events
  drop constraint if exists written_exam_integrity_events_event_type_check;
alter table public.written_exam_integrity_events
  add constraint written_exam_integrity_events_event_type_check
  check (event_type in (
    'visibility_hidden','window_blur','fullscreen_exit','fullscreen_enter',
    'copy_attempt','paste_attempt','connection_lost','connection_restored',
    'screenshot_attempt'
  ));

create or replace function public.flag_written_exam_integrity_violation(
  p_attempt_id uuid,
  p_event_type text,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $written$
declare
  v_student_id uuid;
begin
  if p_event_type not in ('visibility_hidden','window_blur','screenshot_attempt') then
    raise exception 'Type de violation anti-triche non autorisé.';
  end if;

  select id into v_student_id
  from public.students
  where lower(email)=lower(auth.jwt()->>'email')
    and coalesce(validation_status,'approved')='approved'
  limit 1;

  if v_student_id is null or not exists (
    select 1 from public.written_exam_attempts
    where id=p_attempt_id and student_id=v_student_id and status='in_progress'
  ) then
    raise exception 'Tentative active introuvable.';
  end if;

  insert into public.written_exam_integrity_events(attempt_id,event_type,details)
  values (
    p_attempt_id,
    p_event_type,
    left(coalesce(p_details,'{}'::jsonb)::text,2000)::jsonb
  );

  update public.written_exam_attempts
  set integrity_failed=true,
      integrity_failed_at=coalesce(integrity_failed_at,now()),
      integrity_failure_reason=coalesce(integrity_failure_reason,p_event_type),
      updated_at=now()
  where id=p_attempt_id;

  return jsonb_build_object('flagged',true,'reason',p_event_type);
end
$written$;

create or replace function public.enforce_written_exam_integrity_zero()
returns trigger
language plpgsql
set search_path = ''
as $written$
begin
  if new.integrity_failed then
    if new.status<>'in_progress' then
      new.status:='graded';
      new.needs_manual_review:=false;
      new.auto_score:=0;
      new.raw_score:=0;
      new.normalized_score:=0;
      new.manual_scores:='{}'::jsonb;
      if new.expression_writing_max_points>0 then
        new.expression_writing_score:=0;
      end if;
    end if;
  end if;
  return new;
end
$written$;

drop trigger if exists written_exam_integrity_zero on public.written_exam_attempts;
create trigger written_exam_integrity_zero
before update on public.written_exam_attempts
for each row execute function public.enforce_written_exam_integrity_zero();

revoke all on function public.flag_written_exam_integrity_violation(uuid,text,jsonb) from public;
grant execute on function public.flag_written_exam_integrity_violation(uuid,text,jsonb) to authenticated;

notify pgrst,'reload schema';
