-- Exercise RPCs use SECURITY DEFINER to enforce class and ownership checks.
-- Remove default PUBLIC/anon EXECUTE grants while retaining authenticated access.
revoke execute on function public.exercise_is_teacher() from public, anon;
revoke execute on function public.exercise_current_student_id() from public, anon;
revoke execute on function public.exercise_question_for_student(uuid) from public, anon;
revoke execute on function public.get_exercise_current_question(uuid) from public, anon;
revoke execute on function public.start_exercise_attempt(uuid) from public, anon;
revoke execute on function public.submit_exercise_answer(uuid, jsonb) from public, anon;
revoke execute on function public.advance_exercise_attempt(uuid) from public, anon;
revoke execute on function public.get_student_exercise_results() from public, anon;
revoke execute on function public.get_teacher_exercise_attempts(uuid) from public, anon;
revoke execute on function public.list_student_exercises() from public, anon;
revoke execute on function public.save_exercise_definition(uuid, jsonb, jsonb, uuid[]) from public, anon;

grant execute on function public.exercise_is_teacher() to authenticated;
grant execute on function public.exercise_current_student_id() to authenticated;
grant execute on function public.exercise_question_for_student(uuid) to authenticated;
grant execute on function public.get_exercise_current_question(uuid) to authenticated;
grant execute on function public.start_exercise_attempt(uuid) to authenticated;
grant execute on function public.submit_exercise_answer(uuid, jsonb) to authenticated;
grant execute on function public.advance_exercise_attempt(uuid) to authenticated;
grant execute on function public.get_student_exercise_results() to authenticated;
grant execute on function public.get_teacher_exercise_attempts(uuid) to authenticated;
grant execute on function public.list_student_exercises() to authenticated;
grant execute on function public.save_exercise_definition(uuid, jsonb, jsonb, uuid[]) to authenticated;
