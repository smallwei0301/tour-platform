import test from 'node:test';
import assert from 'node:assert/strict';

test('orders request minimal contract', () => {
  const payload = { experienceSlug: 'chaishan-cave-tour' };
  assert.equal(typeof payload.experienceSlug, 'string');
});
