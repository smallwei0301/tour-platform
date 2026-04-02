import test from 'node:test';
import assert from 'node:assert/strict';

test('homepage to experience link smoke placeholder', () => {
  const routes = ['/', '/experiences/chaishan-cave-tour'];
  assert.equal(routes.length, 2);
});
