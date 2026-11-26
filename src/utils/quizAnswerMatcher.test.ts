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

  it('accepte les chiffres et les nombres cardinaux italiens équivalents', () => {
    const pairs = [
      ['92', 'novantadue'],
      ['novantadue', '92'],
      ['92', 'novantadue euro'],
      ['92 euro', 'novantadue'],
      ['108', 'centotto'],
      ['180', 'centottanta'],
      ['223', 'duecentoventitré'],
      ['999', 'novecentonovantanove']
    ];
    for (const [student, expected] of pairs) {
      assert.equal(isTextAnswerCorrect(student, expected), true, `${student} should match ${expected}`);
    }
    assert.equal(isTextAnswerCorrect('93', 'novantadue'), false);
    assert.equal(isTextAnswerCorrect('92', 'novantatré'), false);
    assert.equal(isTextAnswerCorrect('novantadue', '93'), false);

    const question: any = {
      id: 'number-92',
      type: 'text',
      question: 'Scrivi in cifre: novantadue',
      points: 2,
      correct_answer: 'novantadue'
    };
    const result = calculateQuestionPointsEarned(question, '92');
    assert.equal(result.isFullyCorrect, true);
    assert.equal(result.awardedPoints, 2);
  });

  it('accepte les nombres en chiffres dans les variantes déclarées', () => {
    assert.equal(isTextAnswerCorrect('92', 'novantadue / novantadue euro'), true);
    assert.equal(isTextAnswerCorrect('92 euro', 'novantadue / 93'), true);
    assert.equal(isTextAnswerCorrect('93', 'novantadue / novantadue euro'), false);
  });

  it('accepte les alternatives séparées par slash, ou, o et oppure', () => {
    for (const expected of [
      'ventiquattro / ventiquattro euro',
      'ventiquattro ou ventiquattro euro',
      'ventiquattro o ventiquattro euro',
      'ventiquattro oppure ventiquattro euro'
    ]) {
      assert.equal(isTextAnswerCorrect('ventiquattro', expected), true, expected);
      assert.equal(isTextAnswerCorrect('ventiquattro euro', expected), true, expected);
    }
    assert.equal(isTextAnswerCorrect('venti', 'ventiquattro ou ventiquattro euro'), false);
    assert.equal(isTextAnswerCorrect('venticinque', 'ventiquattro oppure ventiquattro euro'), false);
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


describe('distinction entre variantes acceptées et cases multiples', () => {
  it('traite une liste plate de réponses comme des variantes d’une seule réponse', () => {
    const question: any = {
      id: 'single-answer-variants', type: 'text', question: 'Scrivi il risultato in lettere',
      points: 2, answers: ['trentatré', 'trentatré euro']
    };
    for (const answer of ['trentatré', 'trentatré euro']) {
      const result = calculateQuestionPointsEarned(question, answer);
      assert.equal(result.isFullyCorrect, true, answer);
      assert.equal(result.awardedPoints, 2, answer);
      assert.equal(result.totalBlanks, 1, answer);
    }
  });

  it('conserve les vrais trous multiples représentés par des tableaux imbriqués', () => {
    const question: any = {
      id: 'two-blanks-variants', type: 'text', question: 'Completa le due forme',
      points: 4, answers: [['parlo', 'io parlo'], ['scrivi', 'tu scrivi']]
    };
    const full = calculateQuestionPointsEarned(question, JSON.stringify(['io parlo', 'scrivi']));
    const partial = calculateQuestionPointsEarned(question, JSON.stringify(['parlo', 'wrong']));
    assert.equal(full.awardedPoints, 4);
    assert.equal(full.totalBlanks, 2);
    assert.equal(partial.awardedPoints, 2);
    assert.equal(partial.isFullyCorrect, false);
  });

  it('préserve les anciens exercices à plusieurs cases déclarées explicitement', () => {
    const question: any = {
      id: 'legacy-explicit-blanks', type: 'text', question: 'Completa',
      points: 4, blank_count: 2, answers: ['parlo', 'scrivi']
    };
    const result = calculateQuestionPointsEarned(question, JSON.stringify(['parlo', 'scrivi']));
    assert.equal(result.isFullyCorrect, true);
    assert.equal(result.totalBlanks, 2);
  });

  it('ne confond pas les variantes avec une réponse partielle', () => {
    const question: any = {
      id: 'wrong-variant', type: 'text', question: 'Scrivi il risultato',
      points: 2, answers: ['trentatré', 'trentatré euro']
    };
    const result = calculateQuestionPointsEarned(question, 'trentatr');
    assert.equal(result.awardedPoints, 0);
    assert.equal(result.isFullyCorrect, false);
  });
});


describe('régression QCM et anciennes réponses dupliquées', () => {
  it('traite deux réponses identiques enregistrées comme une seule réponse attendue', () => {
    const question: any = {
      id: 'duplicate-single-answer', type: 'text', question: 'Calcola 9 × 5',
      points: 2, blank_count: 2, answers: ['quarantacinque', 'quarantacinque']
    };
    const result = calculateQuestionPointsEarned(question, 'quarantacinque');
    assert.equal(result.isFullyCorrect, true);
    assert.equal(result.awardedPoints, 2);
    assert.equal(result.totalBlanks, 1);
  });

  it('accepte le libellé ou l’identifiant de la bonne option QCM', () => {
    const byId: any = {
      id: 'qcm-id', type: 'qcm', question: 'QCM', points: 2,
      correct_answer: 'opt-a',
      options: [{ id: 'opt-a', label: 'Quarantacinque' }, { id: 'opt-b', label: 'Cinquantacinque' }]
    };
    assert.equal(calculateQuestionPointsEarned(byId, 'opt-a').awardedPoints, 2);
    assert.equal(calculateQuestionPointsEarned(byId, 'Quarantacinque').awardedPoints, 2);
    const byLabel: any = { ...byId, correct_answer: 'Quarantacinque' };
    assert.equal(calculateQuestionPointsEarned(byLabel, 'opt-a').awardedPoints, 2);
    assert.equal(calculateQuestionPointsEarned(byLabel, 'Quarantacinque').awardedPoints, 2);
    assert.equal(calculateQuestionPointsEarned(byLabel, 'Cinquantacinque').awardedPoints, 0);
  });
  it('déduit six cases indépendantes depuis l’énoncé lorsque blank_count manque', () => {
    const question: any = {
      id: 'legacy-six-blanks',
      type: 'text',
      question: 'Io dorm___ otto ore. Tu part___ domani. Luca apr___ la porta. Noi sent___ la musica. Voi segu___ il corso. Loro copr___ il tavolo.',
      points: 6,
      answers: ['o', 'i', 'e', 'iamo', 'ite', 'ono']
    };
    const result = calculateQuestionPointsEarned(question, JSON.stringify(['O', 'i', 'e', 'iamo', 'ite', 'sbagliato']));
    assert.deepEqual(result, {
      awardedPoints: 5, maxPoints: 6, isFullyCorrect: false,
      partialCorrectCount: 5, totalBlanks: 6
    });
  });

  it('décompose une ancienne réponse multi-trous stockée comme une seule chaîne séparée par slash', () => {
    const question: any = {
      id: 'legacy-six-blanks-delimited', type: 'text',
      question: 'Io dorm___ otto ore. Tu part___ domani. Luca apr___ la porta. Noi sent___ la musica. Voi segu___ il corso. Loro copr___ il tavolo.',
      points: 6, answers: ['o / i / e / iamo / ite / ono']
    };
    const result = calculateQuestionPointsEarned(question, JSON.stringify(['O', 'i', 'e', 'iamo', 'ite', 'ono']));
    assert.equal(result.isFullyCorrect, true);
    assert.equal(result.awardedPoints, 6);
    assert.equal(result.totalBlanks, 6);
  });

  it('ne transforme pas une liste de variantes en cases lorsque l’énoncé ne contient qu’un trou', () => {
    const question: any = {
      id: 'one-blank-two-variants', type: 'text',
      question: 'Scrivi la forma: Io ___', points: 2,
      answers: ['parlo', 'io parlo']
    };
    assert.equal(calculateQuestionPointsEarned(question, 'io parlo').awardedPoints, 2);
    assert.equal(calculateQuestionPointsEarned(question, 'io parlo').totalBlanks, 1);
  });

});
