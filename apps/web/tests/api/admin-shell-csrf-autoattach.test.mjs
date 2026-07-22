/**
 * AdminShell CSRF 自動附掛守門測試。
 *
 * 背景（2026-07-22 生產實例）：AdminShell 於 mount 時 prime tp_csrf cookie，並
 * monkey-patch window.fetch 為 admin 寫入 API 自動附 x-csrf-token。原實作有兩個洞：
 *   1. patch 只比對 /api/admin/，漏掉 /api/v2/admin/——middleware 的 CSRF 雙提交
 *      （shouldRequireCsrf）兩者都守，導遊代入等 v2 寫入因此得不到自動附掛。
 *   2. tp_csrf 壽命僅 24h；行動瀏覽器從記憶體還原分頁不會重跑 mount priming，
 *      cookie 失效後所有 admin 寫入操作一律 403「CSRF token required」。
 * 本測試以 source-inspection（與 repo 既有契約測試一致）鎖住修正後的行為。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const ADMIN_SHELL = join(REPO_ROOT, 'src/components/admin/AdminShell.tsx');

function patchBody() {
  const src = readFileSync(ADMIN_SHELL, 'utf8');
  const start = src.indexOf('window.fetch = ');
  const end = src.indexOf('return () => {', start);
  assert.ok(start !== -1 && end > start, 'AdminShell 需保留 window.fetch patch');
  return src.slice(start, end);
}

test('AdminShell：mount 時 prime CSRF cookie', () => {
  const src = readFileSync(ADMIN_SHELL, 'utf8');
  assert.match(src, /fetch\('\/api\/admin\/auth\/csrf'/, '需向 /api/admin/auth/csrf 取得 tp_csrf');
});

test('AdminShell：fetch patch 需同時涵蓋 /api/admin/ 與 /api/v2/admin/', () => {
  const body = patchBody();
  assert.match(body, /startsWith\('\/api\/admin\/'\)/, 'patch 需比對 v1 admin API');
  assert.match(body, /startsWith\('\/api\/v2\/admin\/'\)/, 'patch 需比對 v2 admin API（導遊代入、退款、取消訂單等）');
});

test('AdminShell：mutation 當下 tp_csrf 失效時需就地補發再附 header', () => {
  const body = patchBody();
  const reprimeIndex = body.indexOf('/api/admin/auth/csrf');
  const attachIndex = body.indexOf("headers.set('x-csrf-token'");
  assert.ok(reprimeIndex !== -1, 'patch 內需有 cookie 失效時的補發呼叫');
  assert.ok(attachIndex !== -1 && reprimeIndex < attachIndex, '補發需發生在附 x-csrf-token 之前');
  assert.match(body, /readCsrfTokenFromCookie\(\)/, '附 header 前需重讀 cookie');
});
