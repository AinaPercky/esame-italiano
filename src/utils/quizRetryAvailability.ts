export const canStudentStartQuiz = (
  quizStatus: string,
  hasSubmission: boolean,
  hasRetryAuthorization: boolean
): boolean => hasRetryAuthorization || (quizStatus === 'launched' && !hasSubmission);

/**
 * A prior submission remains immutable, but a server-authorized retry may create
 * another attempt for the same quiz/student pair.
 */
export const canSubmitQuizAttempt = (
  hasExistingSubmission: boolean,
  hasLegacyRetryGrant: boolean,
  hasPresenceRetryAuthorization: boolean
): boolean => !hasExistingSubmission || hasLegacyRetryGrant || hasPresenceRetryAuthorization;
