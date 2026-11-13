-- Exercise server-side grading for all question types.
do $grade$
declare
  v_result jsonb;
begin
  v_result := public.exercise_grade_question(
    '{"type":"text","correct_answer":"parlo | scrivi","points":2}'::jsonb,
    '["parlo","scrivi"]'::jsonb
  );
  if coalesce((v_result ->> 'correct')::boolean,false) is not true or (v_result ->> 'points')::numeric <> 2 then
    raise exception 'Text multi-blank grading failed';
  end if;

  v_result := public.exercise_grade_question(
    '{"type":"reorder","points":1,"items":[{"id":"a"},{"id":"b"}]}'::jsonb,
    '["a","b"]'::jsonb
  );
  if coalesce((v_result ->> 'correct')::boolean,false) is not true then
    raise exception 'Reorder grading failed';
  end if;

  v_result := public.exercise_grade_question(
    '{"type":"verbes_trous","points":2,"verbes_trous":{"phrases":[{"id":"1","reponses":["vado"]},{"id":"2","reponses":["sei"]}]}}'::jsonb,
    '{"1":{"texte_saisi":"vado"},"2":{"texte_saisi":"sei"}}'::jsonb
  );
  if coalesce((v_result ->> 'correct')::boolean,false) is not true or (v_result ->> 'points')::numeric <> 2 then
    raise exception 'Verbes à trous grading failed';
  end if;
end;
$grade$;

-- End-to-end database contract for the exercises module.
-- Run after 20261113000000_exercises_module.sql in the isolated CI database.
insert into auth.users(id,email) values
('11111111-1111-4111-8111-111111111111','ainapercky@gmail.com'),
('22222222-2222-4222-8222-222222222222','student@example.test');

insert into public.classes(id,name) values
('33333333-3333-4333-8333-333333333333','Classe Exercices');

insert into public.students(id,class_id,first_name,last_name,email,validation_status)
values ('44444444-4444-4444-8444-444444444444',
        '33333333-3333-4333-8333-333333333333',
        'Student','Test','student@example.test','approved');

set role authenticated;
select set_config('request.jwt.claims','{"email":"ainapercky@gmail.com"}',false);
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

select set_config(
  'test.exercise_id',
  public.save_exercise_definition(
    null,
    '{"title":"Exercice CI","description":"Test","category":"Grammaire","level":"A1","status":"published"}'::jsonb,
    '{"questions":[{"id":"q1","type":"qcm","question":"Qual è la risposta?","options":["sono","sei","è"],"correct_answer":"sono","points":2,"time_limit_seconds":30,"explanation":"Sono è la prima persona."}]}'::jsonb,
    array['33333333-3333-4333-8333-333333333333'::uuid]
  )::text,
  false
);

reset role;
set role authenticated;
select set_config('request.jwt.claims','{"email":"student@example.test"}',false);
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);

do $$
declare
  v_exercise_id uuid := current_setting('test.exercise_id')::uuid;
  v_attempt jsonb;
  v_attempt_id uuid;
  v_correction jsonb;
  v_retry jsonb;
  v_advance jsonb;
  v_count integer;
begin
  if jsonb_array_length(public.list_student_exercises()) <> 1 then
    raise exception 'Student should only see exercises assigned to their class';
  end if;

  if (select count(*) from public.exercise_versions) <> 0 then
    raise exception 'Student must not be able to read exercise answer keys directly';
  end if;

  v_attempt := public.start_exercise_attempt(v_exercise_id);
  if v_attempt #>> '{question,correct_answer}' is not null then
    raise exception 'Correct answer leaked before submission';
  end if;
  if (v_attempt #>> '{question,time_limit_seconds}')::integer <> 30 then
    raise exception 'Question timer was not preserved';
  end if;

  v_attempt_id := (v_attempt ->> 'attempt_id')::uuid;
  v_correction := public.submit_exercise_answer(v_attempt_id, '"wrong"'::jsonb);
  if coalesce((v_correction ->> 'correct')::boolean,true) then
    raise exception 'Incorrect answer was graded as correct';
  end if;
  if v_correction ->> 'expected' <> 'sono' then
    raise exception 'Correction did not reveal the expected answer after submission';
  end if;
  v_retry := public.submit_exercise_answer(v_attempt_id, '"wrong"'::jsonb);
  if v_retry ->> 'points' <> v_correction ->> 'points' then
    raise exception 'Retrying an already committed answer must return the same correction';
  end if;

  v_advance := public.advance_exercise_attempt(v_attempt_id);
  if coalesce((v_advance ->> 'completed')::boolean,false) is not true then
    raise exception 'Single-question exercise should complete after advancing';
  end if;

  v_count := jsonb_array_length(public.get_student_exercise_results());
  if v_count <> 1 then raise exception 'Student attempt history was not persisted'; end if;

  -- A second independent attempt is allowed.
  v_attempt := public.start_exercise_attempt(v_exercise_id);
  if (v_attempt ->> 'attempt_id')::uuid = v_attempt_id then
    raise exception 'A new attempt must have its own identifier';
  end if;
  perform set_config('test.attempt2', v_attempt ->> 'attempt_id', false);
end;
$$;

reset role;
update public.exercise_attempts
set current_question_deadline_at = now() - interval '1 second'
where id = current_setting('test.attempt2')::uuid;
set role authenticated;
select set_config('request.jwt.claims','{"email":"student@example.test"}',false);
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $timeout$
declare v_result jsonb;
begin
  v_result := public.submit_exercise_answer(current_setting('test.attempt2')::uuid, '"sono"'::jsonb);
  if coalesce((v_result ->> 'timed_out')::boolean,false) is not true or coalesce((v_result ->> 'points')::numeric,1) <> 0 then
    raise exception 'Expired question must be graded as a timeout with zero points';
  end if;
end;
$timeout$;

reset role;
set role authenticated;
select set_config('request.jwt.claims','{"email":"ainapercky@gmail.com"}',false);
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

do $$
declare
  v_exercise_id uuid := current_setting('test.exercise_id')::uuid;
  v_attempts jsonb;
begin
  v_attempts := public.get_teacher_exercise_attempts(v_exercise_id);
  if jsonb_array_length(v_attempts) <> 2 then
    raise exception 'Teacher should see both independent student attempts';
  end if;
end;
$$;

reset role;
