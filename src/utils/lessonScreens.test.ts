import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScreens, getFirstDiscoveryScreenIndex, getFirstLessonScreenIndex, lessonScreenSegment } from './lessonScreens';
import type { Lesson, LessonBlock } from '../types/lessons';

function makeLesson(blocks: LessonBlock[], method: Lesson['method'] = 'inductive'): Lesson {
  return {
    id: 'lesson-1', slug: 'test', type: 'grammaire', level: 'A1', duration_min: 10,
    title_it: 'Titolo', title_fr: 'Titre', objective: 'Objectif', status: 'published', method,
    sort_order: 0, access: 'free', created_at: '', updated_at: '', blocks
  };
}

const dialogue: LessonBlock = { id: 'dialogue', type: 'dialogue', content: { lines: [] } };
const stepBlocks = Array.from({ length: 6 }, (_, index): LessonBlock => ({
  id: `quiz-${index}`, type: 'discovery', content: { steps: [{ id: `step-${index}`, kind: 'choose', prompt: `Question ${index + 1}` }] }
}));

test('buildScreens construit dialogue, six questions, quatre écrans de cours et écran final (12)', () => {
  const blocks: LessonBlock[] = [
    dialogue,
    ...stepBlocks,
    { id: 'formula', type: 'formula', content: {} },
    { id: 'exceptions', type: 'exceptions', content: {} },
    { id: 'chips', type: 'chips', content: {} },
    { id: 'recap', type: 'recap', content: {} }
  ];
  const screens = buildScreens(makeLesson(blocks));
  assert.equal(screens.length, 12);
  assert.deepEqual(screens.map(screen => screen.kind), [
    'dialogue', 'step', 'step', 'step', 'step', 'step', 'step', 'part', 'part', 'part', 'part', 'done'
  ]);
  assert.equal(screens[0].kind, 'dialogue');
  assert.equal(screens[1].kind, 'step');
  if (screens[1].kind === 'step') {
    assert.equal(screens[1].stepIndex, 1);
    assert.equal(screens[1].total, 6);
  }
  assert.equal(getFirstDiscoveryScreenIndex(screens), 1);
  assert.equal(getFirstLessonScreenIndex(screens), 7);
  assert.equal(lessonScreenSegment(screens[0]), 'dialogue');
  assert.equal(lessonScreenSegment(screens[1]), 'discovery');
  assert.equal(lessonScreenSegment(screens[7]), 'lesson');
});

test('les blocs dialogue sont présentés avant les questions et les parties suivent leur ordre JSON relatif', () => {
  const screens = buildScreens(makeLesson([
    { id: 'formula', type: 'formula', content: {} },
    stepBlocks[0],
    dialogue,
    { id: 'chips', type: 'chips', content: {} }
  ]));
  assert.deepEqual(screens.slice(0, 4).map(screen => screen.kind), ['dialogue', 'step', 'part', 'part']);
  assert.deepEqual(screens.filter(screen => screen.kind === 'part').map(screen => screen.kind === 'part' ? screen.block.id : ''), ['formula', 'chips']);
});

test('les callouts s’attachent à l’écran précédent sans devenir un écran distinct', () => {
  const tip: LessonBlock = { type: 'tip', content: { text: 'Conseil' } };
  const screens = buildScreens(makeLesson([dialogue, tip, ...stepBlocks.slice(0, 1), { id: 'formula', type: 'formula', content: {} }, tip]));
  assert.equal(screens.length, 4);
  assert.equal(screens[0].kind, 'dialogue');
  if (screens[0].kind === 'dialogue') assert.equal(screens[0].extras.length, 1);
  const formulaScreen = screens.find(screen => screen.kind === 'part');
  assert.ok(formulaScreen && formulaScreen.kind === 'part');
  if (formulaScreen?.kind === 'part') assert.equal(formulaScreen.extras.length, 1);
});

test('en mode direct sans dialogue ni quiz, conserve les écrans de cours et la fin', () => {
  const screens = buildScreens(makeLesson([
    { id: 'rule', type: 'rule_cards', content: {} },
    { id: 'recap', type: 'recap', content: {} }
  ], 'direct'));
  assert.deepEqual(screens.map(screen => screen.kind), ['part', 'part', 'done']);
  assert.equal(getFirstDiscoveryScreenIndex(screens), 2);
  assert.equal(getFirstLessonScreenIndex(screens), 0);
});

test('en mode direct, les blocs discovery éventuels ne deviennent pas des écrans quiz', () => {
  const screens = buildScreens(makeLesson([dialogue, stepBlocks[0], { id: 'rule', type: 'formula', content: {} }], 'direct'));
  assert.deepEqual(screens.map(screen => screen.kind), ['dialogue', 'part', 'done']);
});

test('en mode direct, le dialogue précède les règles sans écran de découverte', () => {
  const screens = buildScreens(makeLesson([
    { id: 'rule', type: 'formula', content: {} },
    dialogue,
    { id: 'recap', type: 'recap', content: {} }
  ], 'direct'));
  assert.deepEqual(screens.map(screen => screen.kind), ['dialogue', 'part', 'part', 'done']);
  assert.equal(screens[0].kind, 'dialogue');
});
