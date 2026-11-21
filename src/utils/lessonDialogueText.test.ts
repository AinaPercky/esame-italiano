import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDialogueEmphasisRange,
  buildDialogueSegments,
  getDialogueWords,
  removeDialogueEmphasisAtWord
} from './lessonDialogueText';

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

test('regroupe une plage de mots soulignée, encadrée ou entourée avec ses espaces et sa ponctuation intermédiaire', () => {
  const { segments } = buildDialogueSegments('Ciao Sara ! Dove studi', [
    { line_index: 0, word_index: 1, text: 'Sara', style: 'circle', color: 'green', group_id: 'g1' },
    { line_index: 0, word_index: 2, text: 'Dove', style: 'circle', color: 'green', group_id: 'g1' }
  ]);
  const group = segments.find(seg => seg.kind === 'emphasis-group');
  assert.ok(group && group.kind === 'emphasis-group');
  assert.equal(group.style, 'circle');
  assert.equal(group.color, 'green');
  assert.equal(group.tokens.map(t => t.raw).join(''), 'Sara ! Dove');
});

test('garde séparés deux groupes adjacents portant un group_id distinct même avec le même style et la même couleur', () => {
  const { segments } = buildDialogueSegments('ho mangiato una mela', [
    { line_index: 0, word_index: 0, text: 'ho', style: 'outline', color: 'blue', group_id: 'g1' },
    { line_index: 0, word_index: 1, text: 'mangiato', style: 'outline', color: 'blue', group_id: 'g1' },
    { line_index: 0, word_index: 2, text: 'una', style: 'outline', color: 'blue', group_id: 'g2' },
    { line_index: 0, word_index: 3, text: 'mela', style: 'outline', color: 'blue', group_id: 'g2' }
  ]);
  const groups = segments.filter(seg => seg.kind === 'emphasis-group');
  assert.equal(groups.length, 2);
  assert.equal(groups[0].kind === 'emphasis-group' ? groups[0].tokens.map(t => t.raw).join('') : '', 'ho mangiato');
  assert.equal(groups[1].kind === 'emphasis-group' ? groups[1].tokens.map(t => t.raw).join('') : '', 'una mela');
});

test('applyDialogueEmphasisRange et removeDialogueEmphasisAtWord appliquent puis annulent tout un groupe sans toucher aux autres', () => {
  const words = getDialogueWords('Ieri ho mangiato una mela');
  let marks = applyDialogueEmphasisRange([], {
    lineIndex: 0,
    startIndex: 1,
    endIndex: 2,
    words,
    color: 'green',
    style: 'underline',
    groupId: 'grp-1'
  });
  marks = applyDialogueEmphasisRange(marks, {
    lineIndex: 0,
    startIndex: 3,
    endIndex: 4,
    words,
    color: 'blue',
    style: 'circle',
    groupId: 'grp-2'
  });
  assert.equal(marks.length, 4);

  const removal = removeDialogueEmphasisAtWord(marks, 0, 2);
  assert.equal(removal.removed, true);
  assert.equal(removal.marks.length, 2);
  assert.deepEqual(removal.marks.map(m => m.text), ['una', 'mela']);
});
