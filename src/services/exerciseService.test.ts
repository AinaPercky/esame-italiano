import test from 'node:test';
import assert from 'node:assert/strict';
import { convertQuizToExercise, parseExerciseJson } from './exerciseService';
import type { Quiz } from '../types';

const validDocument = {
  schema: 'perckylingua.exercise',
  schema_version: 1,
  metadata: { title: 'I verbi', description: '', category: 'Grammaire', level: 'A1' },
  questions: [{
    id: 'q1', type: 'qcm', question: 'Scegli.',
    options: ['sono', 'sei'], correct_answer: 'sono',
    points: 1, time_limit_seconds: 15
  }]
};

test('parseExerciseJson validates the versioned exercise format and mandatory timer', () => {
  const parsed = parseExerciseJson(JSON.stringify(validDocument));
  assert.equal(parsed.metadata.title, 'I verbi');
  assert.equal(parsed.questions[0].time_limit_seconds, 15);
  assert.throws(() => parseExerciseJson(JSON.stringify({
    ...validDocument,
    questions: [{ ...validDocument.questions[0], time_limit_seconds: 0 }]
  })), /temps imparti/i);
});

test('parseExerciseJson rejects unsupported schema versions', () => {
  assert.throws(() => parseExerciseJson(JSON.stringify({
    ...validDocument,
    schema_version: 99
  })), /version 1/i);
});

test('parseExerciseJson rejects an empty title and an empty question list', () => {
  assert.throws(() => parseExerciseJson(JSON.stringify({
    ...validDocument,
    metadata: { ...validDocument.metadata, title: '   ' }
  })), /titre est obligatoire/i);
  assert.throws(() => parseExerciseJson(JSON.stringify({
    ...validDocument,
    questions: []
  })), /au moins une question/i);
});

test('convertQuizToExercise preserves questions and supplies the existing quiz timer default', () => {
  const quiz = {
    id: 'quiz-1',
    title: 'Presente',
    class_id: 'class-1',
    created_at: new Date(0).toISOString(),
    duration_minutes: 2,
    status: 'draft',
    questions: [{
      id: 'q1', type: 'qcm', question: 'Scegli.',
      options: ['sono', 'sei'], correct_answer: 'sono', points: 1
    }],
    total_points: 1
  } as Quiz;
  const converted = convertQuizToExercise(quiz);
  assert.equal(converted.metadata.title, 'Presente');
  assert.equal(converted.questions[0].correct_answer, 'sono');
  assert.ok(Number(converted.questions[0].time_limit_seconds) > 0);
});
