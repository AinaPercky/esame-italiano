-- Expose detailed copies for attempts whose results are already published.
-- Published exam versions are immutable: never UPDATE written_exam_versions.
-- Instead, use the mutable parent setting for the student-list presentation and
-- let the correction RPC rely on the already-enforced per-student publication gate.

alter table public.written_exams
  alter column show_corrections_after_publish set default true;

-- Enable the parent option only for exams that already have published results.
-- This does not touch immutable version rows, answers, scores or attempts.
update public.written_exams e
set show_corrections_after_publish = true
where e.show_corrections_after_publish = false
  and exists (
    select 1
    from public.written_exam_attempts a
    where a.exam_id = e.id
      and a.results_published = true
  );

-- Student list: for an attempt with published results, expose the copy action
-- based on the parent setting, not the immutable attempt-version flag. Keep all
-- existing ownership, class eligibility, score visibility and ordering rules.
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
  join lateral (
    select vv.*
    from public.written_exam_versions vv
    where vv.exam_id=e.id
      and vv.status='published'
      and exists(
        select 1 from public.written_exam_version_classes ec
        where ec.version_id=vv.id and ec.class_id=v_student.class_id
      )
    order by vv.version_number desc
    limit 1
  ) v on true
  left join lateral (
    select *
    from public.written_exam_attempts aa
    where aa.exam_id=e.id and aa.student_id=v_student.id
    order by aa.attempt_number desc
    limit 1
  ) a on true
  left join public.written_exam_versions av on av.id=a.version_id
  where (
    (a.status='in_progress' and e.status in ('published','scheduled','open'))
    or (e.status in ('published','scheduled','open')
      and (v.opens_at is null or v.opens_at<=now())
      and (v.closes_at is null or v.closes_at>now()))
    or (a.id is not null and e.status in ('published','scheduled','open','closed','grading','results_published'))
  );

  return v_result;
end
$written$;

-- Correction payload remains restricted to the authenticated student's own
-- attempt and is returned only after results_published=true. The immutable
-- version flag is deliberately not used as a second gate.
create or replace function public.get_my_written_exam_corrections(p_exam_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $written$
declare
  v_student_id uuid;
  v_attempt public.written_exam_attempts%rowtype;
  v_result jsonb;
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
  where exam_id=p_exam_id
    and student_id=v_student_id
    and results_published=true
  order by attempt_number desc
  limit 1;

  if not found then
    raise exception 'Résultats non publiés pour cet élève.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'section_title',s.title,
    'questions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'question_id',q.id,
        'prompt',q.prompt,
        'type',q.question_type,
        'points',q.points,
        'public_data',q.public_data,
        'student_answer',v_attempt.answers->q.id::text,
        'answer_key',k.answer_key,
        'explanation',k.explanation,
        'manual_review',q.manual_review,
        'manual_score',v_attempt.manual_scores->q.id::text
      ) order by coalesce(ord.sequence,q.position))
      from public.written_exam_questions q
      join public.written_exam_answer_keys k on k.question_id=q.id
      left join lateral jsonb_array_elements_text(
        coalesce(v_attempt.order_manifest->'questions'->s.id::text,'[]'::jsonb)
      ) with ordinality as ord(question_id,sequence) on ord.question_id=q.id::text
      where q.section_id=s.id
    ),'[]'::jsonb)
  ) order by coalesce(section_order.sequence,s.position)),'[]'::jsonb)
  into v_result
  from public.written_exam_sections s
  left join lateral jsonb_array_elements_text(
    coalesce(v_attempt.order_manifest->'sections','[]'::jsonb)
  ) with ordinality as section_order(section_id,sequence)
    on section_order.section_id=s.id::text
  where s.version_id=v_attempt.version_id;

  return v_result;
end
$written$;

revoke all on function public.get_my_written_exam_corrections(uuid) from public;
grant execute on function public.get_my_written_exam_corrections(uuid) to authenticated;
notify pgrst, 'reload schema';
