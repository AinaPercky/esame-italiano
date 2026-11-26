import { QuizQuestion } from '../types';
import { isReorderAnswerCorrect } from './quizReorder';
import { noterQuiz, type VerbesTrousAnswerKeyPhrase } from './verbesTrous';
import { noterMotsTrous, type MotsTrousAnswerKeyPhrase } from './motsTrous';
import { areEquivalentItalianNumbers } from './italianNumberWords';

/**
 * Normalise une chaîne pour la comparaison de réponse :
 * - Insensible à la casse (majuscules / minuscules)
 * - Nettoyage des espaces de début, fin et espaces multiples (ex: "di  tanto   in tanto" -> "di tanto in tanto")
 * - Unification des apostrophes typographiques (' vs ’ vs ‘ vs `) et suppression de l'espace après apostrophe (ex: "l' euro" -> "l'euro")
 * - Unification des guillemets typographiques («, », “, ”)
 * - Optionnellement : normalisation de la ponctuation terminale de phrase (. ? ! ; :)
 */
export function normalizeAnswerText(value: string, stripTerminalPunctuation = false): string {
  // NFC unifie les caractères accentués précomposés et décomposés (ex. é).
  let text = (value || '')
    .normalize('NFC')
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

  // 3. Équivalence exacte entre chiffres et nombres cardinaux italiens (0 à 999).
  if (areEquivalentItalianNumbers(normStudentNoEndPunct, normExpectedNoEndPunct)) {
    return true;
  }

  // 3. Prise en charge des alternatives déclarées par le professeur (ex: "io cuocio / cuocio")
  const alternatives = expectedAnswer
    .split(/\s*[\/;|]\s*|\s+(?:ou|oppure|o)\s+/i)
    .map(alt => normalizeAnswerText(alt, true))
    .filter(Boolean);

  if (alternatives.length > 1 && alternatives.some(alt =>
    alt === normStudentNoEndPunct || areEquivalentItalianNumbers(normStudentNoEndPunct, alt)
  )) {
    return true;
  }

  return false;
}

/**
 * Récupère la liste des réponses attendues pour une question de type saisie.
 * - S'il y a 1 seul trou : renvoie [reponse]
 * - S'il y a plusieurs trous (ex: 2, 3, 4 verbes) : renvoie le tableau des réponses pour chaque trou.
 */
export const CLOZE_BLANK_REGEX = /(?:_{2,}|…{2,}|\.{3,}|\[\s*\]|\(\s*\)|\{\{\s*\}\})/g;

export type QuizExpectedAnswerSource = Pick<QuizQuestion, 'question'> & Partial<Pick<QuizQuestion, 'correct_answer' | 'answers' | 'blank_count'>> & { acceptedAnswers?: string[]; accepted_answers?: string[] };

function inferPromptBlankCount(prompt: string): number {
  return Array.from(String(prompt || '').matchAll(new RegExp(CLOZE_BLANK_REGEX.source, 'g'))).length;
}

