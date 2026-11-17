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

  it('applies the retry rule independently of the student, quiz and launch identifiers', () => {
    const scenarios = [
      { studentId: 'student-a', quizId: 'quiz-1', status: 'launched' },
      { studentId: 'student-b', quizId: 'quiz-2', status: 'closed' },
      { studentId: 'student-c', quizId: 'quiz-3', status: 'launched' }
    ];
    for (const scenario of scenarios) {
      assert.equal(
        canStudentStartQuiz(scenario.status, true, isRetryAuthorizedParticipant('retry_authorized')),
        true,
        `A valid retry must remain available for ${scenario.studentId} / ${scenario.quizId}`
      );
    }
  });

  it('requires an explicit retry authorization for every previously submitted quiz', () => {
    for (const status of ['pending', 'present', 'absent', 'completed', 'timeout', null, undefined]) {
      assert.equal(isRetryAuthorizedParticipant(status), false);
      assert.equal(canStudentStartQuiz('launched', true, isRetryAuthorizedParticipant(status)), false);
      assert.equal(canSubmitQuizAttempt(true, false, isRetryAuthorizedParticipant(status)), false);
    }
  });

  it('allows an explicitly authorized retry even when the previous quiz attempt is already recorded', () => {
    assert.equal(canSubmitQuizAttempt(true, false, true), true);
    assert.equal(canStudentStartQuiz('closed', true, true), true);
  });

  it('does not consume the retry grant when presence is confirmed', () => {
    const confirmationFunction = QUIZ_RETRY_CONFIRMATION_MIGRATION_SQL
      .split('CREATE OR REPLACE FUNCTION public.confirm_quiz_presence')[1]
      ?.split('REVOKE ALL ON FUNCTION')[0] || '';
    assert.match(confirmationFunction, /presence_status = 'retry_authorized'/);
    assert.match(confirmationFunction, /g\.used_at IS NULL/);
    assert.equal(confirmationFunction.includes('SET used_at ='), false);
  });
});


describe('unified participant and retry lifecycle migration', () => {
  it('repairs a missing participant for an approved student with an active class enrollment', async () => {
    const { QUIZ_PARTICIPANT_LIFECYCLE_MIGRATION_SQL } = await import('../data/quizParticipantLifecycleMigration');
    assert.match(QUIZ_PARTICIPANT_LIFECYCLE_MIGRATION_SQL, /s\.validation_status = 'approved'/);
    assert.match(QUIZ_PARTICIPANT_LIFECYCLE_MIGRATION_SQL, /ce\.status = 'active'/);
    assert.match(QUIZ_PARTICIPANT_LIFECYCLE_MIGRATION_SQL, /ON CONFLICT \(quiz_id, student_id\)/);
    assert.match(QUIZ_PARTICIPANT_LIFECYCLE_MIGRATION_SQL, /get_student_active_launch/);
  });

  it('does not expose a previous attempt without a live teacher retry grant', async () => {
    const { QUIZ_PARTICIPANT_LIFECYCLE_MIGRATION_SQL } = await import('../data/quizParticipantLifecycleMigration');
    assert.match(QUIZ_PARTICIPANT_LIFECYCLE_MIGRATION_SQL, /v_has_history/);
    assert.match(QUIZ_PARTICIPANT_LIFECYCLE_MIGRATION_SQL, /v_has_terminal_participation/);
    assert.match(QUIZ_PARTICIPANT_LIFECYCLE_MIGRATION_SQL, /g\.used_at IS NULL/);
    assert.match(QUIZ_PARTICIPANT_LIFECYCLE_MIGRATION_SQL, /g\.revoked_at IS NULL/);
  });

  it('consumes retry attempts only on submission and respects max_attempts', async () => {
    const { QUIZ_PARTICIPANT_LIFECYCLE_MIGRATION_SQL } = await import('../data/quizParticipantLifecycleMigration');
    assert.match(QUIZ_PARTICIPANT_LIFECYCLE_MIGRATION_SQL, /used_attempts = used_attempts \+ 1/);
    assert.match(QUIZ_PARTICIPANT_LIFECYCLE_MIGRATION_SQL, /used_attempts \+ 1 >= max_attempts/);
    assert.match(QUIZ_PARTICIPANT_LIFECYCLE_MIGRATION_SQL, /Presence confirmation must not consume retry grants/);
  });
});
