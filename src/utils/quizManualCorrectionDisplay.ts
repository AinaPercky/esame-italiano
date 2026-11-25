import { QuizQuestion, QuizSubmission } from '../types';
import {
  getQuestionExpectedAnswers,
  isTextAnswerCorrect,
  normalizeAnswerText,
  parseStudentAnswers
} from './quizAnswerMatcher';
import {
  getCorrectReorderIds,
  parseReorderAnswer
} from './quizReorder';
import {
  noterPhrase,
  normalizeVerbesTrousAnswer,
  parseVerbesTrousAnswers,
  type VerbesTrousAnswerKeyPhrase,
  type VerbesTrousPhraseAnswer
} from './verbesTrous';
import {
  noterMotsTrous,
  parseMotsTrousAnswers,
  type MotsTrousAnswerKeyPhrase
} from './motsTrous';

export interface QcmOptionBreakdown {
  index: number;
  label: string;
  isSelected: boolean;
  isExpected: boolean;
}

export interface TextSlotBreakdown {
  index: number;
  label: string;
  studentValue: string;
  expectedValue: string;
  isCorrect: boolean;
  isEmpty: boolean;
}

export interface ReorderItemBreakdown {
  position: number;
  studentText: string;
  expectedText: string;
  isMatch: boolean;
}

export interface VerbesTrousPhraseBreakdown {
  index: number;
  debut: string;
  fin: string;
  chosenVerb: string;
  expectedVerb: string;
  typedText: string;
  expectedAnswers: string[];
  isVerbCorrect: boolean;
  isConjugationCorrect: boolean;
  pointsEarned: number;
  maxPoints: number;
}

export interface MotsTrousPhraseBreakdown {
  index: number;
  debut: string;
  fin: string;
  chosenWord: string;
  expectedWord: string;
  isCorrect: boolean;
  pointsEarned: number;
  maxPoints: number;
}

export type QuestionCorrectionBreakdown =
  | {
      type: 'qcm';
      hasResponse: boolean;
      studentDisplay: string;
      expectedDisplay: string;
      isCorrect: boolean;
      options: QcmOptionBreakdown[];
    }
  | {
      type: 'text';
      hasResponse: boolean;
      isMultiBlank: boolean;
      slots: TextSlotBreakdown[];
    }
  | {
      type: 'reorder';
      hasResponse: boolean;
      studentSummary: string;
      expectedSummary: string;
      isAllMatch: boolean;
      items: ReorderItemBreakdown[];
    }
  | {
      type: 'verbes_trous';
      hasResponse: boolean;
      phrases: VerbesTrousPhraseBreakdown[];
      totalEarned: number;
      totalMax: number;
    }
  | {
      type: 'mots_trous';
      hasResponse: boolean;
      phrases: MotsTrousPhraseBreakdown[];
      totalEarned: number;
      totalMax: number;
    };

export interface QuickScoreOption {
  value: number;
  label: string;
  kind: 'zero' | 'half' | 'auto' | 'max';
}

export function hasStudentResponse(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return false;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed === null) return false;
      if (Array.isArray(parsed)) return parsed.some(item => hasStudentResponse(item));
      if (typeof parsed === 'object') {
        return Object.values(parsed as Record<string, unknown>).some(item => hasStudentResponse(item));
      }
    } catch {
      /* Texte ordinaire non vide */
    }
    return true;
  }
  if (Array.isArray(value)) return value.some(item => hasStudentResponse(item));
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(item => hasStudentResponse(item));
  }
  return true;
}

export function formatPointsCompact(value: number): string {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return '0';
  if (Number.isInteger(safe)) return String(safe);
  return String(Number(safe.toFixed(2)));
}

export function resolveQuickScoreOptions(maxPoints: number, autoPoints: number): QuickScoreOption[] {
  const safeMax = Math.max(0, Number(maxPoints) || 0);
  const safeAuto = Math.min(safeMax, Math.max(0, Number(autoPoints) || 0));
  const items: QuickScoreOption[] = [{ value: 0, label: '0', kind: 'zero' }];

  const seen = new Set<number>([0]);

  if (safeMax >= 1) {
    const half = Math.round((safeMax / 2) * 4) / 4;
    if (half > 0 && half < safeMax && !seen.has(half)) {
      seen.add(half);
      items.push({ value: half, label: `${formatPointsCompact(half)} (½)`, kind: 'half' });
    }
  }

  if (safeAuto > 0 && safeAuto < safeMax && !seen.has(safeAuto)) {
    seen.add(safeAuto);
    items.push({ value: safeAuto, label: `Auto (${formatPointsCompact(safeAuto)})`, kind: 'auto' });
  }

  if (safeMax > 0 && !seen.has(safeMax)) {
    seen.add(safeMax);
    items.push({ value: safeMax, label: `Max (${formatPointsCompact(safeMax)})`, kind: 'max' });
  }

  return items.sort((a, b) => a.value - b.value);
}

