/**
 * Script SQL complet pour l'initialisation de Supabase PostgreSQL
 */
export const SUPABASE_SQL_SCHEMA = `-- ==============================================================================
-- PerckyLingua - PostgreSQL & Supabase Database Schema
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Nettoyage conditionnel
DROP TABLE IF EXISTS evaluation_details CASCADE;
DROP TABLE IF EXISTS exam_pass_order CASCADE;
DROP TABLE IF EXISTS evaluations CASCADE;
DROP TABLE IF EXISTS exam_rubrics CASCADE;
DROP TABLE IF EXISTS exams CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS classes CASCADE;

-- 1. Table : classes
CREATE TABLE classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Table : students
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    gender TEXT NOT NULL DEFAULT 'homme' CHECK (gender IN ('homme', 'femme')),
    email TEXT NOT NULL CHECK (btrim(email) <> ''),
    student_number TEXT,
    avatar_url TEXT,
    validation_status TEXT NOT NULL DEFAULT 'approved' CHECK (validation_status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Table : exams
CREATE TABLE exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    exam_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Table : exam_rubrics
CREATE TABLE exam_rubrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    question TEXT NOT NULL,
    example_sentence TEXT NOT NULL,
    points NUMERIC(5,2) NOT NULL DEFAULT 1.0,
    position INTEGER NOT NULL,
    CONSTRAINT unique_exam_rubric_position UNIQUE (exam_id, position)
);

-- 5. Table : evaluations
CREATE TABLE evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    total_score NUMERIC(5,2) NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'completed')),
    max_duration_seconds INTEGER NOT NULL DEFAULT 180,
    duration_used_seconds INTEGER DEFAULT 0,
    timer_status TEXT DEFAULT 'not_timed' CHECK (timer_status IN ('not_timed', 'completed', 'stopped_manually')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_student_exam UNIQUE (exam_id, student_id)
);

-- 6. Table : evaluation_details
CREATE TABLE evaluation_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
    rubric_id UUID NOT NULL REFERENCES exam_rubrics(id) ON DELETE CASCADE,
    is_validated BOOLEAN NOT NULL DEFAULT FALSE,
    awarded_points NUMERIC(5,2) NOT NULL DEFAULT 0.0,
    error_note TEXT,
    CONSTRAINT unique_eval_rubric UNIQUE (evaluation_id, rubric_id)
);

-- 7. Table : exam_pass_order
CREATE TABLE exam_pass_order (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'current', 'completed', 'absent')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_exam_student_pass UNIQUE (exam_id, student_id),
    CONSTRAINT unique_exam_position UNIQUE (exam_id, position)
);

-- 8. Quiz et soumissions
CREATE TABLE quizzes (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'Autre',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    duration_minutes INTEGER NOT NULL DEFAULT 10,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'launched', 'closed')),
    launched_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_points NUMERIC(7,2) NOT NULL DEFAULT 20,
    public_id UUID UNIQUE,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    class_ids TEXT[]
);

CREATE TABLE quiz_submissions (
    id TEXT PRIMARY KEY,
    quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    quiz_title TEXT NOT NULL,
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    student_number TEXT,
    class_id TEXT NOT NULL,
    class_name TEXT,
    started_at TIMESTAMPTZ NOT NULL,
    submitted_at TIMESTAMPTZ,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    score NUMERIC(7,2) NOT NULL DEFAULT 0,
    max_score NUMERIC(7,2) NOT NULL DEFAULT 20,
    score_20 NUMERIC(5,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('completed', 'timeout', 'missed')),
    feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
    date DATE NOT NULL,
    CONSTRAINT unique_quiz_student_submission UNIQUE (quiz_id, student_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_email_unique ON students (lower(btrim(email)));
CREATE INDEX IF NOT EXISTS idx_exams_class_id ON exams(class_id);
CREATE INDEX IF NOT EXISTS idx_exam_rubrics_exam_id ON exam_rubrics(exam_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_exam_id ON evaluations(exam_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_student_id ON evaluations(student_id);

-- Politiques de sécurité (RLS)
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_pass_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Classes full access" ON classes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Students full access" ON students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Exams full access" ON exams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Exam rubrics full access" ON exam_rubrics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Evaluations full access" ON evaluations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Evaluation details full access" ON evaluation_details FOR ALL USING (true);
CREATE POLICY "Exam pass order full access" ON exam_pass_order FOR ALL USING (true);
CREATE POLICY "Quizzes full access" ON quizzes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Quiz submissions full access" ON quiz_submissions FOR ALL USING (true) WITH CHECK (true);
`;

