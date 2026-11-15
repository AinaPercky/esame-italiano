import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canStudentStartQuiz, canSubmitQuizAttempt, isRetryAuthorizedParticipant } from './quizRetryAvailability';
import { QUIZ_RETRY_CONFIRMATION_MIGRATION_SQL } from '../data/quizRetryConfirmationMigration';

describe('quiz lock and teacher-authorized retry', () => {
  it('locks a completed quiz even if the quiz is still marked launched', () => {
    assert.equal(canStudentStartQuiz('launched', true, false), false);
  });

  it('keeps a quiz locked when no teacher retry authorization exists', () => {
    assert.equal(canStudentStartQuiz('closed', true, false), false);
    assert.equal(canSubmitQuizAttempt(true, false, false), false);
  });

  it('allows a new attempt only when a retry authorization exists', () => {
    assert.equal(canStudentStartQuiz('closed', true, true), true);
    assert.equal(canSubmitQuizAttempt(true, false, true), true);
  });

  it('allows the first attempt while a quiz is launched', () => {
    assert.equal(canStudentStartQuiz('launched', false, false), true);
    assert.equal(canSubmitQuizAttempt(false, false, false), true);
  });

  it('does not unlock a completed quiz merely because the quiz status is launched', () => {
    assert.equal(canStudentStartQuiz('launched', true, false), false);
  });
});
