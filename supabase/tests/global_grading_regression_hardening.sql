DO $tests$
DECLARE r jsonb; q jsonb; v_section uuid; v_question_id uuid; v_position integer; v_score numeric; v_constraint text; v_save text;
BEGIN
 r:=public.quiz_grade_question('{"type":"qcm","points":2,"correct_answer":"Sono","options":[{"id":"a","label":"Sono"},{"id":"b","label":"Sei"}]}'::jsonb,'a');
 IF coalesce((r->>'correct')::boolean,false) IS NOT TRUE OR (r->>'points')::numeric<>2 THEN RAISE EXCEPTION 'QUIZ_QCM_ID_FAIL %',r; END IF;
 r:=public.quiz_grade_question('{"type":"qcm","points":2,"correct_answer":"a","options":[{"id":"a","label":"Sono"},{"id":"b","label":"Sei"}]}'::jsonb,'Sono');
 IF coalesce((r->>'correct')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'QUIZ_QCM_LABEL_FAIL %',r; END IF;
 r:=public.quiz_grade_question('{"type":"qcm","points":2,"correct_answer":"Sono","options":["Sono","Sei"]}'::jsonb,'0');
 IF coalesce((r->>'correct')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'QUIZ_QCM_INDEX_FAIL %',r; END IF;
 r:=public.quiz_grade_question('{"type":"qcm","points":2,"correct_answer":"a","options":[{"id":"a","label":"Sono"},{"id":"b","label":"Sei"}]}'::jsonb,'b');
 IF coalesce((r->>'correct')::boolean,false) IS TRUE THEN RAISE EXCEPTION 'QUIZ_QCM_NEGATIVE_FAIL %',r; END IF;

 r:=public.quiz_grade_question('{"type":"text","points":2,"answers":["ventitré","23"]}'::jsonb,'23');
 IF coalesce((r->>'correct')::boolean,false) IS NOT TRUE OR (r->>'points')::numeric<>2 OR (r->>'maxPoints')::numeric<>2 THEN RAISE EXCEPTION 'QUIZ_VARIANTS_FAIL %',r; END IF;
 r:=public.quiz_grade_question('{"type":"text","points":2,"blank_count":2,"answers":["quarantacinque","quarantacinque"]}'::jsonb,'quarantacinque');
 IF coalesce((r->>'correct')::boolean,false) IS NOT TRUE OR (r->>'points')::numeric<>2 OR (r->>'maxPoints')::numeric<>2 THEN RAISE EXCEPTION 'QUIZ_DUPLICATE_VARIANTS_FAIL %',r; END IF;
 r:=public.quiz_grade_question('{"type":"text","points":4,"blank_count":2,"answers":[["sono","io sono"],["ho","possiedo"]]}'::jsonb,'["IO SONO","possiedo"]');
 IF coalesce((r->>'correct')::boolean,false) IS NOT TRUE OR (r->>'points')::numeric<>4 THEN RAISE EXCEPTION 'QUIZ_MULTI_BLANK_FAIL %',r; END IF;
 r:=public.quiz_grade_question('{"type":"text","points":1,"blank_count":3,"question":"___ ___ ___","answers":["a","b","c"]}'::jsonb,'["a","b","c"]');
 IF coalesce((r->>'correct')::boolean,false) IS NOT TRUE OR (r->>'points')::numeric<>1 OR (r->>'maxPoints')::numeric<>1 THEN RAISE EXCEPTION 'QUIZ_THIRDS_FAIL %',r; END IF;
 r:=public.quiz_grade_question('{"type":"text","points":2,"correct_answer":"92"}'::jsonb,'novantadue');
 IF coalesce((r->>'correct')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'QUIZ_NUMBER_FAIL %',r; END IF;

 q:=jsonb_build_object('type','reorder','points',2,'items',jsonb_build_array(jsonb_build_object('id','a','text','A'),jsonb_build_object('id','b','text','B')),'correct_answer',jsonb_build_array('b','a')::text);
 r:=public.quiz_grade_question(q,'["b","a"]');
 IF coalesce((r->>'correct')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'QUIZ_REORDER_FAIL %',r; END IF;
 r:=public.quiz_grade_question('{"type":"verbes_trous","points":3,"verbes_trous":{"points_par_phrase":3,"phrases":[{"id":"p1","verbe":"essere","reponses":["sono / son"]}]}}'::jsonb,'{"choices":{"p1":"essere"},"saisies":{"p1":"son"}}');
 IF (r->>'points')::numeric<>3 THEN RAISE EXCEPTION 'QUIZ_VERBES_VARIANT_FAIL %',r; END IF;
 r:=public.quiz_grade_question('{"type":"mots_trous","points":2,"mots_trous":{"points_par_phrase":1,"banque":["sono","ho"],"phrases":[{"id":"p1","mot":"sono"},{"id":"p2","mot":"ho"}]}}'::jsonb,'{"p1":"sono","p2":"ho"}');
 IF coalesce((r->>'correct')::boolean,false) IS NOT TRUE OR (r->>'points')::numeric<>2 THEN RAISE EXCEPTION 'QUIZ_MOTS_FAIL %',r; END IF;

 r:=public.exercise_grade_question('{"type":"qcm","points":3,"correct_answer":"sono","options":["sono","sei"]}'::jsonb,'"0"'::jsonb);
 IF coalesce((r->>'correct')::boolean,false) IS NOT TRUE OR (r->>'points')::numeric<>3 THEN RAISE EXCEPTION 'EXERCISE_QCM_FAIL %',r; END IF;
 r:=public.exercise_grade_question('{"type":"text","points":2,"answers":["ventitré","23"]}'::jsonb,'"23"'::jsonb);
 IF coalesce((r->>'correct')::boolean,false) IS NOT TRUE OR (r->>'points')::numeric<>2 THEN RAISE EXCEPTION 'EXERCISE_VARIANTS_FAIL %',r; END IF;
 r:=public.exercise_grade_question('{"type":"text","points":1,"blank_count":3,"question":"___ ___ ___","answers":["a","b","c"]}'::jsonb,'["a","b","c"]'::jsonb);
 IF coalesce((r->>'correct')::boolean,false) IS NOT TRUE OR (r->>'points')::numeric<>1 THEN RAISE EXCEPTION 'EXERCISE_THIRDS_FAIL %',r; END IF;
 r:=public.exercise_grade_question('{"type":"text","points":2,"correct_answer":"caffè"}'::jsonb,'"caffè"'::jsonb);
 IF coalesce((r->>'correct')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'EXERCISE_UNICODE_FAIL %',r; END IF;
 r:=public.exercise_grade_question('{"type":"reorder","points":2,"items":[{"id":"a"},{"id":"b"}]}'::jsonb,'["a","b"]'::jsonb);
 IF coalesce((r->>'correct')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'EXERCISE_REORDER_FAIL %',r; END IF;
 r:=public.exercise_grade_question('{"type":"verbes_trous","points":3,"verbes_trous":{"phrases":[{"id":"p1","verbe":"essere","reponses":["sono / son"]}]}}'::jsonb,'{"choices":{"p1":"essere"},"saisies":{"p1":"son"}}'::jsonb);
 IF (r->>'points')::numeric<>3 THEN RAISE EXCEPTION 'EXERCISE_VERBES_VARIANT_FAIL %',r; END IF;
 r:=public.exercise_grade_question('{"type":"mots_trous","points":2,"mots_trous":{"banque":["sono","ho"],"phrases":[{"id":"p1","mot":"sono"},{"id":"p2","mot":"ho"}]}}'::jsonb,'{"p1":"sono","p2":"ho"}'::jsonb);
 IF coalesce((r->>'correct')::boolean,false) IS NOT TRUE OR (r->>'points')::numeric<>2 THEN RAISE EXCEPTION 'EXERCISE_MOTS_FAIL %',r; END IF;

 SELECT pg_get_constraintdef(oid) INTO v_constraint FROM pg_constraint WHERE conname='written_exam_questions_question_type_check';
 IF v_constraint NOT LIKE '%mots_trous%' THEN RAISE EXCEPTION 'EXAM_MOTS_CONSTRAINT_MISSING %',v_constraint; END IF;
 SELECT pg_get_functiondef('public.save_written_exam_definition(uuid,jsonb)'::regprocedure) INTO v_save;
 IF position('mots_trous' IN v_save)=0 THEN RAISE EXCEPTION 'EXAM_SAVE_MOTS_PAYLOAD_MISSING'; END IF;

 SELECT s.id INTO v_section FROM public.written_exam_sections s WHERE NOT EXISTS (SELECT 1 FROM public.written_exam_attempts a WHERE a.version_id=s.version_id) ORDER BY s.position LIMIT 1;
 IF v_section IS NOT NULL THEN
   SELECT coalesce(max(position),0)+1 INTO v_position FROM public.written_exam_questions WHERE section_id=v_section;
   v_question_id:=gen_random_uuid();
   INSERT INTO public.written_exam_questions(section_id,question_key,position,question_type,prompt,points,public_data)
   VALUES(v_section,'grading-test-'||v_question_id::text,v_position,'text','Scrivi novantadue',2,'{"type":"text"}'::jsonb);
   INSERT INTO public.written_exam_answer_keys(question_id,answer_key) VALUES(v_question_id,'{"acceptedAnswers":["novantadue"]}'::jsonb);
   v_score:=public.written_exam_auto_question_score(v_question_id,'"92"'::jsonb);
   IF v_score<>2 THEN RAISE EXCEPTION 'EXAM_TEXT_NUMBER_FAIL %',v_score; END IF;
   DELETE FROM public.written_exam_questions WHERE id=v_question_id;
   v_position:=v_position+1;

   v_question_id:=gen_random_uuid();
   INSERT INTO public.written_exam_questions(section_id,question_key,position,question_type,prompt,points,public_data)
   VALUES(v_section,'grading-test-'||v_question_id::text,v_position,'mots_trous','Completa le frasi',2,'{"type":"mots_trous","mots_trous":{"points_par_phrase":1,"banque":["sono","ho"],"phrases":[{"id":"p1","debut":"","fin":""},{"id":"p2","debut":"","fin":""}]}}'::jsonb);
   INSERT INTO public.written_exam_answer_keys(question_id,answer_key) VALUES(v_question_id,'{"phrases":[{"id":"p1","mot":"sono"},{"id":"p2","mot":"ho"}]}'::jsonb);
   v_score:=public.written_exam_auto_question_score(v_question_id,'{"p1":"sono","p2":"ho"}'::jsonb);
   IF v_score<>2 THEN RAISE EXCEPTION 'EXAM_MOTS_FULL_FAIL %',v_score; END IF;
   v_score:=public.written_exam_auto_question_score(v_question_id,'{"p1":"sono","p2":"sono"}'::jsonb);
   IF v_score<>1 THEN RAISE EXCEPTION 'EXAM_MOTS_DUPLICATE_FAIL %',v_score; END IF;
   DELETE FROM public.written_exam_questions WHERE id=v_question_id;
 END IF;
END;
$tests$;
