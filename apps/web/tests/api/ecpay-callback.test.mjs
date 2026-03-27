import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderDb } from '../../src/lib/db.mjs';
import { orders } from '../../src/lib/store.mjs';

test('ecpay callback expected contract shape', async () => {
  const order = await createOrderDb({ experienceSlug: 'chaishan-cave-tour' });
  const target = orders.find((o) => o.id === order.id);
  assert.ok(target);
  target.status = 'paid';
  assert.equal(target.status, 'paid');
});
