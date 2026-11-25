# Module Exercices — PerckyLingua

## Architecture

The exercise feature is separate from graded quizzes and written exams. It reuses the existing question model and student controls where compatible, while keeping independent exercise versions, attempts, answers, scoring, and class assignments.

- React teacher workspace: src/views/ExercisesAdminView.tsx
- React student player: src/views/ExercisesStudentView.tsx
- Supabase access layer: src/services/exerciseService.ts
- Database migration: supabase/migrations/20261113000000_exercises_module.sql

## Rules

- Only the configured teacher account can create, edit, publish, archive, and inspect exercise attempts.
- A student can start an exercise only when it is published and assigned to one of the student's current classes.
- Every question must define a positive time_limit_seconds.
- The database sets each question deadline. Refreshing the page does not restart the timer.
- A validated answer is immutable for that attempt. The correction is returned only after submission or timeout.
- The correction screen is untimed. The student explicitly advances to start the next question's timer.
- Attempts are independent and unlimited. Exercise scores are not added to quiz grades or official exams.
- Exercise content is versioned. Existing attempts remain linked to the exact version used at their start.

## JSON format

~~~json
{
  "schema": "perckylingua.exercise",
  "schema_version": 1,
  "metadata": {
    "title": "Il presente indicativo",
    "description": "Esercizio di ripasso",
    "category": "Conjugaison",
    "level": "A1"
  },
  "questions": [
    {
      "id": "q1",
      "type": "qcm",
      "question": "Qual è la forma corretta?",
      "options": ["io sono", "io sei", "io è"],
      "correct_answer": "io sono",
      "points": 1,
      "time_limit_seconds": 20,
      "explanation": "La prima persona singolare è sono."
    }
  ]
}
~~~

Import validates the schema version, supported question types, and mandatory positive timers. Import creates a draft; class assignments and publication must be selected in the teacher workspace. Export contains exercise content only, never students, attempts, answers, grades, or class membership.

## Quiz interoperability

- Quiz → Exercise creates a new exercise draft. The original quiz and its history are not modified.
- Existing quiz question timers are preserved. If a quiz has no explicit timer, the current quiz default is used and shown in the editable JSON preview for teacher confirmation.
- Exercise → Quiz creates a separate quiz through the existing quiz persistence service. Exercise attempts and versions are not copied.
- Question content is copied; publication, classes, and access are configured independently.

## Deployment

1. Review the SQL migration in this branch.
2. Apply the migration to the intended Supabase project only after reviewing the teacher email check in exercise_is_teacher().
3. Build and run the app tests.
4. Verify teacher create/publish/archive, class access, each question type, timeout, refresh/resume, repeated attempts, JSON import/export, and both conversion directions.

The migration is intentionally committed as a file only; it is not automatically applied to the production database.


## Soumission groupée (migration 20261120200000)

Les nouvelles tentatives utilisent désormais le parcours groupé :

- `start_exercise_attempt_batch` crée la tentative et retourne en une seule réponse toutes les questions nettoyées, dans l’ordre aléatoire figé côté serveur ; les clés de réponse et explications restent dans la version privée.
- Les réponses et l’index courant sont conservés dans IndexedDB pendant le parcours. Le navigateur n’appelle plus PostgreSQL à chaque validation ou changement de question.
- `submit_exercise_attempt_batch` reçoit les réponses de la tentative, recalcule les notes avec `exercise_grade_question`, écrit les lignes de détail et clôt la tentative dans une transaction.
- Chaque question possède son propre chronomètre indépendant. Le serveur démarre son échéance au moment où la question est activée ; le temps inutilisé est perdu et n'est jamais transféré à la question suivante.
- `advance_exercise_attempt_batch` enregistre la réponse validée puis démarre le chronomètre complet de la question suivante côté PostgreSQL. L'index actif et l'échéance ne sont jamais déterminés par le brouillon du navigateur.
- `evaluate_exercise_attempt_question` n'accepte que la question actuellement ouverte. La réponse et son état (dans le délai / expirée) sont figés lors de la validation ; l'écran de correction reste sans limite de temps.
- La remise finale n'accepte que la dernière question active. Les réponses aux questions précédentes sont reprises depuis les enregistrements serveur, et une réponse tardive ne peut pas être notée comme correcte.
- Les tentatives historiques non groupées continuent d'utiliser les RPC individuelles. Les tentatives groupées déjà en cours au moment du déploiement doivent être terminées ou contrôlées avant l'application de cette migration.

Les RPC groupées sont réservées au rôle `authenticated`. La migration doit être appliquée avant de publier la nouvelle version du frontend.

## Type « Mots à trous avec banque » (`mots_trous`)

Le module Exercices prend également en charge le type `mots_trous` (glisser-déposer d’une banque de mots vers le trou de chaque phrase, avec pièges possibles).

~~~json
{
  "id": "q_mots_1",
  "type": "mots_trous",
  "question": "Completa le frasi con le parole della banca",
  "points": 3,
  "time_limit_seconds": 32,
  "mots_trous": {
    "titre": "Al bar in Italia",
    "consigne": "Glisse chaque mot dans le trou de la phrase correspondante.",
    "points_par_phrase": 1,
    "banque": ["caffè", "cornetto", "succo", "acqua"],
    "phrases": [
      { "id": 1, "debut": "La mattina bevo un ", "fin": " caldo.", "mot": "caffè" },
      { "id": 2, "debut": "Mangio un ", "fin": " alla crema.", "mot": "cornetto" },
      { "id": 3, "debut": "Vorrei un ", "fin": " d'arancia.", "mot": "succo" }
    ]
  },
  "explanation": "Vocabulaire courant du petit-déjeuner italien."
}
~~~

- `points` doit correspondre à `phrases.length × points_par_phrase` (`points_par_phrase` vaut `1` par défaut).
- `banque` contient au moins autant de mots que de phrases, sans doublon ; chaque `mot` attendu est unique et appartient à `banque`.
- Côté élève, `exercise_sanitize_question_for_batch` et `exercise_question_for_student` suppriment le champ `mot` de chaque phrase avant envoi. La correction et le score sont calculés côté PostgreSQL par `exercise_grade_question` (voir `docs/mots-trous.md`).

