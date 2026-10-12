/**
 * Script SQL complet pour l'initialisation de Supabase PostgreSQL
 */
export const SUPABASE_SQL_SCHEMA = `-- ==============================================================================
-- Italian Oral Exam Manager - PostgreSQL & Supabase Database Schema
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
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Table : students
CREATE TABLE students (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    student_number TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Table : exams
CREATE TABLE exams (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    exam_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Table : exam_rubrics
CREATE TABLE exam_rubrics (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    question TEXT NOT NULL,
    example_sentence TEXT NOT NULL,
    points NUMERIC(5,2) NOT NULL DEFAULT 1.0,
    position INTEGER NOT NULL,
    CONSTRAINT unique_exam_rubric_position UNIQUE (exam_id, position)
);

-- 5. Table : evaluations
CREATE TABLE evaluations (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
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
    id TEXT PRIMARY KEY,
    evaluation_id TEXT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
    rubric_id TEXT NOT NULL REFERENCES exam_rubrics(id) ON DELETE CASCADE,
    is_validated BOOLEAN NOT NULL DEFAULT FALSE,
    awarded_points NUMERIC(5,2) NOT NULL DEFAULT 0.0,
    error_note TEXT,
    CONSTRAINT unique_eval_rubric UNIQUE (evaluation_id, rubric_id)
);

-- 7. Table : exam_pass_order
CREATE TABLE exam_pass_order (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'current', 'completed', 'absent')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_exam_student_pass UNIQUE (exam_id, student_id),
    CONSTRAINT unique_exam_position UNIQUE (exam_id, position)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);
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

CREATE POLICY "Classes full access" ON classes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Students full access" ON students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Exams full access" ON exams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Exam rubrics full access" ON exam_rubrics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Evaluations full access" ON evaluations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Evaluation details full access" ON evaluation_details FOR ALL USING (true);
CREATE POLICY "Exam pass order full access" ON exam_pass_order FOR ALL USING (true);
`;
