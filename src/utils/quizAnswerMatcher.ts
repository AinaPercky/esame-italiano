import { QuizQuestion } from '../types';
import { isReorderAnswerCorrect } from './quizReorder';

/**
 * Normalise une chaîne pour la comparaison de réponse :
 * - Insensible à la casse (majuscules / minuscules)
 * - Nettoyage des espaces de début, fin et espaces multiples (ex: "di  tanto   in tanto" -> "di tanto in tanto")
 * - Unification des apostrophes typographiques (' vs ’ vs ‘ vs `) et suppression de l'espace après apostrophe (ex: "l' euro" -> "l'euro")
 * - Unification des guillemets typographiques («, », “, ”)
 * - Optionnellement : normalisation de la ponctuation terminale de phrase (. ? ! ; :)
 */
export function normalizeAnswerText(value: string, stripTerminalPunctuation = false): string {
  let text = (value || '')
    .trim()
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/'\s+/g, "'")
    .replace(/[«»“”]/g, '"')
    .replace(/\s+/g, ' ');

  if (stripTerminalPunctuation) {
    text = text.replace(/[.?!;:]+$/, '').trim();
  }

  return text;
}

/**
 * Vérifie si la réponse saisie par l'élève est correcte pour une question de type saisie textuelle
 * (qu'il s'agisse d'un mot unique, de plusieurs mots ou d'une phrase complète) :
 * 
 * 1. Mots uniques et phrases :
 *    - La casse (majuscule / minuscule) est tolérée ("Cuocio" == "cuocio", "Io vado a scuola" == "io vado a scuola").
 *    - Les espaces superflus sont nettoyés sans déformer la phrase.
 *    - Les correspondances partielles sont strictement refusées : chaque mot doit être complet (ex: "cuoc" != "cuocio", "io parl" != "io parlo").
 * 
 * 2. Phrases entières avec ponctuation :
 *    - Un point final ou une ponctuation terminale omise ou ajoutée par l'élève en fin de phrase est toléré
 *      (ex: "Io vado a scuola." équivaut à "io vado a scuola").
 * 
 * 3. Réponses alternatives :
 *    - Si le professeur a renseigné plusieurs formes acceptées séparées par "/" ou ";" (ex: "io parlo / parlo"),
 *      chacune des formes complètes est acceptée.
 */
export function isTextAnswerCorrect(studentAnswer: string, expectedAnswer: string): boolean {
  const normStudent = normalizeAnswerText(studentAnswer);
  const normExpected = normalizeAnswerText(expectedAnswer);

  if (!normStudent || !normExpected) {
    return false;
  }

  // 1. Égalité directe stricte (insensible à la casse et aux espaces multiples)
  if (normStudent === normExpected) {
    return true;
  }

  // 2. Égalité avec tolérance sur la ponctuation terminale de phrase (ex: point final oublié ou ajouté)
  const normStudentNoEndPunct = normalizeAnswerText(studentAnswer, true);
  const normExpectedNoEndPunct = normalizeAnswerText(expectedAnswer, true);
  if (normStudentNoEndPunct && normStudentNoEndPunct === normExpectedNoEndPunct) {
    return true;
  }

  // 3. Prise en charge des alternatives déclarées par le professeur (ex: "io cuocio / cuocio")
  const alternatives = expectedAnswer
    .split(/\s*[\/;|]\s*/)
    .map(alt => normalizeAnswerText(alt, true))
    .filter(Boolean);

  if (alternatives.length > 1 && alternatives.includes(normStudentNoEndPunct)) {
    return true;
  }

  return false;
}

/**
 * Récupère la liste des réponses attendues pour une question de type saisie.
 * - S'il y a 1 seul trou : renvoie [reponse]
 * - S'il y a plusieurs trous (ex: 2, 3, 4 verbes) : renvoie le tableau des réponses pour chaque trou.
 */
export function getQuestionExpectedAnswers(question: QuizQuestion): string[] {
  if (Array.isArray(question.answers) && question.answers.length > 0) {
    return question.answers.map(a => {
      if (Array.isArray(a)) {
        return a.map(String).join(' / ');
      }
      return String(a || '').trim();
    });
  }

  const raw = (question.correct_answer || '').trim();
  if (raw.startsWith('[') && raw.endsWith(']')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: any) => {
          if (Array.isArray(item)) return item.map(String).join(' / ');
          return String(item || '').trim();
        });
      }
    } catch {}
  }

  // Délimiteur pipe pour les réponses multi-trous (ex: "parlo | scrivi | legge | dormiamo" ou "parlo|scrivi|legge|dormiamo")
  if (raw.includes('|')) {
    const parts = raw.split(/\s*\|\s*/).filter(Boolean);
    if (parts.length > 1) return parts;
  }

  if (raw.includes(' // ')) {
    const parts = raw.split(/\s*\/\/\s*/).filter(Boolean);
    if (parts.length > 1) return parts;
  }

  return [raw];
}

/**
 * Décode la réponse saisie par l'élève, qu'il s'agisse d'un texte simple ou d'un JSON multi-trous.
 */
