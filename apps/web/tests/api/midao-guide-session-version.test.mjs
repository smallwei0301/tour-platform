import assert from 'node:assert/strict';
import test from 'node:test';

const {
  createGuideSessionCookies,
  verifyGuideSession,
} = await import('../../src/lib/guide-auth.ts');

function cookieHeader(cookies) {
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

function requestWithCookies(cookies) {
  const value = typeof cookies === 'string' ? cookies : cookieHeader(cookies);
  return { headers: { get: (name) => name === 'cookie' ? value : '' } };
}

function tokenParts(cookies) {
  const raw = cookies.find((cookie) => cookie.startsWith('guide_token='));
  assert.ok(raw);
  return decodeURIComponent(raw.split(';')[0].slice('guide_token='.length)).split(':');
}

test('valid guide token exposes its signed sessionVersion and remains three parts', () => {
  const cookies = createGuideSessionCookies('guide-version-7', 'Version Guide', 7, false);
  assert.equal(tokenParts(cookies).length, 3);
  const session = verifyGuideSession(requestWithCookies(cookies));
  assert.equal(session?.guideId, 'guide-version-7');
  assert.equal(session?.sessionVersion, 7);
});

test('tampered version or signature returns null', () => {
  const cookies = createGuideSessionCookies('guide-version-tamper', 'Version Guide', 7, false);
  const [guideId, version, signature] = tokenParts(cookies);
  const base = cookies.filter((cookie) => !cookie.startsWith('guide_token='));

  const changedVersion = [`guide_token=${encodeURIComponent(`${guideId}:${Number(version) + 1}:${signature}`)}`, ...base];
  assert.equal(verifyGuideSession(requestWithCookies(changedVersion)), null);

  const changedSignature = [`guide_token=${encodeURIComponent(`${guideId}:${version}:${'0'.repeat(64)}`)}`, ...base];
  assert.equal(verifyGuideSession(requestWithCookies(changedSignature)), null);
});
