-- Destructive reset requested for written-exam attempts. Answers and scores
-- are stored on the attempt row; section results and integrity events cascade
-- from it. The subject, immutable versions, and class assignments are kept.
create or replace function public.reset_written_exam_attempts(p_exam_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $written$
declare
  v_status text;
  v_title text;
  v_deleted integer := 0;
begin
  if not public.written_exam_is_teacher() then
    raise exception 'Accès enseignant requis.';
  end if;

  select status, title
    into v_status, v_title
    from public.written_exams
   where id = p_exam_id
   for update;

  if not found then
    raise exception 'Sujet d’examen introuvable.';
  end if;

  if v_status not in ('closed', 'grading') then
    raise exception 'Clôturez le sujet avant de réinitialiser ses tentatives.';
  end if;

  delete from public.written_exam_attempts
   where exam_id = p_exam_id;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'exam_id', p_exam_id,
    'title', v_title,
    'deleted_attempts', v_deleted
  );
end
$written$;

revoke all on function public.reset_written_exam_attempts(uuid) from public, anon;
grant execute on function public.reset_written_exam_attempts(uuid) to authenticated;

notify pgrst, 'reload schema';
