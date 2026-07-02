import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 健檢 v2（docs/operations/reports/repo-health-audit-20260702.md S2）：
// admin token 與 guide HMAC 簽章比對必須為常數時間，避免 timing side-channel。
// 共用實作：src/lib/constant-time.mjs（edge-safe 純 JS，middleware 可用）。

const __dirname = dirname(fileURLToPath(import.meta.url));

const { constantTimeEquals } = await import('../../src/lib/constant-time.mjs');
const { isAdminAuthorized } = await import('../../src/lib/admin-auth.mjs');
const { createGuideSessionCookies, verifyGuideSession } = await import('../../src/lib/guide-auth.ts');

describe('constantTimeEquals', () => {
  it('returns true for identical strings', () => {
    assert.equal(constantTimeEquals('secret-token-123', 'secret-token-123'), true);
  });

  it('returns false for same-length different strings', () => {
    assert.equal(constantTimeEquals('secret-token-123', 'secret-token-124'), false);
  });

  it('returns false for different-length strings', () => {
    assert.equal(constantTimeEquals('short', 'a-much-longer-string'), false);
    assert.equal(constantTimeEquals('a-much-longer-string', 'short'), false);
  });

  it('handles empty strings', () => {
    assert.equal(constantTimeEquals('', ''), true);
    assert.equal(constantTimeEquals('', 'x'), false);
  });

  it('coerces non-string input safely instead of throwing', () => {
    assert.equal(constantTimeEquals(undefined, 'x'), false);
    assert.equal(constantTimeEquals(null, null), true);
  });
});

describe('isAdminAuthorized still behaves correctly with constant-time compare', () => {
  const base = {
    requiredToken: 'admin-token-abcdef',
    allowlistRaw: 'ops@example.com',
    expectedSessionVersion: 1,
    sessionVersion: 1,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };

  it('authorizes a valid token + allowlisted email', () => {
    const r = isAdminAuthorized({ ...base, token: 'admin-token-abcdef', email: 'ops@example.com' });
    assert.equal(r.ok, true);
  });

  it('rejects an invalid token', () => {
    const r = isAdminAuthorized({ ...base, token: 'admin-token-abcdeg', email: 'ops@example.com' });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'invalid token');
  });

  it('rejects a truncated token (different length)', () => {
    const r = isAdminAuthorized({ ...base, token: 'admin-token', email: 'ops@example.com' });
    assert.equal(r.ok, false);
  });
});

describe('source contract: comparisons use constantTimeEquals, not !==', () => {
  const adminAuthSrc = readFileSync(resolve(__dirname, '../../src/lib/admin-auth.mjs'), 'utf8');
  const guideAuthSrc = readFileSync(resolve(__dirname, '../../src/lib/guide-auth.ts'), 'utf8');

  it('admin-auth.mjs compares token via constantTimeEquals', () => {
    assert.match(adminAuthSrc, /constantTimeEquals\(\s*token\s*,\s*requiredToken\s*\)/);
    assert.ok(!/token\s*!==\s*requiredToken/.test(adminAuthSrc), 'must not use short-circuit !== for token compare');
  });

  it('guide-auth.ts verifies HMAC signature via constantTimeEquals', () => {
    assert.match(guideAuthSrc, /constantTimeEquals\(\s*sig\s*,\s*expected\s*\)/);
    assert.ok(!/sig\s*!==\s*expected/.test(guideAuthSrc), 'must not use short-circuit !== for signature compare');
  });

  it('guide-auth.ts verifyPassword reuses the shared helper', () => {
    assert.match(guideAuthSrc, /from '\.\/constant-time\.mjs'/);
  });
});

describe('verifyGuideSession behavior with constant-time compare', () => {
  function requestWithCookies(cookies) {
    const cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ');
    return new Request('http://localhost/api/guide/x', { headers: { cookie: cookieHeader } });
  }

  it('accepts a validly signed session cookie', () => {
    const cookies = createGuideSessionCookies('guide-1', '阿偉', 3, false);
    const session = verifyGuideSession(requestWithCookies(cookies));
    assert.ok(session);
    assert.equal(session.guideId, 'guide-1');
  });

  it('rejects a tampered signature', () => {
    const cookies = createGuideSessionCookies('guide-1', '阿偉', 3, false);
    const tampered = cookies.map((c) =>
      c.startsWith('guide_token=')
        ? c.replace(/=([^;]*)/, (m, v) => {
            const parts = decodeURIComponent(v).split(':');
            const sig = parts[2];
            const flipped = (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1);
            return `=${encodeURIComponent(`${parts[0]}:${parts[1]}:${flipped}`)}`;
          })
        : c,
    );
    assert.equal(verifyGuideSession(requestWithCookies(tampered)), null);
  });
});
