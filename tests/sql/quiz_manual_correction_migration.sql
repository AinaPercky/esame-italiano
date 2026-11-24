-- Test d'intégration isolé de la correction manuelle des quiz.
-- À exécuter dans une base PostgreSQL jetable.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END;
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $fn$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$fn$;

CREATE OR REPLACE FUNCTION public.quiz_is_teacher()
RETURNS boolean LANGUAGE sql STABLE AS $fn$
  SELECT current_setting('request.jwt.claim.role', true) = 'authenticated'
     AND lower(coalesce(current_setting('request.jwt.claim.email', true), '')) = 'ainapercky@gmail.com';
$fn$;

CREATE TABLE public.quiz_submissions (
  id text PRIMARY KEY,
  quiz_id text NOT NULL,
  quiz_title text,
  student_id text NOT NULL,
  student_name text,
  student_number text,
  class_id text,
  class_name text,
  started_at timestamptz,
  submitted_at timestamptz,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  questions_snapshot jsonb,
  score numeric NOT NULL DEFAULT 0,
  max_score numeric NOT NULL DEFAULT 10,
  score_20 numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  feedback jsonb NOT NULL DEFAULT '{}'::jsonb,
  date date DEFAULT current_date,
  attempt_number integer NOT NULL DEFAULT 1,
  launch_id uuid,
  attendance_status text DEFAULT 'unknown',
  retry_grant_id uuid,
  is_counted boolean NOT NULL DEFAULT true,
  UNIQUE (quiz_id, student_id, attempt_number)
);

CREATE TABLE public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id text NOT NULL,
  student_id text NOT NULL,
  attempt_number integer NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  max_score numeric NOT NULL DEFAULT 10,
  score_20 numeric NOT NULL DEFAULT 0,
  feedback jsonb NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO public.quiz_submissions (
  id, quiz_id, student_id, student_name, status, questions_snapshot, score, max_score,
  score_20, feedback, attempt_number, submitted_at, is_counted
) VALUES
  ('manual-attempt-1', 'manual-quiz', 'student-1', 'Élève Test', 'completed',
   '[{"id":"q1","type":"qcm","question":"Question 1","correct_answer":"A","points":5},{"id":"q2","type":"text","question":"Question 2","correct_answer":"ciao","points":5}]'::jsonb,
   4, 10, 8, '{"q1":{"points":2,"maxPoints":5,"correct":false},"q2":{"points":2,"maxPoints":5,"correct":false}}'::jsonb,
   1, now() - interval '2 hours', false),
  ('manual-attempt-2', 'manual-quiz', 'student-1', 'Élève Test', 'completed',
   '[{"id":"q1","type":"qcm","question":"Question 1","correct_answer":"A","points":5},{"id":"q2","type":"text","question":"Question 2","correct_answer":"ciao","points":5}]'::jsonb,
   8, 10, 16, '{"q1":{"points":4,"maxPoints":5,"correct":false},"q2":{"points":4,"maxPoints":5,"correct":false}}'::jsonb,
   2, now() - interval '1 hour', true);

INSERT INTO public.quiz_attempts (quiz_id, student_id, attempt_number, score, max_score, score_20)
VALUES ('manual-quiz', 'student-1', 1, 4, 10, 8);

\i supabase/migrations/20261124190000_quiz_manual_correction.sql
-- Idempotence de la migration.
\i supabase/migrations/20261124190000_quiz_manual_correction.sql

DO $security$
BEGIN
  IF has_function_privilege('anon', 'public.review_quiz_submission(text,jsonb,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon ne doit pas pouvoir exécuter la correction manuelle';
  END IF;
  IF has_column_privilege('authenticated', 'public.quiz_submissions', 'manual_review', 'SELECT') THEN
    RAISE EXCEPTION 'Les élèves ne doivent pas lire les commentaires privés de correction';
  END IF;
END;
$security$;

SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.email', 'ainapercky@gmail.com', false);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000123', false);

SELECT public.review_quiz_submission(
  'manual-attempt-1',
  '{"q1":5,"q2":4}'::jsonb,
  '{"q1":"Réponse acceptable dans ce contexte","q2":"Accord grammatical à revoir"}'::jsonb,
  'Relecture professorale après vérification du corrigé.'
);

DO $verify$
DECLARE
  reviewed public.quiz_submissions%ROWTYPE;
  attempt public.quiz_attempts%ROWTYPE;
BEGIN
  SELECT * INTO reviewed FROM public.quiz_submissions WHERE id = 'manual-attempt-1';
  IF reviewed.score IS DISTINCT FROM 9::numeric OR reviewed.score_20 IS DISTINCT FROM 18::numeric THEN
    RAISE EXCEPTION 'La note corrigée doit être recalculée : score %, score20 %', reviewed.score, reviewed.score_20;
  END IF;
  IF reviewed.manual_review ->> 'general_comment' IS DISTINCT FROM 'Relecture professorale après vérification du corrigé.' THEN
    RAISE EXCEPTION 'Le commentaire général n''a pas été conservé.';
  END IF;
  IF reviewed.manual_review ->> 'automatic_score' IS DISTINCT FROM '4'
     OR reviewed.manual_review ->> 'automatic_score_20' IS DISTINCT FROM '8'
     OR reviewed.manual_review #>> '{automatic_feedback,q1,points}' IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION 'La note automatique originale doit rester disponible après correction.';
  END IF;
  IF reviewed.feedback #>> '{q1,points}' IS DISTINCT FROM '5'
     OR reviewed.feedback #>> '{q1,correct}' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Le feedback de la question doit refléter les points vérifiés : %', reviewed.feedback;
  END IF;
  IF reviewed.is_counted IS DISTINCT FROM true
     OR (SELECT is_counted FROM public.quiz_submissions WHERE id = 'manual-attempt-2') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Le classement des tentatives doit être recalculé après correction.';
  END IF;
  SELECT * INTO attempt FROM public.quiz_attempts WHERE quiz_id = 'manual-quiz' AND student_id = 'student-1' AND attempt_number = 1;
  IF attempt.score IS DISTINCT FROM 9::numeric OR attempt.score_20 IS DISTINCT FROM 18::numeric THEN
    RAISE EXCEPTION 'La table des tentatives doit recevoir la note corrigée.';
  END IF;
END;
$verify$;

DO $validation$
BEGIN
  BEGIN
    PERFORM public.review_quiz_submission('manual-attempt-1', '{"q1":6,"q2":4}'::jsonb, '{}'::jsonb, '');
    RAISE EXCEPTION 'Une note supérieure au barème aurait dû être refusée.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Une note supérieure au barème aurait dû être refusée.' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.review_quiz_submission('manual-attempt-1', '{"unknown-question":1}'::jsonb, '{}'::jsonb, '');
    RAISE EXCEPTION 'Une question inconnue aurait dû être refusée.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Une question inconnue aurait dû être refusée.' THEN RAISE; END IF;
  END;
END;
$validation$;

SELECT set_config('request.jwt.claim.email', 'student@example.com', false);
DO $unauthorized$
BEGIN
  BEGIN
    PERFORM public.review_quiz_submission('manual-attempt-1', '{"q1":5,"q2":5}'::jsonb, '{}'::jsonb, '');
    RAISE EXCEPTION 'Un élève ne doit pas pouvoir corriger une copie.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Un élève ne doit pas pouvoir corriger une copie.' THEN RAISE; END IF;
  END;
END;
$unauthorized$;

SELECT 'quiz manual correction migration: OK' AS result;
