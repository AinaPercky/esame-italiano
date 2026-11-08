-- End-to-end database test for the isolated PostgreSQL CI database.
-- The whole test runs in a transaction and is rolled back.
begin;

create temporary table written_exam_ci_context (
  exam_id uuid not null,
  version_id uuid not null,
  student_id uuid not null,
  class_id uuid not null,
  attempt_id uuid not null
);
grant select on written_exam_ci_context to authenticated;

do $written$
declare
  v_admin_id uuid:=gen_random_uuid();
  v_class_id uuid:=gen_random_uuid();
  v_student_id uuid:=gen_random_uuid();
  v_exam_id uuid;
  v_version_id uuid;
  v_attempt_id uuid;
  v_qcm_id uuid;
  v_text_id uuid;
  v_reorder_id uuid;
  v_manual_id uuid;
  v_verbes_id uuid;
  v_saved jsonb;
  v_started jsonb;
  v_started_again jsonb;
  v_answers jsonb;
  v_result jsonb;
  v_list jsonb;
  v_corrections jsonb;
  v_second_saved jsonb;
  v_second_started jsonb;
  v_scheduled_saved jsonb;
  v_scheduled_exam_id uuid;
  v_raw_score numeric;
  v_auto_score numeric;
  v_normalized numeric;
  v_status text;
  v_section_count integer;
  v_question_key text;
  v_offset integer;
  v_error text;
