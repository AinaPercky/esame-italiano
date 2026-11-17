-- Minimal PostgreSQL fixture for the student roster and leaderboard RPC migrations.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '');
$$;

CREATE TABLE public.classes (
  id uuid PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE public.students (
  id uuid PRIMARY KEY,
  class_id uuid,
  first_name text,
  last_name text,
  gender text,
  email text,
  student_number text,
  avatar_url text,
  validation_status text,
  created_at timestamptz,
  updated_at timestamptz
);
CREATE TABLE public.class_enrollments (
  student_id uuid NOT NULL REFERENCES public.students(id),
  class_id uuid NOT NULL REFERENCES public.classes(id),
  status text NOT NULL,
  started_at timestamptz DEFAULT now()
);
CREATE TABLE public.quizzes (
  id text PRIMARY KEY,
  class_id text,
  class_ids text[]
);
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
  score numeric DEFAULT 0,
  max_score numeric DEFAULT 20,
  score_20 numeric DEFAULT 0,
  status text,
  feedback jsonb NOT NULL DEFAULT '{}'::jsonb,
  date date DEFAULT current_date,
  launch_id uuid,
  attempt_number integer DEFAULT 1,
  is_counted boolean NOT NULL DEFAULT true,
  attendance_status text DEFAULT 'unknown',
  retry_grant_id uuid
);

CREATE OR REPLACE FUNCTION public.quiz_is_teacher()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(nullif(current_setting('test.is_teacher', true), '')::boolean, false);
$$;

CREATE OR REPLACE FUNCTION public.quiz_current_student_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('test.student_id', true), '');
$$;


ALTER TABLE public.quizzes
  ADD COLUMN status text DEFAULT 'launched',
  ADD COLUMN attendance_mode text DEFAULT 'open',
  ADD COLUMN is_public boolean DEFAULT false,
  ADD COLUMN questions jsonb DEFAULT '[]'::jsonb;

CREATE TABLE public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id text NOT NULL,
  student_id text NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1
);

CREATE TABLE public.quiz_launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id text NOT NULL,
  status text NOT NULL,
  launched_at timestamptz DEFAULT now()
);

CREATE TABLE public.quiz_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id uuid NOT NULL,
  student_id text NOT NULL,
  presence_status text NOT NULL,
  presence_deadline_at timestamptz
);

CREATE TABLE public.quiz_question_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id text NOT NULL,
  student_id text NOT NULL,
  attempt_number integer NOT NULL,
  question_id text NOT NULL,
  answer text NOT NULL DEFAULT '',
  feedback jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (quiz_id, student_id, attempt_number, question_id)
);

CREATE OR REPLACE FUNCTION public.quiz_grade_question(question jsonb, answer text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'correct', coalesce(question ->> 'expected', '') = coalesce(answer, ''),
    'points', CASE WHEN coalesce(question ->> 'expected', '') = coalesce(answer, '') THEN 1 ELSE 0 END,
    'maxPoints', 1,
    'expected', question ->> 'expected'
  );
$$;
