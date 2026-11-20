-- Test d'intégration isolé de la migration questions_snapshot.
-- Le workflow exécute ce fichier dans une base PostgreSQL jetable.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE TABLE public.quizzes (
  id text PRIMARY KEY,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb
);

-- Schéma minimal sans la nouvelle colonne : simule une base avant migration.
CREATE TABLE public.quiz_launches (
  id uuid PRIMARY KEY,
  quiz_id text NOT NULL,
  launched_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'launched'
);

CREATE TABLE public.quiz_submissions (
  id text PRIMARY KEY,
  quiz_id text NOT NULL,
  launch_id uuid
);

INSERT INTO public.quiz_submissions (id, quiz_id)
VALUES ('legacy-submission', 'quiz-1');

INSERT INTO public.quizzes (id, questions)
VALUES
  ('quiz-1', '[{"id":"q1","question":"Version au lancement","correct_answer":"è"}]'::jsonb),
  ('quiz-2', '[{"id":"q2","question":"Sans lancement","correct_answer":"ciao"}]'::jsonb);

\i supabase/migrations/20261120150000_add_quiz_submission_questions_snapshot.sql
-- La migration doit être ré-exécutable.
\i supabase/migrations/20261120150000_add_quiz_submission_questions_snapshot.sql

DO $$
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
END;
$$;

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

-- Hors lancement actif, un snapshot explicitement fourni reste compatible.
INSERT INTO public.quiz_submissions (id, quiz_id, questions_snapshot)
VALUES ('provided-snapshot', 'quiz-2', '[{"id":"q-provided","question":"Version fournie"}]'::jsonb);
RESET ROLE;

DO $$
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

  IF provided IS DISTINCT FROM '[{"id":"q-provided","question":"Version fournie"}]'::jsonb THEN
    RAISE EXCEPTION 'Le snapshot fourni hors lancement a été écrasé : %', provided;
  END IF;

  IF (SELECT count(*) FROM public.quiz_submissions WHERE questions_snapshot IS NULL) <> 1 THEN
    RAISE EXCEPTION 'La ligne historique doit être la seule à rester sans snapshot';
  END IF;
END;
$$;

SELECT 'quiz snapshot migration: OK' AS result;
