import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { verifyLiffIdToken } = await import('../../src/lib/line-liff-verify.mjs');

const CHANNEL_ID = '1660000000';

function withFetch(response, fn) {
  const saved = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return response;
  };
  const savedChannel = process.env.LINE_LOGIN_CHANNEL_ID;
  process.env.LINE_LOGIN_CHANNEL_ID = CHANNEL_ID;
  return Promise.resolve(fn(calls)).finally(() => {
    global.fetch = saved;
    if (savedChannel === undefined) delete process.env.LINE_LOGIN_CHANNEL_ID;
    else process.env.LINE_LOGIN_CHANNEL_ID = savedChannel;
  });
}

test('verifyLiffIdToken: valid token with matching aud → ok + lineUserId/email', async () => {
  const future = Math.floor(Date.now() / 1000) + 3600;
  await withFetch(
    { ok: true, status: 200, json: async () => ({ aud: CHANNEL_ID, sub: 'Uliff123', email: 'amy@example.com', name: 'Amy', exp: future }) },
    async (calls) => {
      const res = await verifyLiffIdToken('valid.token');
      assert.equal(res.ok, true);
      assert.equal(res.lineUserId, 'Uliff123');
      assert.equal(res.email, 'amy@example.com');
      // posts to LINE verify endpoint with id_token + client_id
      assert.equal(calls[0].url, 'https://api.line.me/oauth2/v2.1/verify');
      assert.match(String(calls[0].init.body), /id_token=valid.token/);
      assert.match(String(calls[0].init.body), new RegExp(`client_id=${CHANNEL_ID}`));
    },
  );
});

test('verifyLiffIdToken: aud mismatch → rejected', async () => {
  const future = Math.floor(Date.now() / 1000) + 3600;
  await withFetch(
    { ok: true, status: 200, json: async () => ({ aud: '9999', sub: 'Ux', exp: future }) },
    async () => {
      const res = await verifyLiffIdToken('token');
      assert.equal(res.ok, false);
      assert.equal(res.reason, 'aud_mismatch');
    },
  );
});

test('verifyLiffIdToken: LINE rejects token → rejected', async () => {
  await withFetch(
    { ok: false, status: 400, json: async () => ({ error: 'invalid_request' }) },
    async () => {
      const res = await verifyLiffIdToken('bad');
      assert.equal(res.ok, false);
      assert.equal(res.reason, 'invalid_token');
    },
  );
});

test('verifyLiffIdToken: expired token → rejected', async () => {
  const past = Math.floor(Date.now() / 1000) - 10;
  await withFetch(
    { ok: true, status: 200, json: async () => ({ aud: CHANNEL_ID, sub: 'Ux', exp: past }) },
    async () => {
      const res = await verifyLiffIdToken('token');
      assert.equal(res.ok, false);
      assert.equal(res.reason, 'expired');
    },
  );
});

test('verifyLiffIdToken: missing token → rejected without fetch', async () => {
  await withFetch({ ok: true, status: 200, json: async () => ({}) }, async (calls) => {
    const res = await verifyLiffIdToken('');
    assert.equal(res.ok, false);
    assert.equal(calls.length, 0);
  });
});

// Contract: verify route exists and binds; entry page flag-gates LIFF while
// preserving the legacy query-param handoff for instant rollback (flag OFF).
test('line auth verify route exists, verifies idToken aud, and upserts a binding', async () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const src = await fs.readFile(path.resolve(__dirname, '../../app/api/line/auth/verify/route.ts'), 'utf8');
  assert.match(src, /export\s+async\s+function\s+POST/);
  assert.match(src, /verifyLiffIdToken/);
  assert.match(src, /upsertLineMapping/);
});

test('booking line entry flag-gates LIFF and keeps legacy handoff fallback', async () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const src = await fs.readFile(path.resolve(__dirname, '../../app/booking/line/page.tsx'), 'utf8');
  assert.match(src, /isLineLiffEnabled/);
  // legacy fallback must remain intact for instant rollback
  assert.match(src, /handoffParams\.set\('mode', 'redirect'\)/);
  assert.match(src, /redirect\(`\/api\/v2\/line\/auth\/handoff\?\$\{handoffParams\.toString\(\)\}`\)/);
});
