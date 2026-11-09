-- End-to-end test for the teacher-entered expression-writing component.
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
  v_result jsonb;
  v_score numeric;
  v_max numeric;
  v_normalized numeric;
  v_expression numeric;
  v_status text;
begin
  insert into public.classes(id,name) values(v_class,'Expression score CI class');
  insert into public.students(id,class_id,first_name,last_name,email,student_number,validation_status)
  values(v_student,v_class,'Expression','Student','expression-score-ci@example.test','EXPR-001','approved');

  perform set_config('request.jwt.claims',jsonb_build_object('email','ainapercky@gmail.com','sub',v_admin::text)::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);

  v_saved:=public.save_written_exam_definition(null,jsonb_build_object(
    'title','Expression writing /100 CI',
    'description','90 points automatiques + expression écrite /10',
    'level','B1','target_language','it','instruction_language','fr',
    'duration_minutes',30,'class_ids',jsonb_build_array(v_class::text),
    'display_scale',100,'max_attempts',1,'shuffle_sections',false,
    'shuffle_questions',false,'shuffle_options',false,
    'sections',jsonb_build_array(jsonb_build_object(
      'id','section','title','Évaluation automatique','points',90,
      'shuffle',false,'questions',jsonb_build_array(jsonb_build_object(
        'id','qcm-90','type','qcm','prompt','Question automatique sur 90 points',
        'points',90,'shuffle_options',false,
        'options',jsonb_build_array(
          jsonb_build_object('id','correct','label','Bonne réponse'),
          jsonb_build_object('id','wrong','label','Mauvaise réponse')
        ),
        'answer_key',jsonb_build_object('correctOptionId','correct')
      ))
    ))
  ));

  v_exam:=(v_saved->>'exam_id')::uuid;
  v_version:=(v_saved->>'version_id')::uuid;
  perform public.set_written_exam_expression_writing_max_points(v_version,10);
  perform public.publish_written_exam(v_exam,v_version);

  perform set_config('request.jwt.claims',jsonb_build_object('email','expression-score-ci@example.test','sub',v_student::text)::text,true);
  perform set_config('request.jwt.claim.sub',v_student::text,true);
  v_started:=public.start_written_exam(v_exam);
  v_attempt:=(v_started->>'attempt_id')::uuid;
  select q.id into v_question
  from public.written_exam_questions q
  join public.written_exam_sections s on s.id=q.section_id
  where s.version_id=v_version and q.question_key='qcm-90';

  perform public.save_written_exam_answers(v_attempt,jsonb_build_object(v_question::text,'correct'));
  perform public.submit_written_exam(v_attempt);

  perform set_config('request.jwt.claims',jsonb_build_object('email','ainapercky@gmail.com','sub',v_admin::text)::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);

  begin
    perform public.publish_written_exam_results(v_exam);
    raise exception 'Publishing unexpectedly succeeded without the expression-writing score.';
  exception when others then
    if position('expression écrite' in lower(sqlerrm))=0 then raise; end if;
  end;

  v_result:=public.grade_written_exam_expression_writing(v_attempt,8);
  perform public.publish_written_exam_results(v_exam);

  select raw_score,raw_max,normalized_score,expression_writing_score,status
  into v_score,v_max,v_normalized,v_expression,v_status
  from public.written_exam_attempts where id=v_attempt;

  if v_score<>98 or v_max<>100 or v_normalized<>98 or v_expression<>8 or v_status<>'graded' then
    raise exception 'Incorrect combined grade: raw %, max %, normalized %, expression %, status %',
      v_score,v_max,v_normalized,v_expression,v_status;
  end if;
end
$written$;

rollback;