begin
  insert into public.classes(id,name) values(v_class_id,'CI test class');
  insert into public.students(id,class_id,first_name,last_name,email,student_number,validation_status)
  values(v_student_id,v_class_id,'Test','Student','student-written-exam-ci@example.test','CI-001','approved');

  perform set_config('request.jwt.claims',jsonb_build_object('email','ainapercky@gmail.com','sub',v_admin_id::text)::text,true);
  perform set_config('request.jwt.claim.sub',v_admin_id::text,true);

  v_saved:=public.save_written_exam_definition(null,jsonb_build_object(
    'title','DB flow v1','description','PostgreSQL integration test','level','A1',
    'target_language','it','instruction_language','fr','duration_minutes',30,
    'class_ids',jsonb_build_array(v_class_id::text),'opens_at',null,'closes_at',null,
    'display_scale',100,'max_attempts',2,'shuffle_sections',false,'shuffle_questions',false,
    'shuffle_options',false,'navigation_mode','free','show_score_after_publish',true,
    'show_corrections_after_publish',true,
    'integrity_settings',jsonb_build_object('fullscreen',false,'warn_on_tab_switch',true,'watermark',false),
    'sections',jsonb_build_array(
      jsonb_build_object('id','section-one','title','Section one','points',0,'shuffle',false,'questions',jsonb_build_array(
        jsonb_build_object('id','qcm-one','type','qcm','prompt','QCM prompt','points',2,'shuffle_options',false,
          'options',jsonb_build_array(
            jsonb_build_object('id','a','label','Option A','is_correct',true),
            jsonb_build_object('id','b','label','Option B','is_correct',false)
          ),
          'answer_key',jsonb_build_object('correctOptionId','a')
        ),
        jsonb_build_object('id','multi-one','type','text','prompt','Multi blank prompt','points',2,'blank_count',2,
          'answer_key',jsonb_build_object('answers',jsonb_build_array(jsonb_build_array('sono'),jsonb_build_array('ho')))
        )
      )),
      jsonb_build_object('id','section-two','title','Section two','points',0,'shuffle',false,'questions',jsonb_build_array(
        jsonb_build_object('id','reorder-one','type','reorder','prompt','Reorder prompt','points',3,'shuffle_options',false,
          'items',jsonb_build_array(
            jsonb_build_object('id','i1','text','Io','is_correct',true),
            jsonb_build_object('id','i2','text','studio','is_correct',true),
            jsonb_build_object('id','i3','text','italiano','is_correct',true)
          ),
          'answer_key',jsonb_build_object('correctOrder',jsonb_build_array('i1','i2','i3'))
        ),
        jsonb_build_object('id','manual-one','type','text','prompt','Manual prompt','points',1,'manual_review',true,
          'answer_key','{}'::jsonb
        ),
        jsonb_build_object('id','verb-bank-one','type','verbes_trous','prompt','Verb bank prompt','points',9,
          'verbes_trous',jsonb_build_object('titre','Verbi riflessivi','consigne','Scegli e coniuga','points_par_phrase',3,
            'banque',jsonb_build_array('addormentarsi','bere','dire'),
            'phrases',jsonb_build_array(jsonb_build_object('id',1,'debut','Io ','fin',' subito.'),jsonb_build_object('id',2,'debut','Noi ','fin',' caffè.'),jsonb_build_object('id',3,'debut','Io ','fin',' quello che penso.'))),
          'answer_key',jsonb_build_object('phrases',jsonb_build_array(
            jsonb_build_object('id',1,'verbe','addormentarsi','reponses',jsonb_build_array('mi addormento')),
            jsonb_build_object('id',2,'verbe','bere','reponses',jsonb_build_array('beviamo')),
            jsonb_build_object('id',3,'verbe','dire','reponses',jsonb_build_array('dico'))
          ))
        )
      ))
    )
  ));

  v_exam_id:=(v_saved->>'exam_id')::uuid;
  v_version_id:=(v_saved->>'version_id')::uuid;
  if (v_saved->>'raw_max')::numeric<>17 then raise exception 'Expected raw maximum 17, got %',v_saved->>'raw_max'; end if;

  select count(*) into v_section_count from public.written_exam_sections where version_id=v_version_id;
  if v_section_count<>2 then raise exception 'Expected 2 sections, got %',v_section_count; end if;
  if (select count(distinct position) from public.written_exam_sections where version_id=v_version_id)<>2 then
    raise exception 'Section positions were not assigned sequentially.';
  end if;
  if exists(
    select 1 from public.written_exam_questions q
    join public.written_exam_sections s on s.id=q.section_id
    where s.version_id=v_version_id
    group by q.section_id having count(*)<>count(distinct q.position)
  ) then raise exception 'Question positions were not assigned sequentially.'; end if;

  perform public.publish_written_exam(v_exam_id,v_version_id);

  perform set_config('request.jwt.claims',jsonb_build_object('email','student-written-exam-ci@example.test','sub',v_student_id::text)::text,true);
  perform set_config('request.jwt.claim.sub',v_student_id::text,true);

  v_started:=public.start_written_exam(v_exam_id);
  v_attempt_id:=(v_started->>'attempt_id')::uuid;
  perform public.get_or_start_written_exam_question_timer(v_attempt_id);

  if v_started::text like '%answer_key%' or v_started::text like '%is_correct%' or v_started::text like '%"reponses"%' or v_started::text like '%"verbe"%' then
    raise exception 'Private answer-key fields leaked into the student exam payload.';
  end if;

  select (q.value->>'id')::uuid into v_qcm_id
  from jsonb_array_elements(v_started->'sections') sec(value)
  cross join lateral jsonb_array_elements(sec.value->'questions') q(value)
  where q.value->>'prompt'='QCM prompt';
  select (q.value->>'id')::uuid into v_text_id
  from jsonb_array_elements(v_started->'sections') sec(value)
  cross join lateral jsonb_array_elements(sec.value->'questions') q(value)
  where q.value->>'prompt'='Multi blank prompt';
  select (q.value->>'id')::uuid into v_reorder_id
  from jsonb_array_elements(v_started->'sections') sec(value)
  cross join lateral jsonb_array_elements(sec.value->'questions') q(value)
  where q.value->>'prompt'='Reorder prompt';
  select (q.value->>'id')::uuid into v_manual_id
  from jsonb_array_elements(v_started->'sections') sec(value)
  cross join lateral jsonb_array_elements(sec.value->'questions') q(value)
  where q.value->>'prompt'='Manual prompt';
  select (q.value->>'id')::uuid into v_verbes_id
  from jsonb_array_elements(v_started->'sections') sec(value)
  cross join lateral jsonb_array_elements(sec.value->'questions') q(value)
  where q.value->>'prompt'='Verb bank prompt';

  if v_qcm_id is null or v_text_id is null or v_reorder_id is null or v_manual_id is null or v_verbes_id is null then
    raise exception 'A question was missing from the student payload.';
  end if;

  v_answers:=jsonb_build_object(
    v_qcm_id::text,'a',
    v_text_id::text,'["sono","wrong"]',
    v_reorder_id::text,'["i1","i3","i2"]',
    v_manual_id::text,'free response',
    v_verbes_id::text,jsonb_build_object('1',jsonb_build_object('verbe_choisi','addormentarsi','texte_saisi','mi addormento'),'2',jsonb_build_object('verbe_choisi','dire','texte_saisi','beviamo'),'3',jsonb_build_object('verbe_choisi','not_in_bank','texte_saisi','dico'))
  );
  for v_question_key in select key from jsonb_each(v_answers) loop
    with ordered_questions as (
      select q.id::text as question_id,
        coalesce(nullif(q.public_data->>'time_limit_seconds','')::integer,30) as duration_seconds,
        row_number() over(order by sec.section_ord,oq.question_ord) as question_order
      from public.written_exam_attempts a
      cross join lateral jsonb_array_elements_text(a.order_manifest->'sections')
        with ordinality as sec(section_id,section_ord)
      cross join lateral jsonb_array_elements_text(a.order_manifest->'questions'->(sec.section_id))
        with ordinality as oq(question_id,question_ord)
      join public.written_exam_questions q on q.id::text=oq.question_id
      where a.id=v_attempt_id
    )
    select coalesce(sum(previous.duration_seconds),0)::integer into v_offset
    from ordered_questions current_question
    left join ordered_questions previous on previous.question_order<current_question.question_order
    where current_question.question_id=v_question_key
    group by current_question.question_order;

    update public.written_exam_attempts
    set question_timer_started_at=now()-make_interval(secs=>v_offset+1)
    where id=v_attempt_id;
    perform public.save_written_exam_question_answer(v_attempt_id,v_question_key,v_answers->v_question_key);
  end loop;
  v_result:=public.submit_written_exam(v_attempt_id);
  if coalesce((v_result->>'needs_review')::boolean,false) is not true then
    raise exception 'Manual-review question did not put the attempt into review.';
  end if;

  select status,auto_score into v_status,v_auto_score
  from public.written_exam_attempts where id=v_attempt_id;
  if v_status<>'needs_review' or v_auto_score<>9 then
    raise exception 'Unexpected automatic grading result: status %, score %',v_status,v_auto_score;
  end if;

  perform set_config('request.jwt.claims',jsonb_build_object('email','ainapercky@gmail.com','sub',v_admin_id::text)::text,true);
  perform set_config('request.jwt.claim.sub',v_admin_id::text,true);
  v_result:=public.grade_written_exam_attempt(v_attempt_id,jsonb_build_object(v_manual_id::text,1));
  perform public.grade_written_exam_attempt(v_attempt_id,jsonb_build_object(v_manual_id::text,1));

  select raw_score,normalized_score,status into v_raw_score,v_normalized,v_status
  from public.written_exam_attempts where id=v_attempt_id;
  if v_status<>'graded' or v_raw_score<>10 or v_normalized<>58.82 then
    raise exception 'Unexpected final grading result: status %, raw %, normalized %',v_status,v_raw_score,v_normalized;
  end if;
  if (select coalesce(sum(raw_score),0) from public.written_exam_section_results where attempt_id=v_attempt_id)<>10 then
    raise exception 'Repeated manual grading changed the section total.';
  end if;

  perform public.publish_written_exam_results(v_exam_id);
  perform set_config('request.jwt.claims',jsonb_build_object('email','student-written-exam-ci@example.test','sub',v_student_id::text)::text,true);
  perform set_config('request.jwt.claim.sub',v_student_id::text,true);

  v_list:=public.list_available_written_exams();
  if jsonb_array_length(v_list)<>1 then raise exception 'Expected one available exam card after publication.'; end if;
  if (v_list->0->>'raw_score')::numeric<>10 or (v_list->0->>'attempt_raw_max')::numeric<>17 then
    raise exception 'Published score or original attempt maximum is incorrect.';
  end if;
  v_corrections:=public.get_my_written_exam_corrections(v_exam_id);
  if jsonb_array_length(v_corrections)<>2 then raise exception 'Expected two correction sections.'; end if;
  if not (v_corrections->0->'questions'->0 ? 'answer_key') then raise exception 'Published corrections do not include the answer key. '; end if;

  insert into written_exam_ci_context(exam_id,version_id,student_id,class_id,attempt_id)
  values(v_exam_id,v_version_id,v_student_id,v_class_id,v_attempt_id);
