-- Regression coverage for the live quiz grading RPC implementation.
DO $test$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.quiz_grade_question(
    '{"id":"duplicate-answer","type":"text","question":"Calcola 9 × 5","points":2,"blank_count":2,"answers":["quarantacinque","quarantacinque"]}'::jsonb,
    'quarantacinque'
  );
  IF coalesce((v_result->>'correct')::boolean,false)=false
     OR (v_result->>'points')::numeric<>2
     OR (v_result->>'maxPoints')::numeric<>2 THEN
    RAISE EXCEPTION 'A duplicated single expected answer must receive full credit. Result: %',v_result;
  END IF;

  v_result := public.quiz_grade_question(
    '{"id":"qcm-id","type":"qcm","points":2,"correct_answer":"opt-a","options":[{"id":"opt-a","label":"Quarantacinque"},{"id":"opt-b","label":"Cinquantacinque"}]}'::jsonb,
    'Quarantacinque'
  );
  IF coalesce((v_result->>'correct')::boolean,false)=false OR (v_result->>'points')::numeric<>2 THEN
    RAISE EXCEPTION 'QCM grading must accept the correct option label when the key stores its id. Result: %',v_result;
  END IF;

  v_result := public.quiz_grade_question(
    '{"id":"qcm-label","type":"qcm","points":2,"correct_answer":"Quarantacinque","options":[{"id":"opt-a","label":"Quarantacinque"},{"id":"opt-b","label":"Cinquantacinque"}]}'::jsonb,
    'opt-a'
  );
  IF coalesce((v_result->>'correct')::boolean,false)=false OR (v_result->>'points')::numeric<>2 THEN
    RAISE EXCEPTION 'QCM grading must accept the correct option id when the key stores its label. Result: %',v_result;
  END IF;

  v_result := public.quiz_grade_question(
    '{"id":"qcm-wrong","type":"qcm","points":2,"correct_answer":"opt-a","options":[{"id":"opt-a","label":"Quarantacinque"},{"id":"opt-b","label":"Cinquantacinque"}]}'::jsonb,
    'opt-b'
  );
  IF coalesce((v_result->>'correct')::boolean,false)=true OR (v_result->>'points')::numeric<>0 THEN
    RAISE EXCEPTION 'QCM grading accepted an incorrect option. Result: %',v_result;
  END IF;

  v_result := public.quiz_grade_question(
    '{"id":"two-blanks","type":"text","points":4,"blank_count":2,"answers":[["parlo","io parlo"],["scrivi","tu scrivi"]]}'::jsonb,
    '["io parlo","scrivi"]'
  );
  IF coalesce((v_result->>'correct')::boolean,false)=false OR (v_result->>'points')::numeric<>4 THEN
    RAISE EXCEPTION 'Nested answer arrays must preserve true multi-blank grading. Result: %',v_result;
  END IF;
END
$test$;
