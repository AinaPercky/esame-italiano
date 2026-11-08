import { Quiz, QuizQuestion } from '../types';

export const DEFAULT_QCM_TIME_SECONDS = 17;
export const DEFAULT_TEXT_TIME_SECONDS = 32;
export const CORRECTION_DISPLAY_SECONDS = 13;

export function getQuestionTimeSeconds(question?: Pick<QuizQuestion, 'type' | 'time_limit_seconds'>): number {
  if (!question) return DEFAULT_QCM_TIME_SECONDS;
  const configuredTime = Number(question.time_limit_seconds);
  if (Number.isFinite(configuredTime) && configuredTime > 0) {
    return Math.max(1, Math.floor(configuredTime));
  }

  return question.type === 'text' || question.type === 'verbes_trous' ? DEFAULT_TEXT_TIME_SECONDS : DEFAULT_QCM_TIME_SECONDS;
}

export function getQuizTotalTimeSeconds(quiz: Pick<Quiz, 'questions' | 'duration_minutes'>): number {
  const questions = quiz.questions || [];
  if (questions.length > 0) {
    return questions.reduce((total, question) => total + getQuestionTimeSeconds(question), 0);
  }

  return Math.max(1, (Number(quiz.duration_minutes) || 10) * 60);
}

export function formatQuizDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) return `${remainder} s`;
  if (remainder === 0) return `${minutes} min`;
  return `${minutes} min ${remainder} s`;
}
