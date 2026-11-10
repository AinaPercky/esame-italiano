import test from 'node:test';
import assert from 'node:assert/strict';
import { QUIZ_PRESENCE_ATTEMPTS_MIGRATION_SQL, QUIZ_PRESENCE_STUDENT_INITIALIZATION_MIGRATION_SQL } from '../data/quizPresenceMigration';
import { getPresenceInitializationRemainingSeconds } from './quizPresence';


test('the presence migration upgrades legacy tables instead of relying on CREATE TABLE IF NOT EXISTS', () => {
  const migration = QUIZ_PRESENCE_ATTEMPTS_MIGRATION_SQL;
  assert.match(migration, /ADD COLUMN IF NOT EXISTS launch_id UUID/i);
  assert.match(migration, /uq_quiz_participants_launch_student/i);
  assert.match(migration, /quiz_participants_presence_status_check/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS launched_by UUID/i);
});

test('presence initialization counts down from the student-specific server deadline', () => {
  const now = Date.parse('2026-11-03T18:00:00.000Z');
  const deadline = '2026-11-03T18:00:10.000Z';

  assert.equal(getPresenceInitializationRemainingSeconds(deadline, now), 10);
  assert.equal(getPresenceInitializationRemainingSeconds(deadline, now + 4_001), 6);
  assert.equal(getPresenceInitializationRemainingSeconds(deadline, now + 9_001), 1);
});

test('presence initialization is over at or after the participant deadline', () => {
  const deadline = '2026-11-03T18:00:10.000Z';
  const deadlineMs = Date.parse(deadline);

  assert.equal(getPresenceInitializationRemainingSeconds(deadline, deadlineMs - 1), 1);
  assert.equal(getPresenceInitializationRemainingSeconds(deadline, deadlineMs), 0);
  assert.equal(getPresenceInitializationRemainingSeconds(deadline, deadlineMs + 1), 0);
});

test('an invalid server deadline does not hold the student in initialization', () => {
  assert.equal(getPresenceInitializationRemainingSeconds('invalid-deadline', Date.now()), 0);
});

test('the follow-up migration stores the deadline per participant at confirmation, not at teacher launch', () => {
  const migration = QUIZ_PRESENCE_STUDENT_INITIALIZATION_MIGRATION_SQL;
  const launchFunction = migration.match(/CREATE OR REPLACE FUNCTION public\.launch_quiz_with_presence[\s\S]*?\$\$;/)?.[0] || '';
  const confirmationFunction = migration.match(/CREATE OR REPLACE FUNCTION public\.confirm_quiz_presence[\s\S]*?\$\$;/)?.[0] || '';
  const closeFunction = migration.match(/CREATE OR REPLACE FUNCTION public\.close_quiz_with_presence[\s\S]*?\$\$;/)?.[0] || '';
  const submissionFunction = migration.match(/CREATE OR REPLACE FUNCTION public\.submit_quiz_presence_submission[\s\S]*?\$\$;/)?.[0] || '';

  assert.match(migration, /ALTER TABLE public\.quiz_participants\s+ADD COLUMN IF NOT EXISTS presence_deadline_at TIMESTAMPTZ/i);
  assert.match(migration, /ALTER COLUMN presence_deadline_at DROP NOT NULL/i);
  assert.match(launchFunction, /INSERT INTO public\.quiz_launches \(quiz_id, launched_by, status\)/i);
  assert.doesNotMatch(launchFunction, /interval '10 seconds'/i);
  assert.match(confirmationFunction, /v_clicked_at := clock_timestamp\(\)/i);
  assert.match(confirmationFunction, /presence_deadline_at = COALESCE/i);
  assert.match(confirmationFunction, /interval '10 seconds'/i);
  assert.match(confirmationFunction, /used_at = v_clicked_at/i);
  assert.match(closeFunction, /presence_status = 'retry_authorized' AND presence_confirmed_at IS NULL\) THEN 'absent'/i);
  assert.match(closeFunction, /presence_status = 'retry_authorized' AND presence_confirmed_at IS NOT NULL THEN 'timeout'/i);
  assert.match(closeFunction, /WHERE quiz_submissions\.status = 'missed'/i);
  assert.match(closeFunction, /SET launch_id = NULL[\s\S]*?used_at IS NULL/i);
  assert.doesNotMatch(submissionFunction, /UPDATE public\.quiz_retry_grants/i);
});
