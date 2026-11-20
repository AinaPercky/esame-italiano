-- Test d'intégration isolé de la migration questions_snapshot.
-- Le workflow exécute ce fichier dans une base PostgreSQL jetable.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE TABLE public.quizzes (
  id text PRIMARY KEY,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb
);

-- Schéma minimal sans la nouvelle colonne : simule une base avant migration.
CREATE TABLE public.quiz_submissions (
  id text PRIMARY KEY,
  quiz_id text NOT NULL
);

INSERT INTO public.quiz_submissions (id, quiz_id)
VALUES ('legacy-submission', 'quiz-1');

INSERT INTO public.quizzes (id, questions)
VALUES (
  'quiz-1',
  '[{"id":"q1","question":"Test","correct_answer":"è"}]'::jsonb
);

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
END;
$$;

GRANT INSERT ON public.quiz_submissions TO anon;

-- Le rôle anon ne peut pas appeler la fonction directement, mais le trigger doit
-- tout de même s'exécuter et lire les questions grâce au contexte SECURITY DEFINER.
SET ROLE anon;
INSERT INTO public.quiz_submissions (id, quiz_id)
VALUES ('new-submission', 'quiz-1');

-- Un snapshot explicitement fourni par l'application doit être conservé.
INSERT INTO public.quiz_submissions (id, quiz_id, questions_snapshot)
VALUES ('provided-snapshot', 'quiz-1', '[{"id":"q-launched","question":"Version fournie"}]'::jsonb);
RESET ROLE;

DO $$
DECLARE
  captured jsonb;
  provided jsonb;
BEGIN
  SELECT questions_snapshot INTO captured
  FROM public.quiz_submissions WHERE id = 'new-submission';

  IF captured IS DISTINCT FROM '[{"id":"q1","question":"Test","correct_answer":"è"}]'::jsonb THEN
    RAISE EXCEPTION 'Le trigger n''a pas capturé le contenu du quiz : %', captured;
  END IF;

  SELECT questions_snapshot INTO provided
  FROM public.quiz_submissions WHERE id = 'provided-snapshot';

  IF provided IS DISTINCT FROM '[{"id":"q-launched","question":"Version fournie"}]'::jsonb THEN
    RAISE EXCEPTION 'Le snapshot fourni par le client a été écrasé : %', provided;
  END IF;

  IF (SELECT count(*) FROM public.quiz_submissions WHERE questions_snapshot IS NULL) <> 1 THEN
    RAISE EXCEPTION 'La ligne historique doit être la seule à rester sans snapshot';
  END IF;
END;
$$;

SELECT 'quiz snapshot migration: OK' AS result;
