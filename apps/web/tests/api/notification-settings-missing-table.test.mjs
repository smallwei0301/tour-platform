import test from 'node:test';
import assert from 'node:assert/strict';

import { isMissingTableError } from '../../src/lib/missing-table-error.mjs';

// Regression for the production error:
//   "Could not find the table 'public.notification_event_settings' in the schema cache"
// Before the migration is applied, the matrix gateway must fail-open (default
// all-on) instead of throwing — see getNotificationOverridesDb.

test('isMissingTableError matches the PostgREST schema-cache miss', () => {
  assert.equal(
    isMissingTableError({ message: "Could not find the table 'public.notification_event_settings' in the schema cache" }),
    true,
  );
  assert.equal(isMissingTableError({ code: 'PGRST205', message: 'whatever' }), true);
  assert.equal(isMissingTableError({ code: '42P01' }), true);
  assert.equal(isMissingTableError({ message: 'relation "notification_event_settings" does not exist' }), true);
});

test('isMissingTableError does NOT match unrelated errors', () => {
  assert.equal(isMissingTableError({ message: 'permission denied' }), false);
  assert.equal(isMissingTableError({ code: '23505', message: 'duplicate key' }), false);
  assert.equal(isMissingTableError(null), false);
  assert.equal(isMissingTableError({ message: 'column foo does not exist' }), false);
});

test('db.mjs getNotificationOverridesDb fails open on missing table (source-contract)', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', '..', 'src', 'lib', 'db.mjs'), 'utf8');
  assert.match(src, /isMissingTableError/, 'db.mjs should import the missing-table guard');
  // the read helper must return {} (not throw) when the table is absent
  assert.match(src, /isMissingTableError\(error\)\)\s*return \{\}/);
});
