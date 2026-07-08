/**
 * Issue #1668 — 匿名公開 Booking V2 不應主動打 /api/me/points 造成 401 noise；
 * 已登入旅客的點數 route / UI 接線仍保留。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

test('T1668.1 — CheckoutPointsRedeem 僅在 traveler 已登入時才 fetch /api/me/points', () => {
  const src = read('src/components/activity/CheckoutPointsRedeem.tsx');
  assert.match(src, /useTravelerAuth/, '應沿用既有 traveler auth hook 判斷登入');
  assert.match(src, /if \(authed !== true\) \{\s*setBalance\(null\);\s*return;\s*\}/s, '未登入/未知時應提前停止 points fetch');
  assert.match(src, /fetch\('\/api\/me\/points', \{ cache: 'no-store' \}\)/, '登入後仍應讀 points route');
});

test('T1668.2 — PointsBalanceChip 也僅在 traveler 已登入時才 fetch /api/me/points', () => {
  const src = read('src/components/me/PointsBalanceChip.tsx');
  assert.match(src, /useTravelerAuth/, '會員頁餘額晶片也應共用 traveler auth hook');
  assert.match(src, /if \(authed !== true\) \{\s*setBalance\(null\);\s*return;\s*\}/s, '未登入/未知時應不主動打 points route');
  assert.match(src, /fetch\('\/api\/me\/points', \{ cache: 'no-store' \}\)/, '登入後仍應讀 points route');
});

test('T1668.3 — /api/me/points route 契約維持：未登入 401，已登入走 getPointsBalanceDb', () => {
  const route = read('app/api/me/points/route.ts');
  assert.match(route, /auth\.getUser\(\)/, 'route 仍應以 server session 取 user');
  assert.match(route, /if \(!user\?\.id\) return Response\.json\(fail\('UNAUTHORIZED', '請先登入'\), \{ status: 401 \}\);/, '匿名 route 契約維持 401');
  assert.match(route, /getPointsBalanceDb\(\{ userId: user\.id \}\)/, '已登入仍應查詢點數餘額');
});
