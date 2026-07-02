/**
 * Issue #1344 — SSR 首屏卡片（Suspense fallback）接線 source-contract。
 *
 * 根因：/activities 與 /activities/[region] 是 ISR（revalidate=60），
 * ActivitiesContent 用 useSearchParams() → prerender 時 CSR bailout，
 * SSR HTML 只剩 Suspense fallback。fallback 必須是用 SSR 資料 render
 * 的真卡片（ActivitiesFirstPaint），否則 LCP 圖片要等 hydration —
 * Lighthouse 實測 render delay 佔 LCP 75%（7.9s / 10.5s）。
 *
 * 這些測試鎖住三條接線，防回歸：
 *   1. 兩個 page 的 Suspense fallback 都用 ActivitiesFirstPaint。
 *   2. ActivityCard / ActivitiesFirstPaint 不得使用 useSearchParams
 *      （一用就 bailout，SSR 首屏歸零）。
 *   3. ActivitiesContent 的卡片改用共用 ActivityCard（單一 markup 來源）。
 *
 * Run:
 *   node --test apps/web/tests/ui/issue1344-ssr-first-paint.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '../../app/[locale]/activities');

const read = (p) => fs.readFileSync(path.join(APP_DIR, p), 'utf8');

const pageSrc = read('page.tsx');
const regionPageSrc = read('[region]/page.tsx');
const cardSrc = read('ActivityCard.tsx');
const firstPaintSrc = read('ActivitiesFirstPaint.tsx');
const contentSrc = read('ActivitiesContent.tsx');

test('page.tsx — Suspense fallback 使用 ActivitiesFirstPaint 並帶 initialActivities', () => {
  assert.match(pageSrc, /import ActivitiesFirstPaint from '\.\/ActivitiesFirstPaint'/);
  assert.match(
    pageSrc,
    /fallback=\{\s*initialActivities\?\.length\s*\?\s*<ActivitiesFirstPaint activities=\{initialActivities\}/,
    'fallback 必須在有 SSR 資料時 render ActivitiesFirstPaint',
  );
  assert.match(pageSrc, /:\s*<ActivitiesSkeleton \/>/, 'SSR 資料抓不到時退回 skeleton');
});

test('[region]/page.tsx — Suspense fallback 使用 ActivitiesFirstPaint 並帶 initialActivities', () => {
  assert.match(regionPageSrc, /import ActivitiesFirstPaint from '\.\.\/ActivitiesFirstPaint'/);
  assert.match(
    regionPageSrc,
    /fallback=\{\s*initialActivities\?\.length\s*\?\s*<ActivitiesFirstPaint activities=\{initialActivities\}/,
  );
  assert.match(regionPageSrc, /:\s*<ActivitiesSkeleton \/>/);
});

// 註解裡可以提到 useSearchParams（說明為什麼不能用）— 先剝掉註解再比對，
// 只鎖真正的 import 與呼叫兩種型態。
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const USE_SEARCH_PARAMS_IMPORT = /import\s*\{[^}]*\buseSearchParams\b[^}]*\}/;
const USE_SEARCH_PARAMS_CALL = /\buseSearchParams\s*\(/;

test('ActivityCard — 不得使用 useSearchParams（避免 CSR bailout 汙染 fallback）', () => {
  const src = stripComments(cardSrc);
  assert.doesNotMatch(src, USE_SEARCH_PARAMS_IMPORT, 'ActivityCard 一旦 import useSearchParams，SSR 首屏就會退回 fallback 外殼');
  assert.doesNotMatch(src, USE_SEARCH_PARAMS_CALL);
  assert.match(cardSrc, /data-testid="activity-card"/, '卡片 markup 必須保留 activity-card testid');
});

test('ActivitiesFirstPaint — server component、不得使用 useSearchParams / use client', () => {
  const src = stripComments(firstPaintSrc);
  assert.doesNotMatch(src, USE_SEARCH_PARAMS_IMPORT);
  assert.doesNotMatch(src, USE_SEARCH_PARAMS_CALL);
  assert.doesNotMatch(firstPaintSrc, /^'use client'/m, 'ActivitiesFirstPaint 必須是 server component 才能進 SSR HTML');
  assert.match(firstPaintSrc, /tp-card-grid tp-card-grid-activities/, '首屏 grid 需與 ActivitiesContent 同 class（CLS 幾何一致）');
  assert.match(firstPaintSrc, /<ActivityCard key=\{a\.slug\} a=\{a\} idx=\{idx\} \/>/);
});

test('ActivitiesContent — 卡片改用共用 ActivityCard，不再有內嵌 article markup', () => {
  assert.match(contentSrc, /import ActivityCard.* from '\.\/ActivityCard'/);
  assert.match(contentSrc, /<ActivityCard\s/, '卡片必須經由共用元件 render');
  assert.doesNotMatch(
    contentSrc,
    /<article className="tp-card" key/,
    '內嵌卡片 markup 應已抽到 ActivityCard，避免兩份 markup 漂移',
  );
});

test('首屏 LCP 關鍵屬性 — 前兩張卡 eager/priority、其餘 lazy（沿用 #1344 既有策略）', () => {
  assert.match(cardSrc, /priority=\{idx < 2\}/);
  assert.match(cardSrc, /loading=\{idx < 2 \? 'eager' : 'lazy'\}/);
  assert.match(cardSrc, /quality=\{60\}/, 'quality 需與 page 層 preload 的 q=60 一致，否則 double download');
});
