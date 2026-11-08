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
