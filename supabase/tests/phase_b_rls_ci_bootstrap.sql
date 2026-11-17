-- Isolated schema for Phase B RLS regression tests.
-- Never apply this file to a hosted or production database.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb LANGUAGE sql STABLE
AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

CREATE TABLE public.classes (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  enrollment_mode text NOT NULL DEFAULT 'approval',
  archived_at timestamptz
);

CREATE TABLE public.students (
  id uuid PRIMARY KEY,
  class_id uuid NOT NULL REFERENCES public.classes(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  student_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  avatar_url text,
  email text NOT NULL,
  validation_status text DEFAULT 'approved',
  gender text NOT NULL DEFAULT 'homme'
);

CREATE TABLE public.class_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id),
  class_id uuid NOT NULL REFERENCES public.classes(id),
  status text NOT NULL DEFAULT 'active',
  source text NOT NULL DEFAULT 'legacy',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.exams (
  id uuid PRIMARY KEY,
  class_id uuid NOT NULL REFERENCES public.classes(id),
  title text NOT NULL,
  description text,
  exam_date date NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now(),
  level text
);

CREATE TABLE public.exam_rubrics (
  id uuid PRIMARY KEY,
  exam_id uuid NOT NULL REFERENCES public.exams(id),
  title text NOT NULL,
  question text NOT NULL,
  example_sentence text NOT NULL,
  points numeric NOT NULL,
  position integer NOT NULL
);

CREATE TABLE public.evaluations (
  id uuid PRIMARY KEY,
  exam_id uuid NOT NULL REFERENCES public.exams(id),
  student_id uuid NOT NULL REFERENCES public.students(id),
  total_score numeric NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  max_duration_seconds integer NOT NULL DEFAULT 180,
  duration_used_seconds integer,
  timer_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.evaluation_details (
  id uuid PRIMARY KEY,
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id),
  rubric_id uuid NOT NULL REFERENCES public.exam_rubrics(id),
  is_validated boolean NOT NULL DEFAULT false,
  awarded_points numeric NOT NULL DEFAULT 0,
  error_note text
);

CREATE TABLE public.exam_pass_order (
  id uuid PRIMARY KEY,
  exam_id uuid NOT NULL REFERENCES public.exams(id),
  student_id uuid NOT NULL REFERENCES public.students(id),
  position integer NOT NULL,
  status text NOT NULL DEFAULT 'waiting',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.class_enrollment_is_teacher()
RETURNS boolean LANGUAGE sql STABLE
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) = 'ainapercky@gmail.com'
$$;

CREATE OR REPLACE FUNCTION public.class_enrollment_current_student_id()
RETURNS uuid LANGUAGE sql STABLE
SET search_path TO 'public', 'auth'
AS $$
  SELECT s.id
  FROM public.students s
  WHERE lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    AND coalesce(s.validation_status, 'approved') = 'approved'
  ORDER BY s.created_at DESC
  LIMIT 1
$$;

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_pass_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY classes_read_available ON public.classes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY classes_teacher_manage ON public.classes FOR ALL TO authenticated
  USING (public.class_enrollment_is_teacher())
  WITH CHECK (public.class_enrollment_is_teacher());
CREATE POLICY "Students full access" ON public.students FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "Exams full access" ON public.exams FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "Exam rubrics full access" ON public.exam_rubrics FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "Evaluations full access" ON public.evaluations FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "Evaluation details full access" ON public.evaluation_details FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "Exam pass order full access" ON public.exam_pass_order FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY class_enrollments_read_own_or_teacher ON public.class_enrollments FOR SELECT TO authenticated
  USING (public.class_enrollment_is_teacher() OR student_id = public.class_enrollment_current_student_id());

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON ALL TABLES IN SCHEMA public TO anon, authenticated;

INSERT INTO public.classes (id,name,enrollment_mode,archived_at) VALUES
('00000000-0000-4000-8000-000000000001','IUM-L2','approval',NULL),
('00000000-0000-4000-8000-000000000002','IUM-L3','approval',NULL),
('00000000-0000-4000-8000-000000000003','Ancienne classe','approval',now());

INSERT INTO public.students (id,class_id,first_name,last_name,student_number,email,validation_status,gender) VALUES
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Aina','One','STU-001','student.one@example.com','approved','femme'),
('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Bako','Two','STU-002','student.two@example.com','approved','homme'),
('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','Cina','Three','STU-003','student.three@example.com','approved','femme');

INSERT INTO public.class_enrollments (student_id,class_id,status) VALUES
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','active'),
('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','active'),
('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','active');

INSERT INTO public.exams (id,class_id,title,exam_date,status) VALUES
('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Oral IUM-L2','2026-11-17','completed'),
('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Oral IUM-L3','2026-11-17','completed');

INSERT INTO public.exam_rubrics (id,exam_id,title,question,example_sentence,points,position) VALUES
('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Pronuncia','Pronuncia','Esempio',5,1),
('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Lessico','Lessico','Esempio',5,1);

INSERT INTO public.evaluations (id,exam_id,student_id,total_score,status) VALUES
('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',4,'completed'),
('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',3,'completed'),
('40000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003',5,'completed');

INSERT INTO public.evaluation_details (id,evaluation_id,rubric_id,is_validated,awarded_points,error_note) VALUES
('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',true,4,NULL),
('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',true,3,NULL),
('50000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000002',true,5,NULL);

INSERT INTO public.exam_pass_order (id,exam_id,student_id,position,status) VALUES
('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,'completed'),
('60000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',2,'completed'),
('60000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003',1,'completed');
