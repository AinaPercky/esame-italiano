import { QuizQuestion } from '../types';
import {
  buildQuestionCorrectionBreakdown,
  type QuestionCorrectionBreakdown
} from './quizManualCorrectionDisplay';
import { hasPendingExpressionWritingScore } from './writtenExam';

export interface OrderedWrittenQuestion {
  question: any;
  section: any;
  sectionIndex: number;
  questionIndex: number;
}

export function getWrittenQuestionAnswerKey(question: any): Record<string, any> {
  if (!question) return {};
  return Array.isArray(question.written_exam_answer_keys)
    ? question.written_exam_answer_keys[0]?.answer_key || {}
    : question.written_exam_answer_keys?.answer_key || {};
}

export function getWrittenQuestionExplanation(question: any): string {
  if (!question) return '';
  const fromKey = Array.isArray(question.written_exam_answer_keys)
    ? question.written_exam_answer_keys[0]?.explanation
    : question.written_exam_answer_keys?.explanation;
  return String(fromKey || question.explanation || '').trim();
}

export function getWrittenQuestionPublicData(question: any): Record<string, any> {
  return question?.public_data || {};
}

export function getWrittenAnswerValue(attempt: any, question: any): unknown {
  if (!attempt || !question) return null;
  return attempt.answers?.[question.id] ?? attempt.answers?.[question.question_key] ?? null;
}

export function getOrderedWrittenQuestions(attempt: any, version: any): OrderedWrittenQuestion[] {
  const sourceSections = [...(version?.written_exam_sections || [])];
  const sectionById = new Map(sourceSections.map((section: any) => [section.id, section]));
  const manifestSections = attempt?.order_manifest?.sections;
  const sectionIds: string[] =
    Array.isArray(manifestSections) && manifestSections.length
      ? manifestSections
      : sourceSections
          .sort((a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0))
          .map((section: any) => section.id);

  const ordered: OrderedWrittenQuestion[] = [];
  let questionCounter = 0;

  sectionIds.forEach((sectionId, sectionIndex) => {
    const section = sectionById.get(sectionId);
    if (!section) return;
    const questions = [...(section.written_exam_questions || [])];
    const questionById = new Map(questions.map((q: any) => [q.id, q]));
    const manifestQuestions = attempt?.order_manifest?.questions?.[section.id];
    const questionIds: string[] =
      Array.isArray(manifestQuestions) && manifestQuestions.length
        ? manifestQuestions
        : questions
            .sort((a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0))
            .map((q: any) => q.id);

    questionIds.forEach(qId => {
      const q = questionById.get(qId);
      if (!q) return;
      ordered.push({
        question: q,
        section,
        sectionIndex,
        questionIndex: questionCounter++
      });
    });
  });

  return ordered;
}

