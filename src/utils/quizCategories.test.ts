import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeQuizCategory, QUIZ_CATEGORIES } from '../types';

describe('catégorie de quiz Thème', () => {
  it('utilise le libellé court dans les catégories disponibles', () => {
    assert.ok(QUIZ_CATEGORIES.includes('Thème'));
    assert.equal(QUIZ_CATEGORIES.some(category => category.startsWith('Thème (')), false);
  });

  it('convertit les anciennes valeurs vers Thème', () => {
    assert.equal(normalizeQuizCategory('Thème'), 'Thème');
    assert.equal(normalizeQuizCategory('Thème (traduction FR → IT)'), 'Thème');
    assert.equal(normalizeQuizCategory('Thème (traduction IT → FR)'), 'Thème');
    assert.equal(normalizeQuizCategory('Thème (traduction IT -> FR)'), 'Thème');
  });

  it('garde Autre comme valeur de repli pour les catégories inconnues', () => {
    assert.equal(normalizeQuizCategory('Catégorie non reconnue'), 'Autre');
    assert.equal(normalizeQuizCategory(null), 'Autre');
  });
});
