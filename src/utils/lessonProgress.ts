export interface GuidedStepIdentity {
  id: string;
}

/** Existing lessons marked done before the guided-quiz gate should remain accessible. */
export function isGuidedQuizComplete(
  steps: GuidedStepIdentity[],
  completedStepIds: string[],
  savedLessonStatus?: 'started' | 'done'
): boolean {
  if (savedLessonStatus === 'done') return true;
  return steps.length === 0 || steps.every(step => completedStepIds.includes(step.id));
}
