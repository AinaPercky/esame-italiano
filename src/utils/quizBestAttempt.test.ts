import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aggregateCumulativeQuizGrades, getCountedQuizSubmissions, isCountedQuizSubmission, markBestQuizAttempt, type QuizAttemptScore } from './quizBestAttempt';

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

  it('préfère une vraie tentative à une ligne missed en cas d’égalité à zéro', () => {
    const attempts: QuizAttemptScore[] = [
      { id: 'completed-zero', attempt_number: 1, score_20: 0, status: 'completed', submitted_at: '2026-11-01T10:00:00Z' },
      { id: 'missed-zero', attempt_number: 2, score_20: 0, status: 'missed', submitted_at: '2026-11-02T10:00:00Z' }
    ];
    const result = markBestQuizAttempt(attempts);
    assert.equal(result.find(x => x.is_counted)?.id, 'completed-zero');
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

describe('cumulative class quiz grades', () => {
  it('counts each quiz once across dates and calculates a weighted average', () => {
    const rows = [
      { id: 'q1-old', student_id: 'student-a', class_id: 'class-a', quiz_id: 'quiz-1', score: 2, max_score: 10, score_20: 4, is_counted: false, submitted_at: '2026-10-01T10:00:00Z' },
      { id: 'q1-best', student_id: 'student-a', class_id: 'class-a', quiz_id: 'quiz-1', score: 8, max_score: 10, score_20: 16, is_counted: true, submitted_at: '2026-10-03T10:00:00Z' },
      { id: 'q1-duplicate', student_id: 'student-a', class_id: 'class-a', quiz_id: 'quiz-1', score: 7, max_score: 10, score_20: 14, is_counted: true, submitted_at: '2026-10-02T10:00:00Z' },
      { id: 'q2', student_id: 'student-a', class_id: 'class-a', quiz_id: 'quiz-2', score: 9, max_score: 30, score_20: 6, is_counted: true, submitted_at: '2026-11-01T10:00:00Z' },
      { id: 'other-class', student_id: 'student-a', class_id: 'class-b', quiz_id: 'quiz-1', score: 5, max_score: 10, score_20: 10, is_counted: true }
    ];
    const result = aggregateCumulativeQuizGrades(rows);
    const classA = result.find(row => row.class_id === 'class-a');
    const classB = result.find(row => row.class_id === 'class-b');

    assert.equal(result.length, 2);
    assert.equal(classA?.quizzes_count, 2);
    assert.deepEqual(classA?.submissions.map(row => row.id).sort(), ['q1-best', 'q2']);
    assert.equal(classA?.total_score, 17);
    assert.equal(classA?.total_possible, 40);
    assert.equal(classA?.average_score_20, 8.5);
    assert.equal(classB?.quizzes_count, 1);
    assert.equal(classB?.average_score_20, 10);
  });

  it('keeps a legitimate zero score and excludes non-counted attempts', () => {
    const result = aggregateCumulativeQuizGrades([
      { id: 'zero', student_id: 'student-a', class_id: 'class-a', quiz_id: 'quiz-1', score: 0, max_score: 20, score_20: 0, is_counted: true },
      { id: 'retry-not-counted', student_id: 'student-a', class_id: 'class-a', quiz_id: 'quiz-1', score: 18, max_score: 20, score_20: 18, is_counted: false }
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].quizzes_count, 1);
    assert.equal(result[0].average_score_20, 0);
  });

  it('returns no ranking row when the student has no counted quiz', () => {
    assert.deepEqual(aggregateCumulativeQuizGrades([
      { id: 'ignored', student_id: 'student-a', class_id: 'class-a', quiz_id: 'quiz-1', score: 18, max_score: 20, score_20: 18, is_counted: false }
    ]), []);
  });
});
