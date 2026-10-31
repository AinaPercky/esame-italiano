-- ==============================================================================
-- PerckyLingua - PostgreSQL & Supabase Database Schema
-- Nom du projet : PerckyLingua
-- ==============================================================================

-- 1. Extensions nécessaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Nettoyage conditionnel (ordre inverse des dépendances)
DROP TABLE IF EXISTS evaluation_details CASCADE;
DROP TABLE IF EXISTS exam_pass_order CASCADE;
DROP TABLE IF EXISTS evaluations CASCADE;
DROP TABLE IF EXISTS exam_rubrics CASCADE;
DROP TABLE IF EXISTS exams CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS classes CASCADE;

-- 2. Table : classes
CREATE TABLE classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Table : students
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    gender TEXT NOT NULL DEFAULT 'homme' CHECK (gender IN ('homme', 'femme')),
    email TEXT NOT NULL CHECK (btrim(email) <> ''),
    student_number TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Table : exams
CREATE TABLE exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    exam_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Table : exam_rubrics
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

-- 6. Table : evaluations
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

-- 7. Table : evaluation_details
CREATE TABLE evaluation_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
    rubric_id UUID NOT NULL REFERENCES exam_rubrics(id) ON DELETE CASCADE,
    is_validated BOOLEAN NOT NULL DEFAULT FALSE,
    awarded_points NUMERIC(5,2) NOT NULL DEFAULT 0.0,
    error_note TEXT,
    CONSTRAINT unique_eval_rubric UNIQUE (evaluation_id, rubric_id)
);

-- 8. Table : exam_pass_order
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

-- 9. Quiz et résultats
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
    total_points NUMERIC(7,2) NOT NULL DEFAULT 20
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

-- quiz_submissions.student_id is TEXT for legacy ID compatibility. Delete the
-- quiz history transactionally when the related student roster entry is deleted.
CREATE OR REPLACE FUNCTION public.delete_student_quiz_submissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    DELETE FROM public.quiz_submissions WHERE student_id = OLD.id::text;
    RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_student_quiz_submissions() FROM PUBLIC;
DROP TRIGGER IF EXISTS delete_student_quiz_submissions ON public.students;
CREATE TRIGGER delete_student_quiz_submissions
BEFORE DELETE ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.delete_student_quiz_submissions();

-- ==============================================================================
-- INDEX POUR L'OPTIMISATION DES PERFORMANCES
-- ==============================================================================
CREATE INDEX idx_students_class_id ON students(class_id);
CREATE INDEX idx_students_names ON students(last_name, first_name);
CREATE UNIQUE INDEX idx_students_email_unique ON students (lower(btrim(email)));
CREATE INDEX idx_exams_class_id ON exams(class_id);
CREATE INDEX idx_exam_rubrics_exam_id ON exam_rubrics(exam_id);
CREATE INDEX idx_evaluations_exam_id ON evaluations(exam_id);
CREATE INDEX idx_evaluations_student_id ON evaluations(student_id);
CREATE INDEX idx_eval_details_evaluation_id ON evaluation_details(evaluation_id);
CREATE INDEX idx_pass_order_exam_id ON exam_pass_order(exam_id);
CREATE INDEX idx_quizzes_class_id ON quizzes(class_id);
CREATE INDEX idx_quiz_submissions_quiz_id ON quiz_submissions(quiz_id);
CREATE INDEX idx_quiz_submissions_student_date ON quiz_submissions(student_id, date);

-- ==============================================================================
-- FONCTIONS & DÉCLENCHEURS (TRIGGERS)
-- ==============================================================================

-- Calcul automatique et cohérent de la note totale lors de la mise à jour des détails
CREATE OR REPLACE FUNCTION recalculate_evaluation_total_score()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE evaluations
    SET 
        total_score = (
            SELECT COALESCE(SUM(awarded_points), 0.0)
            FROM evaluation_details
            WHERE evaluation_id = NEW.evaluation_id
        ),
        updated_at = timezone('utc'::text, now())
    WHERE id = NEW.evaluation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalculate_eval_score
AFTER INSERT OR UPDATE OR DELETE ON evaluation_details
FOR EACH ROW
EXECUTE FUNCTION recalculate_evaluation_total_score();

-- Mise à jour automatique du champ updated_at
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_students_updated_at
BEFORE UPDATE ON students
FOR EACH ROW
EXECUTE FUNCTION update_timestamp_column();

CREATE TRIGGER trg_evaluations_updated_at
BEFORE UPDATE ON evaluations
FOR EACH ROW
EXECUTE FUNCTION update_timestamp_column();

-- ==============================================================================
-- POLITIQUES DE SÉCURITÉ ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_pass_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_submissions ENABLE ROW LEVEL SECURITY;

