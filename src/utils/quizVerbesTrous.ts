import { QuizQuestion } from '../types';
import { normalizeAnswerText } from './quizAnswerMatcher';

export interface VerbesTrousPhrase {
  debut: string;
  fin: string;
  verbe: string;
  reponses: string[];
}

export interface VerbesTrousStudentChoice {
  verbe: string;
  saisie: string;
}

export interface VerbesTrousPhraseResult {
  phraseIndex: number;
  expectedVerb: string;
  expectedReponses: string[];
  chosenVerb: string;
  writtenText: string;
  isVerbCorrect: boolean;
  verbPoints: number; // 0 ou 1
  isConjugationCorrect: boolean;
  conjugationPoints: number; // 0 ou 2
  totalPoints: number; // 0 à 3
  isFullyCorrect: boolean;
}

export interface VerbesTrousGradingResult {
  awardedPoints: number;
  maxPoints: number;
  isFullyCorrect: boolean;
  phraseResults: VerbesTrousPhraseResult[];
  verbsPlacedCount: number;
  verbsConjugatedCount: number;
  totalPhrases: number;
}

/**
 * Normalise un texte ou un verbe pour la comparaison :
 * - Trim, minuscules
 * - Réduction des espaces multiples
 * - Unification des apostrophes
 */
export function normalizeVerbesTrousText(text: string): string {
  return normalizeAnswerText(text || '', true);
}

/**
 * Vérifie si la conjugaison saisie correspond à l'une des réponses acceptées.
 * Prend en charge :
 * - Insensible à la casse
 * - Tolérance aux espaces superflus
 * - Variantes séparées par '/' ou ';' dans chaque entrée du tableau
 */
export function isConjugationAccepted(studentText: string, acceptedResponses: string[]): boolean {
  const normStudent = normalizeVerbesTrousText(studentText);
  if (!normStudent) return false;

  for (const resp of acceptedResponses || []) {
    // Si la réponse acceptée contient des séparateurs comme "/" ou ";"
    const alternatives = String(resp || '')
      .split(/\s*[\/;|]\s*/)
      .map(alt => normalizeVerbesTrousText(alt))
      .filter(Boolean);

    if (alternatives.includes(normStudent)) {
      return true;
    }
  }

  return false;
}

/**
 * Note une phrase individuelle selon la règle PerckyLingua :
 * - 1 point pour le bon verbe
 * - 2 points pour la bonne conjugaison
 * - Total : 3 points max
 */
export function gradeVerbesTrousPhrase(
  phrase: VerbesTrousPhrase,
  phraseIndex: number,
  chosenVerb: string,
  writtenText: string,
  pointsParPhrase = 3
): VerbesTrousPhraseResult {
  const normExpectedVerb = normalizeVerbesTrousText(phrase.verbe);
  const normChosenVerb = normalizeVerbesTrousText(chosenVerb);

  const isVerbCorrect = Boolean(normChosenVerb && normChosenVerb === normExpectedVerb);
  const verbPoints = isVerbCorrect ? 1 : 0;

  const isConjugationCorrect = isConjugationAccepted(writtenText, phrase.reponses);
  const conjugationPoints = isConjugationCorrect ? 2 : 0;

  const totalPoints = verbPoints + conjugationPoints;
  const isFullyCorrect = totalPoints === pointsParPhrase;

  return {
    phraseIndex,
    expectedVerb: phrase.verbe,
    expectedReponses: phrase.reponses,
    chosenVerb: chosenVerb || '',
    writtenText: writtenText || '',
    isVerbCorrect,
    verbPoints,
    isConjugationCorrect,
    conjugationPoints,
    totalPoints,
    isFullyCorrect
  };
}

/**
 * Décode la réponse stockée de l'élève pour une question `verbes_trous`.
 * Peut être un objet JSON { choices: {...}, saisies: {...} }
 * ou un tableau d'objets, ou un dictionnaire de phraseIndex.
 */
export function parseVerbesTrousStudentAnswer(
  rawAnswer: string | undefined | null,
  phraseCount: number
): { choices: Record<number, string>; saisies: Record<number, string> } {
  const choices: Record<number, string> = {};
  const saisies: Record<number, string> = {};

  if (!rawAnswer) {
    return { choices, saisies };
  }

  try {
    const parsed = typeof rawAnswer === 'string' ? JSON.parse(rawAnswer) : rawAnswer;

    if (parsed && typeof parsed === 'object') {
      if (parsed.choices && typeof parsed.choices === 'object') {
        Object.keys(parsed.choices).forEach(k => {
          choices[Number(k)] = String(parsed.choices[k] || '');
        });
      }
      if (parsed.saisies && typeof parsed.saisies === 'object') {
        Object.keys(parsed.saisies).forEach(k => {
          saisies[Number(k)] = String(parsed.saisies[k] || '');
        });
      }

      // Si le format était un simple tableau d'items
      if (Array.isArray(parsed)) {
        parsed.forEach((item: any, idx: number) => {
          if (item && typeof item === 'object') {
            choices[idx] = String(item.verbe || item.verb || item.chosenVerb || '');
            saisies[idx] = String(item.saisie || item.text || item.writtenText || '');
          }
        });
      }

      // Si le format était un dictionnaire { 0: { verbe, saisie } }
      if (!parsed.choices && !Array.isArray(parsed)) {
        Object.keys(parsed).forEach(k => {
          const num = Number(k);
          if (!isNaN(num) && parsed[k] && typeof parsed[k] === 'object') {
            choices[num] = String(parsed[k].verbe || parsed[k].verb || '');
            saisies[num] = String(parsed[k].saisie || parsed[k].text || '');
          }
        });
      }
    }
  } catch {
    // Si la chaîne n'était pas du JSON, on ignore
  }

  return { choices, saisies };
}

