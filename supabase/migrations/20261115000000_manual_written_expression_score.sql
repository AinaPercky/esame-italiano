-- Add a separate teacher-entered written-expression component to the composite /100 grade.
-- Existing published versions and attempts keep a zero-point component unless explicitly configured
-- in a new draft version. Existing attempt scores are never rewritten.

alter table public.written_exam_versions
  add column if not exists expression_writing_max_points numeric(5,2) not null default 0
  check (expression_writing_max_points in (0,10,20));

alter table public.written_exam_attempts
  add column if not exists expression_writing_max_points numeric(5,2) not null default 0
  check (expression_writing_max_points in (0,10,20)),
  add column if not exists expression_writing_score numeric(5,2);

create or replace function public.set_written_exam_expression_writing_max_points(
  p_version_id uuid,
  p_max_points numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $written$
declare
  v_version public.written_exam_versions%rowtype;
begin
  if not public.written_exam_is_teacher() then
    raise exception 'Accès enseignant requis.';
  end if;
  if p_max_points not in (0,10,20) then
    raise exception 'La note d’expression écrite doit être désactivée, sur 10 ou sur 20.';
  end if;

  select * into v_version
  from public.written_exam_versions
  where id=p_version_id
  for update;

  if not found or v_version.status<>'draft' then
    raise exception 'Seule une version brouillon peut être configurée.';
  end if;
  if p_max_points>0 and (v_version.raw_max+p_max_points<>100 or v_version.display_scale is distinct from 100) then
    raise exception 'Pour obtenir une note sur 100, les questions ( % points) et l’expression écrite ( / % ) doivent totaliser 100 points et l’échelle normalisée doit être 100.',
      v_version.raw_max,p_max_points;
  end if;

  update public.written_exam_versions
  set expression_writing_max_points=p_max_points
  where id=p_version_id;

  return jsonb_build_object(
    'version_id',p_version_id,
    'expression_writing_max_points',p_max_points,
    'exam_total',v_version.raw_max+p_max_points
  );
end
$written$;

revoke all on function public.set_written_exam_expression_writing_max_points(uuid,numeric) from public;
grant execute on function public.set_written_exam_expression_writing_max_points(uuid,numeric) to authenticated;

-- Snapshot the expression-writing component in each attempt and include it in the
-- denominator used for the final score. This keeps published attempts immutable.
create or replace function public.snapshot_written_exam_expression_writing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $written$
declare
  v_max numeric;
begin
  select expression_writing_max_points into v_max
  from public.written_exam_versions
  where id=new.version_id and exam_id=new.exam_id;

  new.expression_writing_max_points:=coalesce(v_max,0);
  new.raw_max:=new.raw_max+coalesce(v_max,0);
  return new;
end
$written$;

drop trigger if exists written_exam_expression_writing_snapshot on public.written_exam_attempts;
create trigger written_exam_expression_writing_snapshot
before insert on public.written_exam_attempts
for each row execute function public.snapshot_written_exam_expression_writing();

create or replace function public.grade_written_exam_expression_writing(
  p_attempt_id uuid,
  p_score numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $written$
declare
  v_attempt public.written_exam_attempts%rowtype;
  v_version public.written_exam_versions%rowtype;
  v_manual_total numeric;
  v_required integer;
  v_provided integer;
  v_final numeric;
begin
  if not public.written_exam_is_teacher() then
    raise exception 'Accès enseignant requis.';
  end if;

  select * into v_attempt
  from public.written_exam_attempts
  where id=p_attempt_id
  for update;

  if not found or v_attempt.status not in ('needs_review','submitted','graded','timed_out') then
    raise exception 'Tentative non corrigeable.';
  end if;
  if v_attempt.expression_writing_max_points not in (10,20) then
    raise exception 'Cette tentative ne comporte pas de note d’expression écrite.';
  end if;
  if p_score is null or p_score<0 or p_score>v_attempt.expression_writing_max_points then
    raise exception 'La note d’expression écrite doit être comprise entre 0 et % points.',
      v_attempt.expression_writing_max_points;
  end if;

  select count(*) into v_required
  from public.written_exam_questions q
  join public.written_exam_sections s on s.id=q.section_id
  where s.version_id=v_attempt.version_id and q.manual_review;

  select count(*) into v_provided
  from jsonb_each(coalesce(v_attempt.manual_scores,'{}'::jsonb));

  if v_required<>v_provided then
    raise exception 'Corrigez d’abord toutes les questions nécessitant une correction manuelle.';
  end if;

  select coalesce(sum((entry.value#>>'{}')::numeric),0)
  into v_manual_total
  from jsonb_each(coalesce(v_attempt.manual_scores,'{}'::jsonb)) entry;

  select * into v_version
  from public.written_exam_versions
  where id=v_attempt.version_id;

  v_final:=v_attempt.auto_score+v_manual_total+p_score;

  update public.written_exam_attempts
  set expression_writing_score=p_score,
      raw_score=v_final,
      normalized_score=case
        when raw_max>0 and v_version.display_scale is not null
        then round(v_final/raw_max*v_version.display_scale,2)
        else null
      end,
      status='graded',
      needs_manual_review=false,
      updated_at=now()
  where id=p_attempt_id;

  return jsonb_build_object(
    'graded',true,
    'expression_writing_score',p_score,
    'expression_writing_max_points',v_attempt.expression_writing_max_points,
    'raw_score',v_final,
    'raw_max',v_attempt.raw_max,
    'normalized_score',case
      when v_attempt.raw_max>0 and v_version.display_scale is not null
      then round(v_final/v_attempt.raw_max*v_version.display_scale,2)
      else null
    end
  );
end
$written$;

revoke all on function public.grade_written_exam_expression_writing(uuid,numeric) from public;
grant execute on function public.grade_written_exam_expression_writing(uuid,numeric) to authenticated;

-- Never publish a final result while a configured expression-writing component is ungraded.
create or replace function public.guard_written_exam_expression_writing_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $written$
begin
  if new.results_published and not old.results_published
     and new.expression_writing_max_points>0
     and new.expression_writing_score is null then
    raise exception 'Saisissez la note d’expression écrite avant de publier les résultats.';
  end if;
  return new;
end
$written$;

drop trigger if exists written_exam_expression_writing_publication_guard on public.written_exam_attempts;
create trigger written_exam_expression_writing_publication_guard
before update of results_published on public.written_exam_attempts
for each row execute function public.guard_written_exam_expression_writing_publication();

notify pgrst, 'reload schema';
