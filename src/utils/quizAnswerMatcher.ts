import { QuizQuestion } from '../types';
import { isReorderAnswerCorrect } from './quizReorder';

/**
 * Normalise une chaîne pour la comparaison de réponse (insensible uniquement à la casse,
 * aux espaces superflus et aux variantes typographiques d'apostrophes).
 */
export function normalizeAnswerText(value: string): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ');
}

/**
 * Vérifie si la réponse saisie par l'élève est correcte pour une question de type saisie textuelle.
 * Seule la différence de casse (majuscule / minuscule) et les espaces superflus sont tolérés.
 * Les correspondances partielles (ex: racine d'un verbe incomplet comme "cuoc" pour "cuocio")
 * sont strictement rejetées.
 * Si le professeur a prévu des variantes autorisées séparées par "/" ou ";", elles sont acceptées.
 */
export function isTextAnswerCorrect(studentAnswer: string, expectedAnswer: string): boolean {
  const normStudent = normalizeAnswerText(studentAnswer);
  const normExpected = normalizeAnswerText(expectedAnswer);

  if (!normStudent || !normExpected) {
    return false;
  }

  // Égalité directe insensible à la casse
  if (normStudent === normExpected) {
    return true;
  }

  // Support d'éventuelles alternatives prévues par l'enseignant (ex: "cuocio / io cuocio")
  const alternatives = normExpected
    .split(/\s*[\/;|]\s*/)
    .map(alt => normalizeAnswerText(alt))
    .filter(Boolean);

  if (alternatives.length > 1 && alternatives.includes(normStudent)) {
    return true;
  }

  return false;
}

/**
 * Vérifie si la réponse à une question d'un quiz (QCM, texte ou réordonnancement) est correcte.
 */
export function isQuestionAnswerCorrect(question: QuizQuestion, studentAnswer: string): boolean {
  const sAns = (studentAnswer || '').trim();
  const expected = (question.correct_answer || '').trim();

  if (question.type === 'reorder') {
    return isReorderAnswerCorrect(question, sAns);
  }

  if (question.type === 'qcm') {
    return normalizeAnswerText(sAns) === normalizeAnswerText(expected);
  }

  // Type text
  return isTextAnswerCorrect(sAns, expected);
}