/**
 * Note l'ensemble d'une question `verbes_trous`
 */
export function gradeVerbesTrousQuestion(
  question: QuizQuestion,
  studentAnswer: string | { choices?: Record<number, string>; saisies?: Record<number, string> }
): VerbesTrousGradingResult {
  const vt = question.verbes_trous || (question as any);
  const phrases: VerbesTrousPhrase[] = Array.isArray(vt?.phrases) ? vt.phrases : Array.isArray(question.phrases) ? (question.phrases as any) : [];
  const pointsParPhrase = Number(vt?.points_par_phrase || (question as any).points_par_phrase) || 3;
  const totalPhrases = phrases.length;
  const maxPoints = totalPhrases * pointsParPhrase;

  let choices: Record<number, string> = {};
  let saisies: Record<number, string> = {};

  if (typeof studentAnswer === 'string') {
    const parsed = parseVerbesTrousStudentAnswer(studentAnswer, totalPhrases);
    choices = parsed.choices;
    saisies = parsed.saisies;
  } else if (studentAnswer && typeof studentAnswer === 'object') {
    choices = studentAnswer.choices || {};
    saisies = studentAnswer.saisies || {};
  }

  let awardedPoints = 0;
  let verbsPlacedCount = 0;
  let verbsConjugatedCount = 0;

  const phraseResults: VerbesTrousPhraseResult[] = phrases.map((phrase: any, idx: number) => {
    const chosenVerb = choices[idx] || '';
    const writtenText = saisies[idx] || '';

    if (chosenVerb.trim()) verbsPlacedCount++;
    if (writtenText.trim()) verbsConjugatedCount++;

    const res = gradeVerbesTrousPhrase(phrase, idx, chosenVerb, writtenText, pointsParPhrase);
    awardedPoints += res.totalPoints;
    return res;
  });

  const isFullyCorrect = maxPoints > 0 && awardedPoints === maxPoints;

  return {
    awardedPoints,
    maxPoints,
    isFullyCorrect,
    phraseResults,
    verbsPlacedCount,
    verbsConjugatedCount,
    totalPhrases
  };
}

/**
 * Formate la réponse attendue pour affichage dans la correction
 */
export function formatCorrectVerbesTrousAnswer(question: QuizQuestion): string {
  const vt = question.verbes_trous || (question as any);
  const phrases = Array.isArray(vt?.phrases) ? vt.phrases : Array.isArray(question.phrases) ? (question.phrases as any) : [];
  if (phrases.length === 0) return question.correct_answer || '';

  return phrases
    .map((p: any, idx: number) => {
      const primaryResponse = p.reponses?.[0] || '—';
      return `${idx + 1}. [${p.verbe}] → ${primaryResponse}`;
    })
    .join('\n');
}

/**
 * Formate la réponse de l'élève pour affichage dans la correction
 */
export function formatStudentVerbesTrousAnswer(
  question: QuizQuestion,
  rawAnswer: string
): string {
  const vt = question.verbes_trous || (question as any);
  const phrases = Array.isArray(vt?.phrases) ? vt.phrases : Array.isArray(question.phrases) ? (question.phrases as any) : [];
  const { choices, saisies } = parseVerbesTrousStudentAnswer(rawAnswer, phrases.length);

  if (phrases.length === 0) return rawAnswer || '—';

  return phrases
    .map((p: any, idx: number) => {
      const v = choices[idx] || '—';
      const c = saisies[idx] || '—';
      const res = gradeVerbesTrousPhrase(p, idx, choices[idx] || '', saisies[idx] || '');
      return `${idx + 1}. [${v}] ${c} (${res.totalPoints}/3)`;
    })
    .join('\n');
}

/**
 * Valide qu'il n'y a pas deux verbes identiques dans la liste des phrases.
 */
export function findDuplicateVerbs(phrases: VerbesTrousPhrase[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  (phrases || []).forEach(p => {
    const norm = normalizeVerbesTrousText(p.verbe);
    if (!norm) return;
    if (seen.has(norm)) {
      duplicates.add(p.verbe.trim());
    } else {
      seen.add(norm);
    }
  });

  return Array.from(duplicates);
}
