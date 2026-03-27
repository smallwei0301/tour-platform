import test from 'node:test';
import assert from 'node:assert/strict';
import { listExperiences } from '../../src/lib/services.mjs';

test('listExperiences returns at least one fixture', () => {
  const list = listExperiences();
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 1);
  assert.equal(list[0].slug, 'chaishan-cave-tour');
});
