import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyQuizQuestionOrder, shuffleQuizQuestions } from './quizQuestionOrder';
import type { QuizQuestion } from '../types';

const questions: QuizQuestion[] = [
  { id: 'q1', type: 'qcm', question: '1', correct_answer: 'A', points: 1 },
  { id: 'q2', type: 'text', question: '2', correct_answer: 'B', points: 1 },
  { id: 'q3', type: 'reorder', question: '3', correct_answer: '[]', points: 1 }
];

describe('ordre des questions de quiz', () => {
  it('mélange sans muter la liste originale ni perdre de question', () => {
    const originalIds = questions.map(question => question.id);
    const shuffled = shuffleQuizQuestions(questions);
    assert.deepEqual(questions.map(question => question.id), originalIds);
    assert.deepEqual([...shuffled.map(question => question.id)].sort(), [...originalIds].sort());
    assert.notEqual(shuffled, questions);
  });

  it('restaure un ordre sauvegardé uniquement s’il est une permutation complète', () => {
    assert.deepEqual(applyQuizQuestionOrder(questions, ['q3', 'q1', 'q2'])?.map(q => q.id), ['q3', 'q1', 'q2']);
    assert.equal(applyQuizQuestionOrder(questions, ['q1', 'q1', 'q2']), null);
    assert.equal(applyQuizQuestionOrder(questions, ['q1', 'q2']), null);
    assert.equal(applyQuizQuestionOrder(questions, ['q1', 'q2', 'missing']), null);
    assert.equal(applyQuizQuestionOrder(questions, 'q1,q2,q3'), null);
  });
});
