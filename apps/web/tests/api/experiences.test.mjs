import test from 'node:test';
import assert from 'node:assert/strict';
import { listExperiencesDb } from '../../src/lib/db.mjs';

test('listExperiencesDb returns fallback fixture when supabase env missing', async () => {
  const list = await listExperiencesDb();
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 1);
  assert.equal(list[0].slug, 'chaishan-cave-tour');
});