-- Autorise l'accès complet avec la clé publique (anon) ou un utilisateur authentifié
CREATE POLICY "Classes full access" ON classes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Students full access" ON students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Exams full access" ON exams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Exam rubrics full access" ON exam_rubrics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Evaluations full access" ON evaluations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Evaluation details full access" ON evaluation_details FOR ALL USING (true);
CREATE POLICY "Exam pass order full access" ON exam_pass_order FOR ALL USING (true);
CREATE POLICY "Quizzes full access" ON quizzes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Quiz submissions full access" ON quiz_submissions FOR ALL USING (true) WITH CHECK (true);

-- Stockage public des photos de profil des élèves (taille maximale 500 Ko)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'student-avatars',
    'student-avatars',
    TRUE,
    512000,
    ARRAY['image/jpeg']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Student avatars are publicly readable"
    ON storage.objects FOR SELECT TO anon, authenticated
    USING (bucket_id = 'student-avatars' AND (storage.foldername(name))[1] = 'avatars');
CREATE POLICY "Student avatars can be uploaded"
    ON storage.objects FOR INSERT TO anon, authenticated
    WITH CHECK (bucket_id = 'student-avatars' AND (storage.foldername(name))[1] = 'avatars');
CREATE POLICY "Student avatars can be replaced"
    ON storage.objects FOR UPDATE TO anon, authenticated
    USING (bucket_id = 'student-avatars' AND (storage.foldername(name))[1] = 'avatars')
    WITH CHECK (bucket_id = 'student-avatars' AND (storage.foldername(name))[1] = 'avatars');
CREATE POLICY "Student avatars can be removed"
    ON storage.objects FOR DELETE TO anon, authenticated
    USING (bucket_id = 'student-avatars' AND (storage.foldername(name))[1] = 'avatars');

-- ==============================================================================
-- JEU DE DONNÉES INITIAL (EXEMPLE : PRÉSENTATION ORALE DU ZÉBU)
-- ==============================================================================
DO $$
DECLARE
    v_class_id UUID;
    v_exam_id UUID;
    v_student_jean UUID;
    v_student_marie UUID;
    v_student_paul UUID;
    v_student_sarah UUID;
    v_rubric_ids UUID[] := ARRAY[]::UUID[];
    v_rubric_id UUID;
    v_eval_jean UUID;