export function parseStudentAnswers(answerStr: string, expectedCount: number): string[] {
  if (!answerStr) return Array(expectedCount).fill('');
  try {
    const parsed = JSON.parse(answerStr);
    if (Array.isArray(parsed)) {
      // Preserve trailing spaces while the student is typing; comparison normalizes later.
      return Array.from({ length: expectedCount }, (_, i) => String(parsed[i] ?? ''));
    }
  } catch {}

  if (expectedCount > 1 && answerStr.includes(' | ')) {
    const parts = answerStr.split(/\s*\|\s*/);
    return Array.from({ length: expectedCount }, (_, i) => String(parts[i] ?? ''));
  }

  // Do not trim a single input value: a trailing space is needed to enter the next word.
  return [answerStr, ...Array(Math.max(0, expectedCount - 1)).fill('')];
}

/**
 * Formate la réponse saisie par l'élève pour un affichage lisible dans la modale de correction.
 */
export function formatTextAnswerForDisplay(question: QuizQuestion, answerStr: string): string {
  const expectedAnswers = getQuestionExpectedAnswers(question);
  if (expectedAnswers.length <= 1) {
    const parts = parseStudentAnswers(answerStr, 1);
    return parts[0] || answerStr;
  }

  const studentParts = parseStudentAnswers(answerStr, expectedAnswers.length);
  return studentParts.map((p, i) => `Case ${i + 1}: ${p || '—'}`).join(' · ');
}

/**
 * Formate la réponse attendue pour un affichage lisible dans la modale de correction.
 */
export function formatCorrectTextAnswerForDisplay(question: QuizQuestion): string {
  const expectedAnswers = getQuestionExpectedAnswers(question);
  if (expectedAnswers.length <= 1) {
    return expectedAnswers[0] || question.correct_answer || '';
  }

  return expectedAnswers.map((p, i) => `Case ${i + 1}: ${p}`).join(' · ');
}

export interface QuestionPointsResult {
  awardedPoints: number;
  maxPoints: number;
  isFullyCorrect: boolean;
  partialCorrectCount: number;
  totalBlanks: number;
}

/**
 * Calcule les points obtenus pour une question (avec gestion du score partiel pour les trous multiples,
 * où chaque trou vaut par défaut 1 point).
 */
export function calculateQuestionPointsEarned(question: QuizQuestion, studentAnswer: string): QuestionPointsResult {
  const maxPoints = Number(question.points) || 1;
  const sAns = (studentAnswer || '').trim();

  if (question.type === 'reorder') {
    const isCorrect = isReorderAnswerCorrect(question, sAns);
    return { awardedPoints: isCorrect ? maxPoints : 0, maxPoints, isFullyCorrect: isCorrect, partialCorrectCount: isCorrect ? 1 : 0, totalBlanks: 1 };
  }

  if (question.type === 'qcm') {
    const expected = (question.correct_answer || '').trim();
    const isCorrect = normalizeAnswerText(sAns) === normalizeAnswerText(expected);
    return { awardedPoints: isCorrect ? maxPoints : 0, maxPoints, isFullyCorrect: isCorrect, partialCorrectCount: isCorrect ? 1 : 0, totalBlanks: 1 };
  }

  // Type texte : trou unique ou trous multiples
  const expectedAnswers = getQuestionExpectedAnswers(question);
  const totalBlanks = Math.max(1, expectedAnswers.length);

  if (totalBlanks <= 1) {
    const expectedSingle = expectedAnswers[0] || (question.correct_answer || '').trim();
    const studentSingle = parseStudentAnswers(sAns, 1)[0] || sAns;
    const isCorrect = isTextAnswerCorrect(studentSingle, expectedSingle);
    return { awardedPoints: isCorrect ? maxPoints : 0, maxPoints, isFullyCorrect: isCorrect, partialCorrectCount: isCorrect ? 1 : 0, totalBlanks: 1 };
  }

  // Multiples cases vides à remplir (notation partielle : 1 point par trou par défaut)
  const studentParts = parseStudentAnswers(sAns, totalBlanks);
  let correctCount = 0;
  expectedAnswers.forEach((expectedPart, idx) => {
    if (isTextAnswerCorrect(studentParts[idx] || '', expectedPart)) {
      correctCount++;
    }
  });

  const effectiveMaxPoints = Math.max(maxPoints, totalBlanks);
  const pointsPerBlank = effectiveMaxPoints / totalBlanks;
  const awardedPoints = Number((correctCount * pointsPerBlank).toFixed(2));
  const isFullyCorrect = correctCount === totalBlanks;

  return {
    awardedPoints,
    maxPoints: effectiveMaxPoints,
    isFullyCorrect,
    partialCorrectCount: correctCount,
    totalBlanks
  };
}

/**
 * Vérifie si la réponse à une question d'un quiz (QCM, texte ou réordonnancement) est correcte.
 * Prend en charge les questions à trou unique et à trous multiples.
 */
export function isQuestionAnswerCorrect(question: QuizQuestion, studentAnswer: string): boolean {
  return calculateQuestionPointsEarned(question, studentAnswer).isFullyCorrect;
}
