-- Run after 20261113130000_multi_class_enrollments.sql.
do $$
declare v_missing integer;
begin
  if to_regclass('public.class_enrollments') is null or to_regclass('public.class_enrollment_requests') is null then
    raise exception 'Enrollment tables are missing';
  end if;
  select count(*) into v_missing from public.students s
  where s.class_id is not null and not exists (
    select 1 from public.class_enrollments ce where ce.student_id=s.id and ce.class_id=s.class_id and ce.status in ('active','suspended')
  );
  if v_missing>0 then raise exception 'Legacy memberships missing from backfill: %',v_missing; end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='classes' and column_name='enrollment_mode') then
    raise exception 'classes.enrollment_mode is missing';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='classes' and column_name='level') then
    raise exception 'Classes must not gain a level column';
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='class_enrollments' and policyname='class_enrollments_read_own_or_teacher') then
    raise exception 'Enrollment RLS policy is missing';
  end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename='classes' and policyname='Classes full access') then
    raise exception 'Legacy unrestricted class policy is still active';
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='classes' and policyname='classes_teacher_manage') then
    raise exception 'Class administration policy is missing';
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='class_enrollment_requests' and policyname='class_enrollment_requests_cancel_own') then
    raise exception 'Student request cancellation policy is missing';
  end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename='classes' and policyname='Classes full access') then
    raise exception 'Legacy unrestricted class policy is still active';
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='classes' and policyname='classes_teacher_manage') then
    raise exception 'Class administration policy is missing';
  end if;
end;
$$;

-- All class-targeted learning modules must resolve the student's active memberships.
do $multi_class_content$
declare v_definition text;
begin
  select pg_get_functiondef('public.list_student_exercises()'::regprocedure) into v_definition;
  if position('class_enrollments' in v_definition)=0 or position('join lateral' in lower(v_definition))=0 then
    raise exception 'Student exercise list must use active memberships without duplicate exercises';
  end if;
  select pg_get_functiondef('public.start_exercise_attempt(uuid)'::regprocedure) into v_definition;
  if position('class_enrollments' in v_definition)=0 then raise exception 'Exercise launch is not multi-class aware'; end if;
  select pg_get_functiondef('public.get_teacher_exercise_attempts(uuid)'::regprocedure) into v_definition;
  if position('class_enrollments' in v_definition)=0 then raise exception 'Teacher exercise report is not multi-class aware'; end if;
  select pg_get_functiondef('public.list_available_written_exams()'::regprocedure) into v_definition;
  if position('class_enrollments' in v_definition)=0 then raise exception 'Written exam listing is not multi-class aware'; end if;
  select pg_get_functiondef('public.start_written_exam(uuid)'::regprocedure) into v_definition;
  if position('class_enrollments' in v_definition)=0 then raise exception 'Written exam launch is not multi-class aware'; end if;
  select pg_get_functiondef('public.launch_quiz_with_presence(text)'::regprocedure) into v_definition;
  if position('class_enrollments' in v_definition)=0 then raise exception 'Quiz launch is not multi-class aware'; end if;
  select pg_get_functiondef('public.submit_quiz_presence_submission(jsonb)'::regprocedure) into v_definition;
  if position('class_enrollments' in v_definition)=0 then raise exception 'Quiz submission is not multi-class aware'; end if;
end;
$multi_class_content$;
