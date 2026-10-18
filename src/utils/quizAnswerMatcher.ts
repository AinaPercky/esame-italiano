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

  // Type texte : mot unique, groupe de mots ou phrase complète
  return isTextAnswerCorrect(sAns, expected);
}
