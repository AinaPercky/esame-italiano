export const canStudentStartQuiz = (
  quizStatus: string,
  hasSubmission: boolean,
  hasRetryAuthorization: boolean
): boolean => hasRetryAuthorization || (quizStatus === 'launched' && !hasSubmission);
