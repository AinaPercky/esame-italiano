import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLessonOrderItems,
  buildLessonQuizChoices,
  getLessonExpectedOrder,
  isLessonFreeTextCorrect,
  isLessonOrderCorrect,
  isLessonQuizChoiceCorrect,
  moveLessonOrderItem,
  normalizeLessonAnswer,
  normalizeLessonText,
} from './lessonQuiz';

test('conserve les libellés complets au-delà de trois mots', () => {
  assert.equal(normalizeLessonText('  la   ragazza    parla con lui  '), 'la ragazza parla con lui');
  const choices = buildLessonQuizChoices({ kind: 'choose', data: { options: [
    { text: 'Una formula di saluto molto importante', correct: true },
    'Una ricetta tradizionale della cucina italiana'
  ] } });
  assert.deepEqual(choices.map(choice => choice.label), [
    'Una formula di saluto molto importante',
    'Una ricetta tradizionale della cucina italiana'
  ]);
});

test('construit les choix de surbrillance et identifie les mots cibles', () => {
  const step = { kind: 'highlight', data: { targets: ['a'] } };
  const choices = buildLessonQuizChoices(step, ['Marco', 'a', 'Roma']);
  assert.deepEqual(choices.map(choice => [choice.label, choice.correct]), [['a', true], ['Marco', false], ['Roma', false]]);
  assert.equal(isLessonQuizChoiceCorrect(step, choices[0]), true);
  assert.equal(isLessonQuizChoiceCorrect(step, choices[1]), false);
});

test('préfère les options highlight du JSON aux mots du dialogue source', () => {
  const step = { kind: 'highlight', data: { targets: ['studiato'], options: ['Ho', 'studiato', 'italiano'] } };
  const choices = buildLessonQuizChoices(step, ['Ciao', 'Ho', 'studiato', 'italiano', 'ieri']);
  assert.deepEqual(choices.map(choice => [choice.label, choice.correct]), [
    ['studiato', true], ['Ho', false], ['italiano', false]
  ]);
  assert.equal(isLessonQuizChoiceCorrect(step, choices[0]), true);
});

test('utilise la bonne option marquée et respecte la clé de réponse explicite', () => {
  const step = { kind: 'choose', data: { options: [{ text: 'con lui', correct: false }, { text: 'a lei', correct: true }] } };
  const choices = buildLessonQuizChoices(step);
  assert.equal(isLessonQuizChoiceCorrect(step, choices[0]), true);
  assert.equal(isLessonQuizChoiceCorrect(step, choices[1]), false);
});

test('ne fusionne pas des réponses complètes uniquement parce que leur début est identique', () => {
  const choices = buildLessonQuizChoices({ kind: 'choose', data: { options: [
    { text: 'Lei parla spesso con lui', correct: false },
    { text: 'Lei parla spesso con lei', correct: true }
  ] } });
  assert.equal(choices.length, 2);
  assert.deepEqual(choices.map(choice => choice.label), ['Lei parla spesso con lei', 'Lei parla spesso con lui']);
});

test('retombe sur les choix non vides si options est présent mais vide', () => {
  const choices = buildLessonQuizChoices({ kind: 'choose', data: {
    options: [],
    choices: [{ text: 'Avere', correct: false }, { text: 'Essere', correct: true }]
  } });
  assert.deepEqual(choices.map(choice => choice.label), ['Essere', 'Avere']);
});

test('conserve le libellé complet verbe de mouvement', () => {
  const choices = buildLessonQuizChoices({ kind: 'choose', data: { options: [
    { text: 'Verbe de mouvement', short_text: 'Verbe de', correct: true }
  ] } });
  assert.equal(choices[0].label, 'Verbe de mouvement');
  assert.equal(choices[0].value, 'Verbe de mouvement');
});

test('un tableau de distracteurs vide ne masque pas les choix de formule', () => {
  const choices = buildLessonQuizChoices({ kind: 'build_formula', data: {
    options: [{ text: 'Avoir seulement', correct: false }],
    distractors: [],
    correct_answer: 'Essere o avere',
  } });
  assert.deepEqual(choices.map(choice => choice.label), ['Essere o avere', 'Avoir seulement']);
});

test('corrige une réponse rédigée complète, longue et tolérante à la casse, aux accents et aux espaces', () => {
  const step = { kind: 'free_text', data: { correct_answer: 'Ieri sono andata al mercato con mia sorella.' } };
  assert.equal(isLessonFreeTextCorrect(step, '  IERI   SONO ANDATA AL MERCATO CON MIA SORELLA  '), true);
  assert.equal(isLessonFreeTextCorrect(step, 'Ieri sono andata al mercato'), false);
});

test('accepte les variantes de réponse rédigée déclarées par l’enseignant', () => {
  const step = { kind: 'free_text', data: { accepted_answers: ['Noi siamo andati a Roma', 'Noi siamo andate a Roma'] } };
  assert.equal(isLessonFreeTextCorrect(step, 'Noi siamo andate a Roma.'), true);
  assert.equal(isLessonFreeTextCorrect(step, 'Noi siamo andato a Roma'), false);
});

test('accepte une réponse libre non vide quand aucune clé de correction n’est déclarée', () => {
  assert.equal(isLessonFreeTextCorrect({ kind: 'free_text', data: {} }, 'Una risposta completa di più parole'), true);
  assert.equal(isLessonFreeTextCorrect({ kind: 'free_text', data: {} }, '   '), false);
});

test('construit des éléments d’ordre et valide correct_order', () => {
  const data = {
    items: ['Tagliamo la cipolla', 'Scaldiamo l’olio', 'Serviamo la pasta'],
    correct_order: ['Scaldiamo l’olio', 'Tagliamo la cipolla', 'Serviamo la pasta']
  };
  assert.equal(buildLessonOrderItems(data).length, 3);
  assert.deepEqual(getLessonExpectedOrder(data), data.correct_order);
  assert.equal(isLessonOrderCorrect(data, data.correct_order), true);
  assert.equal(isLessonOrderCorrect(data, ['Tagliamo la cipolla', 'Scaldiamo l’olio', 'Serviamo la pasta']), false);
});

test('déduit l’ordre attendu des propriétés order/position des éléments', () => {
  const data = { items: [
    { id: 'last', text: 'Servire', order: 3 },
    { id: 'first', text: 'Preparare', order: 1 },
    { id: 'middle', text: 'Cuocere', order: 2 }
  ] };
  assert.deepEqual(getLessonExpectedOrder(data), ['Preparare', 'Cuocere', 'Servire']);
  assert.equal(isLessonOrderCorrect(data, ['Preparare', 'Cuocere', 'Servire']), true);
});

test('ne bloque pas un réordonnancement sans clé de correction', () => {
  const data = { items: ['A', 'B', 'C'] };
  assert.equal(isLessonOrderCorrect(data, ['C', 'A', 'B']), true);
});

test('déplace les éléments dans les deux sens et ignore les indices invalides', () => {
  assert.deepEqual(moveLessonOrderItem(['A', 'B', 'C', 'D'], 2, 0), ['C', 'A', 'B', 'D']);
  assert.deepEqual(moveLessonOrderItem(['A', 'B', 'C', 'D'], 0, 3), ['B', 'C', 'D', 'A']);
  const items = ['A', 'B'];
  assert.equal(moveLessonOrderItem(items, -1, 1), items);
});

test('normalise une réponse sans couper les mots', () => {
  assert.equal(normalizeLessonAnswer('  È   VERAMENTE   IMPORTANTE!  '), 'e veramente importante');
});
