import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

describe('sécurité des métadonnées pédagogiques des exercices', () => {
  it('retire error_category_map des questions envoyées à l’élève', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261120150000_add_quiz_submission_questions_snapshot.sql'
    );
    const migration = fs.readFileSync(migrationPath, 'utf8');
    const normalized = migration.toLowerCase();
    const start = normalized.lastIndexOf('create or replace function public.exercise_question_for_student');
    const end = normalized.indexOf('revoke all on function public.exercise_question_for_student', start);
    assert.notEqual(start, -1, 'La migration doit remplacer le helper de question étudiant.');
    assert.notEqual(end, -1, 'Les privilèges du helper doivent être réaffirmés.');
    const studentProjection = normalized.slice(start, end);
    assert.ok(studentProjection.includes("- 'error_category_map'"));
    assert.ok(studentProjection.includes("- 'correct_answer'"));
    assert.ok(studentProjection.includes("'question', v_safe"));
  });

  it('conserve le helper accessible uniquement aux utilisateurs authentifiés', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261120150000_add_quiz_submission_questions_snapshot.sql'
    );
    const migration = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(migration.includes('REVOKE ALL ON FUNCTION public.exercise_question_for_student(uuid) FROM PUBLIC, anon;'));
    assert.ok(migration.includes('GRANT EXECUTE ON FUNCTION public.exercise_question_for_student(uuid) TO authenticated;'));
  });
});
