import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getCountedQuizSubmissions, isCountedQuizSubmission, markBestQuizAttempt, type QuizAttemptScore } from './quizBestAttempt';

describe('markBestQuizAttempt', () => {
  it('retient la meilleure note et conserve toutes les tentatives', () => {
    const attempts: QuizAttemptScore[] = [
      { id: 'a1', attempt_number: 1, score_20: 8, submitted_at: '2026-11-01T10:00:00Z' },
      { id: 'a2', attempt_number: 2, score_20: 15, submitted_at: '2026-11-02T10:00:00Z' },
      { id: 'a3', attempt_number: 3, score_20: 12, submitted_at: '2026-11-03T10:00:00Z' }
    ];
    const result = markBestQuizAttempt(attempts);
    assert.equal(result.length, 3);
    assert.deepEqual(result.filter(x => x.is_counted).map(x => x.id), ['a2']);
    assert.equal(attempts.every(x => x.is_counted === undefined), true);
  });

  it('remplace la note de référence lorsque la seconde chance est meilleure', () => {
    const attempts: QuizAttemptScore[] = [
      { id: 'first', attempt_number: 1, score_20: 11 },
      { id: 'retry', attempt_number: 2, score_20: 18 }
    ];
    const result = markBestQuizAttempt(attempts);
    assert.equal(result.find(x => x.is_counted)?.id, 'retry');
  });

  it('ne remplace pas la meilleure note par une tentative moins bonne', () => {
    const attempts: QuizAttemptScore[] = [
      { id: 'first', attempt_number: 1, score_20: 17 },
      { id: 'retry', attempt_number: 2, score_20: 9 }
    ];
    const result = markBestQuizAttempt(attempts);
    assert.equal(result.find(x => x.is_counted)?.id, 'first');
  });

  it('départage les égalités par date, puis par numéro de tentative', () => {
    const attempts: QuizAttemptScore[] = [
      { id: 'old', attempt_number: 1, score_20: 15, submitted_at: '2026-11-01T10:00:00Z' },
      { id: 'new', attempt_number: 2, score_20: 15, submitted_at: '2026-11-02T10:00:00Z' }
    ];
    const result = markBestQuizAttempt(attempts);
    assert.equal(result.find(x => x.is_counted)?.id, 'new');
  });

  it('gère une liste vide', () => {
    assert.deepEqual(markBestQuizAttempt([]), []);
  });
});

describe('counted quiz submissions', () => {
  it('excludes historical attempts explicitly marked as not counted', () => {
    const rows = [
      { id: 'first', score_20: 2.2, is_counted: false },
      { id: 'timeout', score_20: 0, is_counted: false },
      { id: 'best', score_20: 16.9, is_counted: true }
    ];
    assert.deepEqual(getCountedQuizSubmissions(rows).map(row => row.id), ['best']);
  });

  it('keeps legacy rows with no flag while respecting explicit false', () => {
    assert.equal(isCountedQuizSubmission({ is_counted: undefined }), true);
    assert.equal(isCountedQuizSubmission({ is_counted: true }), true);
    assert.equal(isCountedQuizSubmission({ is_counted: false }), false);
  });
});
