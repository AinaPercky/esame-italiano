-- Minimal isolated schema for the public quiz batch-grading RPC.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END
$roles$;

CREATE TABLE public.quizzes (
  id TEXT PRIMARY KEY,
  public_id TEXT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_points NUMERIC
);

CREATE OR REPLACE FUNCTION public.quiz_grade_question(p_question JSONB, p_answer TEXT)
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'correct', coalesce(p_answer, '') = coalesce(p_question ->> 'correct_answer', ''),
    'points', CASE WHEN coalesce(p_answer, '') = coalesce(p_question ->> 'correct_answer', '') THEN coalesce((p_question ->> 'points')::numeric, 1) ELSE 0 END,
    'maxPoints', coalesce((p_question ->> 'points')::numeric, 1),
    'expected', coalesce(p_question ->> 'correct_answer', ''),
    'studentAnswer', coalesce(p_answer, ''),
    'explanation', p_question -> 'explanation'
  );
$$;

INSERT INTO public.quizzes(id, public_id, is_public, questions, total_points) VALUES
(
  'public-quiz-1',
  'share-quiz-1',
  TRUE,
  '[
    {"id":"q1","type":"qcm","question":"Scegli.","correct_answer":"sono","points":2,"explanation":"Prima persona."},
    {"id":"q2","type":"qcm","question":"Scegli.","correct_answer":"sei","points":3,"explanation":"Seconda persona."}
  ]'::jsonb,
  5
),
(
  'private-quiz-1',
  'private-share-1',
  FALSE,
  '[{"id":"q1","correct_answer":"secret","points":1}]'::jsonb,
  1
);
