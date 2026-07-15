/**
 * Issue #1526 — LINE Login route/UI 接線 source-contract。
 *
 * Run: node --test apps/web/tests/api/issue1526-line-login-wiring.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(__dirname, '../../app');
const read = (p) => fs.readFileSync(path.join(APP, p), 'utf8');

test('POST /api/auth/line — flag gate、idToken 驗證、rate-limit、service、成功回 redirect', () => {
  const src = read('api/auth/line/route.ts');
  assert.match(src, /isLineLoginEnabled\(\)/, '須 flag gate');
  assert.match(src, /LINE_LOGIN_DISABLED[\s\S]*status:\s*404/, 'flag OFF 回 404 停用');
  assert.match(src, /limiters\.lineAuth/, '須 rate-limit');
  assert.match(src, /verifyLiffIdToken/, '須驗 idToken');
  assert.match(src, /status:\s*401/, 'idToken 失敗回 401');
  assert.match(src, /issueLineSession/, '須用共用 orchestration');
  assert.match(src, /isLineLoginAutoLinkEmailEnabled\(\)/, 'autoLink 由 flag 控制');
});

test('/api/auth/* 於 middleware CSRF-exempt（issuance 端點）', () => {
  const mw = fs.readFileSync(path.resolve(APP, '../middleware.ts'), 'utf8');
  assert.match(mw, /startsWith\('\/api\/auth'\)/, '/api/auth 須在 CSRF exempt');
});

test('/auth/line/callback — code 交換、驗 idToken、issueLineSession、站內 redirect、未設定 graceful', () => {
  const src = read('auth/line/callback/route.ts');
  assert.match(src, /isLineLoginEnabled\(\)/);
  assert.match(src, /LINE_LOGIN_CHANNEL_SECRET/, '須用 channel secret 換 token');
  assert.match(src, /api\.line\.me\/oauth2\/v2\.1\/token/, '須打 LINE token 端點');
  assert.match(src, /verifyLiffIdToken/);
  assert.match(src, /issueLineSession/);
  assert.match(src, /line_not_configured/, '未設定 channel 須 graceful 導回 login');
  // open-redirect 防護：next 僅站內
  assert.match(src, /startsWith\('\/'\)\s*&&\s*!.*startsWith\('\/\/'\)/);
});

test('登入頁 — LINE 按鈕 flag-gated，Google 登入不動', () => {
  const src = read('(non-locale)/login/page.tsx');
  assert.match(src, /isLineLoginEnabled\(\)/, 'flag 讀取');
  assert.match(src, /lineLoginEnabled\s*&&/, 'flag OFF 時不 render LINE 按鈕');
  assert.match(src, /data-testid="line-login-btn"/);
  assert.match(src, /data-testid="google-login-btn"/, 'Google 按鈕仍在');
  assert.match(src, /access\.line\.me\/oauth2\/v2\.1\/authorize/, 'LINE authorize 起手');
});