export const STUDENT_AVATAR_MIGRATION_SQL = `-- Migration non destructive : stockage des photos de profil des élèves
ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'student-avatars',
    'student-avatars',
    TRUE,
    512000,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Student avatars are publicly readable" ON storage.objects;
CREATE POLICY "Student avatars are publicly readable"
    ON storage.objects FOR SELECT TO anon, authenticated
    USING (bucket_id = 'student-avatars' AND (storage.foldername(name))[1] = 'avatars');

DROP POLICY IF EXISTS "Student avatars can be uploaded" ON storage.objects;
CREATE POLICY "Student avatars can be uploaded"
    ON storage.objects FOR INSERT TO anon, authenticated
    WITH CHECK (bucket_id = 'student-avatars' AND (storage.foldername(name))[1] = 'avatars');

DROP POLICY IF EXISTS "Student avatars can be replaced" ON storage.objects;
CREATE POLICY "Student avatars can be replaced"
    ON storage.objects FOR UPDATE TO anon, authenticated
    USING (bucket_id = 'student-avatars' AND (storage.foldername(name))[1] = 'avatars')
    WITH CHECK (bucket_id = 'student-avatars' AND (storage.foldername(name))[1] = 'avatars');

DROP POLICY IF EXISTS "Student avatars can be removed" ON storage.objects;
CREATE POLICY "Student avatars can be removed"
    ON storage.objects FOR DELETE TO anon, authenticated
    USING (bucket_id = 'student-avatars' AND (storage.foldername(name))[1] = 'avatars');
`;

export const STUDENT_EMAIL_IDENTITY_MIGRATION_SQL = `-- Migration destructive pour remplacer l'ancien annuaire par une identité élève basée sur l'e-mail
-- Supprime les anciennes soumissions de quiz et les élèves. Les évaluations orales
-- et ordres de passage sont supprimés automatiquement par les clés étrangères.
BEGIN;

DELETE FROM public.quiz_submissions;
DELETE FROM public.students;

ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.students
    ALTER COLUMN email SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_email_unique
    ON public.students (lower(btrim(email)));

COMMIT;
`;

export const QUIZ_SUPABASE_MIGRATION_SQL = `-- Ajout non destructif de la persistance des quiz et de leurs résultats
CREATE TABLE IF NOT EXISTS public.quizzes (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'Autre',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    duration_minutes INTEGER NOT NULL DEFAULT 10,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'launched', 'closed')),
    launched_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_points NUMERIC(7,2) NOT NULL DEFAULT 20,
    public_id UUID UNIQUE,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    class_ids TEXT[]
);

ALTER TABLE public.quizzes
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Autre';

CREATE TABLE IF NOT EXISTS public.quiz_submissions (
    id TEXT PRIMARY KEY,
    quiz_id TEXT NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    quiz_title TEXT NOT NULL,
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    student_number TEXT,
    class_id TEXT NOT NULL,
    class_name TEXT,
    started_at TIMESTAMPTZ NOT NULL,
    submitted_at TIMESTAMPTZ,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    score NUMERIC(7,2) NOT NULL DEFAULT 0,
    max_score NUMERIC(7,2) NOT NULL DEFAULT 20,
    score_20 NUMERIC(5,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('completed', 'timeout', 'missed')),
    feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
    date DATE NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_quiz_student_submission
    ON public.quiz_submissions (quiz_id, student_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_class_id ON public.quizzes (class_id);
CREATE INDEX IF NOT EXISTS idx_quiz_submissions_quiz_id ON public.quiz_submissions (quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_submissions_student_date
    ON public.quiz_submissions (student_id, date);

ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS public_id UUID;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS class_ids TEXT[];
CREATE UNIQUE INDEX IF NOT EXISTS idx_quizzes_public_id ON public.quizzes(public_id) WHERE public_id IS NOT NULL;

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Quizzes full access" ON public.quizzes;
CREATE POLICY "Quizzes full access" ON public.quizzes FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Quiz submissions full access" ON public.quiz_submissions;
CREATE POLICY "Quiz submissions full access" ON public.quiz_submissions FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
`;

