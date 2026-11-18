export interface OralSessionScoreInput {
  classId: string;
  score: number;
  maxScore: number;
}

/**
 * Convertit une note de session sur son barème d'origine vers une note sur 20.
 * Retourne null si le barème ou la note n'est pas exploitable.
 */
export function normalizeOralScoreTo20(score: number, maxScore: number): number | null {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 || score < 0) {
    return null;
  }
  return Math.round((score / maxScore) * 200) / 10;
}

/**
 * Moyenne arithmétique des sessions d'une classe.
 * Chaque session a exactement le même poids, après normalisation sur 20.
 */
export function calculateOralClassAverage(
  sessions: OralSessionScoreInput[],
  classId: string
): { average: number | null; sessionCount: number; normalizedScores: number[] } {
  const normalizedScores = sessions
    .filter(session => session.classId === classId)
    .map(session => normalizeOralScoreTo20(session.score, session.maxScore))
    .filter((score): score is number => score !== null);

  if (normalizedScores.length === 0) {
    return { average: null, sessionCount: 0, normalizedScores: [] };
  }

  const average = Math.round(
    (normalizedScores.reduce((sum, score) => sum + score, 0) / normalizedScores.length) * 10
  ) / 10;

  return { average, sessionCount: normalizedScores.length, normalizedScores };
}