type RawOptionEntry = string | { id?: string; label?: string; text?: string };

function normalizeOptionEntry(entry: RawOptionEntry, index: number): { id: string; label: string; index: number } {
  if (typeof entry === 'string') {
    return { id: String(index), label: entry.trim(), index };
  }
  if (entry && typeof entry === 'object') {
    const label = String(entry.label ?? entry.text ?? entry.id ?? '').trim();
    const id = String(entry.id ?? index).trim();
    return { id, label, index };
  }
  return { id: String(index), label: String(entry ?? '').trim(), index };
}

function matchesOption(
  option: { id: string; label: string; index: number },
  rawTarget: string,
  hasObjectOptions: boolean
): boolean {
  const trimmed = rawTarget.trim();
  if (!trimmed) return false;
  const normTarget = normalizeAnswerText(trimmed);
  if (normalizeAnswerText(option.label) === normTarget) return true;
  if (hasObjectOptions && normalizeAnswerText(option.id) === normTarget) return true;
  if (/^\d+$/.test(trimmed) && Number(trimmed) === option.index) return true;
  return false;
}

function resolveOptionLabel(
  options: Array<{ id: string; label: string; index: number }>,
  rawValue: string,
  hasObjectOptions: boolean
): string {
  const trimmed = rawValue.trim();
  if (!trimmed) return '';
  const matched = options.find(opt => matchesOption(opt, trimmed, hasObjectOptions));
  if (matched) return matched.label;
  return trimmed;
}

function extractVerbesTrousAnswerMap(
  rawAnswer: unknown,
  phrases: Array<{ id: string | number }>
): Record<string, VerbesTrousPhraseAnswer> {
  if (!rawAnswer) return {};
  let rawObj: unknown = rawAnswer;
  if (typeof rawAnswer === 'string') {
    const trimmed = rawAnswer.trim();
    if (!trimmed) return {};
    try {
      rawObj = JSON.parse(trimmed);
    } catch {
      return {};
    }
  }

  if (!rawObj || typeof rawObj !== 'object') return {};

  const result: Record<string, VerbesTrousPhraseAnswer> = {};

  if (Array.isArray(rawObj)) {
    phrases.forEach((phrase, idx) => {
      const entry = rawObj[idx] as Record<string, unknown> | undefined;
      if (entry && typeof entry === 'object') {
        result[String(phrase.id)] = {
          verbe_choisi: String(entry.verbe_choisi ?? entry.verbe ?? entry.verb ?? entry.chosenVerb ?? '').trim() || null,
          texte_saisi: String(entry.texte_saisi ?? entry.saisie ?? entry.text ?? entry.writtenText ?? '').trim()
        };
      }
    });
    return result;
  }

  const obj = rawObj as Record<string, unknown>;
  if ('choices' in obj || 'saisies' in obj) {
    const choices = (obj.choices && typeof obj.choices === 'object' ? obj.choices : {}) as Record<string, unknown>;
    const saisies = (obj.saisies && typeof obj.saisies === 'object' ? obj.saisies : {}) as Record<string, unknown>;
    const phraseIds = new Set(phrases.map(p => String(p.id)));

    phrases.forEach((phrase, idx) => {
      const idKey = String(phrase.id);
      const idxKey = String(idx);
      const verb =
        choices[idKey] !== undefined
          ? choices[idKey]
          : (!phraseIds.has(idxKey) || choices[idxKey] !== undefined ? choices[idxKey] : undefined);
      const text =
        saisies[idKey] !== undefined
          ? saisies[idKey]
          : (!phraseIds.has(idxKey) || saisies[idxKey] !== undefined ? saisies[idxKey] : undefined);

      const cleanVerb = verb != null ? String(verb).trim() : '';
      const cleanText = text != null ? String(text).trim() : '';
      if (cleanVerb || cleanText) {
        result[idKey] = {
          verbe_choisi: cleanVerb || null,
          texte_saisi: cleanText
        };
      }
    });
    return result;
  }

  const parsedMap = parseVerbesTrousAnswers(rawObj);
  const phraseIds = new Set(phrases.map(p => String(p.id)));
  phrases.forEach((phrase, idx) => {
    const idKey = String(phrase.id);
    const idxKey = String(idx);
    const entry =
      (parsedMap[idKey] as unknown as Record<string, unknown> | undefined) ??
      (!phraseIds.has(idxKey) ? (parsedMap[idxKey] as unknown as Record<string, unknown> | undefined) : undefined);

    if (entry && typeof entry === 'object') {
      const verbe = String(entry.verbe_choisi ?? entry.verbe ?? entry.verb ?? '').trim();
      const texte = String(entry.texte_saisi ?? entry.saisie ?? entry.text ?? '').trim();
      result[idKey] = {
        verbe_choisi: verbe || null,
        texte_saisi: texte
      };
    }
  });

  return result;
}

