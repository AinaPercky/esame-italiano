-- Keep written-exam answers on the student device during the attempt.
-- The server still owns the authoritative timer/progression and receives the answer
-- object once, atomically with final submission.

create or replace function public.advance_written_exam_question(
  p_attempt_id uuid,
  p_question_id text
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
  if v_student_id is null then raise exception 'Fiche élève active introuvable.'; end if;

  select * into v_attempt
  from public.written_exam_attempts
  where id=p_attempt_id and student_id=v_student_id
  for update;
  if not found or v_attempt.status<>'in_progress' then
    raise exception 'Tentative introuvable ou déjà terminée.';
  end if;
  if v_attempt.deadline_at<=now() then
    return jsonb_build_object('advanced',false,'expired',true);
  end if;
  if v_attempt.question_timer_started_at is null then
    raise exception 'Chronomètre individuel non initialisé.';
  end if;

  with ordered_questions as (
    select q.id::text as question_id,
      (row_number() over(order by sec.section_ord,oq.question_ord)-1)::integer as question_index,
      coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
        case when q.question_type in ('text','verbes_trous') then 32 else 17 end)::integer as seconds,
      coalesce(sum(coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
        case when q.question_type in ('text','verbes_trous') then 32 else 17 end))
        over(order by sec.section_ord,oq.question_ord rows between unbounded preceding and 1 preceding),0)::integer as offset_seconds
    from jsonb_array_elements_text(v_attempt.order_manifest->'sections')
      with ordinality as sec(section_id,section_ord)
    cross join lateral jsonb_array_elements_text(v_attempt.order_manifest->'questions'->(sec.section_id))
      with ordinality as oq(question_id,question_ord)
    join public.written_exam_questions q on q.id::text=oq.question_id
  )
  select question_index,offset_seconds,seconds
  into v_question_index,v_question_offset,v_question_seconds
  from ordered_questions where question_id=p_question_id;
  if v_question_index is null then raise exception 'Question inconnue pour cette tentative.'; end if;

  with ordered_questions as (
    select (row_number() over(order by sec.section_ord,oq.question_ord)-1)::integer as question_index,
      coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
        case when q.question_type in ('text','verbes_trous') then 32 else 17 end)::integer as seconds,
      coalesce(sum(coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
        case when q.question_type in ('text','verbes_trous') then 32 else 17 end))
        over(order by sec.section_ord,oq.question_ord rows between unbounded preceding and 1 preceding),0)::integer as offset_seconds
    from jsonb_array_elements_text(v_attempt.order_manifest->'sections')
      with ordinality as sec(section_id,section_ord)
    cross join lateral jsonb_array_elements_text(v_attempt.order_manifest->'questions'->(sec.section_id))
      with ordinality as oq(question_id,question_ord)
    join public.written_exam_questions q on q.id::text=oq.question_id
  )
  select count(*)::integer into v_question_count from ordered_questions;

  with ordered_questions as (
    select (row_number() over(order by sec.section_ord,oq.question_ord)-1)::integer as question_index,
      coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
        case when q.question_type in ('text','verbes_trous') then 32 else 17 end)::integer as seconds,
      coalesce(sum(coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
        case when q.question_type in ('text','verbes_trous') then 32 else 17 end))
        over(order by sec.section_ord,oq.question_ord rows between unbounded preceding and 1 preceding),0)::integer as offset_seconds
    from jsonb_array_elements_text(v_attempt.order_manifest->'sections')
      with ordinality as sec(section_id,section_ord)
    cross join lateral jsonb_array_elements_text(v_attempt.order_manifest->'questions'->(sec.section_id))
      with ordinality as oq(question_id,question_ord)
    join public.written_exam_questions q on q.id::text=oq.question_id
  )
  select question_index into v_active_question_index
  from ordered_questions
  where now()>=v_attempt.question_timer_started_at+make_interval(secs=>offset_seconds)
    and now()<v_attempt.question_timer_started_at+make_interval(secs=>(offset_seconds+seconds))
  limit 1;

  -- A repeated request after a lost response is harmless: the next question is already active.
  if v_active_question_index=v_question_index+1 then
    return jsonb_build_object('advanced',true,'next_question_index',v_question_index+1,
      'question_timer_started_at',v_attempt.question_timer_started_at,'idempotent',true);
  end if;
  if v_active_question_index is distinct from v_question_index then
    return jsonb_build_object('advanced',false,'active_question_index',v_active_question_index);
  end if;

  if v_question_index+1<v_question_count then
    v_next_offset:=v_question_offset+v_question_seconds;
    update public.written_exam_attempts
    set question_timer_started_at=now()-make_interval(secs=>v_next_offset),updated_at=now()
    where id=p_attempt_id
    returning question_timer_started_at into v_attempt.question_timer_started_at;
  end if;

  return jsonb_build_object('advanced',true,'next_question_index',least(v_question_index+1,v_question_count),
    'question_timer_started_at',coalesce(v_attempt.question_timer_started_at,now()));
end
$written$;

create or replace function public.submit_written_exam_with_answers(
  p_attempt_id uuid,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $written$
declare
  v_student_id uuid;
  v_attempt public.written_exam_attempts%rowtype;
  v_key text;
  v_result jsonb;
begin
  select id into v_student_id
  from public.students
  where lower(email)=lower(auth.jwt()->>'email')
    and coalesce(validation_status,'approved')='approved'
  limit 1;
  if v_student_id is null then raise exception 'Fiche élève active introuvable.'; end if;

  if jsonb_typeof(coalesce(p_answers,'{}'::jsonb))<>'object' then
    raise exception 'Les réponses de l’examen doivent être un objet JSON.';
  end if;
  if octet_length(coalesce(p_answers,'{}'::jsonb)::text)>2000000 then
    raise exception 'La copie dépasse la taille maximale autorisée.';
  end if;

  select * into v_attempt
  from public.written_exam_attempts
  where id=p_attempt_id and student_id=v_student_id
  for update;
  if not found then raise exception 'Tentative introuvable.'; end if;

  -- Idempotent retry after a successful submission whose HTTP response was lost.
  if v_attempt.status<>'in_progress' then
    if v_attempt.submitted_at is not null then
      return jsonb_build_object('submitted',true,'already_submitted',true,
        'status',v_attempt.status,'raw_score',v_attempt.raw_score,'normalized_score',v_attempt.normalized_score);
    end if;
    raise exception 'Tentative déjà terminée.';
  end if;
  if not exists(select 1 from public.written_exams where id=v_attempt.exam_id and status in ('published','open','scheduled')) then
    raise exception 'Examen clôturé.';
  end if;

  for v_key in select jsonb_object_keys(coalesce(p_answers,'{}'::jsonb)) loop
    if not exists(
      select 1 from public.written_exam_questions q
      join public.written_exam_sections s on s.id=q.section_id
      where s.version_id=v_attempt.version_id and q.id::text=v_key
    ) then raise exception 'Réponse associée à une question inconnue.'; end if;
  end loop;

  update public.written_exam_attempts
  set answers=coalesce(p_answers,'{}'::jsonb),updated_at=now()
  where id=p_attempt_id;

  v_result:=public.submit_written_exam(p_attempt_id);
  return v_result;
end
$written$;

revoke all on function public.advance_written_exam_question(uuid,text) from public;
revoke all on function public.submit_written_exam_with_answers(uuid,jsonb) from public;
grant execute on function public.advance_written_exam_question(uuid,text) to authenticated;
grant execute on function public.submit_written_exam_with_answers(uuid,jsonb) to authenticated;

notify pgrst,'reload schema';
