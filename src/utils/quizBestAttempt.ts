export interface QuizAttemptScore {
  id: string;
  score_20?: number | null;
  submitted_at?: string | null;
  started_at?: string | null;
  attempt_number?: number | null;
  is_counted?: boolean;
}

/**
 * Returns a copy of the attempts with exactly one reference result:
 * highest score, then latest submission, then highest attempt number.
 */
export function markBestQuizAttempt<T extends QuizAttemptScore>(attempts: T[]): T[] {
  if (attempts.length === 0) return [];
  const ranked = [...attempts].sort((a, b) =>
    (Number(b.score_20) || 0) - (Number(a.score_20) || 0) ||
    (new Date(b.submitted_at || b.started_at || 0).getTime() -
      new Date(a.submitted_at || a.started_at || 0).getTime()) ||
    (Number(b.attempt_number) || 0) - (Number(a.attempt_number) || 0) ||
    b.id.localeCompare(a.id)
  );
  const bestId = ranked[0].id;
  return attempts.map(attempt => ({ ...attempt, is_counted: attempt.id === bestId }));
}
