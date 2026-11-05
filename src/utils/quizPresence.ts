import type { QuizPresenceStatus, QuizSubmission } from '../types';

export const QUIZ_PRESENCE_INITIALIZATION_SECONDS = 10;

export const isQuizRetryEligible = (options: {
  isPublic?: boolean;
  attendanceMode?: 'legacy' | 'strict_presence';
  participantStatus?: QuizPresenceStatus;
  hasParticipant: boolean;
  latestSubmissionStatus?: QuizSubmission['status'];
}): boolean => {
  const { isPublic, attendanceMode, participantStatus, hasParticipant, latestSubmissionStatus } = options;

  if (isPublic || attendanceMode !== 'strict_presence' || latestSubmissionStatus === 'completed') return false;
  if (participantStatus === 'present' || participantStatus === 'completed' || participantStatus === 'retry_authorized') return false;
  if (participantStatus === 'absent' || participantStatus === 'timeout') return true;

  // Lors d’une relance, une ancienne base peut garder/créer le participant du
  // lancement courant en « pending » même si une absence/expiration antérieure
  // existe. Ne pas masquer l’action dans ce cas, mais ne pas l’offrir à tous les
  // élèves qui n’ont encore jamais commencé.
  if (participantStatus === 'pending') {
    return latestSubmissionStatus === 'missed' || latestSubmissionStatus === 'timeout';
  }

  return !hasParticipant;
};

/** Returns the remaining whole seconds from the server deadline for one participant. */
export const getPresenceInitializationRemainingSeconds = (
  deadlineAt: string,
  nowMs: number = Date.now()
): number => {
  const deadlineMs = Date.parse(deadlineAt);
  if (!Number.isFinite(deadlineMs)) return 0;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
};
