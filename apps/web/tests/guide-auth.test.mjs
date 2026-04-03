import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Dynamic import for TS → use compiled or inline JS equivalent
// Run via: node --experimental-strip-types --test tests/guide-auth.test.mjs
// or: npx tsx tests/guide-auth.test.mjs (if tsx available)
// For CI we test the compiled output.

const {
  generateInviteToken,
  isInviteTokenExpired,
  hashPassword,
  verifyPassword,
  createGuideSessionCookies,
  verifyGuideSession,
  maskEmail,
} = await import('../src/lib/guide-auth.ts').catch(() =>
  import('../src/lib/guide-auth.js'),
);

describe('generateInviteToken', () => {
  it('returns a UUID v4 string', () => {
    const token = generateInviteToken();
    assert.match(token, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 10 }, generateInviteToken));
    assert.equal(tokens.size, 10);
  });
});

describe('isInviteTokenExpired', () => {
  it('returns true for past date', () => {
    assert.equal(isInviteTokenExpired(new Date(Date.now() - 1000).toISOString()), true);
  });

  it('returns false for future date', () => {
    assert.equal(isInviteTokenExpired(new Date(Date.now() + 3600000).toISOString()), false);
  });
});

describe('hashPassword / verifyPassword', () => {
  it('verifies correct password', () => {
    const hash = hashPassword('secret123');
    assert.equal(verifyPassword('secret123', hash), true);
  });

  it('rejects wrong password', () => {
    const hash = hashPassword('secret123');
    assert.equal(verifyPassword('wrong', hash), false);
  });

  it('two hashes of same password are different (salt)', () => {
    const h1 = hashPassword('same');
    const h2 = hashPassword('same');
    assert.notEqual(h1, h2);
    assert.equal(verifyPassword('same', h1), true);
    assert.equal(verifyPassword('same', h2), true);
  });

  it('rejects malformed stored hash', () => {
    assert.equal(verifyPassword('any', 'nocolon'), false);
  });
});

describe('createGuideSessionCookies / verifyGuideSession', () => {
  function makeFakeRequest(cookies) {
    return { headers: { get: (k) => k === 'cookie' ? cookies : '' } };
  }

  it('round-trips valid session', () => {
    const cookies = createGuideSessionCookies('guide-123', 'Test Guide', 1, false);
    // Parse the cookies into a header string
    const cookieHeader = cookies
      .map((c) => c.split(';')[0])
      .join('; ');
    const req = makeFakeRequest(cookieHeader);
    const result = verifyGuideSession(req);
    assert.equal(result?.guideId, 'guide-123');
    assert.equal(result?.guideName, 'Test Guide');
    assert.equal(result?.isNew, false);
  });

  it('detects isNew flag', () => {
    const cookies = createGuideSessionCookies('guide-456', 'New Guide', 1, true);
    const cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ');
    const result = verifyGuideSession(makeFakeRequest(cookieHeader));
    assert.equal(result?.isNew, true);
  });

  it('rejects tampered token', () => {
    const cookies = createGuideSessionCookies('guide-789', 'Name', 1);
    // Token is URL-encoded: guide-789:1:<hmac> → replace the hmac part
    const tampered = cookies.map((c) => {
      if (!c.startsWith('guide_token=')) return c;
      // Decode, tamper, re-encode
      const rawValue = c.split(';')[0].replace('guide_token=', '');
      const decoded = decodeURIComponent(rawValue);
      // decoded = "guide-789:1:<64hexchars>"
      const parts = decoded.split(':');
      parts[2] = 'badhash123456789012345678901234567890123456789012345678901234';
      const reEncoded = encodeURIComponent(parts.join(':'));
      return c.replace(rawValue, reEncoded);
    });
    const cookieHeader = tampered.map((c) => c.split(';')[0]).join('; ');
    assert.equal(verifyGuideSession(makeFakeRequest(cookieHeader)), null);
  });

  it('returns null when no cookies', () => {
    assert.equal(verifyGuideSession(makeFakeRequest('')), null);
  });
});

describe('maskEmail', () => {
  it('masks correctly', () => {
    assert.equal(maskEmail('john@gmail.com'), 'j***@gmail.com');
    assert.equal(maskEmail('ab@test.com'), 'a***@test.com');
  });

  it('handles edge cases', () => {
    assert.equal(maskEmail('@domain.com'), '***');
    assert.equal(maskEmail('noemail'), '***');
  });
});
