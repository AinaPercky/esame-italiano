/**
 * Diagnostic temporaire du moteur de correction.
 * Supprimer ce fichier et ses appels après analyse des journaux navigateur.
 * Ne journalise que les corrections contenant au moins une réponse incorrecte/partielle.
 * Affiche volontairement les réponses attendues et clés présentes dans le résultat de correction.
 */
type DiagnosticModule = 'quiz' | 'exercise' | 'written_exam';

function findIncorrect(value: unknown, path = '$', found: Array<{ path: string; detail: unknown }> = []) {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => findIncorrect(item, `${path}[${index}]`, found));
    return found;
  }

  const record = value as Record<string, unknown>;
  const correctnessKeys = ['correct', 'is_correct', 'isCorrect', 'is_fully_correct', 'isFullyCorrect'];
  for (const key of correctnessKeys) {
    if (record[key] === false) {
      found.push({ path, detail: { [key]: false, points: record.points ?? record.awarded_points, maxPoints: record.maxPoints ?? record.max_points } });
      break;
    }
  }

  const points = Number(record.points ?? record.awarded_points);
  const maxPoints = Number(record.maxPoints ?? record.max_points);
  if (Number.isFinite(points) && Number.isFinite(maxPoints) && maxPoints > 0 && points < maxPoints
      && !found.some(item => item.path === path)) {
    found.push({ path, detail: { points, maxPoints } });
  }

  for (const [key, child] of Object.entries(record)) {
    findIncorrect(child, `${path}.${key}`, found);
  }
  return found;
}

export function logGradingDiagnostic(input: {
  module: DiagnosticModule;
  attemptId?: string;
  quizId?: string;
  studentId?: string;
  submittedAnswers: unknown;
  gradingResult: unknown;
}) {
  const incorrectQuestions = findIncorrect(input.gradingResult);
  if (incorrectQuestions.length === 0) return;

  // LOG TEMPORAIRE — commenter/supprimer après collecte des diagnostics.
  console.log('[PERCKYLINGUA][GRADING_DIAGNOSTIC]', {
    timestamp: new Date().toISOString(),
    module: input.module,
    quizId: input.quizId,
    attemptId: input.attemptId,
    studentId: input.studentId,
    submittedAnswers: input.submittedAnswers,
    incorrectQuestions,
    gradingResult: input.gradingResult
  });
}
