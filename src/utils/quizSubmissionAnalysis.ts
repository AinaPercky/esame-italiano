import { QuizQuestion, QuizSubmission } from '../types';
import {
  calculateQuestionPointsEarned,
  formatCorrectTextAnswerForDisplay
} from './quizAnswerMatcher';
import { formatCorrectReorderAnswer, formatReorderAnswer } from './quizReorder';

export interface QuizQuestionResponseAnalysis {
  submission: QuizSubmission;
  answer: string;
  expected: string;
  correct: boolean;
  points: number;
  maxPoints: number;
}

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};

const hasOwn = (record: JsonRecord, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

const textValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

export function submissionHasDetailedAnswerData(submission: QuizSubmission): boolean {
  const answers = asRecord(submission.answers);
  const feedback = asRecord(submission.feedback);
  return Object.keys(answers).length > 0 || Object.keys(feedback).length > 0;
}

/**
 * Reconstitue une analyse à partir des réponses persistées ou du feedback historique.
 * Si une copie contient des données détaillées pour d'autres questions, une question
 * sans clé enregistrée est traitée comme non répondue. Si la copie entière n'a aucune
 * donnée de réponse, null indique que la note seule ne permet pas de reconstruire la copie.
 */
export function analyzeSubmissionQuestion(
  question: QuizQuestion,
  submission: QuizSubmission
): QuizQuestionResponseAnalysis | null {
  const answers = asRecord(submission.answers);
  const feedbackEntries = asRecord(submission.feedback);
  if (!submissionHasDetailedAnswerData(submission)) return null;

  const hasAnswerEntry = hasOwn(answers, question.id);
  const feedback = asRecord(feedbackEntries[question.id]);
  const hasFeedbackEntry = hasOwn(feedbackEntries, question.id);
  const rawAnswer = hasAnswerEntry
    ? textValue(answers[question.id])
    : textValue(feedback.studentAnswer);
  const calculated = calculateQuestionPointsEarned(question, rawAnswer);
  const hasSavedFeedback = hasFeedbackEntry && Object.keys(feedback).length > 0;

  const expected = typeof feedback.expected === 'string' && feedback.expected
    ? feedback.expected
    : question.type === 'reorder'
      ? formatCorrectReorderAnswer(question)
      : question.type === 'text'
        ? formatCorrectTextAnswerForDisplay(question)
        : question.correct_answer || '';
  const answer = typeof feedback.studentAnswer === 'string' && feedback.studentAnswer
    ? feedback.studentAnswer
    : rawAnswer
      ? question.type === 'reorder'
        ? formatReorderAnswer(question, rawAnswer)
        : rawAnswer
      : 'Aucune réponse saisie';

  const savedPoints = Number(feedback.points);
  const points = hasSavedFeedback && Number.isFinite(savedPoints)
    ? savedPoints
    : calculated.awardedPoints;

  return {
    submission,
    answer,
    expected: expected || '—',
    correct: hasSavedFeedback && typeof feedback.correct === 'boolean'
      ? feedback.correct
      : calculated.isFullyCorrect,
    points,
    maxPoints: calculated.maxPoints
  };
}
