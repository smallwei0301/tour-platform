import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

// AC3: Migration file
test('AC3: migration file exists and references rating_avg column', async () => {
  const src = await readSource('../../supabase/migrations/20260511_issue300_activity_rating_signal.sql');
  assert.match(src, /rating_avg/, 'Migration should reference rating_avg column');
});

test('AC3: migration adds CHECK constraint for rating_avg range', async () => {
  const src = await readSource('../../supabase/migrations/20260511_issue300_activity_rating_signal.sql');
  assert.match(src, /CHECK/, 'Migration should add a CHECK constraint');
  assert.match(src, /rating_avg >= 0/, 'CHECK should enforce lower bound 0');
  assert.match(src, /rating_avg <= 5/, 'CHECK should enforce upper bound 5');
});

test('AC3: migration allows NULL for rating_avg', async () => {
  const src = await readSource('../../supabase/migrations/20260511_issue300_activity_rating_signal.sql');
  assert.match(src, /IS NULL/, 'CHECK constraint must allow NULL rating_avg');
});

test('AC3: migration references review_count column with DEFAULT 0', async () => {
  const src = await readSource('../../supabase/migrations/20260511_issue300_activity_rating_signal.sql');
  assert.match(src, /review_count/, 'Migration should reference review_count');
  assert.match(src, /DEFAULT 0/, 'review_count should have DEFAULT 0');
});

test('AC3: migration is idempotent using ADD COLUMN IF NOT EXISTS', async () => {
  const src = await readSource('../../supabase/migrations/20260511_issue300_activity_rating_signal.sql');
  assert.match(src, /ADD COLUMN IF NOT EXISTS/, 'Should use IF NOT EXISTS for idempotency');
});
