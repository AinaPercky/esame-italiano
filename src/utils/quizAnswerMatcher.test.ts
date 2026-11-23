import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isTextAnswerCorrect,
  calculateQuestionPointsEarned,
  normalizeAnswerText,
  parseStudentAnswers
} from './quizAnswerMatcher';

describe('normalisation des réponses textuelles de quiz', () => {
  it('ignore la casse et normalise les espaces multiples entre les mots', () => {
    assert.equal(normalizeAnswerText('  IO   VADO\tA  SCUOLA  '), 'io vado a scuola');
    assert.equal(isTextAnswerCorrect('IO   VADO A SCUOLA', 'io vado a scuola'), true);
  });

  it('accepte les accents Unicode précomposés et décomposés visuellement identiques', () => {
    const expected = 'ventitré';
    const studentAnswer = 'ventitre\u0301';
    assert.notEqual(studentAnswer, expected);
    assert.equal(normalizeAnswerText(studentAnswer), expected);
    assert.equal(isTextAnswerCorrect(studentAnswer, expected), true);
    assert.equal(isTextAnswerCorrect('VENTITRE\u0301', expected), true);
    const question: any = { id: 'unicode-23', type: 'text', question: 'Scrivi 23 in lettere', points: 2, correct_answer: expected };
    const score = calculateQuestionPointsEarned(question, studentAnswer);
    assert.equal(score.isFullyCorrect, true);
    assert.equal(score.awardedPoints, 2);
  });

  it('accepte plusieurs variantes complètes pour une même question et refuse les autres', () => {
    for (const accepted of ['ventitré', '23', 'ventitre\u0301']) {
      assert.equal(isTextAnswerCorrect(accepted, 'ventitré / 23'), true);
    }
    assert.equal(isTextAnswerCorrect('venti', 'ventitré / 23'), false);
    assert.equal(isTextAnswerCorrect('24', 'ventitré / 23'), false);
  });

  it('note les trous multiples lorsque chaque trou possède plusieurs variantes acceptées', () => {
    const question: any = {
      id: 'multi-answers',
      type: 'text',
      question: 'Completa le due risposte',
      points: 4,
      answers: [['sono', 'io sono'], ['ho', 'possiedo']]
    };
    const allAlternatives = calculateQuestionPointsEarned(question, JSON.stringify(['IO SONO', 'possiedo']));
    assert.equal(allAlternatives.isFullyCorrect, true);
    assert.equal(allAlternatives.awardedPoints, 4);
    const oneAlternative = calculateQuestionPointsEarned(question, JSON.stringify(['sono', 'wrong']));
    assert.equal(oneAlternative.isFullyCorrect, false);
    assert.equal(oneAlternative.awardedPoints, 2);
  });

  it('accepte une ponctuation finale omise ou ajoutée', () => {
    assert.equal(isTextAnswerCorrect('io vado a scuola', 'Io vado a scuola.'), true);
    assert.equal(isTextAnswerCorrect('Io vado a scuola!', 'io vado a scuola'), true);
  });

  it('compare la phrase entière et refuse une réponse partielle', () => {
    assert.equal(isTextAnswerCorrect('io vado', 'io vado a scuola'), false);
    assert.equal(isTextAnswerCorrect('io vado a scuola', 'io vado a scuola'), true);
  });

  it('accepte les variantes complètes séparées par slash ou point-virgule, sans tenir compte de la casse', () => {
    assert.equal(isTextAnswerCorrect('IO PARLO', 'io parlo / parlo'), true);
    assert.equal(isTextAnswerCorrect('parlo', 'io parlo; parlo'), true);
  });

  it('conserve l’espace final d’une réponse simple pendant la frappe', () => {
    assert.deepEqual(parseStudentAnswers('Io vado ', 1), ['Io vado ']);
    assert.equal(isTextAnswerCorrect(parseStudentAnswers('Io vado ', 1)[0], 'io vado'), true);
  });

  it('conserve les espaces finaux de chaque case dans les réponses multi-trous', () => {
    const serialized = JSON.stringify(['Io ', 'vado a scuola ']);
    assert.deepEqual(parseStudentAnswers(serialized, 2), ['Io ', 'vado a scuola ']);
  });
});
describe('notation des questions verbes_trous', () => {
  it('attribue séparément le point du verbe et les deux points de conjugaison', () => {
    const question: any = {
      id: 'verbs-1', type: 'verbes_trous', question: 'Verbi riflessivi', points: 6, correct_answer: '',
      verbes_trous: {
        points_par_phrase: 3,
        banque: ['addormentarsi', 'bere', 'dire'],
        phrases: [
          { id: 1, debut: 'Io ', fin: '.', verbe: 'addormentarsi', reponses: ['mi addormento'] },
          { id: 2, debut: 'Noi ', fin: '.', verbe: 'bere', reponses: ['beviamo'] }
        ]
      }
    };
    const answer = JSON.stringify({
      '1': { verbe_choisi: 'addormentarsi', texte_saisi: 'mi addormento' },
      '2': { verbe_choisi: 'dire', texte_saisi: 'beviamo' }
    });
    const result = calculateQuestionPointsEarned(question, answer);
    assert.equal(result.awardedPoints, 5);
    assert.equal(result.maxPoints, 6);
    assert.equal(result.isFullyCorrect, false);
  });
});
