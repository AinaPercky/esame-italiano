import { Quiz, QuizQuestion } from '../../types';

export interface QuizFeedbackEntry {
  correct: boolean;
  points: number;
  expected: string;
  studentAnswer: string;
}

export interface QuizEvaluationResult {
  rawScore: number;
  maxScore: number;
  score20: number;
  feedback: Record<string, QuizFeedbackEntry>;
}

const LEADING_ARTICLES = /^(l|la|le|les|il|lo|gli|i|un|uno|una|the)\s+/;

function normalizeQuizText(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeQuizTextCompact(value: string): string {
  return normalizeQuizText(value).replace(/\s+/g, '');
}

function stripLeadingArticle(value: string): string {
  return value.replace(LEADING_ARTICLES, '').trim();
}

export function isTextAnswerCorrect(studentAnswer: string, expectedAnswer: string): boolean {
  const normalizedStudent = normalizeQuizText(studentAnswer);
  const normalizedExpected = normalizeQuizText(expectedAnswer);

  if (!normalizedStudent || !normalizedExpected) {
    return false;
  }

  const studentNoArticle = stripLeadingArticle(normalizedStudent);
  const expectedNoArticle = stripLeadingArticle(normalizedExpected);
  const compactStudent = normalizeQuizTextCompact(studentAnswer);
  const compactExpected = normalizeQuizTextCompact(expectedAnswer);

  return (
    normalizedStudent === normalizedExpected ||
    studentNoArticle === normalizedExpected ||
    normalizedStudent === expectedNoArticle ||
    studentNoArticle === expectedNoArticle ||
    compactStudent === compactExpected ||
    normalizedStudent.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedStudent) ||
    studentNoArticle.includes(expectedNoArticle) ||
    expectedNoArticle.includes(studentNoArticle)
  );
}

export function isQuestionAnswerCorrect(question: QuizQuestion, answer: string): boolean {
  const studentAnswer = (answer || '').trim();
  const expectedAnswer = (question.correct_answer || '').trim();

  if (question.type === 'qcm') {
    return studentAnswer.toLowerCase() === expectedAnswer.toLowerCase();
  }

  return isTextAnswerCorrect(studentAnswer, expectedAnswer);
}

export function evaluateQuizAnswers(
  quiz: Pick<Quiz, 'questions' | 'total_points'>,
  answers: Record<string, string>
): QuizEvaluationResult {
  let rawScore = 0;
  const feedback: Record<string, QuizFeedbackEntry> = {};

  (quiz.questions || []).forEach((question) => {
    const studentAnswer = (answers[question.id] || '').trim();
    const expectedAnswer = (question.correct_answer || '').trim();
    const correct = isQuestionAnswerCorrect(question, studentAnswer);
    const points = correct ? (Number(question.points) || 1) : 0;

    rawScore += points;
    feedback[question.id] = {
      correct,
      points,
      expected: expectedAnswer,
      studentAnswer
    };
  });

  const maxScore = Number(quiz.total_points) || 20;
  const score20 = maxScore > 0 ? Number(((rawScore / maxScore) * 20).toFixed(1)) : 0;

  return {
    rawScore,
    maxScore,
    score20,
    feedback
  };
}

export function formatQuizTime(timeLeftMillis: number | null): string {
  if (timeLeftMillis === null) return '00:00';
  const totalSeconds = Math.max(0, Math.floor(timeLeftMillis / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function getQuizTimeTone(timeLeftMillis: number | null): 'normal' | 'warning' | 'danger' {
  if (timeLeftMillis === null) return 'normal';
  if (timeLeftMillis <= 30_000) return 'danger';
  if (timeLeftMillis <= 120_000) return 'warning';
  return 'normal';
}
