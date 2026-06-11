/**
 * Issue #1374 — admin session cookies 補 Secure flag（production）
 *
 * AC1: production 模式下 POST 登入回應的 4 個 set-cookie 皆含 Secure
 * AC2: DELETE 登出清除 cookie 同樣含 Secure（production）
 * AC3: 本地 dev（非 https）登入流程不受影響（不強制 Secure）
 *
 * cookie 組裝抽到 src/lib/admin-session.mjs（.mjs 可直接 import 測試），
 * route 接線以 source-contract 鎖定。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const { createAdminSessionCookies, clearAdminSessionCookies } = await import(
  '../../src/lib/admin-session.mjs'
);

function withNodeEnv(value, fn) {
  const prev = process.env.NODE_ENV;
  if (value === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }
}

const SAMPLE = {
  token: 'tok-abc',
  email: 'admin@tour-platform.com',
  expiresAt: '2026-06-18T00:00:00.000Z',
  sessionVersion: 3,
};

test('AC1: production 下 createAdminSessionCookies 4 個 cookie 皆含 Secure', () => {
  withNodeEnv('production', () => {
    const cookies = createAdminSessionCookies(SAMPLE);
    assert.equal(cookies.length, 4);
    for (const c of cookies) {
      assert.match(c, /; Secure/, `cookie 應含 Secure: ${c}`);
    }
    const names = cookies.map((c) => c.split('=')[0]);
    assert.deepEqual(names, [
      'admin_token',
      'admin_email',
      'admin_session_expires_at',
      'admin_session_version',
    ]);
  });
});

test('AC1: admin_token / admin_email 維持 HttpOnly；expires_at / version 維持非 HttpOnly', () => {
  withNodeEnv('production', () => {
    const [tokenC, emailC, expC, verC] = createAdminSessionCookies(SAMPLE);
    assert.match(tokenC, /HttpOnly/);
    assert.match(emailC, /HttpOnly/);
    assert.ok(!expC.includes('HttpOnly'), 'expires_at 供前端讀取，不應 HttpOnly');
    assert.ok(!verC.includes('HttpOnly'), 'session_version 供前端讀取，不應 HttpOnly');
    for (const c of [tokenC, emailC, expC, verC]) {
      assert.match(c, /SameSite=Lax/);
      assert.match(c, /Max-Age=604800/);
      assert.match(c, /Path=\//);
    }
  });
});

test('AC2: production 下 clearAdminSessionCookies 4 個清除 cookie 皆含 Secure 且 Max-Age=0', () => {
  withNodeEnv('production', () => {
    const cookies = clearAdminSessionCookies();
    assert.equal(cookies.length, 4);
    for (const c of cookies) {
      assert.match(c, /; Secure/, `清除 cookie 應含 Secure: ${c}`);
      assert.match(c, /Max-Age=0/);
    }
  });
});

test('AC3: dev（無 NODE_ENV=production）不強制 Secure，本地 http 登入不受影響', () => {
  withNodeEnv('development', () => {
    for (const c of [...createAdminSessionCookies(SAMPLE), ...clearAdminSessionCookies()]) {
      assert.ok(!c.includes('Secure'), `dev 不應帶 Secure: ${c}`);
    }
  });
});

test('cookie 值仍經 encodeURIComponent 處理', () => {
  withNodeEnv('production', () => {
    const [tokenC, emailC] = createAdminSessionCookies({
      ...SAMPLE,
      token: 'a b/c',
      email: 'x+y@z.tw',
    });
    assert.match(tokenC, /admin_token=a%20b%2Fc/);
    assert.match(emailC, /admin_email=x%2By%40z\.tw/);
  });
});

// ── Source-contract：route 接線 ─────────────────────────────────────────────

const adminRouteSrc = readFileSync(
  path.resolve('app/api/admin/auth/session/route.ts'),
  'utf8'
);

test('接線: POST 與 DELETE 改用 helper，route 內不再手刻 admin cookie 字串', () => {
  assert.match(adminRouteSrc, /createAdminSessionCookies/, 'POST 應使用 createAdminSessionCookies');
  assert.match(adminRouteSrc, /clearAdminSessionCookies/, 'DELETE 應使用 clearAdminSessionCookies');
  assert.ok(
    !/set-cookie',\s*`admin_token=/.test(adminRouteSrc),
    'route 不應再手刻 admin_token cookie 字串'
  );
});
