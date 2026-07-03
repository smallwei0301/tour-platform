/**
 * Issue #1407 — Legacy 退役階段三殘留守門（source-contract）
 *
 * owner 2026-07-03 拍板直接退役。本測試鎖定「刪掉的東西不得回來」：
 *  1. legacy routes／pages 檔案不存在（/api/orders、/checkout、/orders、feature-flags 診斷端點）
 *  2. middleware 無 /api/orders 殘留（CSRF 白名單、matcher）
 *  3. client-api 無 createOrder／legacy 建單呼叫
 *  4. Booking V2 flags（isBookingV2Enabled／isBookingV2ShellEnabled／BOOKING_V2*）已退場
 *  5. next.config 有 /checkout 與 /orders 的 301 redirects（保護舊書籤/索引）
 *  6. availability route：legacy 請求模式已刪，但資料面 fallback（#839/#1133 安全網）必須保留
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

test('T1407.1 — legacy 檔案已刪除且不得回歸', () => {
  for (const rel of [
    'app/api/orders/route.ts',
    'app/checkout/page.tsx',
    'app/checkout/layout.tsx',
    'app/orders/page.tsx',
    'app/orders/[orderId]/page.tsx',
    'app/api/v2/feature-flags/route.ts',
  ]) {
    assert.equal(existsSync(path.join(ROOT, rel)), false, `${rel} 應已隨 #1407 刪除`);
  }
});

test('T1407.2 — middleware 無 /api/orders 殘留', () => {
  const src = read('middleware.ts');
  assert.ok(
    !/pathname\.startsWith\('\/api\/orders'\)/.test(src),
    'middleware 不得再引用 /api/orders 路徑判斷'
  );
  assert.ok(!/'\/api\/orders\/:path\*'/.test(src), 'matcher 不得再含 /api/orders');
  assert.ok(!/'\/orders\/:path\*'/.test(src), 'matcher 不得再含 /orders（頁面已改 redirect）');
  assert.ok(!/'\/checkout\/:path\*'/.test(src), 'matcher 不得再含 /checkout');
});

test('T1407.3 — client-api 無 legacy createOrder', () => {
  const src = read('src/lib/client-api.ts');
  assert.ok(!/export async function createOrder\b/.test(src), 'createOrder 應已刪除');
  assert.ok(!/fetch\('\/api\/orders'/.test(src), '不得再打 legacy /api/orders');
});

test('T1407.4 — Booking V2 flags 已退場', () => {
  const flags = read('src/config/feature-flags.mjs');
  assert.ok(!/export function isBookingV2Enabled/.test(flags), 'isBookingV2Enabled 應已退場');
  assert.ok(!/export function isBookingV2ShellEnabled/.test(flags), 'isBookingV2ShellEnabled 應已退場');
  // 產品碼不得再讀這兩個 env（允許出現在註解說明中）
  const middleware = read('middleware.ts');
  for (const src of [middleware]) {
    assert.ok(!/process\.env\.NEXT_PUBLIC_BOOKING_V2_ENABLED/.test(src));
    assert.ok(!/process\.env\.BOOKING_V2\b/.test(src));
  }
});

test('T1407.5 — next.config 提供 legacy 路徑 301 redirects', () => {
  const src = read('next.config.mjs');
  assert.match(src, /async redirects\(\)/, '應定義 redirects()');
  assert.match(src, /source: '\/checkout'/, '/checkout 應導向');
  assert.match(src, /destination: '\/booking\/:slug'/, '/checkout?slug= 應導向 V2 booking');
  assert.match(src, /source: '\/orders'/, '/orders 應導向 /me/orders');
  assert.match(src, /destination: '\/me\/orders'/, '/orders 目的地應為 /me/orders');
  assert.match(src, /source: '\/orders\/:orderId'/, '/orders/[id] 應導向 /me/orders/[id]');
  assert.match(src, /permanent: true/, '應為 301（permanent）');
});

test('T1407.6 — availability route：legacy 請求模式已刪、資料面 fallback 保留', () => {
  const src = read('app/api/activities/[slug]/availability/route.ts');
  // 退役面：不得再支援 ?source=legacy／?mode=legacy 與 BOOKING_V2 env 回滾
  assert.ok(!/explicitSource\s*===\s*'legacy'/.test(src), '?source=legacy 模式不得回歸');
  assert.ok(!/explicitMode\s*===\s*'legacy'/.test(src), '?mode=legacy 模式不得回歸');
  assert.ok(!/process\.env\.BOOKING_V2\b/.test(src), 'BOOKING_V2 env 回滾不得回歸');
  // 安全網面（#839/#1133）：資料 fallback 必須保留直到 V2 slots 全量回填另案移除
  assert.match(src, /loadLegacySchedules/, '資料面 legacy snapshot fallback 應保留（安全網）');
  assert.match(src, /legacy_fallback/, 'fallback 回應需維持可觀測標記');
  assert.match(src, /v2HasGeneratedSlots/, 'no-generated-slots 判斷應保留');
});

test('T1407.7 — 活動頁鏈路無 flag 殘留（一律 V2）', () => {
  const page = read('app/[locale]/activities/[region]/[slug]/page.tsx');
  assert.ok(!/isBookingV2Enabled|useBookingV2/.test(page), '活動頁不得再有 booking flag');
  const dps = read('src/components/activity/DatePlanSection.tsx');
  assert.ok(!/useBookingV2/.test(dps), 'DatePlanSection 不得再有 booking flag prop');
  const entry = read('src/lib/booking-entry.mjs');
  assert.ok(!/useBookingV2/.test(entry), 'booking-entry 殘留參數應已移除');
});
