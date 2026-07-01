/**
 * 排程 vs 即時 預約「可用時間來源」嚴格區隔 — PR3 預覽正確性
 *
 * 排程方案只看固定場次，動態規則預覽對它無意義。admin 與 guide 的時段預覽路由，
 * 當 previewPlan 為排程方案時，必須回「請至場次管理」提示（previewNotice）與空
 * slots，且不跑動態規則的 generateAvailableSlots。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const ADMIN_PREVIEW = join(
  REPO_ROOT,
  'app/api/v2/admin/guides/[guideId]/availability-preview/route.ts'
);
const GUIDE_PREVIEW = join(REPO_ROOT, 'app/api/guide/availability-preview/route.ts');

function read(p) {
  return readFileSync(p, 'utf8');
}

test('admin preview：排程方案短路，回 previewNotice + 空 slots，先於 generateAvailableSlots', () => {
  const src = read(ADMIN_PREVIEW);
  assert.match(src, /isDynamicAvailabilityApplicable/, '應引入純函式判準');
  assert.match(src, /previewNotice/, '回應應帶 previewNotice');
  // 守門必須在 generateAvailableSlots 之前（否則仍會跑動態預覽）。
  const guardIdx = src.indexOf('!isDynamicAvailabilityApplicable(planData.booking_type)');
  const genIdx = src.indexOf('generateAvailableSlots(');
  assert.ok(guardIdx >= 0, '應有 booking_type 守門');
  assert.ok(genIdx >= 0, '仍保留 generateAvailableSlots 供動態方案');
  assert.ok(guardIdx < genIdx, '排程守門必須先於 generateAvailableSlots');
});

test('guide preview：排程方案短路旗標，回 previewNotice + 空 slots，先於 generateAvailableSlots', () => {
  const src = read(GUIDE_PREVIEW);
  assert.match(src, /isDynamicAvailabilityApplicable/);
  assert.match(src, /previewNotice/);
  assert.match(src, /scheduledPlanNotice/, '應以旗標短路（變數在資料載入後才在 scope）');
  const flagIdx = src.indexOf('scheduledPlanNotice = true');
  const shortCircuitIdx = src.indexOf('if (scheduledPlanNotice)');
  const genIdx = src.indexOf('generateAvailableSlots(');
  assert.ok(flagIdx >= 0, '排程方案應設短路旗標');
  assert.ok(shortCircuitIdx >= 0, '應在載入資料後、產生時段前短路');
  assert.ok(shortCircuitIdx < genIdx, '短路 return 必須先於 generateAvailableSlots');
});
