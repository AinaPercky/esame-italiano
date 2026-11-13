-- Complete multi-class handling for student exercise lists and teacher reports.
CREATE OR REPLACE FUNCTION public.list_student_exercises()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_student_id uuid := public.exercise_current_student_id();
  v_result jsonb;
begin
  if v_student_id is null then raise exception 'Profil étudiant validé introuvable.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'title', e.title, 'description', e.description,
    'category', e.category, 'level', e.level, 'assigned_at', a.assigned_at,
    'attempt_count', (select count(*) from public.exercise_attempts at where at.exercise_id=e.id and at.student_id=v_student_id),
    'active_attempt_id', (select at.id from public.exercise_attempts at where at.exercise_id=e.id and at.student_id=v_student_id and at.status='in_progress' order by at.started_at desc limit 1)
  ) order by a.assigned_at desc), '[]'::jsonb)
  into v_result
  from public.exercises e
  join lateral (
    select min(a.assigned_at) as assigned_at
    from public.exercise_class_assignments a
    where a.exercise_id=e.id
      and exists (
        select 1 from public.class_enrollments ce
        where ce.class_id=a.class_id
          and ce.student_id=v_student_id
          and ce.status='active'
      )
  ) a on a.assigned_at is not null
  where e.status='published';
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_teacher_exercise_attempts(p_exercise_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_result jsonb;
begin
  if not public.exercise_is_teacher() then
    raise exception 'Accès professeur requis.';
  end if;

  if not exists (select 1 from public.exercises e where e.id = p_exercise_id) then
    raise exception 'Exercice introuvable.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'student_id', s.id,
        'student_name', trim(concat_ws(' ', s.first_name, s.last_name)),
        'student_number', s.student_number,
        'class_id', c.id,
        'class_name', c.name,
        'attempt_id', latest.id,
        'status', coalesce(latest.status, 'not_started'),
        'attempt_count', coalesce(stats.attempt_count, 0),
        'score', coalesce(stats.best_score, 0),
        'best_score', stats.best_score,
        'latest_score', latest.score,
        'max_score', coalesce(latest.max_score, stats.max_score),
        'started_at', latest.started_at,
        'completed_at', latest.completed_at,
        'details', coalesce(latest.details, '[]'::jsonb)
      )
      order by c.name, s.last_name, s.first_name
    ),
    '[]'::jsonb
  )
  into v_result
  from public.exercise_class_assignments assignment
  join public.classes c on c.id = assignment.class_id
  join public.class_enrollments ce on ce.class_id = c.id and ce.status = 'active'
  join public.students s on s.id = ce.student_id
  left join lateral (
    select
      a.id, a.status, a.score, a.max_score, a.started_at, a.completed_at,
      (
        select coalesce(
          jsonb_agg(jsonb_build_object(
            'question_id', ans.question_id,
            'answer', ans.answer,
            'correct', ans.is_correct,
            'points', ans.points_awarded,
            'max_points', ans.max_points,
            'timed_out', ans.timed_out
          ) order by ans.answered_at),
          '[]'::jsonb
        )
        from public.exercise_answers ans
        where ans.attempt_id = a.id
      ) as details
    from public.exercise_attempts a
    where a.exercise_id = p_exercise_id
      and a.student_id = s.id
    order by a.started_at desc
    limit 1
  ) latest on true
  left join lateral (
    select
      count(*)::integer as attempt_count,
      max(a.score) filter (where a.status = 'completed') as best_score,
      max(a.max_score) as max_score
    from public.exercise_attempts a
    where a.exercise_id = p_exercise_id
      and a.student_id = s.id
  ) stats on true
  where assignment.exercise_id = p_exercise_id
    and coalesce(s.validation_status, 'approved') = 'approved';

  return v_result;
end;
$function$;
do $checks$
declare v_definition text;
begin
 select pg_get_functiondef('public.list_student_exercises()'::regprocedure) into v_definition;
 if position('class_enrollments' in v_definition)=0 or position('join lateral' in lower(v_definition))=0 then
   raise exception 'Student exercise list must use active memberships without duplicate exercises';
 end if;
 select pg_get_functiondef('public.get_teacher_exercise_attempts(uuid)'::regprocedure) into v_definition;
 if position('class_enrollments' in v_definition)=0 then raise exception 'Teacher exercise report is not multi-class aware'; end if;
end;
$checks$;
