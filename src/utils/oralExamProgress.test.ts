import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOralClassAverage, normalizeOralScoreTo20 } from './oralExamProgress';

describe('oral exam score normalization', () => {
  it('normalizes different session scales to 20', () => {
    assert.equal(normalizeOralScoreTo20(12, 15), 16);
    assert.equal(normalizeOralScoreTo20(16, 20), 16);
    assert.equal(normalizeOralScoreTo20(8, 10), 16);
  });

  it('rejects invalid scores and missing score scales', () => {
    assert.equal(normalizeOralScoreTo20(10, 0), null);
    assert.equal(normalizeOralScoreTo20(-1, 20), null);
    assert.equal(normalizeOralScoreTo20(Number.NaN, 20), null);
    assert.equal(normalizeOralScoreTo20(10, Number.POSITIVE_INFINITY), null);
  });
});

describe('oral exam class average', () => {
  const sessions = [
    { classId: 'class-a', score: 12, maxScore: 15 },
    { classId: 'class-a', score: 16, maxScore: 20 },
    { classId: 'class-a', score: 8, maxScore: 10 },
    { classId: 'class-b', score: 10, maxScore: 20 },
    { classId: 'class-a', score: 4, maxScore: 0 }
  ];

  it('calculates an equal-weight average after normalization', () => {
    assert.deepEqual(calculateOralClassAverage(sessions, 'class-a'), {
      average: 16,
      sessionCount: 3,
      normalizedScores: [16, 16, 16]
    });
  });

  it('keeps class results isolated', () => {
    assert.deepEqual(calculateOralClassAverage(sessions, 'class-b'), {
      average: 10,
      sessionCount: 1,
      normalizedScores: [10]
    });
  });

  it('returns an empty result when a class has no valid sessions', () => {
    assert.deepEqual(calculateOralClassAverage(sessions, 'class-c'), {
      average: null,
      sessionCount: 0,
      normalizedScores: []
    });
  });
});
