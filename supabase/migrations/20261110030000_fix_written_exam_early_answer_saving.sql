-- Fix written-exam answer loss when students validate before the per-question timer expires.
-- The existing timer RPC used one fixed start timestamp and inferred the active question
-- from cumulative time. Manual "Valider et continuer" advanced only the React index,
-- so PostgreSQL continued to reject the next question until the previous timer elapsed.
-- Keep the existing schema and atomically rebase the timer when an answer is validated.

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
        case when q.question_type in ('text','verbes_trous') then 32 else 17 end)::integer as seconds,
      coalesce(
        sum(coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
          case when q.question_type in ('text','verbes_trous') then 32 else 17 end))
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
        case when q.question_type in ('text','verbes_trous') then 32 else 17 end)::integer as seconds,
      coalesce(
        sum(coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
          case when q.question_type in ('text','verbes_trous') then 32 else 17 end))
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
        case when q.question_type in ('text','verbes_trous') then 32 else 17 end)::integer as seconds,
      coalesce(
        sum(coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
          case when q.question_type in ('text','verbes_trous') then 32 else 17 end))
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

  -- Normal autosave is accepted only for the active question. A validation may also
  -- arrive just after the question timer expired, when the next timer window has begun.
  if v_active_question_index is distinct from v_question_index then
    if not p_advance
       or v_active_question_index is distinct from (v_question_index+1)
       and not (v_question_index=v_question_count-1 and v_active_question_index is null) then
      return jsonb_build_object('saved',false,'expired',true,'reason','question_not_active');
    end if;
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

  -- On early validation, rebase the same timer origin so the next question becomes
  -- active immediately. This preserves the existing resume calculation and avoids
  -- adding a second cursor column that could drift from the randomized manifest.
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

-- Preserve compatibility for clients still calling the original three-argument RPC.
drop function if exists public.save_written_exam_question_answer(uuid,text,jsonb);
create function public.save_written_exam_question_answer(
  p_attempt_id uuid,
  p_question_id text,
  p_answer jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
as $written$
  select public.save_written_exam_question_answer(p_attempt_id,p_question_id,p_answer,false);
$written$;

revoke all on function public.save_written_exam_question_answer(uuid,text,jsonb,boolean) from public;
revoke all on function public.save_written_exam_question_answer(uuid,text,jsonb) from public;
grant execute on function public.save_written_exam_question_answer(uuid,text,jsonb,boolean) to authenticated;
grant execute on function public.save_written_exam_question_answer(uuid,text,jsonb) to authenticated;