export function buildQuestionCorrectionBreakdown(
  question: QuizQuestion,
  rawAnswer: unknown
): QuestionCorrectionBreakdown {
  const responsePresent = hasStudentResponse(rawAnswer);

  if (question.type === 'qcm') {
    const rawOptions = (question.options || []) as unknown as RawOptionEntry[];
    const hasObjectOptions = rawOptions.some(opt => typeof opt === 'object' && opt !== null);
    const options = rawOptions.map(normalizeOptionEntry);

    const rawExpected = String(question.correct_answer ?? '').trim();
    const rawStudent = responsePresent
      ? (typeof rawAnswer === 'string' ? rawAnswer.trim() : String(rawAnswer ?? '').trim())
      : '';

    const expectedDisplay = resolveOptionLabel(options, rawExpected, hasObjectOptions) || 'Corrigé non défini';
    const studentDisplay = rawStudent ? resolveOptionLabel(options, rawStudent, hasObjectOptions) : 'Aucune réponse';

    const mappedOptions: QcmOptionBreakdown[] = options.map(opt => ({
      index: opt.index,
      label: opt.label,
      isSelected: Boolean(rawStudent && matchesOption(opt, rawStudent, hasObjectOptions)),
      isExpected: Boolean(rawExpected && matchesOption(opt, rawExpected, hasObjectOptions))
    }));

    const isCorrect =
      Boolean(rawStudent && rawExpected) &&
      (normalizeAnswerText(studentDisplay) === normalizeAnswerText(expectedDisplay) ||
        mappedOptions.some(opt => opt.isSelected && opt.isExpected));

    return {
      type: 'qcm',
      hasResponse: responsePresent,
      studentDisplay,
      expectedDisplay,
      isCorrect,
      options: mappedOptions
    };
  }

  if (question.type === 'reorder') {
    const rawItems = question.items || [];
    const itemsById = new Map(rawItems.map(item => [String(item.id), item.text]));
    const expectedIds = getCorrectReorderIds(question);
    const rawStr = typeof rawAnswer === 'string'
      ? rawAnswer
      : Array.isArray(rawAnswer)
        ? JSON.stringify(rawAnswer)
        : String(rawAnswer ?? '');
    const studentIds = parseReorderAnswer(rawStr);

    const maxLen = Math.max(expectedIds.length, studentIds.length);
    const items: ReorderItemBreakdown[] = Array.from({ length: maxLen }, (_, idx) => {
      const eId = expectedIds[idx];
      const sId = studentIds[idx];
      const expectedText = eId ? (itemsById.get(String(eId)) || String(eId)) : '—';
      const studentText = sId ? (itemsById.get(String(sId)) || String(sId)) : '—';
      return {
        position: idx + 1,
        studentText,
        expectedText,
        isMatch: Boolean(eId && sId && String(eId) === String(sId))
      };
    });

    const expectedSummary = expectedIds.map(id => itemsById.get(String(id)) || String(id)).join(' → ') || question.correct_answer || 'Corrigé non défini';
    const studentSummary = studentIds.length > 0
      ? studentIds.map(id => itemsById.get(String(id)) || String(id)).join(' → ')
      : (responsePresent ? rawStr : 'Aucune réponse');

    return {
      type: 'reorder',
      hasResponse: responsePresent,
      studentSummary,
      expectedSummary,
      isAllMatch: items.length > 0 && items.every(item => item.isMatch),
      items
    };
  }

  if (question.type === 'verbes_trous') {
    const rawPhrases = (question.verbes_trous?.phrases || question.phrases || []) as VerbesTrousAnswerKeyPhrase[];
    const pointsParPhrase = Number(question.verbes_trous?.points_par_phrase ?? question.points_par_phrase) || 3;
    const answersMap = extractVerbesTrousAnswerMap(rawAnswer, rawPhrases);
    const usedVerbs = new Set<string>();

    const phrases: VerbesTrousPhraseBreakdown[] = rawPhrases.map((phrase, index) => {
      const rawAns = answersMap[String(phrase.id)];
      const chosenNorm = normalizeVerbesTrousAnswer(rawAns?.verbe_choisi);
      const isDuplicateVerb = Boolean(chosenNorm && usedVerbs.has(chosenNorm));
      if (chosenNorm && !isDuplicateVerb) usedVerbs.add(chosenNorm);

      const graded = isDuplicateVerb
        ? noterPhrase(phrase, undefined, pointsParPhrase)
        : noterPhrase(phrase, rawAns, pointsParPhrase);

      return {
        index: index + 1,
        debut: phrase.debut || '',
        fin: phrase.fin || '',
        chosenVerb: rawAns?.verbe_choisi || '',
        expectedVerb: phrase.verbe || '',
        typedText: rawAns?.texte_saisi || '',
        expectedAnswers: (phrase.reponses || []).filter(Boolean),
        isVerbCorrect: graded.points_verbe > 0,
        isConjugationCorrect: graded.points_conjugaison > 0,
        pointsEarned: graded.total,
        maxPoints: pointsParPhrase
      };
    });

    return {
      type: 'verbes_trous',
      hasResponse: responsePresent,
      phrases,
      totalEarned: phrases.reduce((sum, p) => sum + p.pointsEarned, 0),
      totalMax: phrases.length * pointsParPhrase
    };
  }

  if (question.type === 'mots_trous') {
    const definition = question.mots_trous || { banque: [], phrases: [] };
    const rawPhrases = (definition.phrases || []) as MotsTrousAnswerKeyPhrase[];
    const pointsParPhrase = Math.max(1, Math.round(Number(definition.points_par_phrase ?? question.points_par_phrase) || 1));
    const answersMap = parseMotsTrousAnswers(rawAnswer, rawPhrases);
    const scored = noterMotsTrous(definition, rawAnswer, rawPhrases);

    const phrases: MotsTrousPhraseBreakdown[] = rawPhrases.map((phrase, index) => {
      const phraseScore = scored.phrases[index];
      const rawChosen = answersMap[String(phrase.id)] || '';
      return {
        index: index + 1,
        debut: phrase.debut || '',
        fin: phrase.fin || '',
        chosenWord: rawChosen,
        expectedWord: phrase.mot || '',
        isCorrect: Boolean(phraseScore?.correct),
        pointsEarned: phraseScore?.points ?? 0,
        maxPoints: pointsParPhrase
      };
    });

    return {
      type: 'mots_trous',
      hasResponse: responsePresent,
      phrases,
      totalEarned: phrases.reduce((sum, p) => sum + p.pointsEarned, 0),
      totalMax: phrases.length * pointsParPhrase
    };
  }

  // Type 'text' (trou unique ou multi-trous)
  const expectedAnswers = getQuestionExpectedAnswers(question);
  const slotCount = Math.max(1, expectedAnswers.length);
  const rawStr = typeof rawAnswer === 'string'
    ? rawAnswer
    : Array.isArray(rawAnswer)
      ? JSON.stringify(rawAnswer)
      : String(rawAnswer ?? '');
  const studentParts = parseStudentAnswers(rawStr, slotCount);

  const slots: TextSlotBreakdown[] = expectedAnswers.map((expectedValue, idx) => {
    const studentValue = (studentParts[idx] || '').trim();
    const expectedClean = (expectedValue || question.correct_answer || '').trim();
    return {
      index: idx + 1,
      label: slotCount > 1 ? `Case ${idx + 1}` : 'Réponse',
      studentValue,
      expectedValue: expectedClean,
      isCorrect: Boolean(studentValue && expectedClean && isTextAnswerCorrect(studentValue, expectedClean)),
      isEmpty: !studentValue
    };
  });

  return {
    type: 'text',
    hasResponse: responsePresent,
    isMultiBlank: slotCount > 1,
    slots
  };
}

export function getSubmissionReviewState(submission: QuizSubmission): 'reviewed' | 'unavailable' | 'pending' {
  if (submission.manual_review) return 'reviewed';
  if (submission.status === 'missed' || !submission.questions_snapshot?.length) return 'unavailable';
  return 'pending';
}
