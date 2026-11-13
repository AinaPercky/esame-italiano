-- Server-side quiz grading and scoped access. Additive; preserves historical results.
CREATE OR REPLACE FUNCTION public.quiz_norm_answer(v TEXT, strip_end BOOLEAN DEFAULT FALSE)
RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
 SELECT CASE WHEN strip_end
   THEN regexp_replace(regexp_replace(lower(btrim(coalesce(v,''))), '[’‘]', '''', 'g'), '[.?!;:]+$', '')
   ELSE regexp_replace(regexp_replace(lower(btrim(coalesce(v,''))), '[’‘]', '''', 'g'), '\s+', ' ', 'g')
 END
$fn$;

CREATE OR REPLACE FUNCTION public.quiz_text_matches(student TEXT, expected TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $fn$
DECLARE s TEXT := public.quiz_norm_answer(student, TRUE); alt TEXT;
BEGIN
 IF s = '' THEN RETURN FALSE; END IF;
 IF s = public.quiz_norm_answer(expected, TRUE) THEN RETURN TRUE; END IF;
 FOR alt IN SELECT x FROM regexp_split_to_table(coalesce(expected,''), '\s*[/;|]\s*') x LOOP
   IF s = public.quiz_norm_answer(alt, TRUE) THEN RETURN TRUE; END IF;
 END LOOP;
 RETURN FALSE;
END $fn$;

CREATE OR REPLACE FUNCTION public.quiz_grade_question(q JSONB, answer TEXT)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
 t TEXT := coalesce(q->>'type','text'); raw TEXT := btrim(coalesce(answer,''));
 expected TEXT := btrim(coalesce(q->>'correct_answer',''));
 pts NUMERIC := coalesce(nullif((q->>'points')::numeric,0),1);
 maxpts NUMERIC := pts; earned NUMERIC := 0; ok BOOLEAN := FALSE;
 exp_display TEXT := expected; student_display TEXT := raw;
 exp_parts JSONB := '[]'; stu_parts JSONB := '[]'; item JSONB; phrase JSONB; ans JSONB;
 choices JSONB; saisies JSONB; correct_order JSONB := '[]'; student_order JSONB := '[]';
 item_ids JSONB := '[]'; used TEXT[] := ARRAY[]::TEXT[];
 chosen TEXT; typed TEXT; expverb TEXT; n INTEGER := 0; idx INTEGER := 0;
 correct_n INTEGER := 0; per_phrase NUMERIC := 3; phrase_score NUMERIC;
 part TEXT; part_ok BOOLEAN;
BEGIN
 IF t='qcm' THEN
   ok := public.quiz_norm_answer(raw)=public.quiz_norm_answer(expected);
   earned := CASE WHEN ok THEN pts ELSE 0 END;
 ELSIF t='reorder' THEN
   SELECT coalesce(jsonb_agg(value->>'id' ORDER BY ord),'[]') INTO item_ids
   FROM jsonb_array_elements(coalesce(q->'items','[]')) WITH ORDINALITY x(value,ord);
   BEGIN correct_order := (q->>'correct_answer')::jsonb; EXCEPTION WHEN OTHERS THEN correct_order := item_ids; END;
   IF jsonb_typeof(correct_order)<>'array' OR jsonb_array_length(correct_order)<>jsonb_array_length(item_ids) THEN correct_order:=item_ids; END IF;
   BEGIN student_order := raw::jsonb; EXCEPTION WHEN OTHERS THEN student_order:='[]'; END;
   IF jsonb_typeof(student_order)<>'array' THEN student_order:='[]'; END IF;
   ok := student_order=correct_order AND jsonb_array_length(student_order)=jsonb_array_length(item_ids);
   earned := CASE WHEN ok THEN pts ELSE 0 END;
   SELECT coalesce(string_agg(i.value->>'text',' → ' ORDER BY x.ord),'') INTO exp_display
   FROM jsonb_array_elements_text(correct_order) WITH ORDINALITY x(id,ord)
   JOIN jsonb_array_elements(coalesce(q->'items','[]')) i(value) ON i.value->>'id'=x.id;
   SELECT coalesce(string_agg(i.value->>'text',' → ' ORDER BY x.ord),'') INTO student_display
   FROM jsonb_array_elements_text(student_order) WITH ORDINALITY x(id,ord)
   JOIN jsonb_array_elements(coalesce(q->'items','[]')) i(value) ON i.value->>'id'=x.id;
 ELSIF t='verbes_trous' AND q ? 'verbes_trous' THEN
   exp_display := '';
   per_phrase := coalesce(nullif((q#>>'{verbes_trous,points_par_phrase}')::numeric,0),3);
   BEGIN ans:=raw::jsonb; EXCEPTION WHEN OTHERS THEN ans:='{}'; END;
   choices:=coalesce(ans->'choices','{}'); saisies:=coalesce(ans->'saisies','{}');
   FOR phrase,idx IN SELECT value,ord::integer FROM jsonb_array_elements(coalesce(q#>'{verbes_trous,phrases}','[]')) WITH ORDINALITY AS x(value,ord) LOOP
     IF coalesce(phrase->>'verbe','')='' OR jsonb_typeof(phrase->'reponses')<>'array' THEN CONTINUE; END IF;
     n:=n+1;
     IF ans ? 'choices' OR ans ? 'saisies' THEN
       chosen:=coalesce(choices->>(idx-1)::text,choices->>(phrase->>'id'));
       typed:=coalesce(saisies->>(idx-1)::text,saisies->>(phrase->>'id'),'');
     ELSE
       item:=coalesce(ans->(phrase->>'id'),'{}');
       chosen:=item->>'verbe_choisi'; typed:=coalesce(item->>'texte_saisi','');
     END IF;
     chosen:=public.quiz_norm_answer(chosen); typed:=public.quiz_norm_answer(typed);
     expverb:=public.quiz_norm_answer(phrase->>'verbe'); phrase_score:=0;
     IF chosen<>'' AND chosen=expverb AND NOT chosen=ANY(used) THEN phrase_score:=phrase_score+1; END IF;
     IF chosen<>'' AND NOT chosen=ANY(used) AND EXISTS(
       SELECT 1 FROM jsonb_array_elements_text(phrase->'reponses') r WHERE public.quiz_norm_answer(r.value)=typed AND typed<>''
     ) THEN phrase_score:=phrase_score+2; END IF;
     IF chosen<>'' THEN used:=array_append(used,chosen); END IF;
     earned:=earned+least(per_phrase,phrase_score);
     exp_display:=concat_ws(' · ',nullif(exp_display,''),phrase->>'verbe'||' → '||(SELECT string_agg(value,' / ') FROM jsonb_array_elements_text(phrase->'reponses')));
   END LOOP;
   maxpts:=n*per_phrase; ok:=n>0 AND earned=maxpts;
 ELSE
   exp_display := '';
   IF jsonb_typeof(q->'answers')='array' AND jsonb_array_length(q->'answers')>0 THEN exp_parts:=q->'answers';
   ELSIF left(expected,1)='[' THEN
     BEGIN exp_parts:=expected::jsonb; EXCEPTION WHEN OTHERS THEN exp_parts:=jsonb_build_array(expected); END;
   ELSIF position('|' IN expected)>0 THEN
     SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO exp_parts FROM regexp_split_to_table(expected,'\s*\|\s*') x WHERE x<>'';
   ELSIF position('//' IN expected)>0 THEN
     SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO exp_parts FROM regexp_split_to_table(expected,'\s*//\s*') x WHERE x<>'';
   ELSE exp_parts:=jsonb_build_array(expected); END IF;
   BEGIN stu_parts:=raw::jsonb; IF jsonb_typeof(stu_parts)<>'array' THEN stu_parts:='[]'; END IF;
   EXCEPTION WHEN OTHERS THEN
     IF jsonb_array_length(exp_parts)>1 AND position(' | ' IN raw)>0 THEN
       SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO stu_parts FROM regexp_split_to_table(raw,'\s*\|\s*') x;
     ELSE stu_parts:=jsonb_build_array(raw); END IF;
   END;
   n:=greatest(1,jsonb_array_length(exp_parts));
   FOR idx IN 0..n-1 LOOP
     item:=exp_parts->idx;
     IF jsonb_typeof(item)='array' THEN
       part_ok:=EXISTS(SELECT 1 FROM jsonb_array_elements_text(item) AS a(value) WHERE public.quiz_text_matches(coalesce(stu_parts->>idx,''),a.value));
       part:=(SELECT string_agg(value,' / ') FROM jsonb_array_elements_text(item));
     ELSE
       part:=coalesce(item#>>'{}',''); part_ok:=public.quiz_text_matches(coalesce(stu_parts->>idx,''),part);
     END IF;
     IF part_ok THEN correct_n:=correct_n+1; END IF;
     exp_display:=concat_ws(' · ',nullif(exp_display,''),CASE WHEN n>1 THEN 'Case '|| (idx+1)||': ' ELSE '' END||part);
   END LOOP;
   IF n>1 THEN
     maxpts:=greatest(pts,n); earned:=round(correct_n*maxpts/n,2);
     student_display:='';
     FOR idx IN 0..n-1 LOOP student_display:=concat_ws(' · ',nullif(student_display,''),'Case '||(idx+1)||': '||coalesce(stu_parts->>idx,'—')); END LOOP;
   ELSE earned:=CASE WHEN correct_n=1 THEN pts ELSE 0 END; END IF;
   ok:=correct_n=n;
 END IF;
 RETURN jsonb_build_object('correct',ok,'points',round(earned,2),'maxPoints',round(maxpts,2),'expected',coalesce(exp_display,expected),'studentAnswer',student_display,'explanation',q->'explanation');
END $fn$;

CREATE OR REPLACE FUNCTION public.quiz_grade_all(p_quiz_id TEXT, p_answers JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE q public.quizzes%ROWTYPE; question JSONB; entry JSONB; fb JSONB:='{}'; raw NUMERIC:=0; maxp NUMERIC:=0; score20 NUMERIC:=0;
BEGIN
 SELECT * INTO q FROM public.quizzes WHERE id=p_quiz_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Quiz introuvable.'; END IF;
 FOR question IN SELECT value FROM jsonb_array_elements(coalesce(q.questions,'[]')) LOOP
   entry:=public.quiz_grade_question(question,coalesce(p_answers->>(question->>'id'),''));
   fb:=fb||jsonb_build_object(question->>'id',entry);
   raw:=raw+coalesce((entry->>'points')::numeric,0);
   maxp:=maxp+coalesce((entry->>'maxPoints')::numeric,0);
 END LOOP;
 IF coalesce(q.total_points,0)>0 THEN maxp:=q.total_points; END IF;
 IF maxp>0 THEN score20:=round(raw/maxp*20,1); END IF;
 RETURN jsonb_build_object('rawScore',round(raw,2),'maxScore',round(maxp,2),'score20',score20,'feedback',fb);
END $fn$;

CREATE OR REPLACE FUNCTION public.quiz_sanitize_payload(p JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE qs JSONB;
BEGIN
 SELECT coalesce(jsonb_agg(clean),'[]') INTO qs FROM (
   SELECT (q-'correct_answer'-'answers'-'explanation'-'phrases'-'points_par_phrase') ||
     CASE WHEN q->>'type'='verbes_trous' AND q ? 'verbes_trous' THEN
       jsonb_build_object('verbes_trous',(q->'verbes_trous')||jsonb_build_object('phrases',
         (SELECT coalesce(jsonb_agg(phrase_item.value-'verbe'-'reponses'),'[]') FROM jsonb_array_elements(coalesce(q#>'{verbes_trous,phrases}','[]')) AS phrase_item)))
     WHEN q->>'type'='reorder' THEN jsonb_build_object('items',
       (SELECT coalesce(jsonb_agg(item ORDER BY random()),'[]') FROM jsonb_array_elements(coalesce(q->'items','[]')) item))
     ELSE '{}'::jsonb END clean
   FROM jsonb_array_elements(coalesce(p->'questions','[]')) q
 ) x;
 RETURN (p-'questions')||jsonb_build_object('questions',qs);
END $fn$;

CREATE OR REPLACE FUNCTION public.get_public_quiz(p_public_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE q public.quizzes%ROWTYPE;
BEGIN
 SELECT * INTO q FROM public.quizzes WHERE is_public=TRUE AND (public_id::text=p_public_id OR id=p_public_id) LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN public.quiz_sanitize_payload(to_jsonb(q));
END $fn$;

CREATE OR REPLACE FUNCTION public.get_public_quiz_catalog()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
 SELECT coalesce(jsonb_agg(public.quiz_sanitize_payload(to_jsonb(q))),'[]'::jsonb)
 FROM public.quizzes q WHERE q.is_public=TRUE AND q.status<>'draft';
$fn$;
CREATE OR REPLACE FUNCTION public.get_student_quiz_catalog()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE sid TEXT:=public.quiz_current_student_id(); cids TEXT[]; result JSONB;
BEGIN
 SELECT array_agg(DISTINCT class_id::text) INTO cids
 FROM public.class_enrollments WHERE student_id=sid AND status='active';
 IF coalesce(array_length(cids,1),0)=0 THEN
   SELECT ARRAY[class_id::text] INTO cids FROM public.students WHERE id::text=sid;
 END IF;
 SELECT coalesce(jsonb_agg(public.quiz_sanitize_payload(to_jsonb(q))),'[]') INTO result
 FROM public.quizzes q
 WHERE coalesce(cids,ARRAY[]::text[]) && coalesce(nullif(q.class_ids,ARRAY[]::text[]),ARRAY[q.class_id]);
 RETURN coalesce(result,'[]');
END $fn$;

CREATE OR REPLACE FUNCTION public.evaluate_quiz_question(p_quiz_id TEXT,p_question_id TEXT,p_answer TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE sid TEXT:=public.quiz_current_student_id(); q public.quizzes%ROWTYPE; cids TEXT[]; question JSONB; l public.quiz_launches%ROWTYPE; part public.quiz_participants%ROWTYPE;
BEGIN
 SELECT * INTO q FROM public.quizzes WHERE id=p_quiz_id;
 IF NOT FOUND OR q.status<>'launched' THEN RAISE EXCEPTION 'Quiz non disponible.'; END IF;
 SELECT array_agg(DISTINCT class_id::text) INTO cids FROM public.class_enrollments WHERE student_id=sid AND status='active';
 IF coalesce(array_length(cids,1),0)=0 THEN SELECT ARRAY[class_id::text] INTO cids FROM public.students WHERE id::text=sid; END IF;
 IF NOT (coalesce(cids,ARRAY[]::text[]) && coalesce(nullif(q.class_ids,ARRAY[]::text[]),ARRAY[q.class_id])) THEN RAISE EXCEPTION 'Accès refusé.'; END IF;
 IF q.attendance_mode='strict_presence' AND NOT coalesce(q.is_public,FALSE) THEN
   SELECT * INTO l FROM public.quiz_launches WHERE quiz_id=q.id AND status='launched' ORDER BY launched_at DESC LIMIT 1;
   IF NOT FOUND THEN RAISE EXCEPTION 'Aucun lancement actif.'; END IF;
   SELECT * INTO part FROM public.quiz_participants WHERE launch_id=l.id AND student_id=sid;
   IF NOT FOUND OR part.presence_status NOT IN ('present','retry_authorized') THEN RAISE EXCEPTION 'Présence non confirmée.'; END IF;
   IF part.presence_deadline_at IS NOT NULL AND clock_timestamp()<part.presence_deadline_at THEN RAISE EXCEPTION 'Fenêtre de présence encore ouverte.'; END IF;
 END IF;
 SELECT value INTO question FROM jsonb_array_elements(coalesce(q.questions,'[]')) WHERE value->>'id'=p_question_id LIMIT 1;
 IF question IS NULL THEN RAISE EXCEPTION 'Question introuvable.'; END IF;
 RETURN public.quiz_grade_question(question,p_answer);
END $fn$;

CREATE OR REPLACE FUNCTION public.evaluate_public_quiz_question(p_public_id TEXT,p_question_id TEXT,p_answer TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE q public.quizzes%ROWTYPE; question JSONB;
BEGIN
 SELECT * INTO q FROM public.quizzes WHERE is_public=TRUE AND (public_id::text=p_public_id OR id=p_public_id) LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Quiz public introuvable.'; END IF;
 SELECT value INTO question FROM jsonb_array_elements(coalesce(q.questions,'[]')) WHERE value->>'id'=p_question_id LIMIT 1;
 IF question IS NULL THEN RAISE EXCEPTION 'Question introuvable.'; END IF;
 RETURN public.quiz_grade_question(question,p_answer);
END $fn$;

-- Keep the previous persistence/attendance checks, but wrap them with authoritative grading.
DO $fn$ BEGIN
 IF to_regprocedure('public.submit_quiz_presence_submission(jsonb)') IS NOT NULL AND to_regprocedure('public.submit_quiz_presence_submission_legacy_unsafe(jsonb)') IS NULL THEN
   ALTER FUNCTION public.submit_quiz_presence_submission(JSONB) RENAME TO submit_quiz_presence_submission_legacy_unsafe;
 END IF;
 IF to_regprocedure('public.submit_quiz_submission(jsonb)') IS NOT NULL AND to_regprocedure('public.submit_quiz_submission_legacy_unsafe(jsonb)') IS NULL THEN
   ALTER FUNCTION public.submit_quiz_submission(JSONB) RENAME TO submit_quiz_submission_legacy_unsafe;
 END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.submit_quiz_presence_submission_legacy_unsafe(JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.submit_quiz_submission_legacy_unsafe(JSONB) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.submit_quiz_presence_submission(p_submission JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE e JSONB; payload JSONB; status TEXT:=coalesce(p_submission->>'status','completed'); result JSONB;
BEGIN
 e:=public.quiz_grade_all(p_submission->>'quiz_id',coalesce(p_submission->'answers','{}'));
 IF status='timeout' THEN e:=jsonb_set(jsonb_set(e,'{rawScore}','0'),'{score20}','0'); END IF;
 payload:=p_submission||jsonb_build_object('score',e->'rawScore','max_score',e->'maxScore','score_20',e->'score20','feedback',e->'feedback');
 SELECT public.submit_quiz_presence_submission_legacy_unsafe(payload) INTO result;
 RETURN result;
END $fn$;

CREATE OR REPLACE FUNCTION public.submit_quiz_submission(p_submission JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE q public.quizzes%ROWTYPE; sid TEXT; cids TEXT[]; e JSONB; payload JSONB; status TEXT:=coalesce(p_submission->>'status','completed');
BEGIN
 SELECT * INTO q FROM public.quizzes WHERE id=p_submission->>'quiz_id';
 IF NOT FOUND OR q.status<>'launched' THEN RAISE EXCEPTION 'Quiz indisponible.'; END IF;
 IF auth.uid() IS NOT NULL THEN
   sid:=public.quiz_current_student_id();
   SELECT array_agg(DISTINCT class_id::text) INTO cids FROM public.class_enrollments WHERE student_id=sid AND status='active';
   IF coalesce(array_length(cids,1),0)=0 THEN SELECT ARRAY[class_id::text] INTO cids FROM public.students WHERE id::text=sid; END IF;
   IF NOT (coalesce(cids,ARRAY[]::text[]) && coalesce(nullif(q.class_ids,ARRAY[]::text[]),ARRAY[q.class_id])) THEN RAISE EXCEPTION 'Accès refusé.'; END IF;
 ELSE
   IF NOT coalesce(q.is_public,FALSE) THEN RAISE EXCEPTION 'Connexion étudiant requise.'; END IF;
   sid:=p_submission->>'student_id';
   IF coalesce(sid,'')='' THEN RAISE EXCEPTION 'Identifiant étudiant requis.'; END IF;
 END IF;
 e:=public.quiz_grade_all(q.id,coalesce(p_submission->'answers','{}'));
 IF status='timeout' THEN e:=jsonb_set(jsonb_set(e,'{rawScore}','0'),'{score20}','0'); END IF;
 payload:=p_submission||jsonb_build_object('student_id',sid,'score',e->'rawScore','max_score',e->'maxScore','score_20',e->'score20','feedback',e->'feedback');
 PERFORM public.submit_quiz_submission_legacy_unsafe(payload);
END $fn$;

-- Remove permissive historical policies on all quiz result/launch tables.
DO $fn$ DECLARE t TEXT; p RECORD; BEGIN
 FOREACH t IN ARRAY ARRAY['quizzes','quiz_submissions','quiz_attempts','quiz_participants','quiz_launches','quiz_retry_grants'] LOOP
  IF to_regclass('public.'||t) IS NOT NULL THEN
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
   FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',p.policyname,t);
   END LOOP;
  END IF;
 END LOOP;
END $fn$;

REVOKE ALL ON public.quizzes,public.quiz_submissions,public.quiz_attempts,public.quiz_participants,public.quiz_launches,public.quiz_retry_grants FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.quizzes TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.quiz_submissions TO authenticated;
GRANT SELECT ON public.quiz_attempts,public.quiz_participants,public.quiz_launches,public.quiz_retry_grants TO authenticated;

CREATE POLICY quiz_teacher_manage ON public.quizzes FOR ALL TO authenticated
 USING ((SELECT public.quiz_is_teacher())) WITH CHECK ((SELECT public.quiz_is_teacher()));
CREATE POLICY quiz_submission_read_scoped ON public.quiz_submissions FOR SELECT TO authenticated
 USING (CASE WHEN (SELECT public.quiz_is_teacher()) THEN TRUE ELSE student_id=(SELECT public.quiz_current_student_id()) END);
CREATE POLICY quiz_submission_teacher_insert ON public.quiz_submissions FOR INSERT TO authenticated
 WITH CHECK ((SELECT public.quiz_is_teacher()));
CREATE POLICY quiz_submission_teacher_update ON public.quiz_submissions FOR UPDATE TO authenticated
 USING ((SELECT public.quiz_is_teacher())) WITH CHECK ((SELECT public.quiz_is_teacher()));
CREATE POLICY quiz_submission_teacher_delete ON public.quiz_submissions FOR DELETE TO authenticated
 USING ((SELECT public.quiz_is_teacher()));
CREATE POLICY quiz_attempts_read_scoped ON public.quiz_attempts FOR SELECT TO authenticated
 USING ((SELECT public.quiz_is_teacher()) OR student_id=(SELECT public.quiz_current_student_id()));
CREATE POLICY quiz_participants_read_scoped ON public.quiz_participants FOR SELECT TO authenticated
 USING ((SELECT public.quiz_is_teacher()) OR student_id=(SELECT public.quiz_current_student_id()));
CREATE POLICY quiz_launches_read_scoped ON public.quiz_launches FOR SELECT TO authenticated
 USING (CASE WHEN (SELECT public.quiz_is_teacher()) THEN TRUE ELSE EXISTS(
   SELECT 1 FROM public.quiz_participants p WHERE p.launch_id=quiz_launches.id AND p.student_id=(SELECT public.quiz_current_student_id())) END);
CREATE POLICY quiz_retry_grants_read_scoped ON public.quiz_retry_grants FOR SELECT TO authenticated
 USING ((SELECT public.quiz_is_teacher()) OR student_id=(SELECT public.quiz_current_student_id()));

REVOKE ALL ON FUNCTION public.quiz_norm_answer(TEXT,BOOLEAN) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.quiz_text_matches(TEXT,TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.quiz_grade_question(JSONB,TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.quiz_grade_all(TEXT,JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.quiz_sanitize_payload(JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_public_quiz(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_quiz_catalog() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_public_quiz_catalog() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.evaluate_quiz_question(TEXT,TEXT,TEXT) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.evaluate_public_quiz_question(TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_quiz_presence_submission(JSONB) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.submit_quiz_submission(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_quiz(TEXT) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_quiz_catalog() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_quiz_catalog() TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_quiz_question(TEXT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_public_quiz_question(TEXT,TEXT,TEXT) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_presence_submission(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_submission(JSONB) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.quiz_is_teacher() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.quiz_current_student_id() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quiz_is_teacher() TO authenticated;
GRANT EXECUTE ON FUNCTION public.quiz_current_student_id() TO authenticated;
NOTIFY pgrst,'reload schema';
