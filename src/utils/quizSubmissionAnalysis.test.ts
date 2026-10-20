import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { QuizQuestion, QuizSubmission } from '../types';
import { analyzeSubmissionQuestion, submissionHasDetailedAnswerData } from './quizSubmissionAnalysis';

const question: QuizQuestion = {
  id: 'q1',
  type: 'qcm',
  question: 'Choisissez la réponse correcte.',
  options: ['A', 'B'],
  correct_answer: 'A',
  points: 2
};

const makeSubmission = (overrides: Partial<QuizSubmission> = {}): QuizSubmission => ({
  id: 'sub-1',
  quiz_id: 'quiz-1',
  quiz_title: 'Quiz test',
  student_id: 'student-1',
  student_name: 'Élève Test',
  class_id: 'class-1',
  started_at: '2026-10-20T08:00:00.000Z',
  answers: {},
  score: 0,
  max_score: 2,
  score_20: 0,
  status: 'completed',
  date: '2026-10-20',
  ...overrides
});

describe('analyse des réponses de quiz sauvegardées', () => {
  it('affiche une question laissée blanche si la copie contient des réponses détaillées à d’autres questions', () => {
    const submission = makeSubmission({ answers: { q2: 'réponse donnée' } });
    const result = analyzeSubmissionQuestion(question, submission);

    assert.ok(result);
    assert.equal(result.answer, 'Aucune réponse saisie');
    assert.equal(result.correct, false);
    assert.equal(result.points, 0);
    assert.equal(result.maxPoints, 2);
  });

  it('utilise le feedback de correction historique même si answers est vide', () => {
    const submission = makeSubmission({
      answers: {},
      feedback: {
        q1: { correct: true, points: 2, expected: 'A', studentAnswer: 'A' }
      }
    });
    const result = analyzeSubmissionQuestion(question, submission);

    assert.ok(result);
    assert.equal(result.answer, 'A');
    assert.equal(result.correct, true);
    assert.equal(result.points, 2);
  });

  it('ne fabrique pas de réponses quand une ancienne copie ne stocke que sa note', () => {
    const submission = makeSubmission({ answers: {}, feedback: {} });

    assert.equal(submissionHasDetailedAnswerData(submission), false);
    assert.equal(analyzeSubmissionQuestion(question, submission), null);
  });

  it('traite une valeur persistée non textuelle comme une chaîne vide sans interrompre le dashboard', () => {
    const submission = makeSubmission({ answers: { q1: null as unknown as string } });
    const result = analyzeSubmissionQuestion(question, submission);

    assert.ok(result);
    assert.equal(result.answer, 'Aucune réponse saisie');
    assert.equal(result.points, 0);
  });
});
