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

  it('keeps retry authorization active after presence has been confirmed', () => {
    assert.equal(isRetryAuthorizedParticipant('retry_authorized'), true);
    assert.equal(canStudentStartQuiz('launched', true, isRetryAuthorizedParticipant('retry_authorized')), true);
  });

  it('does not treat ordinary confirmed attendance as a retry authorization', () => {
    assert.equal(isRetryAuthorizedParticipant('present'), false);
    assert.equal(canStudentStartQuiz('launched', true, isRetryAuthorizedParticipant('present')), false);
  });

  it('does not consume the retry grant when presence is confirmed', () => {
    const confirmationFunction = QUIZ_RETRY_CONFIRMATION_MIGRATION_SQL
      .split('CREATE OR REPLACE FUNCTION public.confirm_quiz_presence')[1]
      ?.split('REVOKE ALL ON FUNCTION')[0] || '';
    assert.match(confirmationFunction, /presence_status = 'retry_authorized'/);
    assert.match(confirmationFunction, /g\\.used_at IS NULL/);
    assert.doesNotMatch(confirmationFunction, /UPDATE public\\.quiz_retry_grants[\\s\\S]*?SET used_at/);
  });
});
