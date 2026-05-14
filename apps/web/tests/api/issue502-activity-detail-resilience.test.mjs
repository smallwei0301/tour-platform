import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldRetryActivityDetailQuery,
  buildCanonicalActivityDetailPath,
} from '../../src/lib/db.mjs';

test('shouldRetryActivityDetailQuery returns true for missing optional column errors', () => {
  assert.equal(
    shouldRetryActivityDetailQuery({ message: 'column activities.social_proof_quotes does not exist' }),
    true,
  );
  assert.equal(
    shouldRetryActivityDetailQuery({ message: "Could not find a relationship between 'activities' and 'guide_profiles'" }),
    true,
  );
});

test('shouldRetryActivityDetailQuery returns false for not found / permission errors', () => {
  assert.equal(shouldRetryActivityDetailQuery({ message: 'JSON object requested, multiple (or no) rows returned' }), false);
  assert.equal(shouldRetryActivityDetailQuery({ message: 'permission denied for table activities' }), false);
});

test('buildCanonicalActivityDetailPath builds two-segment route from region slug + activity slug', () => {
  assert.equal(
    buildCanonicalActivityDetailPath({ slug: 'e2e-accept-test-001', regionSlug: 'taipei', region: '台北市' }),
    '/activities/taipei/e2e-accept-test-001',
  );
});

test('buildCanonicalActivityDetailPath falls back to normalized region when regionSlug is absent', () => {
  assert.equal(
    buildCanonicalActivityDetailPath({ slug: 'dadadaocheng-walk', region: '台北市' }),
    '/activities/taipei/dadadaocheng-walk',
  );
});