end
$written$;

-- Publish a second immutable version for the same class. Students should see one card
-- and new attempts should use this class's latest published version.
do $written$
declare
  v_admin_id uuid:=gen_random_uuid();
  v_class_two uuid:=gen_random_uuid();
  v_student_two uuid:=gen_random_uuid();
  v_ctx record;
  v_saved jsonb;
  v_started jsonb;
  v_started_again jsonb;
  v_version_id uuid;
  v_attempt_id uuid;
  v_list jsonb;
begin
  select * into v_ctx from written_exam_ci_context limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('email','ainapercky@gmail.com','sub',v_admin_id::text)::text,true);
  perform set_config('request.jwt.claim.sub',v_admin_id::text,true);
  insert into public.classes(id,name) values(v_class_two,'CI second class');
  insert into public.students(id,class_id,first_name,last_name,email,student_number,validation_status)
  values(v_student_two,v_class_two,'Second','Student','student-written-exam-ci-two@example.test','CI-002','approved');

  v_saved:=public.save_written_exam_definition(v_ctx.exam_id,jsonb_build_object(
    'title','DB flow v2','description','Second immutable version for another class','level','A1',
    'target_language','it','instruction_language','fr','duration_minutes',30,
    'class_ids',jsonb_build_array(v_class_two::text),'opens_at',null,'closes_at',null,
    'display_scale',100,'max_attempts',2,'shuffle_sections',false,'shuffle_questions',false,
    'shuffle_options',false,'navigation_mode','free','show_score_after_publish',true,
    'show_corrections_after_publish',true,
    'integrity_settings',jsonb_build_object('fullscreen',false,'warn_on_tab_switch',true,'watermark',false),
    'sections',jsonb_build_array(jsonb_build_object('id','v2-section','title','Version two section','points',0,'shuffle',false,
      'questions',jsonb_build_array(jsonb_build_object('id','v2-qcm','type','qcm','prompt','Version two QCM','points',1,'shuffle_options',false,
        'options',jsonb_build_array(jsonb_build_object('id','a','label','A'),jsonb_build_object('id','b','label','B')),
        'answer_key',jsonb_build_object('correctOptionId','a')
      ))
    ))
  ));
  v_version_id:=(v_saved->>'version_id')::uuid;
  perform public.publish_written_exam(v_ctx.exam_id,v_version_id);

  -- The first student must still receive the older version assigned to class one.
  perform set_config('request.jwt.claims',jsonb_build_object('email','student-written-exam-ci@example.test','sub',v_ctx.student_id::text)::text,true);
  perform set_config('request.jwt.claim.sub',v_ctx.student_id::text,true);
  v_list:=public.list_available_written_exams();
  if jsonb_array_length(v_list)<>1 or v_list->0->>'title'<>'DB flow v1' then
    raise exception 'Student in class one did not retain the version assigned to class one.';
  end if;
  v_started:=public.start_written_exam(v_ctx.exam_id);
  v_attempt_id:=(v_started->>'attempt_id')::uuid;
  if v_started->'exam'->>'title'<>'DB flow v1' then raise exception 'Student in class one started a version assigned to another class.'; end if;
  v_started_again:=public.start_written_exam(v_ctx.exam_id);
  if (v_started_again->>'attempt_id')::uuid<>v_attempt_id then raise exception 'Resume created a second attempt instead of reusing the active attempt.'; end if;

  -- The second student must receive and start the newer version assigned to class two.
  perform set_config('request.jwt.claims',jsonb_build_object('email','student-written-exam-ci-two@example.test','sub',v_student_two::text)::text,true);
  perform set_config('request.jwt.claim.sub',v_student_two::text,true);
  v_list:=public.list_available_written_exams();
  if jsonb_array_length(v_list)<>1 or v_list->0->>'title'<>'DB flow v2' then
    raise exception 'Student in class two did not receive the latest version assigned to class two.';
  end if;
  v_started:=public.start_written_exam(v_ctx.exam_id);
  if v_started->'exam'->>'title'<>'DB flow v2' then raise exception 'Student in class two did not start the class-specific latest version.'; end if;
