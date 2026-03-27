import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrder } from '../../src/lib/services.mjs';

test('createOrder success with existing experience', () => {
  const order = createOrder({ experienceSlug: 'chaishan-cave-tour' });
  assert.equal(order.status, 'pending_payment');
  assert.equal(order.totalTwd, 1800);
});

test('createOrder throws when experienceSlug missing', () => {
  assert.throws(() => createOrder({}), /experienceSlug is required/);
});

test('createOrder throws when experience does not exist', () => {
  assert.throws(() => createOrder({ experienceSlug: 'not-found' }), /experience not found/);
});
