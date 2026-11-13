-- Teacher tracking: include every student in classes assigned to an exercise,
-- even when the student has not started it yet.
create or replace function public.get_teacher_exercise_attempts(p_exercise_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_result jsonb;
begin
  if not public.exercise_is_teacher() then
    raise exception 'Accès professeur requis.';
  end if;

  if not exists (
    select 1 from public.exercises e where e.id = p_exercise_id
  ) then
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
  join public.students s on s.class_id = c.id
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
$$;

revoke execute on function public.get_teacher_exercise_attempts(uuid) from public, anon;
grant execute on function public.get_teacher_exercise_attempts(uuid) to authenticated;

notify pgrst, 'reload schema';