BEGIN
    -- 1. Création de la classe A1
    INSERT INTO classes (name) VALUES ('Classe A1 - Débutants') RETURNING id INTO v_class_id;

    -- 2. Création des élèves de test
    INSERT INTO students (class_id, first_name, last_name, email, student_number)
    VALUES (v_class_id, 'Jean', 'Rakoto', 'jean.rakoto@eleve.esame.fr', 'STU-001') RETURNING id INTO v_student_jean;

    INSERT INTO students (class_id, first_name, last_name, email, student_number)
    VALUES (v_class_id, 'Marie', 'Rabe', 'marie.rabe@eleve.esame.fr', 'STU-002') RETURNING id INTO v_student_marie;

    INSERT INTO students (class_id, first_name, last_name, email, student_number)
    VALUES (v_class_id, 'Paul', 'Rasoa', 'paul.rasoa@eleve.esame.fr', 'STU-003') RETURNING id INTO v_student_paul;

    INSERT INTO students (class_id, first_name, last_name, email, student_number)
    VALUES (v_class_id, 'Sarah', 'Ranaivo', 'sarah.ranaivo@eleve.esame.fr', 'STU-004') RETURNING id INTO v_student_sarah;

    -- 3. Création de l'examen modèle "Présentation orale — Lo zébu"
    INSERT INTO exams (class_id, title, description, exam_date, status)
    VALUES (
        v_class_id, 
        'Présentation orale — Lo zébu', 
        'Examen oral individuel sur la description du zébu en 10 rubriques prédéfinies.',
        CURRENT_DATE,
        'in_progress'
    ) RETURNING id INTO v_exam_id;

    -- 4. Insertion des 10 rubriques officielles en italien
    -- 1. Identificazione
    INSERT INTO exam_rubrics (exam_id, title, question, example_sentence, points, position)
    VALUES (v_exam_id, 'Identificazione', 'Che animale è?', 'Questo è un grande mammifero erbivoro…', 1.0, 1)
    RETURNING id INTO v_rubric_id; v_rubric_ids := array_append(v_rubric_ids, v_rubric_id);

    -- 2. Nome scientifico e significato
    INSERT INTO exam_rubrics (exam_id, title, question, example_sentence, points, position)
    VALUES (v_exam_id, 'Nome scientifico e significato', 'Qual è il suo nome scientifico?', 'Il suo nome scientifico è Bos taurus indicus…', 1.0, 2)
    RETURNING id INTO v_rubric_id; v_rubric_ids := array_append(v_rubric_ids, v_rubric_id);

    -- 3. Aspetto fisico
    INSERT INTO exam_rubrics (exam_id, title, question, example_sentence, points, position)
    VALUES (v_exam_id, 'Aspetto fisico', 'Com''è fatto?', 'Ha una grande gobba sul dorso e corna slanciate…', 1.0, 3)
    RETURNING id INTO v_rubric_id; v_rubric_ids := array_append(v_rubric_ids, v_rubric_id);

    -- 4. Dimensioni e peso
    INSERT INTO exam_rubrics (exam_id, title, question, example_sentence, points, position)
    VALUES (v_exam_id, 'Dimensioni e peso', 'Quanto è grande?', 'È lungo circa 2 metri e pesa circa 400 kg…', 1.0, 4)
    RETURNING id INTO v_rubric_id; v_rubric_ids := array_append(v_rubric_ids, v_rubric_id);

    -- 5. Habitat e distribuzione
    INSERT INTO exam_rubrics (exam_id, title, question, example_sentence, points, position)
    VALUES (v_exam_id, 'Habitat e distribuzione', 'Dove vive?', 'Vive soprattutto in Madagascar e nei paesi caldi…', 1.0, 5)
    RETURNING id INTO v_rubric_id; v_rubric_ids := array_append(v_rubric_ids, v_rubric_id);

    -- 6. Alimentazione
    INSERT INTO exam_rubrics (exam_id, title, question, example_sentence, points, position)
    VALUES (v_exam_id, 'Alimentazione', 'Che cosa mangia?', 'Si nutre principalmente di erba, foglie e foraggio…', 1.0, 6)
    RETURNING id INTO v_rubric_id; v_rubric_ids := array_append(v_rubric_ids, v_rubric_id);

    -- 7. Comportamento
    INSERT INTO exam_rubrics (exam_id, title, question, example_sentence, points, position)
    VALUES (v_exam_id, 'Comportamento', 'Come si comporta?', 'Di solito vive in mandrie ed è calmo e resistente…', 1.0, 7)
    RETURNING id INTO v_rubric_id; v_rubric_ids := array_append(v_rubric_ids, v_rubric_id);

    -- 8. Particolarità
    INSERT INTO exam_rubrics (exam_id, title, question, example_sentence, points, position)
    VALUES (v_exam_id, 'Particolarità', 'Che cosa lo rende speciale?', 'È particolare perché resiste bene alla siccità e al calore…', 1.0, 8)
    RETURNING id INTO v_rubric_id; v_rubric_ids := array_append(v_rubric_ids, v_rubric_id);

    -- 9. Curiosità
    INSERT INTO exam_rubrics (exam_id, title, question, example_sentence, points, position)
    VALUES (v_exam_id, 'Curiosità', 'Qual è una curiosità interessante?', 'In Madagascar è un simbolo nazionale di ricchezza e status…', 1.0, 9)
    RETURNING id INTO v_rubric_id; v_rubric_ids := array_append(v_rubric_ids, v_rubric_id);

    -- 10. Utilità
    INSERT INTO exam_rubrics (exam_id, title, question, example_sentence, points, position)
    VALUES (v_exam_id, 'Utilità', 'A che cosa serve lo zebu?', 'Può essere utilizzato per i lavori agricoli e il trasporto…', 1.0, 10)
    RETURNING id INTO v_rubric_id; v_rubric_ids := array_append(v_rubric_ids, v_rubric_id);

    -- 5. Ordre de passage initial
    INSERT INTO exam_pass_order (exam_id, student_id, position, status)
    VALUES 
        (v_exam_id, v_student_marie, 1, 'completed'),
        (v_exam_id, v_student_jean, 2, 'completed'),
        (v_exam_id, v_student_paul, 3, 'completed'),
        (v_exam_id, v_student_sarah, 4, 'waiting');

    -- 6. Évaluation modèle pour Jean Rakoto (note 7/10 comme dans l'exemple de la consigne)
    INSERT INTO evaluations (exam_id, student_id, total_score, status)
    VALUES (v_exam_id, v_student_jean, 7.0, 'completed')
    RETURNING id INTO v_eval_jean;

    -- Détails des 10 rubriques de Jean (7 validées, 3 non validées : rubriques 4, 7, 10 décochées)
    INSERT INTO evaluation_details (evaluation_id, rubric_id, is_validated, awarded_points)
    VALUES 
        (v_eval_jean, v_rubric_ids[1], TRUE, 1.0),
        (v_eval_jean, v_rubric_ids[2], TRUE, 1.0),
        (v_eval_jean, v_rubric_ids[3], TRUE, 1.0),
        (v_eval_jean, v_rubric_ids[4], FALSE, 0.0),
        (v_eval_jean, v_rubric_ids[5], TRUE, 1.0),
        (v_eval_jean, v_rubric_ids[6], TRUE, 1.0),
        (v_eval_jean, v_rubric_ids[7], FALSE, 0.0),
        (v_eval_jean, v_rubric_ids[8], TRUE, 1.0),
        (v_eval_jean, v_rubric_ids[9], TRUE, 1.0),
        (v_eval_jean, v_rubric_ids[10], FALSE, 0.0);

END $$;
