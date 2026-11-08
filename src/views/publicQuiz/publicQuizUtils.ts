import { Quiz, QuizQuestion } from '../../types';
import { formatCorrectReorderAnswer, formatReorderAnswer } from '../../utils/quizReorder';
import { noterQuiz, parseVerbesTrousAnswers, type VerbesTrousAnswerKeyPhrase } from '../../utils/verbesTrous';
import { isTextAnswerCorrect, isQuestionAnswerCorrect, formatTextAnswerForDisplay, formatCorrectTextAnswerForDisplay } from '../../utils/quizAnswerMatcher';

export { isTextAnswerCorrect, isQuestionAnswerCorrect };

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

export function evaluateQuizAnswers(
  quiz: Pick<Quiz, 'questions' | 'total_points'>,
  answers: Record<string, string>
): QuizEvaluationResult {
  let rawScore = 0;
  const feedback: Record<string, QuizFeedbackEntry> = {};

  (quiz.questions || []).forEach((question) => {
    const studentAnswer = (answers[question.id] || '').trim();
    const expectedAnswer = (question.correct_answer || '').trim();
    if (question.type === 'verbes_trous' && question.verbes_trous) {
      const definition = question.verbes_trous;
      const keys = definition.phrases.filter((phrase) => phrase.verbe && Array.isArray(phrase.reponses)) as VerbesTrousAnswerKeyPhrase[];
      const scored = noterQuiz(definition, studentAnswer, keys);
      rawScore += scored.score;
      const parsed = parseVerbesTrousAnswers(studentAnswer);
      feedback[question.id] = {
        correct: scored.score === scored.maxScore,
        points: scored.score,
        expected: keys.map((phrase) => phrase.verbe + ' → ' + phrase.reponses.join(' / ')).join(' · '),
        studentAnswer: definition.phrases.map((phrase) => {
          const value = parsed[String(phrase.id)];
          return (value?.verbe_choisi || '—') + ' → ' + (value?.texte_saisi || '—');
        }).join(' · ')
      };
      return;
    }

    const correct = isQuestionAnswerCorrect(question, studentAnswer);
    const points = correct ? (Number(question.points) || 1) : 0;

    rawScore += points;
    feedback[question.id] = {
      correct,
      points,
      expected: question.type === 'reorder'
        ? formatCorrectReorderAnswer(question)
        : question.type === 'text'
        ? formatCorrectTextAnswerForDisplay(question)
        : expectedAnswer,
      studentAnswer: question.type === 'reorder'
        ? formatReorderAnswer(question, studentAnswer)
        : question.type === 'text'
        ? formatTextAnswerForDisplay(question, studentAnswer)
        : studentAnswer
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
