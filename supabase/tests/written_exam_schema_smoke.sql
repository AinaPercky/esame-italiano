-- Smoke test for the composite written exam schema.
-- Run after applying the migration in a disposable Supabase test project.
do $written$
declare
  v_table text;
  v_required text[] := array[
    'written_exams','written_exam_classes','written_exam_versions','written_exam_version_classes',
    'written_exam_sections','written_exam_questions','written_exam_answer_keys','written_exam_attempts',
    'written_exam_section_results','written_exam_integrity_events'
  ];
begin
  foreach v_table in array v_required loop
    if to_regclass('public.'||v_table) is null then
      raise exception 'Missing required table: %',v_table;
    end if;
    if not exists(
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=v_table and c.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on %',v_table;
    end if;
  end loop;
  if to_regprocedure('public.start_written_exam(uuid)') is null then raise exception 'Missing start_written_exam RPC'; end if;
  if to_regprocedure('public.save_written_exam_answers(uuid,jsonb)') is null then raise exception 'Missing save_written_exam_answers RPC'; end if;
  if to_regprocedure('public.submit_written_exam(uuid)') is null then raise exception 'Missing submit_written_exam RPC'; end if;
  if to_regprocedure('public.grade_written_exam_attempt(uuid,jsonb)') is null then raise exception 'Missing grade_written_exam_attempt RPC'; end if;
  if to_regprocedure('public.get_my_written_exam_corrections(uuid)') is null then raise exception 'Missing gated corrections RPC'; end if;
  if to_regprocedure('public.save_written_exam_question_time_limits(uuid,jsonb)') is null then raise exception 'Missing per-question time limit RPC'; end if;
  if to_regprocedure('public.reset_written_exam_attempts(uuid)') is null then raise exception 'Missing teacher-only destructive reset RPC'; end if;
  if to_regprocedure('public.get_or_start_written_exam_question_timer(uuid)') is null then raise exception 'Missing persisted question timer RPC'; end if;
  if to_regprocedure('public.save_written_exam_question_answer(uuid,text,jsonb)') is null then raise exception 'Missing server-timed per-question answer RPC'; end if;
  if has_function_privilege('authenticated','public.save_written_exam_answers(uuid,jsonb)','EXECUTE') then raise exception 'Legacy bulk answer save remains executable by students'; end if;
  if has_function_privilege('anon','public.reset_written_exam_attempts(uuid)','EXECUTE') then raise exception 'Anonymous users can reset written-exam attempts'; end if;
  if not has_function_privilege('authenticated','public.reset_written_exam_attempts(uuid)','EXECUTE') then raise exception 'Teachers cannot call the written-exam reset RPC'; end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='written_exam_attempts' and column_name='question_timer_started_at') then
    raise exception 'Persisted per-question timer start column is missing';
  end if;
  if not exists(select 1 from pg_trigger where tgname='written_exam_question_shuffle_required' and not tgisinternal) then
    raise exception 'Mandatory per-attempt question shuffle trigger is missing';
  end if;
  if not exists(select 1 from pg_trigger where tgname='written_exam_section_question_shuffle_required' and not tgisinternal) then
    raise exception 'Mandatory section question shuffle trigger is missing';
  end if;
  if not exists(select 1 from pg_trigger where tgname='written_exam_versions_immutable' and not tgisinternal) then
    raise exception 'Published-version immutability trigger is missing';
  end if;
  if not exists(select 1 from pg_trigger where tgname='written_answer_keys_immutable' and not tgisinternal) then
    raise exception 'Answer-key immutability trigger is missing';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.written_exam_questions'::regclass and pg_get_constraintdef(oid) like '%verbes_trous%') then
    raise exception 'Verb-bank question type constraint is missing';
  end if;
  if not exists(select 1 from pg_trigger where tgname='written_exam_validate_verbes_trous' and not tgisinternal) then
    raise exception 'Verb-bank publication validation trigger is missing';
  end if;
  if not exists(select 1 from pg_trigger where tgname='written_exam_verbes_trous_score' and not tgisinternal) then
    raise exception 'Verb-bank attempt scoring trigger is missing';
  end if;
end
$written$;
