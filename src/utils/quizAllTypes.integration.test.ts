import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateQuizAnswers } from '../views/publicQuiz/publicQuizUtils';
import { calculateQuestionPointsEarned, parseStudentAnswers } from './quizAnswerMatcher';
import { convertQuizToExercise, parseExerciseJson } from '../services/exerciseService';
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
    },
    { id: 'mots-1', type: 'mots_trous', question: 'Completa con le parole della banca.', correct_answer: '', points: 2,
      mots_trous: {
        titre: 'Al bar',
        consigne: 'Glisse chaque mot dans le trou correspondant.',
        points_par_phrase: 1,
        banque: ['caffè', 'cornetto', 'succo'],
        phrases: [
          { id: 1, debut: 'Bevo un ', fin: '.', mot: 'caffè' },
          { id: 2, debut: 'Mangio un ', fin: '.', mot: 'cornetto' }
        ]
      }
    }
  ];

  const quiz = {
    id: 'quiz-all-types',
    title: 'Tutti i tipi',
    class_id: 'class-1',
    created_at: new Date(0).toISOString(),
    duration_minutes: 5,
    status: 'draft',
    questions,
    total_points: 15
  } as Quiz;

  it('corrige ensemble QCM, texte multi-champs, réordonnancement, verbes_trous et mots_trous', () => {
    const textAnswer = JSON.stringify(['vado', 'scuola', 'parlano']);
    const verbAnswer = JSON.stringify({
      '1': { verbe_choisi: 'andare', texte_saisi: 'vado' },
      '2': { verbe_choisi: 'essere', texte_saisi: 'siamo' }
    });
    const motsAnswer = JSON.stringify({ '1': 'caffè', '2': 'cornetto' });
    const result = evaluateQuizAnswers(quiz, {
      'qcm-1': 'B',
      'text-3': textAnswer,
      'reorder-1': JSON.stringify(['i1', 'i2', 'i3']),
      'verbs-1': verbAnswer,
      'mots-1': motsAnswer
    });

    assert.equal(result.rawScore, 15);
    assert.equal(result.maxScore, 15);
    assert.equal(result.score20, 20);
    assert.equal(Object.keys(result.feedback).length, 5);
    assert.equal(result.feedback['text-3'].correct, true);
    assert.equal(result.feedback['verbs-1'].correct, true);
    assert.equal(result.feedback['mots-1'].correct, true);
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
    assert.equal(calculateQuestionPointsEarned(questions[4], JSON.stringify({ '1': 'caffè' })).isFullyCorrect, false);
    assert.equal(calculateQuestionPointsEarned(questions[4], JSON.stringify({ '1': 'caffè' })).awardedPoints, 1);
  });

  it('convertit un quiz avec mots_trous en exercice valide et conservant sa configuration', () => {
    const converted = convertQuizToExercise(quiz);
    const reparsed = parseExerciseJson(JSON.stringify(converted));
    const convertedMots = reparsed.questions.find(q => q.id === 'mots-1');
    assert.ok(convertedMots);
    assert.equal(convertedMots!.type, 'mots_trous');
    assert.equal(convertedMots!.time_limit_seconds, 32);
    assert.equal(convertedMots!.mots_trous?.banque.length, 3);
    assert.equal(convertedMots!.mots_trous?.phrases.length, 2);
  });
});

