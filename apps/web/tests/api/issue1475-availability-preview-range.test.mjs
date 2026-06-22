// #1475 — 導遊可用時段預覽：跨多週的週期性排程要顯示每一週，而非只出現一天。
// 主因：guide availability-preview 原本上限 14 天 + 前端靜默吞掉 400，導致選了
// 跨多週範圍時回退顯示舊的 7 天視窗（只剩一個週一）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, '..', '..');

const { generateAvailableSlots } = await import('../../src/lib/slot-generator.ts');

const TZ = 'Asia/Taipei';
const GUIDE = 'guide-1';

function mondayRule() {
  return {
    id: 'rule-mon',
    guide_id: GUIDE,
    activity_plan_id: null,
    weekday: 1, // Monday（0=Sunday）
    start_time_local: '09:00',
    end_time_local: '12:00',
    timezone: TZ,
    slot_interval_minutes: 60,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    effective_from: null,
    effective_to: null,
    is_active: true,
  };
}

const PLAN = {
  id: 'plan-1', activity_id: 'act-1', duration_minutes: 60,
  max_participants: 10, booking_type: 'scheduled',
};

test('每週一規則跨 5 週 → 產生每一個週一（不是只有一天）', () => {
  const { slots } = generateAvailableSlots(
    { guideId: GUIDE, activityPlanId: 'plan-1', dateFrom: '2026-06-18', dateTo: '2026-07-23', timezone: TZ, participants: 1 },
    { rules: [mondayRule()], blackouts: [], bookings: [], plan: PLAN },
  );
  // 取 Asia/Taipei 日期（slot.startAt 帶 +08:00，前 10 碼即台北日期）
  const dates = [...new Set(slots.map((s) => s.startAt.slice(0, 10)))].sort();
  // 6/18–7/23 之間的週一：6/22、6/29、7/6、7/13、7/20
  assert.deepEqual(dates, ['2026-06-22', '2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20']);
  // 每個週一 09–12、間隔 60 → 3 個時段
  assert.equal(slots.length, dates.length * 3);
});

test('guide availability-preview 上限放寬到 92 天', () => {
  const src = readFileSync(join(webRoot, 'app/api/guide/availability-preview/route.ts'), 'utf8');
  assert.match(src, /daysDiff > 92/);
  assert.match(src, /Preview range limited to 92 days/);
  assert.doesNotMatch(src, /daysDiff > 14/);
});

test('前端預覽不再靜默吞掉錯誤（清空舊資料並顯示原因）', () => {
  const src = readFileSync(join(webRoot, 'app/guide/availability/page.tsx'), 'utf8');
  assert.match(src, /setPreviewError\(/);
  assert.match(src, /setPreviewSlots\(\[\]\)/);
  assert.match(src, /data-testid="guide-availability-preview-error"/);
});
