import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
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


test('exercise batch migration keeps answer keys server-side and exposes only authenticated batch RPCs', () => {
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261120200000_batch_exercise_attempts.sql');
  const migration = fs.readFileSync(migrationPath, 'utf8');
  for (const snippet of [
    'CREATE OR REPLACE FUNCTION public.start_exercise_attempt_batch(',
    'CREATE OR REPLACE FUNCTION public.get_exercise_attempt_bundle(',
    'CREATE OR REPLACE FUNCTION public.submit_exercise_attempt_batch(',
    "- 'correct_answer' - 'answers' - 'explanation'",
    'public.exercise_grade_question(v_question, coalesce(v_answer, \'null\'::jsonb))',
    'v_question_start := v_attempt.started_at + make_interval(secs => v_elapsed_seconds)',
    'Une réponse concerne une question dont le délai n’a pas encore commencé.',
    'REVOKE ALL ON FUNCTION public.submit_exercise_attempt_batch(UUID, JSONB) FROM PUBLIC, anon;',
    'GRANT EXECUTE ON FUNCTION public.submit_exercise_attempt_batch(UUID, JSONB) TO authenticated;'
  ]) assert.ok(migration.includes(snippet), 'SQL groupé incomplet : ' + snippet);

  const servicePath = path.resolve(process.cwd(), 'src/services/exerciseService.ts');
  const service = fs.readFileSync(servicePath, 'utf8');
  assert.ok(service.includes("client.rpc('start_exercise_attempt_batch'"));
  assert.ok(service.includes("client.rpc('get_exercise_attempt_bundle'"));
  assert.ok(service.includes("client.rpc('submit_exercise_attempt_batch'"));

  const viewPath = path.resolve(process.cwd(), 'src/views/ExercisesStudentView.tsx');
  const view = fs.readFileSync(viewPath, 'utf8');
  assert.ok(view.includes('exerciseService.submitAttemptBatch(active.attempt_id, nextAnswers)'));
  assert.ok(view.includes("localStorage.setItem('exercise_batch_draft_'"));
});
