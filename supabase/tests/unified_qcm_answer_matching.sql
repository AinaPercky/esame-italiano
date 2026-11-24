-- Regression coverage for canonical QCM answer matching.
DO $tests$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.quiz_grade_question(
    '{"id":"q1","type":"qcm","points":2,"correct_answer":"Sono","options":[{"id":"a","label":"Sono"},{"id":"b","label":"Sei"}]}'::jsonb,
    'a'
  );
  IF coalesce((v_result->>'correct')::boolean,false) IS NOT TRUE
     OR coalesce((v_result->>'points')::numeric,0) <> 2 THEN
    RAISE EXCEPTION 'Quiz QCM rejected the correct option id: %', v_result;
  END IF;

  v_result := public.quiz_grade_question(
    '{"id":"q2","type":"qcm","points":2,"correct_answer":"a","options":[{"id":"a","label":"Sono"},{"id":"b","label":"Sei"}]}'::jsonb,
    'Sono'
  );
  IF coalesce((v_result->>'correct')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Quiz QCM rejected the correct visible label: %', v_result;
  END IF;

  v_result := public.exercise_grade_question(
    '{"type":"qcm","points":3,"correct_answer":"sono","options":["sono","sei"]}'::jsonb,
    '"0"'::jsonb
  );
  IF coalesce((v_result->>'correct')::boolean,false) IS NOT TRUE
     OR coalesce((v_result->>'points')::numeric,0) <> 3 THEN
    RAISE EXCEPTION 'Exercise QCM rejected the correct zero-based option index: %', v_result;
  END IF;

  v_result := public.exercise_grade_question(
    '{"type":"qcm","points":3,"correct_answer":"io sono","options":["io sono","io sei"]}'::jsonb,
    '"IO   SONO"'::jsonb
  );
  IF coalesce((v_result->>'correct')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Exercise QCM rejected a normalized correct label: %', v_result;
  END IF;

  IF NOT public.quiz_qcm_answer_matches(
    '[{"id":"opt-a","label":"La réponse correcte"},{"id":"opt-b","label":"Un distracteur"}]'::jsonb,
    'opt-a',
    'La réponse correcte'
  ) THEN
    RAISE EXCEPTION 'Written-exam QCM canonical matching rejected a correct label.';
  END IF;

  IF public.quiz_qcm_answer_matches(
    '[{"id":"opt-a","label":"La réponse correcte"},{"id":"opt-b","label":"Un distracteur"}]'::jsonb,
    'opt-a',
    'opt-b'
  ) THEN
    RAISE EXCEPTION 'QCM matcher accepted a genuinely wrong option.';
  END IF;
END;
$tests$;
