import test from 'node:test';
import assert from 'node:assert/strict';
import { isGuidedQuizComplete } from './lessonProgress';

const steps = [{ id: 'step-1' }, { id: 'step-2' }];

test('déverrouille uniquement lorsque toutes les étapes guidées attendues sont terminées', () => {
  assert.equal(isGuidedQuizComplete(steps, ['step-1']), false);
  assert.equal(isGuidedQuizComplete(steps, ['step-1', 'step-2']), true);
});

test('ne compte pas les identifiants de progression obsolètes comme des étapes actuelles', () => {
  assert.equal(isGuidedQuizComplete(steps, ['old-step-1', 'old-step-2']), false);
});

test('préserve l’accès aux leçons déjà enregistrées comme terminées avant le quiz guidé', () => {
  assert.equal(isGuidedQuizComplete(steps, [], 'done'), true);
});

test('n’exige aucune étape lorsqu’une leçon n’a pas de quiz guidé', () => {
  assert.equal(isGuidedQuizComplete([], []), true);
});
