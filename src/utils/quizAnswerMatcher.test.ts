import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isTextAnswerCorrect,
  normalizeAnswerText,
  parseStudentAnswers
} from './quizAnswerMatcher';

describe('normalisation des réponses textuelles de quiz', () => {
  it('ignore la casse et normalise les espaces multiples entre les mots', () => {
    assert.equal(normalizeAnswerText('  IO   VADO\tA  SCUOLA  '), 'io vado a scuola');
    assert.equal(isTextAnswerCorrect('IO   VADO A SCUOLA', 'io vado a scuola'), true);
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
