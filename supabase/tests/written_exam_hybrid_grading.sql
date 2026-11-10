-- Automatic grading is retained as the initial proposal for questions that also require
-- teacher review. A manual mark replaces (rather than adds to) the automatic proposal.
begin;

do $written$
declare
  v_admin uuid:=gen_random_uuid();
  v_class uuid:=gen_random_uuid();
  v_student uuid:=gen_random_uuid();
  v_exam uuid;
  v_version uuid;
  v_attempt uuid;
  v_correct_question uuid;
  v_wrong_question uuid;
  v_saved jsonb;
  v_started jsonb;
  v_result jsonb;
  v_auto numeric;
  v_raw numeric;
  v_section_raw numeric;
  v_status text;
  v_answers jsonb;
  v_question_key text;
  v_offset integer;
  v_duration integer;
begin
  insert into public.classes(id,name) values(v_class,'Hybrid grading CI class');
  insert into public.students(id,class_id,first_name,last_name,email,student_number,validation_status)
  values(v_student,v_class,'Hybrid','Student','hybrid-grading-ci@example.test','HYBRID-001','approved');

  perform set_config('request.jwt.claims',jsonb_build_object('email','ainapercky@gmail.com','sub',v_admin::text)::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);

  v_saved:=public.save_written_exam_definition(null,jsonb_build_object(
    'title','Hybrid grading CI',
    'description','Automatic proposal followed by teacher review',
    'level','B1','target_language','it','instruction_language','fr',
    'duration_minutes',20,'class_ids',jsonb_build_array(v_class::text),
    'display_scale',100,'max_attempts',1,'shuffle_sections',false,
    'shuffle_questions',false,'shuffle_options',false,
    'sections',jsonb_build_array(jsonb_build_object(
      'id','hybrid-section','title','Compréhension écrite','points',4,
      'shuffle',false,'questions',jsonb_build_array(
        jsonb_build_object('id','auto-correct-text','type','text','prompt','Question with an automatic match','points',2,'manual_review',true,
          'answer_key',jsonb_build_object('acceptedAnswers',jsonb_build_array('correct phrase'))),
        jsonb_build_object('id','auto-wrong-text','type','text','prompt','Question requiring teacher override','points',2,'manual_review',true,
          'answer_key',jsonb_build_object('acceptedAnswers',jsonb_build_array('expected answer')))
      )
    ))
  ));
  v_exam:=(v_saved->>'exam_id')::uuid;
  v_version:=(v_saved->>'version_id')::uuid;
  perform public.publish_written_exam(v_exam,v_version);

  perform set_config('request.jwt.claims',jsonb_build_object('email','hybrid-grading-ci@example.test','sub',v_student::text)::text,true);
  perform set_config('request.jwt.claim.sub',v_student::text,true);
  v_started:=public.start_written_exam(v_exam);
  v_attempt:=(v_started->>'attempt_id')::uuid;
  perform public.get_or_start_written_exam_question_timer(v_attempt);

  select q.id into v_correct_question
  from public.written_exam_questions q
  join public.written_exam_sections s on s.id=q.section_id
  where s.version_id=v_version and q.question_key='auto-correct-text';
  select q.id into v_wrong_question
  from public.written_exam_questions q
  join public.written_exam_sections s on s.id=q.section_id
  where s.version_id=v_version and q.question_key='auto-wrong-text';

  v_answers:=jsonb_build_object(
    v_correct_question::text,'correct phrase',
    v_wrong_question::text,'student wording'
  );
  -- The question timer is sequential: position the server timer at each question
  -- before saving its answer, regardless of the per-attempt random order.
  for v_question_key in select key from jsonb_each(v_answers)
  loop
    with ordered_questions as (
      select q.id::text as question_id,
        coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,
          case when q.question_type in ('text','verbes_trous') then 32 else 17 end) as duration_seconds,
        row_number() over(order by sec.section_ord,oq.question_ord) as question_order
      from public.written_exam_attempts a
      cross join lateral jsonb_array_elements_text(a.order_manifest->'sections')
        with ordinality as sec(section_id,section_ord)
      cross join lateral jsonb_array_elements_text(a.order_manifest->'questions'->(sec.section_id))
        with ordinality as oq(question_id,question_ord)
      join public.written_exam_questions q on q.id::text=oq.question_id
      where a.id=v_attempt
    )
    select coalesce(sum(previous.duration_seconds),0)::integer,current_question.duration_seconds
    into v_offset,v_duration
    from ordered_questions current_question
    left join ordered_questions previous on previous.question_order<current_question.question_order
    where current_question.question_id=v_question_key
    group by current_question.question_order,current_question.duration_seconds;

    update public.written_exam_attempts
    set question_timer_started_at=now()-make_interval(secs=>v_offset+1)
    where id=v_attempt;
    perform public.save_written_exam_question_answer(v_attempt,v_question_key,v_answers->v_question_key);
  end loop;
  v_result:=public.submit_written_exam(v_attempt);

  select auto_score,raw_score,status into v_auto,v_raw,v_status
  from public.written_exam_attempts where id=v_attempt;
  if v_auto<>2 or v_raw<>2 or v_status<>'needs_review'
     or coalesce((v_result->>'needs_review')::boolean,false) is not true then
    raise exception 'Automatic correction was not applied before manual review: auto %, raw %, status %',v_auto,v_raw,v_status;
  end if;

  perform set_config('request.jwt.claims',jsonb_build_object('email','ainapercky@gmail.com','sub',v_admin::text)::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  v_result:=public.grade_written_exam_attempt(v_attempt,jsonb_build_object(
    v_correct_question::text,1,
    v_wrong_question::text,2
  ));

  select raw_score,auto_score,status into v_raw,v_auto,v_status
  from public.written_exam_attempts where id=v_attempt;
  select raw_score into v_section_raw
  from public.written_exam_section_results where attempt_id=v_attempt limit 1;
  if v_auto<>2 or v_raw<>3 or v_section_raw<>3 or v_status<>'graded' then
    raise exception 'Manual marks did not replace the automatic proposal: auto %, raw %, section %, status %',v_auto,v_raw,v_section_raw,v_status;
  end if;

  -- Repeating the same manual correction must not add the points twice.
  perform public.grade_written_exam_attempt(v_attempt,jsonb_build_object(
    v_correct_question::text,1,
    v_wrong_question::text,2
  ));
  select raw_score into v_raw from public.written_exam_attempts where id=v_attempt;
  if v_raw<>3 then raise exception 'Repeated hybrid grading changed the final score to %',v_raw; end if;

  perform public.publish_written_exam_results(v_exam);
end
$written$;

rollback;
