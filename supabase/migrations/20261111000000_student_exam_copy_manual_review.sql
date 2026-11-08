-- Include manual-review metadata in the student's published answer sheet.
-- The RPC keeps the same ownership and publication checks as the original function.
create or replace function public.get_my_written_exam_corrections(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $written$
declare v_student_id uuid; v_attempt public.written_exam_attempts%rowtype; v_result jsonb;
begin
 select id into v_student_id from public.students where lower(email)=lower(auth.jwt()->>'email') and coalesce(validation_status,'approved')='approved' limit 1;
 if v_student_id is null then raise exception 'Fiche élève active introuvable.'; end if;
 select * into v_attempt from public.written_exam_attempts
 where exam_id=p_exam_id and student_id=v_student_id and results_published=true
 order by attempt_number desc limit 1;
 if not found then raise exception 'Résultats non publiés pour cet élève.'; end if;
 if not exists(select 1 from public.written_exam_versions where id=v_attempt.version_id and show_corrections_after_publish=true) then
   raise exception 'La correction détaillée n’a pas été publiée.';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'section_title',s.title,
   'questions',coalesce((select jsonb_agg(jsonb_build_object(
     'question_id',q.id,'prompt',q.prompt,'type',q.question_type,'points',q.points,'public_data',q.public_data,
     'student_answer',v_attempt.answers->q.id::text,
     'answer_key',k.answer_key,'explanation',k.explanation,
     'manual_review',q.manual_review,
     'manual_score',v_attempt.manual_scores->q.id::text
   ) order by coalesce(ord.sequence,q.position)) from public.written_exam_questions q join public.written_exam_answer_keys k on k.question_id=q.id left join lateral jsonb_array_elements_text(coalesce(v_attempt.order_manifest->'questions'->s.id::text,'[]'::jsonb)) with ordinality as ord(question_id,sequence) on ord.question_id=q.id::text where q.section_id=s.id),'[]'::jsonb)
 ) order by coalesce(section_order.sequence,s.position)),'[]'::jsonb)
 into v_result from public.written_exam_sections s left join lateral jsonb_array_elements_text(coalesce(v_attempt.order_manifest->'sections','[]'::jsonb)) with ordinality as section_order(section_id,sequence) on section_order.section_id=s.id::text where s.version_id=v_attempt.version_id;
 return v_result;
end $written$;
revoke all on function public.get_my_written_exam_corrections(uuid) from public;
grant execute on function public.get_my_written_exam_corrections(uuid) to authenticated;
notify pgrst,'reload schema';
