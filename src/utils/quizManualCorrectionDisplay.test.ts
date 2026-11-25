import test from 'node:test';
import assert from 'node:assert/strict';
import { QuizQuestion } from '../types';
import {
  buildQuestionCorrectionBreakdown,
  hasStudentResponse,
  resolveQuickScoreOptions
} from './quizManualCorrectionDisplay';

test('décode une question QCM avec options textuelles ou objets {id, label} et index', () => {
  const qString: QuizQuestion = {
    id: 'q1',
    type: 'qcm',
    question: 'Quale verbo significa "être" ?',
    options: ['Avere', 'Essere', 'Fare'],
    correct_answer: '1',
    points: 2
  };
  const b1 = buildQuestionCorrectionBreakdown(qString, '1');
  assert.equal(b1.type, 'qcm');
  if (b1.type === 'qcm') {
    assert.equal(b1.studentDisplay, 'Essere');
    assert.equal(b1.expectedDisplay, 'Essere');
    assert.equal(b1.isCorrect, true);
  }

  const qObj = {
    id: 'q2',
    type: 'qcm',
    question: 'Scegli la forma corretta',
    options: [
      { id: 'opt-a', label: 'Io sono' },
      { id: 'opt-b', label: 'Io siamo' }
    ],
    correct_answer: 'opt-a',
    points: 2
  } as unknown as QuizQuestion;

  const b2 = buildQuestionCorrectionBreakdown(qObj, 'opt-b');
  assert.equal(b2.type, 'qcm');
  if (b2.type === 'qcm') {
    assert.equal(b2.studentDisplay, 'Io siamo');
    assert.equal(b2.expectedDisplay, 'Io sono');
    assert.equal(b2.isCorrect, false);
    assert.equal(b2.options[0].isExpected, true);
    assert.equal(b2.options[1].isSelected, true);
  }
});

test('décode les réponses textuelles simples (avec équivalence numérique) et multi-cases', () => {
  const qSingle: QuizQuestion = {
    id: 'q-num',
    type: 'text',
    question: 'Quanti anni ha?',
    correct_answer: 'novantadue',
    points: 2
  };
  const bSingle = buildQuestionCorrectionBreakdown(qSingle, '92');
  assert.equal(bSingle.type, 'text');
  if (bSingle.type === 'text') {
    assert.equal(bSingle.isMultiBlank, false);
    assert.equal(bSingle.slots[0].isCorrect, true);
    assert.equal(bSingle.slots[0].studentValue, '92');
    assert.equal(bSingle.slots[0].expectedValue, 'novantadue');
  }

  const qMulti: QuizQuestion = {
    id: 'q-multi',
    type: 'text',
    question: 'Completa: ___ e ___',
    answers: ['trentatré', 'quaranta'],
    blank_count: 2,
    correct_answer: 'trentatré | quaranta',
    points: 2
  };
  const bMulti = buildQuestionCorrectionBreakdown(qMulti, JSON.stringify(['trentatré', 'cinquanta']));
  assert.equal(bMulti.type, 'text');
  if (bMulti.type === 'text') {
    assert.equal(bMulti.isMultiBlank, true);
    assert.equal(bMulti.slots.length, 2);
    assert.equal(bMulti.slots[0].isCorrect, true);
    assert.equal(bMulti.slots[1].isCorrect, false);
    assert.equal(bMulti.slots[1].expectedValue, 'quaranta');
  }
});

test('décode une question de réordonnement en libellés lisibles avec comparaison positionnelle', () => {
  const qReorder: QuizQuestion = {
    id: 'q-reo',
    type: 'reorder',
    question: 'Remets la phrase dans l’ordre',
    items: [
      { id: 'i1', text: 'Ciao' },
      { id: 'i2', text: 'come' },
      { id: 'i3', text: 'stai?' }
    ],
    correct_answer: JSON.stringify(['i1', 'i2', 'i3']),
    points: 3
  };
  const breakdown = buildQuestionCorrectionBreakdown(qReorder, JSON.stringify(['i1', 'i3', 'i2']));
  assert.equal(breakdown.type, 'reorder');
  if (breakdown.type === 'reorder') {
    assert.equal(breakdown.isAllMatch, false);
    assert.equal(breakdown.studentSummary, 'Ciao → stai? → come');
    assert.equal(breakdown.expectedSummary, 'Ciao → come → stai?');
    assert.equal(breakdown.items[0].isMatch, true);
    assert.equal(breakdown.items[1].isMatch, false);
  }
});

