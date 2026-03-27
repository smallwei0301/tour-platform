import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderDb } from '../../src/lib/db.mjs';
import { listAdminOrdersFallback } from '../../src/lib/admin.mjs';

test('admin orders includes margin fields', async () => {
  await createOrderDb({ experienceSlug: 'chaishan-cave-tour' });
  const rows = listAdminOrdersFallback();
  assert.ok(rows.length >= 1);
  assert.equal(typeof rows[0].marginTwd, 'number');
  assert.equal(rows[0].totalTwd - rows[0].costTwd, rows[0].marginTwd);
});
