/**
 * Issue #1591 — 加購 checkout 串接源碼契約測試。
 * draft route 收 addonSelections 並以 persistOrderAddonsDb 重算入總額；
 * 加購清單 API、選購器、booking 頁與下單 body 須接線。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

test('T1591wire.1 — 加購清單 API 存在（GET，接 listActivityAddonsDb）', () => {
  const src = read('app/api/v2/activities/[activityId]/addons/route.ts');
  assert.match(src, /export async function GET/);
  assert.match(src, /listActivityAddonsDb/);
});

test('T1591wire.2 — draft route 經 applyOrderExtras 收 addonSelections；重算在 checkout/order-extras', () => {
  const route = read('app/api/v2/bookings/draft/route.ts');
  assert.match(route, /addonSelections/);
  assert.match(route, /applyOrderExtras\(\{/);
  // 重邏輯抽到 src/lib/checkout/order-extras.mjs（route 不再手刻）
  const helper = read('src/lib/checkout/order-extras.mjs');
  assert.match(helper, /import\s*\{\s*persistOrderAddonsDb\s*\}/);
  assert.match(helper, /persistOrderAddonsDb\(\{/);
  // server 端把加購小計加進 total 並更新訂單總額
  assert.match(helper, /total\s*\+=\s*addonTotal/);
  assert.match(helper, /update\(\{\s*total_twd:\s*total\s*\}\)/);
});

test('T1591wire.3 — 選購器讀 API＋回報選擇；金額前端只作顯示', () => {
  const src = read('src/components/activity/CheckoutAddonPicker.tsx');
  assert.match(src, /\/api\/v2\/activities\/\$\{activityId\}\/addons/);
  assert.match(src, /addonLineSubtotal/);
  assert.match(src, /onChange\(selections,\s*addonTotal\)/);
});

test('T1591wire.4 — booking 頁掛 CheckoutExtrasSection 並把 addonSelections 送進下單 body', () => {
  const src = read('app/(non-locale)/booking/[activityId]/page.tsx');
  assert.match(src, /<CheckoutExtrasSection/);
  assert.match(src, /addonSelections:\s*extras\.addonSelections\.length\s*>\s*0/);
  assert.match(src, /payTotal/);
  // 選購器仍由 CheckoutExtrasSection 掛載
  const section = read('src/components/activity/CheckoutExtrasSection.tsx');
  assert.match(section, /<CheckoutAddonPicker/);
});
