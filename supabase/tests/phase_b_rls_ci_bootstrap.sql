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

CREATE TABLE public.lesson_progress (
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',
  discovery_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE public.lessons (
  id uuid PRIMARY KEY,
  status text NOT NULL
);

CREATE TABLE public.lesson_blocks (
  id uuid PRIMARY KEY,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id),
  position integer NOT NULL,
  type text NOT NULL,
  content jsonb NOT NULL,
  parent_block_id uuid
);

-- Exercise tables are included to verify the schema-wide privilege hardening.
CREATE TABLE public.exercises (id uuid PRIMARY KEY, status text NOT NULL);
CREATE TABLE public.exercise_versions (id uuid PRIMARY KEY, content jsonb NOT NULL);
CREATE TABLE public.exercise_class_assignments (exercise_id uuid NOT NULL, class_id uuid NOT NULL);
CREATE TABLE public.exercise_attempts (id uuid PRIMARY KEY, student_id uuid NOT NULL);
CREATE TABLE public.exercise_answers (id uuid PRIMARY KEY, attempt_id uuid NOT NULL, answer jsonb);

CREATE TABLE public.quiz_submissions (id uuid PRIMARY KEY);
CREATE TABLE public.quiz_attempts (id uuid PRIMARY KEY);
CREATE TABLE public.quiz_launches (id uuid PRIMARY KEY);
CREATE TABLE public.quiz_participants (id uuid PRIMARY KEY);
CREATE TABLE public.quiz_retry_grants (id uuid PRIMARY KEY);
CREATE TABLE public.quizzes (id uuid PRIMARY KEY);
CREATE TABLE public.class_enrollment_requests (id uuid PRIMARY KEY);

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

CREATE POLICY "Managers can manage lessons" ON public.lessons FOR ALL TO authenticated
  USING (public.class_enrollment_is_teacher())
  WITH CHECK (public.class_enrollment_is_teacher());
CREATE POLICY "Published lessons are readable" ON public.lessons FOR SELECT TO anon, authenticated
  USING (status = 'published');
CREATE POLICY "Managers can manage lesson blocks" ON public.lesson_blocks FOR ALL TO authenticated
  USING (public.class_enrollment_is_teacher())
  WITH CHECK (public.class_enrollment_is_teacher());
CREATE POLICY "Published lesson blocks are readable" ON public.lesson_blocks FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = lesson_blocks.lesson_id AND l.status = 'published'));
CREATE POLICY "Managers read lesson progress" ON public.lesson_progress FOR SELECT TO authenticated USING (true);
CREATE POLICY "Students manage own lesson progress" ON public.lesson_progress FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_class_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_launches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_retry_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_enrollment_requests ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON ALL TABLES IN SCHEMA public TO anon, authenticated;

INSERT INTO public.lessons (id,status) VALUES
('70000000-0000-4000-8000-000000000001','published'),
('70000000-0000-4000-8000-000000000002','draft');
INSERT INTO public.lesson_blocks (id,lesson_id,position,type,content) VALUES
('71000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',1,'text','{"text":"Public lesson"}'),
('71000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002',1,'text','{"text":"Draft lesson"}');
INSERT INTO public.lesson_progress (user_id,lesson_id,status,discovery_state) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','70000000-0000-4000-8000-000000000001','completed','{}'),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd','70000000-0000-4000-8000-000000000001','in_progress','{}');

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
