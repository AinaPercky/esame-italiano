-- Explicit server-side publication for exercises.
-- Saving content and publishing are separate operations so the admin UI cannot
-- silently leave an exercise in draft after a successful save.
create or replace function public.publish_exercise(p_exercise_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_exercise public.exercises%rowtype;
  v_content jsonb;
  v_question_count integer;
begin
  if not public.exercise_is_teacher() then
    raise exception 'Accès professeur requis.';
  end if;

  select * into v_exercise
  from public.exercises
  where id = p_exercise_id and created_by = auth.uid()
  for update;

  if not found then
    raise exception 'Exercice introuvable ou non modifiable.';
  end if;

  if v_exercise.current_version_id is null then
    raise exception 'Enregistrez le contenu de l’exercice avant de le publier.';
  end if;

  if not exists (
    select 1 from public.exercise_class_assignments
    where exercise_id = p_exercise_id
  ) then
    raise exception 'Attribuez au moins une classe avant de publier.';
  end if;

  select content into v_content
  from public.exercise_versions
  where id = v_exercise.current_version_id
    and exercise_id = p_exercise_id;

  if not found then
    raise exception 'Version de l’exercice introuvable.';
  end if;

  if coalesce(jsonb_typeof(v_content -> 'questions'), '') <> 'array' then
    raise exception 'Le contenu de l’exercice est invalide.';
  end if;

  v_question_count := jsonb_array_length(v_content -> 'questions');
  if v_question_count < 1 then
    raise exception 'Ajoutez au moins une question avant de publier.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_content -> 'questions') q(value)
    where nullif(trim(q.value ->> 'id'), '') is null
       or coalesce(q.value ->> 'type', '') not in ('qcm','text','reorder','verbes_trous')
       or coalesce((q.value ->> 'time_limit_seconds')::integer, 0) <= 0
       or coalesce((q.value ->> 'points')::numeric, 0) <= 0
  ) then
    raise exception 'Chaque question doit avoir un type, des points et un temps strictement positifs.';
  end if;

  update public.exercises
  set status = 'published',
      published_at = coalesce(published_at, now()),
      updated_at = now()
  where id = p_exercise_id;

  return p_exercise_id;
end;
$$;

revoke execute on function public.publish_exercise(uuid) from public, anon;
grant execute on function public.publish_exercise(uuid) to authenticated;
