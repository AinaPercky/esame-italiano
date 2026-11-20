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


const batchGradingMigration = readFileSync(
  new URL('../../supabase/migrations/20261120210000_fix_batch_quiz_submission_grading.sql', import.meta.url),
  'utf8'
);

describe('batch quiz grading and correction regression', () => {
  it('grades the answers submitted in the final batch for standard and strict-presence quizzes', () => {
    assert.equal((batchGradingMigration.match(/saved_answers := coalesce\(p_submission -> 'answers', '\{\}'::jsonb\)/g) || []).length, 2);
    assert.match(batchGradingMigration, /public\.quiz_grade_all\(v_quiz_id, saved_answers\)/);
    assert.match(batchGradingMigration, /jsonb_typeof\(saved_answers\) <> 'object'/);
    assert.doesNotMatch(batchGradingMigration, /FROM public\.quiz_question_evaluations/);
  });

  it('does not erase earned points when the overall quiz timer expires', () => {
    assert.match(batchGradingMigration, /Les réponses saisies avant la fin du temps restent notées/);
    assert.match(batchGradingMigration, /Les questions non répondues reçoivent zéro point individuellement/);
    assert.doesNotMatch(batchGradingMigration, /jsonb_set\(jsonb_set\(e, '\{rawScore\}', '0'::jsonb\)/);
  });

  it('renders correction data returned by the server in all student modules', () => {
    const studentQuizView = readFileSync(new URL('../views/StudentSpaceView.tsx', import.meta.url), 'utf8');
    const publicResultView = readFileSync(new URL('../views/publicQuiz/PublicQuizResultScreen.tsx', import.meta.url), 'utf8');
    const exerciseView = readFileSync(new URL('../views/ExercisesStudentView.tsx', import.meta.url), 'utf8');
    assert.match(studentQuizView, /lastSubmissionResult\.feedback/);
    assert.match(studentQuizView, /Bonne réponse/);
    assert.match(publicResultView, /itemFeedback\.explanation/);
    assert.match(publicResultView, /Non répondu/);
    assert.match(exerciseView, /!question\.correct \|\| unanswered/);
    assert.match(exerciseView, /Réponse attendue/);
  });
});
