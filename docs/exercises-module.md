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
