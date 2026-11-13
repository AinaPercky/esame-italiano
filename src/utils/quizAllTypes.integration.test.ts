import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateQuizAnswers } from '../views/publicQuiz/publicQuizUtils';
import { calculateQuestionPointsEarned, parseStudentAnswers } from './quizAnswerMatcher';
import type { Quiz, QuizQuestion } from '../types';

describe('intégration du moteur de correction – tous les types de quiz', () => {
  const questions: QuizQuestion[] = [
    { id: 'qcm-1', type: 'qcm', question: 'Scegli.', options: ['A', 'B'], correct_answer: 'B', points: 2 },
    { id: 'text-3', type: 'text', question: 'Io ___ a ___ e loro ___.', correct_answer: 'vado | scuola | parlano', points: 3 },
    { id: 'reorder-1', type: 'reorder', question: 'Riordina.', items: [
      { id: 'i1', text: 'Io' }, { id: 'i2', text: 'vado' }, { id: 'i3', text: 'a scuola' }
    ], correct_answer: JSON.stringify(['i1', 'i2', 'i3']), points: 2 },
    { id: 'verbs-1', type: 'verbes_trous', question: 'Completa i verbi.', correct_answer: '', points: 6,
      verbes_trous: { banque: ['andare', 'essere'], points_par_phrase: 3, phrases: [
        { id: 1, debut: 'Io ', fin: '.', verbe: 'andare', reponses: ['vado'] },
        { id: 2, debut: 'Noi ', fin: '.', verbe: 'essere', reponses: ['siamo'] }
      ] }
    }
  ];

  const quiz = { questions, total_points: 13 } as Pick<Quiz, 'questions' | 'total_points'>;

  it('corrige ensemble QCM, texte multi-champs, réordonnancement et verbes_trous', () => {
    const textAnswer = JSON.stringify(['vado', 'scuola', 'parlano']);
    const verbAnswer = JSON.stringify({
      '1': { verbe_choisi: 'andare', texte_saisi: 'vado' },
      '2': { verbe_choisi: 'essere', texte_saisi: 'siamo' }
    });
    const result = evaluateQuizAnswers(quiz, {
      'qcm-1': 'B',
      'text-3': textAnswer,
      'reorder-1': JSON.stringify(['i1', 'i2', 'i3']),
      'verbs-1': verbAnswer
    });

    assert.equal(result.rawScore, 13);
    assert.equal(result.maxScore, 13);
    assert.equal(result.score20, 20);
    assert.equal(Object.keys(result.feedback).length, 4);
    assert.equal(result.feedback['text-3'].correct, true);
    assert.equal(result.feedback['verbs-1'].correct, true);
  });

  it('attribue un score partiel sur les trois champs texte sans perdre les réponses', () => {
    const answer = JSON.stringify(['vado', 'errato', 'parlano']);
    const result = calculateQuestionPointsEarned(questions[1], answer);
    assert.deepEqual(parseStudentAnswers(answer, 3), ['vado', 'errato', 'parlano']);
    assert.equal(result.totalBlanks, 3);
    assert.equal(result.partialCorrectCount, 2);
    assert.equal(result.awardedPoints, 2);
    assert.equal(result.isFullyCorrect, false);
  });

  it('refuse les réponses incomplètes pour les types structurés', () => {
    assert.equal(calculateQuestionPointsEarned(questions[0], '').isFullyCorrect, false);
    assert.equal(calculateQuestionPointsEarned(questions[2], JSON.stringify(['i1'])).isFullyCorrect, false);
    assert.equal(calculateQuestionPointsEarned(questions[3], '').isFullyCorrect, false);
  });
});
