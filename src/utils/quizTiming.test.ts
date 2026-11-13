import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatQuizDuration, getQuestionTimeSeconds, getQuizTotalTimeSeconds } from './quizTiming';

describe('chronométrage des quiz', () => {
  it('applique les durées configurées et les valeurs par défaut par type', () => {
    assert.equal(getQuestionTimeSeconds({ type: 'qcm' }), 17);
    assert.equal(getQuestionTimeSeconds({ type: 'text' }), 32);
    assert.equal(getQuestionTimeSeconds({ type: 'verbes_trous' }), 32);
    assert.equal(getQuestionTimeSeconds({ type: 'reorder' }), 17);
    assert.equal(getQuestionTimeSeconds({ type: 'qcm', time_limit_seconds: 8 }), 8);
    assert.equal(getQuestionTimeSeconds({ type: 'text', time_limit_seconds: 0 }), 32);
  });

  it('calcule la durée totale à partir de chaque question plutôt que duration_minutes', () => {
    assert.equal(getQuizTotalTimeSeconds({
      duration_minutes: 60,
      questions: [
        { id: '1', type: 'qcm', question: '', correct_answer: 'A', points: 1, time_limit_seconds: 8 },
        { id: '2', type: 'text', question: '', correct_answer: 'B', points: 1, time_limit_seconds: 25 },
        { id: '3', type: 'verbes_trous', question: '', correct_answer: '', points: 3, time_limit_seconds: 40,
          verbes_trous: { banque: ['fare'], phrases: [{ id: 1, debut: '', fin: '', verbe: 'fare', reponses: ['faccio'] }] } }
      ]
    }), 73);
  });

  it('formate correctement les durées affichées', () => {
    assert.equal(formatQuizDuration(8), '8 s');
    assert.equal(formatQuizDuration(60), '1 min');
    assert.equal(formatQuizDuration(125), '2 min 5 s');
    assert.equal(formatQuizDuration(-1), '0 s');
  });
});
