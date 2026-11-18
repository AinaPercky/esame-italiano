import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ORAL_EXAM_DURATION_SECONDS,
  MAX_ORAL_EXAM_DURATION_SECONDS,
  MIN_ORAL_EXAM_DURATION_SECONDS,
  formatOralExamTime,
  getOralExamCheckpoint,
  normalizeOralExamDurationSeconds
} from './oralExamTiming';

test('normalise la durée par défaut et les limites configurables', () => {
  assert.equal(normalizeOralExamDurationSeconds(undefined), DEFAULT_ORAL_EXAM_DURATION_SECONDS);
  assert.equal(normalizeOralExamDurationSeconds(Number.NaN), DEFAULT_ORAL_EXAM_DURATION_SECONDS);
  assert.equal(normalizeOralExamDurationSeconds(20), MIN_ORAL_EXAM_DURATION_SECONDS);
  assert.equal(normalizeOralExamDurationSeconds(180), 180);
  assert.equal(normalizeOralExamDurationSeconds(9000), MAX_ORAL_EXAM_DURATION_SECONDS);
});

test('formate correctement le temps écoulé ou restant', () => {
  assert.equal(formatOralExamTime(0), '00:00');
  assert.equal(formatOralExamTime(65), '01:05');
  assert.equal(formatOralExamTime(3600), '60:00');
});

test('déclenche les alertes uniquement aux seuils définis', () => {
  assert.equal(getOralExamCheckpoint(60), 60);
  assert.equal(getOralExamCheckpoint(30), 30);
  assert.equal(getOralExamCheckpoint(10), 10);
  assert.equal(getOralExamCheckpoint(59), null);
  assert.equal(getOralExamCheckpoint(0), null);
});
