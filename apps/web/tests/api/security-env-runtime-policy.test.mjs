/**
 * Security-env regression guard — Issue #1115 family / credential leak follow-up.
 *
 * `WEAK_TOKEN_VALUES` previously contained a literal copy of a known-weak
 * admin token (committed by accident in older history). The literal has been
 * removed from `apps/web/src/config/security-env.mjs`. We still need to
 * guarantee that production rejects any equivalently-short value via the
 * length floor in `isWeakSecret`, so the security boundary doesn't depend
 * on a string allow-list that itself could leak.
 *
 * This test does NOT include the original literal — re-adding it as a
 * fixture would put the leak right back into source. We test the length
 * floor instead, which catches the original 11-char value plus any
 * future short tokens by construction.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRuntimeSecretPolicy } from '../../src/config/security-env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../../src/config/security-env.mjs');

describe('security-env runtime policy — production secret length + blocklist', () => {
  test('production env with both secrets strong + ≥32/16 chars passes', () => {
    const env = {
      NODE_ENV: 'production',
      GUIDE_SESSION_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', // 34 chars
      ADMIN_ACCESS_TOKEN: 'bbbbbbbbbbbbbbbbbb', // 18 chars
    };
    assert.equal(assertRuntimeSecretPolicy(env), true);
  });

  test('production env with 11-character admin token is rejected (length floor)', () => {
    const env = {
      NODE_ENV: 'production',
      GUIDE_SESSION_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ADMIN_ACCESS_TOKEN: 'x'.repeat(11), // 11 chars; previously the leaked length
    };
    assert.throws(() => assertRuntimeSecretPolicy(env), /SECURITY_ENV_BLOCK/);
  });

  test('production env with 15-character admin token still rejected (just below 16-char floor)', () => {
    const env = {
      NODE_ENV: 'production',
      GUIDE_SESSION_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ADMIN_ACCESS_TOKEN: 'x'.repeat(15),
    };
    assert.throws(() => assertRuntimeSecretPolicy(env), /SECURITY_ENV_BLOCK/);
  });

  test('production env with 31-character guide secret rejected (below 32-char floor)', () => {
    const env = {
      NODE_ENV: 'production',
      GUIDE_SESSION_SECRET: 'x'.repeat(31),
      ADMIN_ACCESS_TOKEN: 'bbbbbbbbbbbbbbbbbb',
    };
    assert.throws(() => assertRuntimeSecretPolicy(env), /SECURITY_ENV_BLOCK/);
  });

  test('production env with WEAK_TOKEN_VALUES placeholder rejected', () => {
    const env = {
      NODE_ENV: 'production',
      GUIDE_SESSION_SECRET: 'guide-dev-secret-change-in-prod', // still in blocklist
      ADMIN_ACCESS_TOKEN: 'changeme',
    };
    assert.throws(() => assertRuntimeSecretPolicy(env), /SECURITY_ENV_BLOCK/);
  });

  test('production env with "your_" prefix rejected', () => {
    const env = {
      NODE_ENV: 'production',
      GUIDE_SESSION_SECRET: 'your_guide_session_secret_should_be_long',
      ADMIN_ACCESS_TOKEN: 'your_admin_token_here',
    };
    assert.throws(() => assertRuntimeSecretPolicy(env), /SECURITY_ENV_BLOCK/);
  });

  test('non-production env is always allowed (development fallback)', () => {
    assert.equal(assertRuntimeSecretPolicy({ NODE_ENV: 'development' }), true);
    assert.equal(assertRuntimeSecretPolicy({}), true);
  });

  test('source file does not contain any historical leaked admin-token literal', () => {
    const src = readFileSync(SRC, 'utf8');
    // We don't quote the original leak inline; we just assert that the
    // identifying ASCII signature (the leaked value's `@Wei` prefix + 7-digit
    // numeric tail format) does NOT appear. If this regex ever matches,
    // someone has re-added a real secret to source.
    assert.doesNotMatch(src, /@Wei\d{6,10}/, 'security-env.mjs must not contain literal `@Wei\\d+` short passwords');
  });
});
