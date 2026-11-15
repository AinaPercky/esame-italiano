import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261115110000_lock_completed_quiz_until_teacher_retry.sql', import.meta.url),
  'utf8'
);

describe('completed quiz lock migration', () => {
  it('only returns active launches for pending or present participants', () => {
    assert.match(migration, /p\.presence_status IN \('pending', 'present'\)/);
    assert.match(migration, /p\.presence_status = 'retry_authorized' AND p\.presence_confirmed_at IS NULL/);
  });

  it('marks the participant completed after the quiz is submitted', () => {
    assert.match(migration, /SET presence_status = 'completed'/);
    assert.match(migration, /attendance_locked_at = coalesce\(attendance_locked_at, now\(\)\)/);
  });

  it('keeps the submission RPC restricted to authenticated users', () => {
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.submit_quiz_presence_submission\(JSONB\) FROM PUBLIC, anon/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.submit_quiz_presence_submission\(JSONB\) TO authenticated/);
  });
});
