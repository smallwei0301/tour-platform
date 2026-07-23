import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { spawnNodeEsm } from '../helpers/spawn-node.mjs';

const moduleUrl = new URL('../../src/lib/guide-session-crypto.ts', import.meta.url);
const cryptoModule = await import(moduleUrl.href);
const guideAuthModule = await import(new URL('../../src/lib/guide-auth.ts', import.meta.url).href);
const {
  signGuideSession,
  verifyGuideSessionSignature,
  signDomainSeparatedValue,
  verifyDomainSeparatedValue,
} = cryptoModule;

function expectedHmac(message) {
  return createHmac('sha256', String(process.env.GUIDE_SESSION_SECRET || '').trim())
    .update(message, 'utf8')
    .digest('hex');
}

test('guide session signature preserves exact legacy HMAC bytes', () => {
  const guideId = 'guide-legacy-123';
  const version = 7;
  const expected = expectedHmac(`${guideId}:${version}`);
  assert.equal(signGuideSession(guideId, version), expected);
  assert.equal(verifyGuideSessionSignature(guideId, version, expected), true);
  assert.equal(verifyGuideSessionSignature(guideId, version + 1, expected), false);
});

test('guide-auth integration preserves the legacy three-part cookie token', () => {
  const guideId = 'guide-integration';
  const version = 11;
  const cookies = guideAuthModule.createGuideSessionCookies(guideId, 'Legacy Guide', version, false);
  const rawToken = decodeURIComponent(cookies.find((cookie) => cookie.startsWith('guide_token='))
    .split(';')[0]
    .slice('guide_token='.length));
  assert.equal(rawToken, `${guideId}:${version}:${expectedHmac(`${guideId}:${version}`)}`);
  const cookieHeader = cookies.map((cookie) => cookie.split(';')[0]).join('; ');
  const session = guideAuthModule.verifyGuideSession({ headers: { get: (name) => name === 'cookie' ? cookieHeader : '' } });
  assert.equal(session?.guideId, guideId);
  assert.equal(session?.guideName, 'Legacy Guide');
});

test('domain-separated signature binds domain, UTF-8 byte length, and payload', () => {
  const domain = 'midao:impersonation-actor:v1';
  const payload = '{"actor":"管理員@example.com"}';
  const message = `${domain}\0${Buffer.byteLength(payload, 'utf8')}:${payload}`;
  const expected = expectedHmac(message);
  assert.equal(signDomainSeparatedValue(domain, payload), expected);
  assert.equal(verifyDomainSeparatedValue(domain, payload, expected), true);
  assert.equal(verifyDomainSeparatedValue(`${domain}:other`, payload, expected), false);
  assert.equal(verifyDomainSeparatedValue(domain, `${payload}x`, expected), false);
});

test('guide and actor signatures are not cross-protocol valid', () => {
  const guideId = 'guide-cross-protocol';
  const version = 3;
  const domain = 'midao:impersonation-actor:v1';
  const payload = `${guideId}:${version}`;
  const guideSignature = signGuideSession(guideId, version);
  const actorSignature = signDomainSeparatedValue(domain, payload);
  assert.notEqual(guideSignature, actorSignature);
  assert.equal(verifyDomainSeparatedValue(domain, payload, guideSignature), false);
  assert.equal(verifyGuideSessionSignature(guideId, version, actorSignature), false);
});

test('shared module does not export the raw secret', () => {
  assert.equal('GUIDE_SESSION_SECRET' in cryptoModule, false);
  assert.equal('resolveGuideSessionSecret' in cryptoModule, false);
});

test('shared module enforces production secret policy and keeps configured dev secret deterministic', () => {
  const modulePath = moduleUrl.pathname;
  const missing = spawnNodeEsm(`await import(${JSON.stringify(modulePath)});`, {
    env: { ...process.env, NODE_ENV: 'production', NEXT_PHASE: '', GUIDE_SESSION_SECRET: '' },
  });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /SECURITY_ENV_BLOCK/);

  const short = spawnNodeEsm(`await import(${JSON.stringify(modulePath)});`, {
    env: { ...process.env, NODE_ENV: 'production', NEXT_PHASE: '', GUIDE_SESSION_SECRET: 'short' },
  });
  assert.notEqual(short.status, 0);
  assert.match(short.stderr, /GUIDE_SESSION_SECRET missing\/weak/);

  const deterministic = spawnNodeEsm(
    `const m = await import(${JSON.stringify(modulePath)}); console.log(m.signGuideSession('g', 2));`,
    { env: { ...process.env, NODE_ENV: 'test', NEXT_PHASE: '', GUIDE_SESSION_SECRET: 'configured-test-secret-at-least-32-bytes' } },
  );
  assert.equal(deterministic.status, 0);
  const expected = createHmac('sha256', 'configured-test-secret-at-least-32-bytes').update('g:2').digest('hex');
  assert.equal(deterministic.stdout.trim(), expected);
});
