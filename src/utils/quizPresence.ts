export const QUIZ_PRESENCE_INITIALIZATION_SECONDS = 10;

/** Returns the remaining whole seconds from the server deadline for one participant. */
export const getPresenceInitializationRemainingSeconds = (
  deadlineAt: string,
  nowMs: number = Date.now()
): number => {
  const deadlineMs = Date.parse(deadlineAt);
  if (!Number.isFinite(deadlineMs)) return 0;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
};