export const ATOMIC_QUIZ_CLOSE_MIGRATION_SQL = `-- RPC transactionnelles pour lancement, clôture et remise des quiz.
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS public_id UUID;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS class_ids TEXT[];

CREATE OR REPLACE FUNCTION public.launch_quiz_and_clear_missed(p_quiz_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_quiz public.quizzes%ROWTYPE;
BEGIN
    SELECT * INTO v_quiz FROM public.quizzes WHERE id = p_quiz_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Quiz introuvable: %', p_quiz_id; END IF;
    DELETE FROM public.quiz_submissions WHERE quiz_id = p_quiz_id AND status = 'missed';
    UPDATE public.quizzes SET status = 'launched', launched_at = now(), expires_at = NULL
    WHERE id = p_quiz_id RETURNING * INTO v_quiz;
    RETURN to_jsonb(v_quiz);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_quiz_and_mark_missed(p_quiz_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_quiz public.quizzes%ROWTYPE; v_submissions JSONB;
BEGIN
    SELECT * INTO v_quiz FROM public.quizzes WHERE id = p_quiz_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Quiz introuvable: %', p_quiz_id; END IF;
    UPDATE public.quizzes SET status = 'closed' WHERE id = p_quiz_id RETURNING * INTO v_quiz;
    INSERT INTO public.quiz_submissions (
        id, quiz_id, quiz_title, student_id, student_name, student_number, class_id, class_name,
        started_at, submitted_at, answers, score, max_score, score_20, status, feedback, date
    )
    SELECT 'sub_missed_' || v_quiz.id || '_' || s.id::text, v_quiz.id, v_quiz.title, s.id::text,
        concat_ws(' ', s.first_name, s.last_name), s.student_number, s.class_id::text, c.name,
        coalesce(v_quiz.launched_at, now()), now(), '{}'::jsonb, 0,
        coalesce(v_quiz.total_points, 20), 0, 'missed', '{}'::jsonb, current_date
    FROM public.students s LEFT JOIN public.classes c ON c.id::text = s.class_id::text
    WHERE s.class_id::text = ANY(coalesce(nullif(v_quiz.class_ids, ARRAY[]::text[]), ARRAY[v_quiz.class_id]))
    ON CONFLICT (quiz_id, student_id) DO NOTHING;
    SELECT coalesce(jsonb_agg(to_jsonb(sub) ORDER BY sub.student_name), '[]'::jsonb)
    INTO v_submissions FROM public.quiz_submissions sub WHERE sub.quiz_id = p_quiz_id;
    RETURN jsonb_build_object('quiz', to_jsonb(v_quiz), 'submissions', v_submissions);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_quiz_submission(p_submission JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_quiz_id TEXT := p_submission ->> 'quiz_id'; v_quiz public.quizzes%ROWTYPE; v_submission_id TEXT;
BEGIN
    IF v_quiz_id IS NULL OR v_quiz_id = '' THEN RAISE EXCEPTION 'Identifiant de quiz manquant.'; END IF;
    SELECT * INTO v_quiz FROM public.quizzes WHERE id = v_quiz_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Quiz introuvable: %', v_quiz_id; END IF;
    IF v_quiz.status <> 'launched' THEN RAISE EXCEPTION 'Ce quiz est clôturé ou n''est pas lancé.'; END IF;
    INSERT INTO public.quiz_submissions (
        id, quiz_id, quiz_title, student_id, student_name, student_number, class_id, class_name,
        started_at, submitted_at, answers, score, max_score, score_20, status, feedback, date
    ) VALUES (
        p_submission ->> 'id', v_quiz_id, coalesce(p_submission ->> 'quiz_title', v_quiz.title),
        p_submission ->> 'student_id', p_submission ->> 'student_name', p_submission ->> 'student_number',
        p_submission ->> 'class_id', p_submission ->> 'class_name', (p_submission ->> 'started_at')::timestamptz,
        nullif(p_submission ->> 'submitted_at', '')::timestamptz, coalesce(p_submission -> 'answers', '{}'::jsonb),
        coalesce((p_submission ->> 'score')::numeric, 0), coalesce((p_submission ->> 'max_score')::numeric, 20),
        coalesce((p_submission ->> 'score_20')::numeric, 0), p_submission ->> 'status',
        coalesce(p_submission -> 'feedback', '{}'::jsonb), (p_submission ->> 'date')::date
    ) ON CONFLICT (quiz_id, student_id) DO NOTHING RETURNING id INTO v_submission_id;
    IF v_submission_id IS NULL THEN RAISE EXCEPTION 'Une soumission existe déjà pour cet élève et ce quiz.'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.launch_quiz_and_clear_missed(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_quiz_and_mark_missed(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_quiz_submission(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.launch_quiz_and_clear_missed(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_quiz_and_mark_missed(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_submission(JSONB) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
`;

export const STUDENT_VALIDATION_STATUS_MIGRATION_SQL = `-- Migration pour ajouter le statut de validation des comptes étudiants dans Supabase
ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (validation_status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_students_validation_status
    ON public.students (validation_status);
`;

export const STUDENT_GENDER_MIGRATION_SQL = `-- Migration non destructive : sexe et accord du message de bienvenue
ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT 'homme'
    CHECK (gender IN ('homme', 'femme'));
`;
