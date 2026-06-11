/**
 * Issue #1375 — next.config.mjs 加 HSTS header；CSP 以 report-only 模式試行
 *
 * AC1: 所有頁面回應含 HSTS header（max-age=31536000; includeSubDomains）
 * AC2: 含 Content-Security-Policy-Report-Only header，policy 涵蓋已盤點第三方來源
 *      （ECPay 跳轉、Supabase、Sentry、Vercel Analytics、Unsplash/Pexels 圖源）
 *
 * source-contract：直接斷言 next.config.mjs 的 securityHeaders 條目。
 * 真實 header 行為由 e2e/issue1375-security-headers.spec.ts 對 dev server 驗證。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const configSrc = readFileSync(path.resolve('next.config.mjs'), 'utf8');

test('AC1: securityHeaders 含 Strict-Transport-Security（一年 + includeSubDomains）', () => {
  assert.match(configSrc, /Strict-Transport-Security/, '應有 HSTS header 條目');
  assert.match(
    configSrc,
    /max-age=31536000;?\s*includeSubDomains/,
    'HSTS 值應為 max-age=31536000; includeSubDomains'
  );
});

test('AC2: 含 Content-Security-Policy-Report-Only（report-only，不直接 enforce）', () => {
  assert.match(configSrc, /Content-Security-Policy-Report-Only/, '應為 Report-Only 模式');
  assert.ok(
    !/key:\s*'Content-Security-Policy'(?!-)/.test(configSrc),
    '不得直接 enforce CSP（避免擋掉金流跳轉）'
  );
});

test('AC2: CSP policy 涵蓋 ECPay form-action（production + stage）', () => {
  assert.match(configSrc, /form-action[^"]*payment\.ecpay\.com\.tw/, '應允許 ECPay production 跳轉');
  assert.match(configSrc, /form-action[^"]*payment-stage\.ecpay\.com\.tw/, '應允許 ECPay stage 跳轉');
});

test('AC2: CSP policy 涵蓋 Supabase（connect-src 含 https 與 wss）', () => {
  assert.match(configSrc, /connect-src[^"]*https:\/\/\*\.supabase\.co/);
  assert.match(configSrc, /connect-src[^"]*wss:\/\/\*\.supabase\.co/);
});

test('AC2: CSP policy 涵蓋 Sentry 與 Vercel Analytics', () => {
  assert.match(configSrc, /\*\.sentry\.io/, 'connect-src 應含 Sentry ingest');
  assert.match(configSrc, /va\.vercel-scripts\.com/, 'script-src 應含 Vercel Analytics script');
  assert.match(configSrc, /vitals\.vercel-insights\.com/, 'connect-src 應含 Speed Insights beacon');
});

test('AC2: CSP policy 涵蓋圖源（unsplash/pexels/supabase + data: blob:）', () => {
  assert.match(configSrc, /img-src[^"]*images\.unsplash\.com/);
  assert.match(configSrc, /img-src[^"]*images\.pexels\.com/);
  assert.match(configSrc, /img-src[^"]*\*\.supabase\.co/);
  assert.match(configSrc, /img-src[^"]*data:/);
  assert.match(configSrc, /img-src[^"]*blob:/);
});

test('AC2: 基線 directive 完整（default-src/script-src/style-src/frame-ancestors）', () => {
  assert.match(configSrc, /default-src 'self'/);
  assert.match(configSrc, /script-src[^"]*'self'/);
  assert.match(configSrc, /style-src[^"]*'unsafe-inline'/, 'Next.js inline style 需允許');
  assert.match(configSrc, /frame-ancestors 'self'/, '對齊既有 X-Frame-Options SAMEORIGIN');
});

test('既有五項 security headers 不得移除', () => {
  for (const key of [
    'X-Content-Type-Options',
    'X-Frame-Options',
    'X-XSS-Protection',
    'Referrer-Policy',
    'Permissions-Policy',
  ]) {
    assert.match(configSrc, new RegExp(key), `${key} 應保留`);
  }
});
