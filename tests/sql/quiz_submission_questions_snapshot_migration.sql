-- Test d'intégration isolé de la migration questions_snapshot.
-- Le workflow exécute ce fichier dans une base PostgreSQL jetable.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE TABLE public.quizzes (
  id text PRIMARY KEY,
  title text NOT NULL DEFAULT 'Quiz test',
  status text NOT NULL DEFAULT 'launched',
  class_id text NOT NULL DEFAULT 'class-1',
  class_ids text[] NOT NULL DEFAULT ARRAY['class-1'],
  total_points numeric NOT NULL DEFAULT 20,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb
);

-- Schéma minimal sans la nouvelle colonne : simule une base avant migration.
CREATE TABLE public.quiz_launches (
  id uuid PRIMARY KEY,
  quiz_id text NOT NULL,
  launched_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  launched_by uuid,
  presence_deadline_at timestamptz,
  status text NOT NULL DEFAULT 'launched',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.quiz_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id uuid NOT NULL,
  quiz_id text NOT NULL,
  student_id text NOT NULL,
  class_id text NOT NULL,
  presence_status text NOT NULL DEFAULT 'present',
  presence_confirmed_at timestamptz DEFAULT now(),
  presence_deadline_at timestamptz DEFAULT now() - interval '1 minute'
);

CREATE TABLE public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id text NOT NULL,
  launch_id uuid,
  participant_id uuid,
  student_id text NOT NULL,
  attempt_number integer NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  score numeric NOT NULL DEFAULT 0,
  max_score numeric NOT NULL DEFAULT 20,
  score_20 numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  feedback jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz DEFAULT now(),
  submitted_at timestamptz
);

