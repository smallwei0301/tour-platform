import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderDb } from '../../src/lib/db.mjs';

test('createOrderDb success with fallback store', async () => {
  const order = await createOrderDb({ experienceSlug: 'chaishan-cave-tour' });
  assert.equal(order.status, 'pending_payment');
  assert.equal(order.totalTwd, 1800);
});

test('createOrderDb throws when experienceSlug missing', async () => {
  await assert.rejects(() => createOrderDb({}), /experienceSlug is required/);
});

test('createOrderDb throws when experience does not exist', async () => {
  await assert.rejects(() => createOrderDb({ experienceSlug: 'not-found' }), /experience not found/);
});
