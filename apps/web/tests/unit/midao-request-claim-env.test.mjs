import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { assertRuntimeSecretPolicy } from '../../src/config/security-env.mjs';
import { validateStartupEnv } from '../../src/config/startup-env.mjs';

const validPepper = () => randomBytes(32).toString('base64url');
const productionEnv = (overrides = {}) => ({
  NODE_ENV: 'production',
  GUIDE_SESSION_SECRET: 'g'.repeat(32),
  ADMIN_ACCESS_TOKEN: 'a'.repeat(16),
  MIDAO_REQUEST_CLAIM_PEPPER: validPepper(),
  ...overrides,
});

test('production runtime policy fails closed unless the dedicated claim pepper is canonical 32-byte base64url', () => {
  assert.equal(assertRuntimeSecretPolicy(productionEnv()), true);
  for (const pepper of [undefined, 'a'.repeat(43), 'local-test-only-midao-request-claim-pepper', randomBytes(31).toString('base64url')]) {
    assert.throws(
      () => assertRuntimeSecretPolicy(productionEnv({ MIDAO_REQUEST_CLAIM_PEPPER: pepper })),
      /MIDAO_REQUEST_CLAIM_PEPPER/u,
    );
  }
});

test('production startup admission reports the dedicated claim pepper rather than accepting a generic long secret', () => {
  assert.equal(validateStartupEnv(productionEnv()).ok, true);
  const result = validateStartupEnv(productionEnv({ MIDAO_REQUEST_CLAIM_PEPPER: 'x'.repeat(43) }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map((entry) => entry.key), ['MIDAO_REQUEST_CLAIM_PEPPER']);
});