test('décode verbes_trous dans les deux formats de payload ({choices, saisies} et map par id)', () => {
  const qVerbes: QuizQuestion = {
    id: 'q-vt',
    type: 'verbes_trous',
    question: 'Completa i verbi',
    correct_answer: '',
    points: 6,
    verbes_trous: {
      points_par_phrase: 3,
      banque: ['svegliarsi', 'lavarsi'],
      phrases: [
        { id: 10, debut: 'Io ', fin: ' alle 7.', verbe: 'svegliarsi', reponses: ['mi sveglio'] },
        { id: 11, debut: 'Tu ', fin: ' le mani.', verbe: 'lavarsi', reponses: ['ti lavi'] }
      ]
    }
  };

  // Format 1: { choices, saisies } indexé par position
  const b1 = buildQuestionCorrectionBreakdown(
    qVerbes,
    JSON.stringify({ choices: { 0: 'svegliarsi', 1: 'lavarsi' }, saisies: { 0: 'mi sveglio', 1: 'ti lava' } })
  );
  assert.equal(b1.type, 'verbes_trous');
  if (b1.type === 'verbes_trous') {
    assert.equal(b1.phrases[0].isVerbCorrect, true);
    assert.equal(b1.phrases[0].isConjugationCorrect, true);
    assert.equal(b1.phrases[0].pointsEarned, 3);
    assert.equal(b1.phrases[1].isVerbCorrect, true);
    assert.equal(b1.phrases[1].isConjugationCorrect, false);
    assert.equal(b1.phrases[1].pointsEarned, 1);
    assert.equal(b1.totalEarned, 4);
  }

  // Format 2: map par id { "10": { verbe_choisi, texte_saisi } }
  const b2 = buildQuestionCorrectionBreakdown(
    qVerbes,
    JSON.stringify({ '10': { verbe_choisi: 'svegliarsi', texte_saisi: 'mi sveglio' } })
  );
  assert.equal(b2.type, 'verbes_trous');
  if (b2.type === 'verbes_trous') {
    assert.equal(b2.phrases[0].chosenVerb, 'svegliarsi');
    assert.equal(b2.phrases[0].pointsEarned, 3);
    assert.equal(b2.phrases[1].chosenVerb, '');
    assert.equal(b2.phrases[1].pointsEarned, 0);
  }
});

test('décode mots_trous de manière lisible phrase par phrase', () => {
  const qMots: QuizQuestion = {
    id: 'q-mt',
    type: 'mots_trous',
    question: 'Al bar',
    correct_answer: '',
    points: 2,
    mots_trous: {
      points_par_phrase: 1,
      banque: ['caffè', 'cornetto'],
      phrases: [
        { id: 1, debut: 'Bevo un ', fin: '.', mot: 'caffè' },
        { id: 2, debut: 'Mangio un ', fin: '.', mot: 'cornetto' }
      ]
    }
  };
  const breakdown = buildQuestionCorrectionBreakdown(qMots, JSON.stringify({ '1': 'caffè', '2': 'caffè' }));
  assert.equal(breakdown.type, 'mots_trous');
  if (breakdown.type === 'mots_trous') {
    assert.equal(breakdown.phrases[0].isCorrect, true);
    assert.equal(breakdown.phrases[0].pointsEarned, 1);
    assert.equal(breakdown.phrases[1].isCorrect, false);
    assert.equal(breakdown.phrases[1].expectedWord, 'cornetto');
    assert.equal(breakdown.totalEarned, 1);
  }
});

test('détecte les réponses vides et génère les raccourcis de notation rapide', () => {
  assert.equal(hasStudentResponse(''), false);
  assert.equal(hasStudentResponse(JSON.stringify({ choices: {}, saisies: {} })), false);
  assert.equal(hasStudentResponse(JSON.stringify(['', ' '])), false);
  assert.equal(hasStudentResponse(JSON.stringify(['ciao', ''])), true);

  const opts3 = resolveQuickScoreOptions(3, 1);
  assert.deepEqual(opts3.map(o => o.value), [0, 1, 1.5, 3]);

  const opts2 = resolveQuickScoreOptions(2, 2);
  assert.deepEqual(opts2.map(o => o.value), [0, 1, 2]);
});
