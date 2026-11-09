-- End-to-end test: a tab switch forces a written-exam attempt to zero, including manual-review and expression-writing components.
begin;

do $written$
declare
  v_admin uuid:=gen_random_uuid();
  v_class uuid:=gen_random_uuid();
  v_student uuid:=gen_random_uuid();
  v_exam uuid;
  v_version uuid;
  v_attempt uuid;
  v_question uuid;
  v_saved jsonb;
  v_started jsonb;
  v_score numeric;
  v_max numeric;
  v_normalized numeric;
  v_expression numeric;
  v_failed boolean;
  v_status text;
begin
  insert into public.classes(id,name) values(v_class,'Integrity zero CI class');
  insert into public.students(id,class_id,first_name,last_name,email,student_number,validation_status)
  values(v_student,v_class,'Integrity','Student','integrity-zero-ci@example.test','INTEGRITY-001','approved');

  perform set_config('request.jwt.claims',jsonb_build_object('email','ainapercky@gmail.com','sub',v_admin::text)::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);

  v_saved:=public.save_written_exam_definition(null,jsonb_build_object(
    'title','Integrity zero /100 CI',
    'description','90 automatic points + written expression /10',
    'level','B1','target_language','it','instruction_language','fr',
    'duration_minutes',30,'class_ids',jsonb_build_array(v_class::text),
    'display_scale',100,'max_attempts',1,'shuffle_sections',false,
    'shuffle_questions',false,'shuffle_options',false,
    'sections',jsonb_build_array(jsonb_build_object(
      'id','section','title','Automatic assessment','points',90,
      'shuffle',false,'questions',jsonb_build_array(jsonb_build_object(
        'id','qcm-80','type','qcm','prompt','Automatic question worth 80 points',
        'points',80,'shuffle_options',false,
        'options',jsonb_build_array(
          jsonb_build_object('id','correct','label','Correct answer'),
          jsonb_build_object('id','wrong','label','Wrong answer')
        ),
        'answer_key',jsonb_build_object('correctOptionId','correct')
      ),jsonb_build_object(
        'id','manual-10','type','text','prompt','Short written response for manual review',
        'points',10,'manual_review',true,
        'answer_key',jsonb_build_object('acceptedAnswers',jsonb_build_array('accepted'))
      ))
    ))
  ));

  v_exam:=(v_saved->>'exam_id')::uuid;
  v_version:=(v_saved->>'version_id')::uuid;
  perform public.set_written_exam_expression_writing_max_points(v_version,10);
  perform public.publish_written_exam(v_exam,v_version);

  perform set_config('request.jwt.claims',jsonb_build_object('email','integrity-zero-ci@example.test','sub',v_student::text)::text,true);
  perform set_config('request.jwt.claim.sub',v_student::text,true);
  v_started:=public.start_written_exam(v_exam);
  v_attempt:=(v_started->>'attempt_id')::uuid;
  select q.id into v_question
  from public.written_exam_questions q
  join public.written_exam_sections s on s.id=q.section_id
  where s.version_id=v_version and q.question_type='qcm'\n  limit 1;\n  if v_question is null then raise exception 'CI fixture did not create a QCM question.'; end if;

  perform public.save_written_exam_answers(v_attempt,jsonb_build_object(v_question::text,'correct'));
  perform public.flag_written_exam_integrity_violation(v_attempt,'visibility_hidden',jsonb_build_object('source','ci-test'));
  perform public.submit_written_exam(v_attempt);

  perform set_config('request.jwt.claims',jsonb_build_object('email','ainapercky@gmail.com','sub',v_admin::text)::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform public.publish_written_exam_results(v_exam);

  select raw_score,raw_max,normalized_score,expression_writing_score,integrity_failed,status
  into v_score,v_max,v_normalized,v_expression,v_failed,v_status
  from public.written_exam_attempts where id=v_attempt;

  if v_score<>0 or v_max<>100 or v_normalized<>0 or v_expression<>0
     or not v_failed or v_status<>'graded' then
    raise exception 'Integrity penalty was not enforced: raw %, max %, normalized %, expression %, failed %, status %',
      v_score,v_max,v_normalized,v_expression,v_failed,v_status;
  end if;
end
$written$;

rollback;