CREATE TABLE public.quiz_retry_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id text NOT NULL,
  student_id text NOT NULL,
  used_at timestamptz,
  launch_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.class_enrollments (
  student_id text NOT NULL,
  class_id text NOT NULL,
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE public.students (
  id text PRIMARY KEY,
  first_name text,
  last_name text,
  student_number text,
  class_id text
);

CREATE TABLE public.classes (
  id text PRIMARY KEY,
  name text
);

CREATE FUNCTION public.quiz_current_student_id()
RETURNS text LANGUAGE sql STABLE AS $fn$ SELECT 'student-1'::text; $fn$;

CREATE FUNCTION public.quiz_sanitize_questions(p_questions jsonb)
RETURNS jsonb LANGUAGE sql STABLE AS $fn$ SELECT coalesce(p_questions, '[]'::jsonb); $fn$;
CREATE FUNCTION public.quiz_expected_answers_list(p_question jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $fn$ SELECT '[]'::jsonb; $fn$;

CREATE FUNCTION public.quiz_grade_question(p_question jsonb, p_answer text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $fn$ SELECT '{}'::jsonb; $fn$;

CREATE TABLE public.quiz_submissions (
  id text PRIMARY KEY,
  quiz_id text NOT NULL,
  quiz_title text,
  student_id text,
  student_name text,
  student_number text,
  class_id text,
  class_name text,
  started_at timestamptz,
  submitted_at timestamptz,
  answers jsonb DEFAULT '{}'::jsonb,
  score numeric DEFAULT 0,
  max_score numeric DEFAULT 20,
  score_20 numeric DEFAULT 0,
  status text,
  feedback jsonb DEFAULT '{}'::jsonb,
  date date DEFAULT current_date,
  attempt_number integer DEFAULT 1,
  is_counted boolean DEFAULT true,
  launch_id uuid,
  attendance_status text DEFAULT 'unknown',
  retry_grant_id uuid,
  UNIQUE (quiz_id, student_id, attempt_number)
);

INSERT INTO public.quiz_submissions (id, quiz_id, student_id, status)
VALUES ('legacy-submission', 'quiz-1', 'legacy-student', 'completed');

INSERT INTO public.quizzes (id, questions)
VALUES
  ('quiz-1', '[{"id":"q1","question":"Version au lancement","correct_answer":"è"}]'::jsonb),
  ('quiz-2', '[{"id":"q2","question":"Sans lancement","correct_answer":"ciao"}]'::jsonb);

-- Simule un lancement actif antérieur à la migration : son snapshot reste NULL.
INSERT INTO public.quiz_launches (id, quiz_id)
VALUES ('00000000-0000-0000-0000-000000000002', 'quiz-2');
INSERT INTO public.quiz_participants (launch_id, quiz_id, student_id, class_id)
VALUES ('00000000-0000-0000-0000-000000000002', 'quiz-2', 'student-1', 'class-1');

\i supabase/migrations/20261120150000_add_quiz_submission_questions_snapshot.sql
-- La migration doit être ré-exécutable.
\i supabase/migrations/20261120150000_add_quiz_submission_questions_snapshot.sql

DO $block$
DECLARE
  sanitized jsonb;
  active_snapshot jsonb;
BEGIN
  IF (SELECT questions_snapshot FROM public.quiz_submissions WHERE id = 'legacy-submission') IS NOT NULL THEN
    RAISE EXCEPTION 'Les données historiques doivent rester NULL';
  END IF;

  IF has_function_privilege('anon', 'public.capture_quiz_submission_questions_snapshot()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon ne doit pas pouvoir exécuter directement la fonction trigger';
  END IF;

  IF has_function_privilege('authenticated', 'public.capture_quiz_submission_questions_snapshot()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ne doit pas pouvoir exécuter directement la fonction trigger';
  END IF;

  IF has_function_privilege('anon', 'public.capture_quiz_launch_questions_snapshot()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.capture_quiz_launch_questions_snapshot()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Les rôles clients ne doivent pas appeler directement le trigger de lancement';
  END IF;
  IF has_column_privilege('authenticated', 'public.quiz_launches', 'questions_snapshot', 'SELECT') THEN
    RAISE EXCEPTION 'Les élèves ne doivent pas lire les snapshots bruts contenant les corrigés';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.quiz_launches', 'id', 'SELECT') THEN
    RAISE EXCEPTION 'Les métadonnées non sensibles du lancement doivent rester lisibles';
  END IF;
  IF has_column_privilege('authenticated', 'public.quiz_submissions', 'questions_snapshot', 'SELECT') THEN
    RAISE EXCEPTION 'Les élèves ne doivent pas lire les snapshots complets des soumissions';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.quiz_submissions', 'answers', 'SELECT') THEN
    RAISE EXCEPTION 'Les élèves doivent conserver l''accès à leurs réponses enregistrées';
  END IF;

  IF position('v_launch.questions_snapshot' IN pg_get_functiondef(
    'public.submit_quiz_presence_submission(jsonb)'::regprocedure
  )) = 0 THEN
    RAISE EXCEPTION 'La correction serveur doit utiliser le snapshot du lancement';
  END IF;
  SELECT public.quiz_sanitize_questions(
    '[{"id":"q-safe","correct_answer":"segreto","error_categories":["Confusion"],"error_category_map":{"avere":"Confusion"}}]'::jsonb
  ) INTO sanitized;
  IF sanitized::text LIKE '%correct_answer%' OR sanitized::text LIKE '%error_category_map%' THEN
    RAISE EXCEPTION 'La projection élève expose des corrigés ou mappings privés : %', sanitized;
  END IF;
  IF sanitized #>> '{0,error_categories,0}' IS DISTINCT FROM 'Confusion' THEN
    RAISE EXCEPTION 'Les catégories de diagnostic non sensibles doivent rester disponibles';
  END IF;
  SELECT public.get_student_active_launch('quiz-2') -> 'launch' -> 'questions_snapshot'
    INTO active_snapshot;
  IF active_snapshot #>> '{0,id}' IS DISTINCT FROM 'q2'
     OR active_snapshot::text LIKE '%correct_answer%' THEN
    RAISE EXCEPTION 'Un lancement historique actif doit utiliser un fallback assaini : %', active_snapshot;
  END IF;
END;
$block$;

-- Le trigger de lancement doit figer la version de quiz avant toute modification.
INSERT INTO public.quiz_launches (id, quiz_id)
VALUES ('00000000-0000-0000-0000-000000000001', 'quiz-1');

UPDATE public.quizzes
SET questions = '[{"id":"q1","question":"Version modifiée après lancement","correct_answer":"nuovo"}]'::jsonb
WHERE id = 'quiz-1';

GRANT INSERT ON public.quiz_submissions TO anon;

-- Le rôle anon ne peut pas appeler les fonctions privilégiées directement.
-- Le trigger doit néanmoins associer la soumission au snapshot serveur du lancement.
SET ROLE anon;
INSERT INTO public.quiz_submissions (id, quiz_id)
VALUES ('new-submission', 'quiz-1');

-- Hors lancement suivi, le serveur ignore tout snapshot transmis par le navigateur.
INSERT INTO public.quiz_submissions (id, quiz_id, questions_snapshot)
VALUES ('provided-snapshot', 'quiz-2', '[{"id":"q-provided","question":"Version fournie"}]'::jsonb);
RESET ROLE;

DO $
DECLARE
  captured jsonb;
  provided jsonb;
BEGIN
  SELECT questions_snapshot INTO captured
  FROM public.quiz_submissions WHERE id = 'new-submission';

  IF captured IS DISTINCT FROM '[{"id":"q1","question":"Version au lancement","correct_answer":"è"}]'::jsonb THEN
    RAISE EXCEPTION 'La soumission ne reprend pas la version figée au lancement : %', captured;
  END IF;

  IF (SELECT launch_id FROM public.quiz_submissions WHERE id = 'new-submission')
       IS DISTINCT FROM '00000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'Le lancement actif n''a pas été associé à la soumission';
  END IF;

  SELECT questions_snapshot INTO provided
  FROM public.quiz_submissions WHERE id = 'provided-snapshot';

  IF provided IS DISTINCT FROM '[{"id":"q2","question":"Sans lancement","correct_answer":"ciao"}]'::jsonb THEN
    RAISE EXCEPTION 'Le snapshot hors lancement doit provenir de la base, pas du navigateur : %', provided;
  END IF;

  IF (SELECT count(*) FROM public.quiz_submissions WHERE questions_snapshot IS NULL) <> 1 THEN
    RAISE EXCEPTION 'La ligne historique doit être la seule à rester sans snapshot';
  END IF;
END;
$$;

SELECT 'quiz snapshot migration: OK' AS result;