export function getQuestionExpectedAnswers(question: QuizExpectedAnswerSource): string[] {
  const explicitBlankCount = Math.max(0, Number((question as any).blank_count) || 0);
  // Old quiz/exercise records sometimes omitted blank_count. The prompt itself is
  // authoritative when it visibly contains several independent blanks.
  const promptBlankCount = inferPromptBlankCount(question.question);
  const inferredBlankCount = promptBlankCount > 1 ? promptBlankCount : explicitBlankCount;

  const normalizeEntries = (entries: unknown[]): string[] => {
    const values = entries.map((entry) => Array.isArray(entry)
      ? entry.map(String).map(value => value.trim()).filter(Boolean).join(' / ')
      : String(entry ?? '').trim()).filter(Boolean);
    const hasNestedBlanks = entries.some(Array.isArray);

    // A flat list matching the number of visible blanks represents independent
    // answer slots, even when legacy data did not persist blank_count.
    if (!hasNestedBlanks && promptBlankCount > 1 && values.length === promptBlankCount) {
      return values;
    }
    if (!hasNestedBlanks && promptBlankCount > 1 && values.length === 1) {
      const parts = values[0].split(/\s*(?:\||\/\/|\/)\s*/).map(part => part.trim()).filter(Boolean);
      if (parts.length === promptBlankCount) return parts;
    }

    // Legacy sanitizer could persist duplicate variants as blank_count=2.
    // Keep this compatibility rule for questions without multiple visible blanks.
    const allFlatEntriesIdentical = !hasNestedBlanks && values.length > 1
      && values.every(value => normalizeAnswerText(value) === normalizeAnswerText(values[0]));
    if (allFlatEntriesIdentical) return [values[0]];

    // Without evidence of multiple blanks, a flat list remains alternatives
    // for one answer. Explicit blank_count preserves older multi-blank records.
    if (!hasNestedBlanks && inferredBlankCount <= 1 && values.length > 1) {
      return [values.join(' / ')];
    }
    return values;
  };

  if (Array.isArray(question.answers) && question.answers.length > 0) {
    return normalizeEntries(question.answers);
  }

  const declaredAlternatives = question.acceptedAnswers || question.accepted_answers;
  if (Array.isArray(declaredAlternatives) && declaredAlternatives.length > 0) return normalizeEntries(declaredAlternatives);

  const raw = (question.correct_answer || '').trim();
  if (raw.startsWith('[') && raw.endsWith(']')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return normalizeEntries(parsed);
      }
    } catch {}
  }

  // Split legacy text only when the number of segments matches visible/declared blanks.
  const splitLegacySlots = (value: string): string[] => {
    const parts = value.split(/\s*(?:\||\/\/|\/)\s*/).map(part => part.trim()).filter(Boolean);
    return inferredBlankCount > 1 && parts.length === inferredBlankCount ? parts : [];
  };
  const delimitedSlots = splitLegacySlots(raw);
  if (delimitedSlots.length > 1) return delimitedSlots;

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
export function formatTextAnswerForDisplay(question: QuizExpectedAnswerSource, answerStr: string): string {
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
export function formatCorrectTextAnswerForDisplay(question: QuizExpectedAnswerSource): string {
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
    const expected = normalizeAnswerText(question.correct_answer || '');
    const options = (question.options || []) as unknown as Array<string | { id?: string; label?: string }>;
    const keyedOption = options.find(option => {
      if (typeof option === 'string') return normalizeAnswerText(option) === expected;
      return normalizeAnswerText(option.id || '') === expected
        || normalizeAnswerText(option.label || '') === expected;
    });
    const acceptedValues = new Set<string>([expected]);
    if (keyedOption) {
      if (typeof keyedOption === 'string') acceptedValues.add(normalizeAnswerText(keyedOption));
      else {
        if (keyedOption.id) acceptedValues.add(normalizeAnswerText(keyedOption.id));
        if (keyedOption.label) acceptedValues.add(normalizeAnswerText(keyedOption.label));
      }
    }
    const isCorrect = acceptedValues.has(normalizeAnswerText(sAns));
    return { awardedPoints: isCorrect ? maxPoints : 0, maxPoints, isFullyCorrect: isCorrect, partialCorrectCount: isCorrect ? 1 : 0, totalBlanks: 1 };
  }

  if (question.type === 'verbes_trous' && question.verbes_trous) {
    const phrases = question.verbes_trous.phrases.filter((phrase) => phrase.verbe && Array.isArray(phrase.reponses)) as VerbesTrousAnswerKeyPhrase[];
    const result = noterQuiz(question.verbes_trous, sAns, phrases);
    const fullyCorrect = result.score === result.maxScore;
    return { awardedPoints: result.score, maxPoints: result.maxScore, isFullyCorrect: fullyCorrect, partialCorrectCount: result.phrases.filter((phrase) => phrase.correct).length, totalBlanks: result.phrases.length };
  }

  if (question.type === 'mots_trous' && question.mots_trous) {
    const phrases = question.mots_trous.phrases.filter((phrase) => Boolean(phrase.mot)) as MotsTrousAnswerKeyPhrase[];
    const result = noterMotsTrous(question.mots_trous, sAns, phrases);
    const fullyCorrect = result.maxScore > 0 && result.score === result.maxScore;
    return {
      awardedPoints: result.score,
      maxPoints: result.maxScore,
      isFullyCorrect: fullyCorrect,
      partialCorrectCount: result.phrases.filter((phrase) => phrase.correct).length,
      totalBlanks: result.phrases.length
    };
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


function getWrittenExamExpectedSlots(answerKey: any, blankCount?: number, prompt = ''): string[] {
  const source = Array.isArray(answerKey?.answers) && answerKey.answers.length
    ? answerKey.answers
    : Array.isArray(answerKey?.acceptedAnswers) && answerKey.acceptedAnswers.length
      ? answerKey.acceptedAnswers
      : Array.isArray(answerKey?.accepted_answers) && answerKey.accepted_answers.length
        ? answerKey.accepted_answers
        : answerKey?.correct_answer != null ? [answerKey.correct_answer] : [];
  if (!source.length) return [];
  return getQuestionExpectedAnswers({
    question: String(prompt || ''),
    blank_count: blankCount,
    answers: source,
    correct_answer: answerKey?.correct_answer != null ? String(answerKey.correct_answer) : ''
  } as QuizExpectedAnswerSource);
}

export function formatWrittenExamTextExpected(prompt: string, answerKey: any, blankCount?: number): string {
  const slots = getWrittenExamExpectedSlots(answerKey, blankCount, prompt);
  if (!slots.length) return 'Corrigé indisponible';
  if (slots.length === 1) return slots[0];
  return slots.map((value, index) => 'Case ' + (index + 1) + ': ' + value).join(' · ');
}

export function gradeWrittenExamTextQuestion(
  prompt: string,
  answerKey: any,
  blankCount: number | undefined,
  studentAnswer: unknown,
  maxPoints: number
): number {
  const expected = getWrittenExamExpectedSlots(answerKey, blankCount, prompt);
  const max = Number(maxPoints);
  if (!expected.length || !Number.isFinite(max) || max <= 0) return 0;
  let submitted: string[] = [];
  if (Array.isArray(studentAnswer)) {
    submitted = studentAnswer.map(value => String(value ?? ''));
  } else if (typeof studentAnswer === 'string') {
    try {
      const parsed = JSON.parse(studentAnswer);
      submitted = Array.isArray(parsed) ? parsed.map(value => String(value ?? '')) : [studentAnswer];
    } catch {
      submitted = [studentAnswer];
    }
  } else if (studentAnswer != null) {
    submitted = [String(studentAnswer)];
  }
  if (expected.length === 1) return isTextAnswerCorrect(submitted[0] || '', expected[0]) ? max : 0;
  const correctCount = expected.reduce((count, value, index) =>
    count + (isTextAnswerCorrect(submitted[index] || '', value) ? 1 : 0), 0);
  return Number(((correctCount / expected.length) * max).toFixed(2));
}
