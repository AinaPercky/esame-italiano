-- Hybrid correction for written comprehension:
-- 1) automatic grading always runs first, including questions flagged for teacher review;
-- 2) the teacher confirms or overrides the proposed score;
-- 3) integrity violations keep the final exam score at zero, without blocking the teacher
--    from recording the written-expression assessment.

create or replace function public.written_exam_auto_question_score(
  p_question_id uuid,
  p_answer jsonb
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $written$
declare
  v_q record;
  v_key jsonb;
  v_expected jsonb;
  v_actual jsonb;
  v_count integer;
  v_hits integer:=0;
  v_idx integer;
  v_points numeric:=0;
  v_answer_text text;
  v_phrase jsonb;
  v_phrase_answer jsonb;
  v_chosen text;
  v_expected_verb text;
  v_typed text;
  v_used text[]:=array[]::text[];
begin
  select q.question_type,q.points,q.public_data,k.answer_key
  into v_q
  from public.written_exam_questions q
  join public.written_exam_answer_keys k on k.question_id=q.id
  where q.id=p_question_id;

  if not found then
    return 0;
  end if;
  v_key:=coalesce(v_q.answer_key,'{}'::jsonb);

  if v_q.question_type='qcm' then
    return case when coalesce(p_answer#>>'{}','')=coalesce(v_key->>'correctOptionId','')
      then v_q.points else 0 end;
  elsif v_q.question_type='text' then
    if jsonb_typeof(v_key->'answers')='array' then
      v_expected:=v_key->'answers';
      if jsonb_typeof(p_answer)='array' then
        v_actual:=p_answer;
      elsif jsonb_typeof(p_answer)='string' and left(coalesce(p_answer#>>'{}',''),1)='[' then
        begin
          v_actual:=(p_answer#>>'{}')::jsonb;
        exception when others then
          v_actual:=jsonb_build_array(p_answer);
        end;
      else
        v_actual:=jsonb_build_array(p_answer);
      end if;
      v_count:=jsonb_array_length(v_expected);
      if v_count=0 then return 0; end if;
      for v_idx in 0..v_count-1 loop
        if jsonb_typeof(v_expected->v_idx)='array' then
          if exists(
            select 1 from jsonb_array_elements_text(v_expected->v_idx) e
            where lower(regexp_replace(btrim(e),'\s+',' ','g'))=
              lower(regexp_replace(btrim(coalesce(v_actual->>v_idx,'')),'\s+',' ','g'))
          ) then v_hits:=v_hits+1; end if;
        elsif lower(regexp_replace(btrim(coalesce(v_expected->>v_idx,'')),'\s+',' ','g'))=
          lower(regexp_replace(btrim(coalesce(v_actual->>v_idx,'')),'\s+',' ','g')) then
          v_hits:=v_hits+1;
        end if;
      end loop;
      return round(v_q.points*v_hits/nullif(v_count,0),2);
    end if;
    v_answer_text:=coalesce(p_answer#>>'{}','');
    if exists(
      select 1 from jsonb_array_elements_text(coalesce(v_key->'acceptedAnswers','[]'::jsonb)) e
      where lower(regexp_replace(btrim(e),'\s+',' ','g'))=
        lower(regexp_replace(btrim(v_answer_text),'\s+',' ','g'))
    ) then return v_q.points; end if;
    return 0;
  elsif v_q.question_type='reorder' then
    v_expected:=coalesce(v_key->'correctOrder','[]'::jsonb);
    if jsonb_typeof(p_answer)='array' then
      v_actual:=p_answer;
    elsif jsonb_typeof(p_answer)='string' and left(coalesce(p_answer#>>'{}',''),1)='[' then
      begin
        v_actual:=(p_answer#>>'{}')::jsonb;
      exception when others then
        v_actual:='[]'::jsonb;
      end;
    else
      v_actual:='[]'::jsonb;
    end if;
    v_count:=jsonb_array_length(v_expected);
    if v_count=0 then return 0; end if;
    for v_idx in 0..v_count-1 loop
      if v_actual->>v_idx=v_expected->>v_idx then v_hits:=v_hits+1; end if;
    end loop;
    return round(v_q.points*v_hits/nullif(v_count,0),2);
  elsif v_q.question_type='verbes_trous' then
    if jsonb_typeof(p_answer)='string' and left(coalesce(p_answer#>>'{}',''),1)='{' then
      begin
        v_actual:=(p_answer#>>'{}')::jsonb;
      exception when others then
        v_actual:='{}'::jsonb;
      end;
    else
      v_actual:=coalesce(p_answer,'{}'::jsonb);
    end if;
    for v_phrase in select value from jsonb_array_elements(coalesce(v_key->'phrases','[]'::jsonb))
    loop
      v_phrase_answer:=v_actual->(v_phrase->>'id');
      v_chosen:=lower(regexp_replace(btrim(coalesce(v_phrase_answer->>'verbe_choisi','')),'\s+',' ','g'));
      v_expected_verb:=lower(regexp_replace(btrim(coalesce(v_phrase->>'verbe','')),'\s+',' ','g'));
      v_typed:=lower(regexp_replace(btrim(coalesce(v_phrase_answer->>'texte_saisi','')),'\s+',' ','g'));
      if v_chosen<>'' and not (v_chosen=any(v_used))
        and exists(
          select 1 from jsonb_array_elements_text(coalesce(v_q.public_data->'verbes_trous'->'banque','[]'::jsonb)) b(value)
          where lower(regexp_replace(btrim(b.value),'\s+',' ','g'))=v_chosen
        ) then
        v_used:=array_append(v_used,v_chosen);
        if v_chosen=v_expected_verb then v_points:=v_points+1; end if;
        if v_typed<>'' and exists(
          select 1 from jsonb_array_elements_text(coalesce(v_phrase->'reponses','[]'::jsonb)) a(value)
          where lower(regexp_replace(btrim(a.value),'\s+',' ','g'))=v_typed
        ) then v_points:=v_points+2; end if;
      end if;
    end loop;
    return least(v_q.points,v_points);
  end if;
  return 0;
end
$written$;

revoke all on function public.written_exam_auto_question_score(uuid,jsonb) from public;

-- Re-run the automatic correction for every supported question. manual_review now
-- means "automatic proposal + teacher verification", not "skip automatic correction".
create or replace function public.submit_written_exam(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $written$
declare
  v_student_id uuid;
  v_is_teacher boolean:=public.written_exam_is_teacher();
  v_attempt public.written_exam_attempts%rowtype;
  v_version public.written_exam_versions%rowtype;
  v_q record;
  v_answer jsonb;
  v_total numeric;
  v_score numeric:=0;
  v_needs_review boolean:=false;
  v_expired boolean;
begin
  if not v_is_teacher then
    select id into v_student_id from public.students
    where lower(email)=lower(auth.jwt()->>'email')
      and coalesce(validation_status,'approved')='approved'
    limit 1;
    select * into v_attempt from public.written_exam_attempts
    where id=p_attempt_id and student_id=v_student_id for update;
  else
    select * into v_attempt from public.written_exam_attempts
    where id=p_attempt_id for update;
  end if;

  if not found or v_attempt.status<>'in_progress' then
    raise exception 'Tentative introuvable ou déjà soumise.';
  end if;
  v_expired:=v_attempt.deadline_at<=now();
  if v_is_teacher and not v_expired then
    raise exception 'Un enseignant ne peut finaliser que les tentatives arrivées à échéance ou clôturées.';
  end if;
  if not v_is_teacher and not exists(
    select 1 from public.written_exams
    where id=v_attempt.exam_id and status in ('published','open','scheduled')
  ) then
    raise exception 'Examen clôturé.';
  end if;

  select * into v_version from public.written_exam_versions where id=v_attempt.version_id;
  delete from public.written_exam_section_results where attempt_id=p_attempt_id;

  for v_q in
    select q.id,q.section_id,q.points,q.manual_review
    from public.written_exam_questions q
    join public.written_exam_sections s on s.id=q.section_id
    where s.version_id=v_attempt.version_id
    order by s.position,q.position
  loop
    if v_q.manual_review then v_needs_review:=true; end if;
    v_answer:=v_attempt.answers->v_q.id::text;
    v_total:=public.written_exam_auto_question_score(v_q.id,v_answer);
    v_score:=v_score+v_total;

    insert into public.written_exam_section_results(attempt_id,section_id,raw_score,raw_max)
    values(p_attempt_id,v_q.section_id,v_total,v_q.points)
    on conflict(attempt_id,section_id) do update
      set raw_score=public.written_exam_section_results.raw_score+excluded.raw_score,
          raw_max=public.written_exam_section_results.raw_max+excluded.raw_max;
  end loop;

  update public.written_exam_attempts
  set status=case when v_expired then 'timed_out' when v_needs_review then 'needs_review' else 'graded' end,
      submitted_at=now(),
      auto_score=v_score,
      raw_score=v_score,
      normalized_score=case
        when raw_max>0 and v_version.display_scale is not null
        then round(v_score/raw_max*v_version.display_scale,2)
        else null
      end,
      needs_manual_review=v_needs_review,
      manual_scores='{}'::jsonb,
      updated_at=now()
  where id=p_attempt_id;

  return jsonb_build_object(
    'submitted',true,
    'needs_review',v_needs_review,
    'timed_out',v_expired,
    'automatic_score',v_score
  );
end
$written$;

-- Manual points replace the automatic proposal question by question. The stored
-- manual_score on each section is the net adjustment, making repeated grading safe.
create or replace function public.grade_written_exam_attempt(
  p_attempt_id uuid,
  p_manual_scores jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $written$
declare
  v_attempt public.written_exam_attempts%rowtype;
  v_version public.written_exam_versions%rowtype;
  v_entry record;
  v_question record;
  v_auto numeric;
  v_awarded numeric;
  v_delta numeric:=0;
  v_section_delta numeric;
  v_required integer;
  v_provided integer;
begin
  if not public.written_exam_is_teacher() then
    raise exception 'Accès enseignant requis.';
  end if;
  select * into v_attempt from public.written_exam_attempts
  where id=p_attempt_id for update;
  if not found or v_attempt.status not in ('needs_review','submitted','graded','timed_out') then
    raise exception 'Tentative non corrigeable.';
  end if;
  if jsonb_typeof(coalesce(p_manual_scores,'{}'::jsonb))<>'object' then
    raise exception 'Les notes manuelles doivent être un objet JSON.';
  end if;

  for v_entry in select key,value from jsonb_each(coalesce(p_manual_scores,'{}'::jsonb))
  loop
    select q.id,q.section_id,q.points
    into v_question
    from public.written_exam_questions q
    join public.written_exam_sections s on s.id=q.section_id
    where q.id::text=v_entry.key and q.manual_review and s.version_id=v_attempt.version_id;
    if not found then
      raise exception 'Question de correction manuelle inconnue pour cette tentative.';
    end if;
    if jsonb_typeof(v_entry.value) not in ('number','string')
      or (v_entry.value#>>'{}')::numeric<0
      or (v_entry.value#>>'{}')::numeric>v_question.points then
      raise exception 'Note manuelle hors barème.';
    end if;
    v_auto:=public.written_exam_auto_question_score(v_question.id,v_attempt.answers->v_question.id::text);
    v_awarded:=(v_entry.value#>>'{}')::numeric;
    v_delta:=v_delta+(v_awarded-v_auto);
  end loop;

  select count(*) into v_required
  from public.written_exam_questions q
  join public.written_exam_sections s on s.id=q.section_id
  where s.version_id=v_attempt.version_id and q.manual_review;
  select count(*) into v_provided
  from jsonb_each(coalesce(p_manual_scores,'{}'::jsonb));
  if v_provided<>v_required then
    raise exception 'Attribuez une note à chaque question nécessitant une vérification manuelle.';
  end if;

  for v_question in
    select q.id,q.section_id
    from public.written_exam_questions q
    join public.written_exam_sections s on s.id=q.section_id
    where s.version_id=v_attempt.version_id and q.manual_review
  loop
    v_auto:=public.written_exam_auto_question_score(v_question.id,v_attempt.answers->v_question.id::text);
    v_awarded:=coalesce((p_manual_scores->>v_question.id::text)::numeric,v_auto);
    v_section_delta:=v_awarded-v_auto;
    update public.written_exam_section_results sr
    set raw_score=sr.raw_score-sr.manual_score+v_section_delta,
        manual_score=v_section_delta
    where sr.attempt_id=p_attempt_id and sr.section_id=v_question.section_id;
  end loop;

  select * into v_version from public.written_exam_versions where id=v_attempt.version_id;
  update public.written_exam_attempts
  set manual_scores=coalesce(p_manual_scores,'{}'::jsonb),
      raw_score=auto_score+v_delta,
      normalized_score=case
        when raw_max>0 and v_version.display_scale is not null
        then round((auto_score+v_delta)/raw_max*v_version.display_scale,2)
        else null
      end,
      status='graded',
      needs_manual_review=false,
      updated_at=now()
  where id=p_attempt_id;

  return jsonb_build_object(
    'graded',true,
    'automatic_score',v_attempt.auto_score,
    'manual_adjustment',v_delta,
    'raw_score',v_attempt.auto_score+v_delta,
    'raw_max',v_attempt.raw_max
  );
end
$written$;

-- Expression-writing marks remain recordable after an integrity violation.
-- The attempt-level integrity trigger still forces the final exam mark to zero.
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
  v_required integer;
  v_provided integer;
  v_final numeric;
begin
  if not public.written_exam_is_teacher() then
    raise exception 'Accès enseignant requis.';
  end if;

  select * into v_attempt from public.written_exam_attempts
  where id=p_attempt_id for update;
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
    raise exception 'Corrigez d’abord toutes les questions nécessitant une vérification manuelle.';
  end if;

  select * into v_version from public.written_exam_versions where id=v_attempt.version_id;
  v_final:=coalesce(v_attempt.raw_score,v_attempt.auto_score,0)+p_score;

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
    'integrity_failed',v_attempt.integrity_failed
  );
end
$written$;

-- A confirmed integrity violation still disqualifies the exam, but does not erase
-- the separately assessed expression-writing score.
create or replace function public.enforce_written_exam_integrity_zero()
returns trigger
language plpgsql
set search_path = ''
as $written$
begin
  if new.integrity_failed and new.status<>'in_progress' then
    new.status:='graded';
    new.needs_manual_review:=false;
    new.auto_score:=0;
    new.raw_score:=0;
    new.normalized_score:=0;
  end if;
  return new;
end
$written$;

drop trigger if exists written_exam_integrity_zero on public.written_exam_attempts;
create trigger written_exam_integrity_zero
before update on public.written_exam_attempts
for each row execute function public.enforce_written_exam_integrity_zero();

revoke all on function public.grade_written_exam_attempt(uuid,jsonb) from public;
revoke all on function public.grade_written_exam_expression_writing(uuid,numeric) from public;
grant execute on function public.grade_written_exam_attempt(uuid,jsonb) to authenticated;
grant execute on function public.grade_written_exam_expression_writing(uuid,numeric) to authenticated;

notify pgrst,'reload schema';
