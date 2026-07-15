// LIFF 一鍵綁定頁 source-contract — Tour Platform (#302b / #926)
//
// 鎖定 /line/bind 的接線：LIFF init → getIDToken → POST /api/line/auth/verify，
// 失敗退回 /me/profile 綁定碼流程；server page 受 NEXT_PUBLIC_LINE_LIFF_ENABLED 旗標
// 節制。/line/bind 為公開頁（不在 /me 受保護前綴下），故免登入即可完成 email 綁定。

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_WEB = path.resolve(__dirname, '../..');
const read = (p) => readFileSync(path.join(REPO_WEB, p), 'utf8');

describe('LIFF 一鍵綁定頁 /line/bind', () => {
  const client = read('app/(non-locale)/line/bind/LineBindClient.tsx');
  const page = read('app/(non-locale)/line/bind/page.tsx');

  test('client 走 LIFF：init → getIDToken → POST /api/line/auth/verify', () => {
    assert.match(client, /@line\/liff/);
    assert.match(client, /liff\.init/);
    assert.match(client, /liff\.isLoggedIn\(\)/);
    assert.match(client, /liff\.login\(\)/);
    assert.match(client, /liff\.getIDToken\(\)/);
    assert.match(client, /\/api\/line\/auth\/verify/);
  });

  test('Google-only 登入：優先綁 user_id（讀平台 session 帶給 verify）', () => {
    // 訂單權威鍵是 user_id；email 僅作訪客備援。client 必須先試 user_id。
    assert.match(client, /supabase\/client/);
    assert.match(client, /auth\.getUser\(\)/);
    assert.match(client, /\{ idToken, userId \}/);
  });

  test('綁定失敗退回 /me/profile 綁定碼流程', () => {
    assert.match(client, /\/me\/profile/);
  });

  test('server page 受 LIFF 旗標節制，OFF 時退回綁定碼頁', () => {
    assert.match(page, /isLineLiffEnabled/);
    assert.match(page, /LineBindClient/);
    assert.match(page, /\/me\/profile/);
  });

  test('verify 端點以 idToken 內 email 綁定（免登入、免碼）', () => {
    const route = read('app/api/line/auth/verify/route.ts');
    assert.match(route, /verifyLiffIdToken/);
    assert.match(route, /upsertLineMapping/);
    assert.match(route, /contactEmail: verified\.email/);
  });
});