end
$written$;

-- As a student, direct table reads must not expose exam questions, answer keys or attempts,
-- while the authenticated RPC interface remains usable.
set local role authenticated;
do $written$
declare
  v_ctx record;
  v_list jsonb;
  v_corrections jsonb;
begin
  select * into v_ctx from written_exam_ci_context limit 1;
  -- Restore the first student's JWT after the multi-class scenario switched to student two.
  perform set_config('request.jwt.claims',jsonb_build_object('email','student-written-exam-ci@example.test','sub',v_ctx.student_id::text)::text,true);
  perform set_config('request.jwt.claim.sub',v_ctx.student_id::text,true);
  if exists(select 1 from public.written_exam_answer_keys) then raise exception 'Student can read private answer keys directly.'; end if;
  if exists(select 1 from public.written_exam_questions) then raise exception 'Student can read exam questions directly.'; end if;
  if exists(select 1 from public.written_exam_attempts) then raise exception 'Student can read attempts directly.'; end if;
  v_list:=public.list_available_written_exams();
  if jsonb_array_length(v_list)<1 then raise exception 'Student RPC list is unavailable.'; end if;
  v_corrections:=public.get_my_written_exam_corrections(v_ctx.exam_id);
  if jsonb_array_length(v_corrections)<>2 then raise exception 'Student corrections RPC is unavailable after publication.'; end if;
end
$written$;
reset role;

rollback;
