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

test('T1591wire.2 — draft route 收 addonSelections 並以 persistOrderAddonsDb 重算', () => {
  const src = read('app/api/v2/bookings/draft/route.ts');
  assert.match(src, /addonSelections/);
  assert.match(src, /import\s*\{\s*persistOrderAddonsDb\s*\}/);
  assert.match(src, /persistOrderAddonsDb\(\{/);
  // server 端把加購小計加進 total 並更新訂單總額
  assert.match(src, /totalAmount\s*\+=\s*addonTotal/);
  assert.match(src, /update\(\{\s*total_twd:\s*totalAmount\s*\}\)/);
});

test('T1591wire.3 — 選購器讀 API＋回報選擇；金額前端只作顯示', () => {
  const src = read('src/components/activity/CheckoutAddonPicker.tsx');
  assert.match(src, /\/api\/v2\/activities\/\$\{activityId\}\/addons/);
  assert.match(src, /addonLineSubtotal/);
  assert.match(src, /onChange\(selections,\s*addonTotal\)/);
});

test('T1591wire.4 — booking 頁掛選購器並把 addonSelections 送進下單 body', () => {
  const src = read('app/booking/[activityId]/page.tsx');
  assert.match(src, /<CheckoutAddonPicker/);
  assert.match(src, /addonSelections:\s*addonSelections\.length\s*>\s*0/);
  assert.match(src, /grandTotal/);
});
