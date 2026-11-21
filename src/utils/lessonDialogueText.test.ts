import test from 'node:test';
import assert from 'node:assert/strict';
import { getDialogueWords } from './lessonDialogueText';

test('récupère les mots dans le bon ordre malgré la ponctuation', () => {
  assert.deepEqual(getDialogueWords('Ieri, ho mangiato una mela!'), [
    'Ieri', 'ho', 'mangiato', 'una', 'mela'
  ]);
});

test('reconnaît les accents italiens et les lettres Unicode', () => {
  assert.deepEqual(getDialogueWords("È già l’ora dell’acqua: perché?"), [
    'È', 'già', 'l', 'ora', 'dell', 'acqua', 'perché'
  ]);
});

test('retourne une liste vide pour un texte vide ou sans mot', () => {
  assert.deepEqual(getDialogueWords(''), []);
  assert.deepEqual(getDialogueWords('... — 123'), []);
});

test('les index d’une expression correspondent aux mots visibles du dialogue', () => {
  const words = getDialogueWords('Ieri ho mangiato una mela rossa.');
  const startIndex = words.indexOf('ho');
  const endIndex = words.indexOf('mela');
  assert.deepEqual(words.slice(startIndex, endIndex + 1), ['ho', 'mangiato', 'una', 'mela']);
});
