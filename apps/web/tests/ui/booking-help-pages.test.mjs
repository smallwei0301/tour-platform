// Source-contract: booking-type & conflict-override help pages exist and are
// linked from the booking_type selectors (admin + guide plan forms) and the
// admin guide detail page. Keeps the help links from silently disappearing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, '../..');

function read(rel) {
  return readFileSync(join(APP, rel), 'utf8');
}

test('help pages exist', () => {
  for (const p of [
    'src/components/help/BookingTypesGuide.tsx',
    'app/(non-locale)/admin/help/booking-types/page.tsx',
    'app/(non-locale)/guide/help/booking-types/page.tsx',
    'app/(non-locale)/admin/help/conflict-override/page.tsx',
  ]) {
    assert.ok(existsSync(join(APP, p)), `missing ${p}`);
  }
});

test('shared booking-types guide covers all three modes', () => {
  const src = read('src/components/help/BookingTypesGuide.tsx');
  assert.match(src, /即時預約/);
  assert.match(src, /申請預約/);
  assert.match(src, /排程預約/);
  // Key behavioural facts must be present.
  assert.match(src, /先審核後付款/);
  assert.match(src, /固定場次/);
});

test('admin + guide booking-types pages render the shared guide component', () => {
  assert.match(read('app/(non-locale)/admin/help/booking-types/page.tsx'), /BookingTypesGuide/);
  assert.match(read('app/(non-locale)/guide/help/booking-types/page.tsx'), /BookingTypesGuide/);
});

test('admin plan form links to booking-types help next to the selector', () => {
  // #1615 拆檔：方案表單（含預約方式下拉與說明連結）移至 PlanFormModal 元件（斷言意圖不變）
  const src = read('src/components/admin/activity-plans/PlanFormModal.tsx');
  assert.match(src, /\/admin\/help\/booking-types/);
  // Link sits near the 預約方式 selector.
  const linkIdx = src.indexOf('/admin/help/booking-types');
  const selectIdx = src.indexOf("aria-label=\"預約方式\"");
  assert.ok(linkIdx > -1 && selectIdx > -1 && Math.abs(linkIdx - selectIdx) < 600, 'link near selector');
});

test('guide plan form links to booking-types help', () => {
  assert.match(read('app/(non-locale)/guide/activities/[id]/plans/[planId]/page.tsx'), /\/guide\/help\/booking-types/);
});

test('conflict-override help is linked from the availability page (single canonical location)', () => {
  // 連結只放在時段預覽頁(例外開放流程所在地),不放列表卡片與導遊詳情頁。
  // #1615 拆檔：時段預覽卡片移至 AdminSlotPreviewSection（純結構搬移），
  // 連結與「時段預覽」標題仍同在該元件內，斷言意圖不變。
  const availSrc = read('src/components/availability/admin-sections.tsx');
  assert.match(availSrc, /\/admin\/help\/conflict-override/);
  const helpIdx = availSrc.indexOf('/admin/help/conflict-override');
  // 檔內「時段預覽」出現多次（含檔頭註解）——取「距連結最近的一次」量距離，
  // 錨定實際 <h2> 標題就在連結旁的意圖不變。
  const previewIdxs = [...availSrc.matchAll(/時段預覽/g)].map((m) => m.index);
  const nearestDist = Math.min(...previewIdxs.map((i) => Math.abs(helpIdx - i)));
  assert.ok(helpIdx > -1 && previewIdxs.length > 0 && nearestDist < 800, 'help link near 時段預覽');

  // 不應再出現在列表卡片或導遊詳情頁(避免重複入口)。
  assert.doesNotMatch(read('app/(non-locale)/admin/guides/page.tsx'), /\/admin\/help\/conflict-override/);
  assert.doesNotMatch(read('app/(non-locale)/admin/guides/[guideId]/page.tsx'), /\/admin\/help\/conflict-override/);
});

test('conflict-override help documents the key steps and limits', () => {
  const src = read('app/(non-locale)/admin/help/conflict-override/page.tsx');
  assert.match(src, /例外開放此場/);
  assert.match(src, /預覽方案篩選/);
  assert.match(src, /確認例外開放/);
  // Must state it does not bypass blackout / season / capacity.
  assert.match(src, /黑名單|季節|名額已滿/);
});
