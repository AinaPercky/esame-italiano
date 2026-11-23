import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  banqueRestanteMots,
  deplacerOuEchangerMot,
  formatCorrectMotsTrousForDisplay,
  formatMotsTrousAnswerForDisplay,
  normalizeMotsTrousAnswer,
  noterMotsTrous,
  parseMotsTrousAnswers,
  placerMot,
  retirerMot,
  trouverPhraseVideMot,
  validateMotsTrousDefinition
} from './motsTrous';
import { parseJsonWithComments } from './parseJsonWithComments';

const definition = {
  titre: 'Al bar in Italia',
  consigne: 'Glisse chaque mot dans le trou de la phrase correspondante.',
  points_par_phrase: 2,
  banque: ['caffè', 'cornetto', "un'aranciata", 'tè'],
  phrases: [
    { id: 1, debut: 'La mattina bevo un ', fin: ' caldo.', mot: 'caffè' },
    { id: 2, debut: 'Mangio un ', fin: ' alla crema.', mot: 'cornetto' },
    { id: 3, debut: 'Prendo ', fin: ' fresca.', mot: "un'aranciata" }
  ]
};

test('normalise la casse, les espaces et les apostrophes sans effacer les accents', () => {
  assert.equal(normalizeMotsTrousAnswer("  UN’  ARANCIATA "), "un'aranciata");
  assert.equal(normalizeMotsTrousAnswer('  Caffè   Caldo '), 'caffè caldo');
  assert.notEqual(normalizeMotsTrousAnswer('caffe'), normalizeMotsTrousAnswer('caffè'));
  assert.equal(normalizeMotsTrousAnswer('caffe\\u0300'), normalizeMotsTrousAnswer('caffè'));
});

test('note correctement une réponse Unicode visuellement identique en NFC et NFD', () => {
  const decomposed = 'caffe\\u0300';
  const score = noterMotsTrous(definition, { '1': decomposed });
  assert.equal(score.phrases[0].correct, true);
  assert.equal(score.score, 2);
});

test('place un mot, évite les doublons et calcule la banque restante avec pièges', () => {
  const step1 = placerMot({}, 1, 'caffè');
  assert.deepEqual(step1, { '1': 'caffè' });
  const moved = placerMot(step1, 2, 'caffè');
  assert.deepEqual(moved, { '2': 'caffè' });
  assert.deepEqual(banqueRestanteMots(definition.banque, moved), ['cornetto', "un'aranciata", 'tè']);
});

test('déplace ou échange deux mots placés et remet un mot dans la banque', () => {
  const initial = { '1': 'cornetto', '2': 'caffè' };
  const swapped = deplacerOuEchangerMot(initial, 1, 2);
  assert.deepEqual(swapped, { '1': 'caffè', '2': 'cornetto' });
  const movedEmpty = deplacerOuEchangerMot(swapped, 2, 3);
  assert.deepEqual(movedEmpty, { '1': 'caffè', '3': 'cornetto' });
  const removed = retirerMot(movedEmpty, 1);
  assert.deepEqual(removed, { '3': 'cornetto' });
});

test('note avec points_par_phrase configurable, anti-réutilisation et contrôle de banque', () => {
  const full = noterMotsTrous(definition, { '1': 'CAFFÈ', '2': 'cornetto', '3': "un’aranciata" });
  assert.equal(full.score, 6);
  assert.equal(full.maxScore, 6);

  const partial = noterMotsTrous(definition, { '1': 'caffè', '2': 'tè', '3': 'caffè' });
  assert.equal(partial.score, 2);
  assert.deepEqual(partial.phrases.map(p => p.points), [2, 0, 0]);

  const outsideBank = noterMotsTrous(definition, { '1': 'pizza' });
  assert.equal(outsideBank.score, 0);
});

test('gère answer_key séparé (format examen écrit) et affichage formaté', () => {
  const publicDef = {
    points_par_phrase: 1,
    banque: ['caffè', 'cornetto', 'succo'],
    phrases: [
      { id: 1, debut: 'Un ', fin: '.' },
      { id: 2, debut: 'Un ', fin: '.' }
    ]
  };
  const key = [
    { id: 1, debut: 'Un ', fin: '.', mot: 'caffè' },
    { id: 2, debut: 'Un ', fin: '.', mot: 'cornetto' }
  ];
  const score = noterMotsTrous(publicDef, JSON.stringify({ '1': 'caffè' }), key);
  assert.equal(score.score, 1);
  assert.equal(score.maxScore, 2);
  assert.equal(formatMotsTrousAnswerForDisplay(publicDef, { '1': 'caffè' }), '1. caffè · 2. —');
  assert.equal(formatCorrectMotsTrousForDisplay(publicDef, key), '1. caffè · 2. cornetto');
});

test('parse les réponses JSON (directes ou choices) et trouve la première phrase vide', () => {
  const parsed = parseMotsTrousAnswers('{"choices":{"1":{"mot_choisi":"caffè"}}}', definition.phrases);
  assert.deepEqual(parsed, { '1': 'caffè' });
  assert.equal(trouverPhraseVideMot(definition.phrases, parsed), '2');
});

test('valide la configuration mots_trous', () => {
  assert.deepEqual(validateMotsTrousDefinition(definition), []);
  const errs = validateMotsTrousDefinition({
    points_par_phrase: 0,
    banque: ['caffè', 'caffè'],
    phrases: [
      { id: 1, debut: 'A ', fin: '.', mot: 'caffè' },
      { id: 2, debut: 'B ', fin: '.', mot: 'latte' },
      { id: 3, debut: 'C ', fin: '.', mot: 'latte' }
    ] as any
  });
  assert.ok(errs.some(e => e.includes('points_par_phrase')));
  assert.ok(errs.some(e => e.includes('doublons')));
  assert.ok(errs.some(e => e.includes('différent')));
  assert.ok(errs.some(e => e.includes('absents de la banque')));
});

test('le modèle JSONC de documentation quiz-import-template reste valide et documente mots_trous', () => {
  const templatePath = path.resolve(process.cwd(), 'src/data/quiz-import-template.jsonc');
  const raw = fs.readFileSync(templatePath, 'utf8');
  assert.ok(raw.includes('"type": "mots_trous"'));
  const parsed = parseJsonWithComments<{ title: string; questions: unknown[] }>(raw);
  assert.equal(parsed.title, 'La cucina e il cibo');
  assert.equal(parsed.questions.length, 10);
});
