/**
 * GA4（gtag.js）安插 source-contract 測試。
 *
 * 需求：把 Google tag（G-26EYTQJ9RC）緊接在每頁 <head> 之後，且每頁只有一份。
 * App Router 下 root layout（app/layout.tsx）是唯一包住全站的 layout，
 * 因此「掛在 root layout <head> 內一次」即等於「每頁一份、且不重複」。
 *
 * 這裡用讀原始碼 + regex 鎖定接線（import、<head> 內掛載、ID、gtag 初始化、
 * CSP 白名單），真實瀏覽器注入由 e2e/ga4-integration.spec.ts 驗證。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const GA_ID = 'G-26EYTQJ9RC';
const componentSrc = readFileSync(
  path.resolve('src/components/analytics/GoogleAnalytics.tsx'),
  'utf8'
);
const layoutSrc = readFileSync(path.resolve('app/layout.tsx'), 'utf8');
const configSrc = readFileSync(path.resolve('next.config.mjs'), 'utf8');

test('GoogleAnalytics 元件用 next/script 載入 gtag.js 並帶正式 GA ID', () => {
  assert.match(componentSrc, /from 'next\/script'/, '應用 next/script（Next 負責 async 載入與去重）');
  assert.match(
    componentSrc,
    /googletagmanager\.com\/gtag\/js/,
    '應載入 googletagmanager.com 的 gtag.js'
  );
  assert.match(componentSrc, new RegExp(GA_ID), `預設 GA ID 應為 ${GA_ID}`);
  assert.match(componentSrc, /gtag\('js', new Date\(\)\)/, '應有 gtag js 初始化');
  assert.match(componentSrc, /gtag\('config'/, '應有 gtag config 呼叫');
  assert.match(
    componentSrc,
    /NEXT_PUBLIC_GA_ID/,
    'GA ID 應可由 NEXT_PUBLIC_GA_ID 覆寫/停用'
  );
});

test('root layout 匯入 GoogleAnalytics 並掛在 <head> 內（緊接 <head> 之後）', () => {
  assert.match(
    layoutSrc,
    /import\s*\{\s*GoogleAnalytics\s*\}\s*from\s*'[^']*analytics\/GoogleAnalytics'/,
    'root layout 應匯入 GoogleAnalytics'
  );
  // <head> 之後第一個出現的元件就是 <GoogleAnalytics />（緊接在 <head> 之後）
  const headIdx = layoutSrc.indexOf('<head>');
  const gaIdx = layoutSrc.indexOf('<GoogleAnalytics');
  const headCloseIdx = layoutSrc.indexOf('</head>');
  assert.ok(headIdx !== -1, '應有 <head>');
  assert.ok(gaIdx !== -1, '應渲染 <GoogleAnalytics />');
  assert.ok(gaIdx > headIdx && gaIdx < headCloseIdx, '<GoogleAnalytics /> 應在 <head> 內');
});

test('CSP 白名單涵蓋 GA4 來源（gtag 載入 + beacon）', () => {
  assert.match(
    configSrc,
    /script-src[^"]*www\.googletagmanager\.com/,
    'script-src 應允許 googletagmanager.com 載入 gtag.js'
  );
  assert.match(
    configSrc,
    /connect-src[^"]*google-analytics\.com/,
    'connect-src 應允許 GA beacon 回傳'
  );
});
