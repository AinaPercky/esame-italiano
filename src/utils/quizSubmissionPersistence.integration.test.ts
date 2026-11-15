import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261115080000_quiz_submission_best_score_and_persistence_fix.sql', import.meta.url),
  'utf8'
);

describe('quiz submission persistence migration contract', () => {
  it('returns the persisted row from the standard submission RPC', () => {
    assert.match(migration, /DROP FUNCTION IF EXISTS public\.submit_quiz_submission\(JSONB\)/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.submit_quiz_submission\(p_submission jsonb\)[\s\S]*?RETURNS jsonb/i);
    assert.match(migration, /RETURN to_jsonb\(saved_row\)/);
    assert.match(migration, /WHERE id = submission_id AND quiz_id = q\.id AND student_id = sid/);
  });

  it('computes the attempt number from the current quiz and student', () => {
    assert.match(migration, /a\.quiz_id = q\.id AND a\.student_id = sid/);
    assert.match(migration, /s\.quiz_id = q\.id AND s\.student_id = sid/);
  });

  it('uses only the evaluations for the current attempt', () => {
    assert.match(migration, /AND attempt_number = attempt_no/);
  });

  it('retains the full attempt history and counts only the best score', () => {
    assert.match(migration, /ORDER BY candidate\.score_20 DESC/);
    assert.match(migration, /SET is_counted = \(/);
    assert.match(migration, /candidate\.submitted_at DESC NULLS LAST/);
  });

  it('recomputes presence participant final score from the best attempt', () => {
    assert.match(migration, /SET final_score = v_best_score/);
    assert.match(migration, /'best_score_20', v_best_score/);
  });

  it('does not trust browser-provided grades', () => {
    assert.match(migration, /public\.quiz_grade_all\(q\.id, coalesce\(saved_answers/);
    assert.match(migration, /public\.quiz_grade_all\(v_quiz_id, coalesce\(saved_answers/);
  });
});