export function toQuizQuestionFromWritten(question: any): QuizQuestion {
  const type = (question?.question_type || 'text') as QuizQuestion['type'];
  const pub = getWrittenQuestionPublicData(question);
  const key = getWrittenQuestionAnswerKey(question);
  const explanation = getWrittenQuestionExplanation(question);
  const points = Number(question?.points) || 0;

  if (type === 'qcm') {
    return {
      id: String(question.id),
      type: 'qcm',
      question: String(question.prompt || ''),
      points,
      options: (pub.options || []).map((opt: any) => ({
        id: String(opt?.id ?? ''),
        label: String(opt?.label ?? opt?.text ?? '')
      })) as unknown as string[],
      correct_answer: String(key.correctOptionId ?? ''),
      explanation
    };
  }

  if (type === 'reorder') {
    return {
      id: String(question.id),
      type: 'reorder',
      question: String(question.prompt || ''),
      points,
      items: (pub.items || []).map((item: any) => ({
        id: String(item?.id ?? ''),
        text: String(item?.text ?? '')
      })),
      correct_answer: JSON.stringify(Array.isArray(key.correctOrder) ? key.correctOrder : []),
      explanation
    };
  }

  if (type === 'verbes_trous') {
    const pubPhrases = Array.isArray(pub.verbes_trous?.phrases) ? pub.verbes_trous.phrases : [];
    const keyPhrases = Array.isArray(key.phrases) ? key.phrases : [];
    const keyById = new Map(keyPhrases.map((p: any) => [String(p?.id ?? ''), p]));
    const mergedPhrases = pubPhrases.map((p: any, idx: number) => {
      const matchedKey = keyById.get(String(p?.id ?? '')) || keyPhrases[idx] || {};
      return {
        ...p,
        verbe: String(matchedKey.verbe || p?.verbe || ''),
        reponses: Array.isArray(matchedKey.reponses)
          ? matchedKey.reponses
          : Array.isArray(p?.reponses)
            ? p.reponses
            : []
      };
    });

    return {
      id: String(question.id),
      type: 'verbes_trous',
      question: String(question.prompt || ''),
      correct_answer: '',
      points,
      verbes_trous: {
        titre: String(pub.verbes_trous?.titre || ''),
        consigne: String(pub.verbes_trous?.consigne || ''),
        points_par_phrase: Number(pub.verbes_trous?.points_par_phrase) || 3,
        banque: Array.isArray(pub.verbes_trous?.banque) ? pub.verbes_trous.banque : [],
        phrases: mergedPhrases
      },
      explanation
    };
  }

  if (type === 'mots_trous') {
    const pubPhrases = Array.isArray(pub.mots_trous?.phrases) ? pub.mots_trous.phrases : [];
    const keyPhrases = Array.isArray(key.phrases) ? key.phrases : [];
    const keyById = new Map(keyPhrases.map((p: any) => [String(p?.id ?? ''), p]));
    const mergedPhrases = pubPhrases.map((p: any, idx: number) => {
      const matchedKey = keyById.get(String(p?.id ?? '')) || keyPhrases[idx] || {};
      return {
        ...p,
        mot: String(matchedKey.mot || p?.mot || '')
      };
    });

    return {
      id: String(question.id),
      type: 'mots_trous',
      question: String(question.prompt || ''),
      correct_answer: '',
      points,
      mots_trous: {
        titre: String(pub.mots_trous?.titre || ''),
        consigne: String(pub.mots_trous?.consigne || ''),
        points_par_phrase: Math.max(1, Math.round(Number(pub.mots_trous?.points_par_phrase) || 1)),
        banque: Array.isArray(pub.mots_trous?.banque) ? pub.mots_trous.banque : [],
        phrases: mergedPhrases
      },
      explanation
    };
  }

  // Type 'text'
  const baseText: QuizQuestion & { acceptedAnswers?: string[]; accepted_answers?: string[] } = {
    id: String(question.id),
    type: 'text',
    question: String(question.prompt || ''),
    points,
    blank_count: pub.blank_count != null ? Number(pub.blank_count) : undefined,
    answers: Array.isArray(key.answers) ? key.answers : undefined,
    acceptedAnswers: Array.isArray(key.acceptedAnswers) ? key.acceptedAnswers : undefined,
    accepted_answers: Array.isArray(key.accepted_answers) ? key.accepted_answers : undefined,
    correct_answer: key.correct_answer != null ? String(key.correct_answer) : '',
    explanation
  };

  return baseText;
}

export function buildWrittenQuestionCorrectionBreakdown(
  question: any,
  rawAnswer: unknown
): QuestionCorrectionBreakdown {
  return buildQuestionCorrectionBreakdown(toQuizQuestionFromWritten(question), rawAnswer);
}

export function getWrittenAttemptReviewState(attempt: any): 'reviewed' | 'unavailable' | 'pending' {
  if (!attempt || attempt.status === 'in_progress') return 'unavailable';
  if (hasPendingExpressionWritingScore(attempt) || attempt.status === 'needs_review') return 'pending';
  if (attempt.status === 'graded') return 'reviewed';
  return 'pending';
}
