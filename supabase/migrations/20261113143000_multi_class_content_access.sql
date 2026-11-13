-- Make exercise and written-exam eligibility honor all active class enrollments.
-- Existing attempts and their saved answers remain untouched.

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
  join public.exercise_class_assignments a on a.exercise_id=e.id
  join public.class_enrollments ce on ce.class_id=a.class_id and ce.student_id=v_student_id and ce.status='active'
  where e.status='published';
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.start_exercise_attempt(p_exercise_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_student_id uuid := public.exercise_current_student_id();
  v_exercise public.exercises%rowtype;
  v_version public.exercise_versions%rowtype;
  v_order jsonb;
  v_option_orders jsonb;
  v_attempt public.exercise_attempts%rowtype;
  v_total numeric := 0;
  v_question jsonb;
begin
  if v_student_id is null then raise exception 'Profil étudiant validé introuvable.'; end if;
  select e.* into v_exercise
  from public.exercises e
  join public.exercise_class_assignments a on a.exercise_id = e.id
  join public.class_enrollments ce on ce.class_id = a.class_id and ce.student_id = v_student_id and ce.status = 'active'
  where e.id = p_exercise_id and e.status = 'published'
  limit 1;
  if not found then raise exception 'Cet exercice n’est pas disponible pour votre classe.'; end if;

  select * into v_version from public.exercise_versions where id = v_exercise.current_version_id;
  if not found then raise exception 'Version de l’exercice introuvable.'; end if;
  if jsonb_array_length(v_version.content -> 'questions') = 0 then raise exception 'Cet exercice ne contient aucune question.'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_version.content -> 'questions') q(value)
    where coalesce((q.value ->> 'time_limit_seconds')::integer,0) <= 0
  ) then raise exception 'Chaque question doit avoir un temps imparti strictement positif.'; end if;

  select jsonb_agg(q.value ->> 'id' order by random()),
         coalesce(sum((q.value ->> 'points')::numeric),0)
  into v_order, v_total
  from jsonb_array_elements(v_version.content -> 'questions') q(value);

  select coalesce(jsonb_object_agg(q.value ->> 'id', shuffled.options), '{}'::jsonb)
  into v_option_orders
  from jsonb_array_elements(v_version.content -> 'questions') q(value)
  cross join lateral (
    select jsonb_agg(o.value order by random()) as options
    from jsonb_array_elements(coalesce(q.value -> 'options','[]'::jsonb)) o(value)
  ) shuffled
  where jsonb_typeof(q.value -> 'options') = 'array';

  select q.value into v_question
  from jsonb_array_elements(v_version.content -> 'questions') q(value)
  where q.value ->> 'id' = v_order ->> 0;

  insert into public.exercise_attempts(
    exercise_id, version_id, student_id, question_order, option_orders, current_question_index,
    current_question_started_at, current_question_deadline_at, max_score
  ) values (
    p_exercise_id, v_version.id, v_student_id, v_order, v_option_orders, 0,
    now(), now() + make_interval(secs => (v_question ->> 'time_limit_seconds')::integer), v_total
  ) returning * into v_attempt;

  return public.exercise_question_for_student(v_attempt.id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_available_written_exams()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_student public.students%rowtype;
  v_result jsonb;
begin
  select * into v_student
  from public.students
  where lower(email)=lower(auth.jwt()->>'email')
    and coalesce(validation_status,'approved')='approved'
  limit 1;

  if not found then
    raise exception 'Fiche élève active introuvable.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,
    'title',v.title,
    'description',v.description,
    'level',v.level,
    'target_language',v.target_language,
    'instruction_language',v.instruction_language,
    'duration_minutes',v.duration_minutes,
    'display_scale',v.display_scale,
    'status',e.status,
    'opens_at',v.opens_at,
    'closes_at',v.closes_at,
    'raw_max',v.raw_max,
    'version_id',v.id,
    'class_eligible',exists(
      select 1 from public.written_exam_version_classes ec
      where ec.version_id=v.id and exists (
        select 1 from public.class_enrollments ce
        where ce.student_id=v_student.id and ce.class_id=ec.class_id and ce.status='active'
      )
    ),
    'integrity_settings',v.integrity_settings,
    'max_attempts',v.max_attempts,
    'navigation_mode',v.navigation_mode,
    'sections',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'title',s.title,
        'group_name',s.group_name,
        'instructions',s.instructions,
        'max_points',s.max_points,
        'support_text',s.support_text,
        'support_url',s.support_url
      ) order by s.position),'[]'::jsonb)
      from public.written_exam_sections s where s.version_id=v.id
    ),
    'attempts_used',(
      select count(*) from public.written_exam_attempts x
      where x.exam_id=e.id and x.student_id=v_student.id
    ),
    'attempt_status',a.status,
    'attempt_version_id',a.version_id,
    'attempt_raw_max',a.raw_max,
    'attempt_display_scale',av.display_scale,
    'results_published',coalesce(a.results_published,false),
    'raw_score',case
      when a.results_published and coalesce(av.show_score_after_publish,v.show_score_after_publish)
      then a.raw_score else null end,
    'normalized_score',case
      when a.results_published and coalesce(av.show_score_after_publish,v.show_score_after_publish)
      then a.normalized_score else null end,
    'show_score_after_publish',coalesce(av.show_score_after_publish,v.show_score_after_publish),
    'show_corrections_after_publish',case
      when a.results_published then coalesce(e.show_corrections_after_publish,true)
      else coalesce(av.show_corrections_after_publish,v.show_corrections_after_publish)
    end
  ) order by v.opens_at nulls first,e.created_at desc),'[]'::jsonb)
  into v_result
  from public.written_exams e
  join lateral (
    select vv.*
    from public.written_exam_versions vv
    where vv.exam_id=e.id
      and vv.status='published'
      and exists(
        select 1 from public.written_exam_version_classes ec
        where ec.version_id=vv.id and exists (
          select 1 from public.class_enrollments ce
          where ce.student_id=v_student.id and ce.class_id=ec.class_id and ce.status='active'
        )
      )
    order by vv.version_number desc
    limit 1
  ) v on true
  left join lateral (
    select *
    from public.written_exam_attempts aa
    where aa.exam_id=e.id and aa.student_id=v_student.id
    order by aa.attempt_number desc
    limit 1
  ) a on true
  left join public.written_exam_versions av on av.id=a.version_id
  where (
    (a.status='in_progress' and e.status in ('published','scheduled','open'))
    or (e.status in ('published','scheduled','open')
      and (v.opens_at is null or v.opens_at<=now())
      and (v.closes_at is null or v.closes_at>now()))
    or (a.id is not null and e.status in ('published','scheduled','open','closed','grading','results_published'))
  );

  return v_result;
