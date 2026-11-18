export const DEFAULT_ORAL_EXAM_DURATION_SECONDS = 180;
export const MIN_ORAL_EXAM_DURATION_SECONDS = 60;
export const MAX_ORAL_EXAM_DURATION_SECONDS = 7200;

/** Normalise une durée de parole en secondes (1 à 120 minutes). */
export function normalizeOralExamDurationSeconds(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_ORAL_EXAM_DURATION_SECONDS;
  return Math.min(
    MAX_ORAL_EXAM_DURATION_SECONDS,
    Math.max(MIN_ORAL_EXAM_DURATION_SECONDS, Math.round(numeric))
  );
}

/** Formate une durée en MM:SS, sans tronquer les examens de plus d'une heure. */
export function formatOralExamTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Renvoie le seuil à annoncer une seule fois au passage exact du compte à rebours. */
export function getOralExamCheckpoint(remainingSeconds: number): 60 | 30 | 10 | null {
  return remainingSeconds === 60 || remainingSeconds === 30 || remainingSeconds === 10
    ? remainingSeconds
    : null;
}
