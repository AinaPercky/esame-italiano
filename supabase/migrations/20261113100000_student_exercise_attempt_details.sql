-- Permettre à un étudiant de consulter le détail de ses propres tentatives.
-- Les réponses attendues et explications ne sont retournées qu'après validation,
-- et uniquement pour une tentative appartenant à l'étudiant connecté.
create or replace function public.get_student_exercise_attempt_details(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_attempt public.exercise_attempts%rowtype;
  v_content jsonb;
  v_questions jsonb;
begin
  select *
    into v_attempt
    from public.exercise_attempts
   where id = p_attempt_id
     and student_id = public.exercise_current_student_id();

  if not found then
    raise exception 'Tentative introuvable ou accès interdit.';
  end if;

  select content
    into v_content
    from public.exercise_versions
   where id = v_attempt.version_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'question_id', q.value ->> 'id',
        'question', q.value ->> 'question',
        'type', q.value ->> 'type',
        'points', coalesce((q.value ->> 'points')::numeric, 0),
        'answer', ans.answer,
        'correct', ans.is_correct,
        'points_awarded', ans.points_awarded,
        'max_points', ans.max_points,
        'timed_out', ans.timed_out,
        'expected', coalesce(q.value -> 'answers', q.value -> 'correct_answer', q.value #> '{verbes_trous,phrases}'),
        'explanation', q.value -> 'explanation',
        'options', q.value -> 'options',
        'items', q.value -> 'items',
        'verbes_trous', q.value -> 'verbes_trous'
      )
      order by ord.position
    ),
    '[]'::jsonb
  )
  into v_questions
  from jsonb_array_elements(v_attempt.question_order) with ordinality as ord(question_id, position)
  join jsonb_array_elements(v_content -> 'questions') as q(value)
    on q.value ->> 'id' = ord.question_id #>> '{}'
  left join public.exercise_answers ans
    on ans.attempt_id = v_attempt.id
   and ans.question_id = ord.question_id #>> '{}';

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'exercise_id', v_attempt.exercise_id,
    'score', v_attempt.score,
    'max_score', v_attempt.max_score,
    'status', v_attempt.status,
    'started_at', v_attempt.started_at,
    'completed_at', v_attempt.completed_at,
    'questions', v_questions
  );
end;
$$;

revoke execute on function public.get_student_exercise_attempt_details(uuid) from public, anon;
grant execute on function public.get_student_exercise_attempt_details(uuid) to authenticated;
