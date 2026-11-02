import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLessonQuizChoices, compactLessonAnswer, isLessonQuizChoiceCorrect } from './lessonQuiz';

test('limite chaque libellé proposé à trois mots maximum', () => {
  assert.equal(compactLessonAnswer('  la   ragazza    parla con lui  '), 'la ragazza parla');
  const choices = buildLessonQuizChoices({ kind: 'choose', data: { options: [{ text: 'Una formula di saluto', correct: true }, 'Una ricetta di cucina'] } });
  assert.deepEqual(choices.map(choice => choice.label), ['Una formula di', 'Una ricetta di']);
  assert.ok(choices.every(choice => choice.label.split(' ').length <= 3));
});

test('construit les choix de surbrillance et identifie les mots cibles', () => {
  const step = { kind: 'highlight', data: { targets: ['a'] } };
  const choices = buildLessonQuizChoices(step, ['Marco', 'a', 'Roma']);
  assert.deepEqual(choices.map(choice => [choice.label, choice.correct]), [['a', true], ['Marco', false], ['Roma', false]]);
  assert.equal(isLessonQuizChoiceCorrect(step, choices[0]), true);
  assert.equal(isLessonQuizChoiceCorrect(step, choices[1]), false);
});

test('utilise la bonne option marquée et respecte la clé de réponse explicite', () => {
  const step = { kind: 'choose', data: { options: [{ text: 'con lui', correct: false }, { text: 'a lei', correct: true }] } };
  const choices = buildLessonQuizChoices(step);
  assert.equal(isLessonQuizChoiceCorrect(step, choices[0]), true);
  assert.equal(isLessonQuizChoiceCorrect(step, choices[1]), false);
});

test('préserve le choix correct lorsque la troncature crée des libellés identiques', () => {
  const choices = buildLessonQuizChoices({ kind: 'choose', data: { options: [
    { text: 'Lei parla spesso con lui', correct: false },
    { text: 'Lei parla spesso con lei', correct: true }
  ] } });
  assert.equal(choices.length, 1);
  assert.equal(choices[0].correct, true);
  assert.equal(choices[0].label.split(' ').length, 3);
});

test('ne propose aucun constructeur de phrase libre en absence de choix', () => {
  assert.deepEqual(buildLessonQuizChoices({ kind: 'free_text', data: {} }), []);
});

test('retombe sur les choix non vides si options est présent mais vide', () => {
  const choices = buildLessonQuizChoices({ kind: 'choose', data: {
    options: [],
    choices: [{ text: 'Avere', correct: false }, { text: 'Essere', correct: true }]
  } });
  assert.deepEqual(choices.map(choice => choice.label), ['Essere', 'Avere']);
});

test('garde le libellé complet de trois mots si short_text en coupe le dernier mot', () => {
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