end
$function$;

CREATE OR REPLACE FUNCTION public.start_written_exam(p_exam_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_student public.students%rowtype; v_exam public.written_exams%rowtype; v_version public.written_exam_versions%rowtype;
 v_attempt public.written_exam_attempts%rowtype; v_manifest jsonb; v_sections jsonb; v_attempt_no integer; v_has_attempt boolean:=false;
begin
 select * into v_student from public.students where lower(email)=lower(auth.jwt()->>'email') and coalesce(validation_status,'approved')='approved' limit 1;
 if not found then raise exception 'Fiche élève active introuvable.'; end if;
 select * into v_exam from public.written_exams where id=p_exam_id and status in ('published','open','scheduled') for update;
 if not found then raise exception 'Examen fermé ou indisponible.'; end if;
 select * into v_attempt from public.written_exam_attempts where exam_id=p_exam_id and student_id=v_student.id and status='in_progress' limit 1;
 v_has_attempt:=found;
 if v_has_attempt then
   select * into v_version from public.written_exam_versions where id=v_attempt.version_id;
 else
   select * into v_version from public.written_exam_versions vv where vv.exam_id=p_exam_id and vv.status='published' and exists(select 1 from public.written_exam_version_classes ec where ec.version_id=vv.id and exists(select 1 from public.class_enrollments ce where ce.student_id=v_student.id and ce.class_id=ec.class_id and ce.status='active')) order by vv.version_number desc limit 1;
 end if;
 if not found then raise exception 'Aucune version publiée.'; end if;
 if not exists(select 1 from public.written_exam_version_classes ec where ec.version_id=v_version.id and exists(select 1 from public.class_enrollments ce where ce.student_id=v_student.id and ce.class_id=ec.class_id and ce.status='active')) then raise exception 'Cet examen n’est pas destiné à votre classe.'; end if;
 if not v_has_attempt and v_version.opens_at is not null and v_version.opens_at>now() then raise exception 'L’examen n’est pas encore ouvert.'; end if;
 if not v_has_attempt and v_version.closes_at is not null and v_version.closes_at<=now() then raise exception 'La période de cet examen est terminée.'; end if;
 if v_has_attempt then
   if v_attempt.deadline_at<=now() then
     -- Le runner soumettra immédiatement les dernières réponses déjà persistées; ne pas annuler la transaction ici.
     null;
   end if;
 else
   select count(*)+1 into v_attempt_no from public.written_exam_attempts where exam_id=p_exam_id and student_id=v_student.id;
   if v_attempt_no>v_version.max_attempts then raise exception 'Nombre maximal de tentatives atteint.'; end if;
   select jsonb_build_object(
     'sections',to_jsonb(array(select s.id::text from public.written_exam_sections s join (select coalesce(group_name,section_key) as group_key,min(position) as group_position,bool_or(fixed_position) as group_fixed,random() as group_random from public.written_exam_sections where version_id=v_version.id group by coalesce(group_name,section_key)) g on g.group_key=coalesce(s.group_name,s.section_key) where s.version_id=v_version.id order by case when v_version.shuffle_sections and not g.group_fixed then g.group_random else g.group_position::double precision end,s.position)),
     'questions',coalesce((select jsonb_object_agg(s.id::text,(select coalesce(jsonb_agg(q.id::text order by case when v_version.shuffle_questions and s.shuffle then random() else q.position::double precision end),'[]'::jsonb) from public.written_exam_questions q where q.section_id=s.id)) from public.written_exam_sections s where s.version_id=v_version.id),'{}'::jsonb),
     'options',coalesce((select jsonb_object_agg(q.id::text,(select coalesce(jsonb_agg(o.value->>'id' order by case when v_version.shuffle_options and q.shuffle_options then random() else o.ordinality::double precision end),'[]'::jsonb) from jsonb_array_elements(q.public_data->'options') with ordinality o(value,ordinality))) from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where s.version_id=v_version.id and jsonb_typeof(q.public_data->'options')='array'),'{}'::jsonb),
     'items',coalesce((select jsonb_object_agg(q.id::text,(select coalesce(jsonb_agg(o.value->>'id' order by case when v_version.shuffle_options and q.shuffle_options then random() else o.ordinality::double precision end),'[]'::jsonb) from jsonb_array_elements(q.public_data->'items') with ordinality o(value,ordinality))) from public.written_exam_questions q join public.written_exam_sections s on s.id=q.section_id where s.version_id=v_version.id and jsonb_typeof(q.public_data->'items')='array'),'{}'::jsonb)
   ) into v_manifest;
   insert into public.written_exam_attempts(exam_id,version_id,student_id,attempt_number,deadline_at,order_manifest,raw_max)
   values(p_exam_id,v_version.id,v_student.id,v_attempt_no,now()+make_interval(mins=>v_version.duration_minutes),v_manifest,v_version.raw_max)
   returning * into v_attempt;
   update public.written_exam_versions set locked_at=coalesce(locked_at,now()) where id=v_version.id;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',s.id,'section_key',s.section_key,'title',s.title,'instructions',s.instructions,'category',s.category,
   'max_points',s.max_points,'position',s.position,'support_text',s.support_text,'support_url',s.support_url,'group_name',s.group_name,
   'questions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'question_key',q.question_key,'type',q.question_type,'prompt',q.prompt,'points',q.points,'public_data',q.public_data) order by q.position) from public.written_exam_questions q where q.section_id=s.id),'[]'::jsonb)
 ) order by s.position),'[]'::jsonb) into v_sections from public.written_exam_sections s where s.version_id=v_version.id;
 return jsonb_build_object('attempt_id',v_attempt.id,'status',v_attempt.status,'deadline_at',v_attempt.deadline_at,'started_at',v_attempt.started_at,'answers',v_attempt.answers,'order_manifest',v_attempt.order_manifest,
 'exam',jsonb_build_object('id',v_exam.id,'title',v_version.title,'description',v_version.description,'level',v_version.level,'target_language',v_version.target_language,'instruction_language',v_version.instruction_language,'duration_minutes',v_version.duration_minutes,'raw_max',v_version.raw_max,'display_scale',v_version.display_scale,'navigation_mode',v_version.navigation_mode,'integrity_settings',v_version.integrity_settings),'sections',v_sections);
end $function$


-- Regression assertions: the four eligibility functions must no longer use
-- students.class_id as the only class membership source.
do $checks$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.list_student_exercises()'::regprocedure) into v_definition;
  if position('class_enrollments' in v_definition)=0 then raise exception 'list_student_exercises is not multi-class aware'; end if;
  select pg_get_functiondef('public.start_exercise_attempt(uuid)'::regprocedure) into v_definition;
  if position('class_enrollments' in v_definition)=0 then raise exception 'start_exercise_attempt is not multi-class aware'; end if;
  select pg_get_functiondef('public.list_available_written_exams()'::regprocedure) into v_definition;
  if position('class_enrollments' in v_definition)=0 then raise exception 'list_available_written_exams is not multi-class aware'; end if;
  select pg_get_functiondef('public.start_written_exam(uuid)'::regprocedure) into v_definition;
  if position('class_enrollments' in v_definition)=0 then raise exception 'start_written_exam is not multi-class aware'; end if;
end;
$checks$;
