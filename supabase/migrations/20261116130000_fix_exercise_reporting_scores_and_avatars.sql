-- Improve exercise attempt reporting: keep the latest attempt status separate from
-- the best completed result, expose the student's profile photo, and return a
-- consistent score/max-score pair from the same best attempt.
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
        'avatar_url', s.avatar_url,
        'class_id', c.id,
        'class_name', c.name,
        'attempt_id', latest.id,
        'status', coalesce(latest.status, 'not_started'),
        'attempt_count', coalesce(stats.attempt_count, 0),
        'score', coalesce(best.score, 0),
        'best_score', best.score,
        'latest_score', latest.score,
        'max_score', coalesce(best.max_score, latest.max_score, stats.max_score, 0),
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
      max(a.max_score) as max_score
    from public.exercise_attempts a
    where a.exercise_id = p_exercise_id
      and a.student_id = s.id
  ) stats on true
  left join lateral (
    select a.score, a.max_score
    from public.exercise_attempts a
    where a.exercise_id = p_exercise_id
      and a.student_id = s.id
      and a.status = 'completed'
      and a.max_score > 0
    order by (a.score / nullif(a.max_score, 0)) desc,
             a.score desc,
             a.completed_at desc nulls last,
             a.started_at desc
    limit 1
  ) best on true
  where assignment.exercise_id = p_exercise_id
    and coalesce(s.validation_status, 'approved') = 'approved';

  return v_result;
end;
$function$;

grant execute on function public.get_teacher_exercise_attempts(uuid) to authenticated;
