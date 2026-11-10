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

  perform public.save_written_exam_question_answer(v_attempt,v_correct_question,'"correct phrase"'::jsonb);
  perform public.save_written_exam_question_answer(v_attempt,v_wrong_question,'"student wording"'::jsonb);
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
