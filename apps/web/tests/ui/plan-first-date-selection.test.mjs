/**
 * 活動詳情頁「先選方案 → 方案下方顯示該方案可預約日期」流程。
 *
 * 產品決策（取代原本「上方日期條 + 日期先行」）：
 *   - 進頁面不抓可用性、不顯示日期條（頁面秒開、省伺服器）。
 *   - 旅客點選方案後才抓一次可用性（既有 ensureLiveAvailability 單次抓取），
 *     並在「該方案卡片下方」顯示專屬於該方案的可預約日期。
 *   - 各方案日期 = 該方案 planId 的場次 ∪ planId=null（全方案通用）場次；
 *     若場次 planId 全部來自外部 ID 空間（V2 UUID ↔ legacy slug 不一致，
 *     #839 同款防禦），退回日期層級聚合，避免日期被誤灰。
 *
 * 本檔鎖定：
 *   1. 新 pure helper filterSchedulesForPlan 的行為。
 *   2. DatePlanSection 來源契約：上方日期條移除、方案卡片內 per-plan
 *      DatePicker、抓取仍為 intent-driven（無 useEffect mount fetch）。
 */

import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const { filterSchedulesForPlan } = await import(
  path.join(ROOT, 'src/components/activity/plan-schedule-match.ts')
);

const PLAN_A = 'half-day';
const PLAN_B = 'full-day';
const UUID_X = 'cccccccc-0000-0000-0000-000000000001';
const KNOWN = [PLAN_A, PLAN_B];

function sched(planId, date, overrides = {}) {
  return {
    startAt: `${date}T09:00:00+08:00`,
    capacity: 10,
    bookedCount: 0,
    status: 'open',
    planId,
    ...overrides,
  };
}

describe('filterSchedulesForPlan', () => {
  it('keeps only the plan-bound rows plus planId=null global rows', () => {
    const schedules = [
      sched(PLAN_A, '2026-06-15'),
      sched(PLAN_B, '2026-06-16'),
      sched(null, '2026-06-17'),
    ];
    const forA = filterSchedulesForPlan(schedules, PLAN_A, KNOWN);
    assert.deepEqual(
      forA.map((s) => s.startAt.slice(0, 10)),
      ['2026-06-15', '2026-06-17'],
      '半日方案應只看到 6/15（自己的）與 6/17（全方案通用）',
    );
    const forB = filterSchedulesForPlan(schedules, PLAN_B, KNOWN);
    assert.deepEqual(
      forB.map((s) => s.startAt.slice(0, 10)),
      ['2026-06-16', '2026-06-17'],
      '全日方案應只看到 6/16 與 6/17',
    );
  });

  it('supports snake_case plan_id rows', () => {
    const schedules = [
      { start_at: '2026-06-15T09:00:00+08:00', capacity: 5, booked_count: 0, plan_id: PLAN_A },
      { start_at: '2026-06-16T09:00:00+08:00', capacity: 5, booked_count: 0, plan_id: PLAN_B },
    ];
    const forA = filterSchedulesForPlan(schedules, PLAN_A, KNOWN);
    assert.equal(forA.length, 1);
    assert.equal(forA[0].plan_id, PLAN_A);
  });

  it('falls back to ALL rows when every schedule planId is foreign to the known plan-ID space (#839 defense)', () => {
    const schedules = [sched(UUID_X, '2026-06-15'), sched(UUID_X, '2026-06-16')];
    const forA = filterSchedulesForPlan(schedules, PLAN_A, KNOWN);
    assert.equal(forA.length, 2, 'UUID↔slug ID 空間不一致時不得把日期全灰掉');
  });

  it('does NOT fall back when at least one schedule matches the known ID space', () => {
    const schedules = [sched(PLAN_A, '2026-06-15'), sched(UUID_X, '2026-06-16')];
    const forB = filterSchedulesForPlan(schedules, PLAN_B, KNOWN);
    assert.equal(forB.length, 0, 'ID 空間一致時維持嚴格過濾');
  });

  it('empty schedules → empty result', () => {
    assert.deepEqual(filterSchedulesForPlan([], PLAN_A, KNOWN), []);
  });
});

// ---------- DatePlanSection 來源契約 ----------

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

test('DatePlanSection：移除上方「出發日期」日期條（plan-first 流程）', async () => {
  const src = await readSource('src/components/activity/DatePlanSection.tsx');
  assert.doesNotMatch(src, /出發日期/, '上方出發日期區塊必須移除');
});

test('DatePlanSection：選中的方案卡片內渲染 per-plan DatePicker（用 filterSchedulesForPlan 過濾）', async () => {
  const src = await readSource('src/components/activity/DatePlanSection.tsx');
  assert.match(src, /filterSchedulesForPlan/, '必須使用共用 pure helper 過濾該方案場次');
  assert.match(src, /isSelected\s*&&[\s\S]*?<DatePicker/, 'DatePicker 只在方案被選取時渲染');
});

test('DatePlanSection：可用性抓取仍為 intent-driven（無 mount fetch），點方案時觸發', async () => {
  const src = await readSource('src/components/activity/DatePlanSection.tsx');
  assert.doesNotMatch(src, /useEffect\s*\(/, '不得加入 mount-time fetch');
  assert.match(
    src,
    /onClick=\{\(\) => \{\s*if \(!canBook\) return;\s*void ensureLiveAvailability\(\);/s,
    '點方案卡片時觸發單次可用性抓取',
  );
});

test('DatePlanSection：切換方案時清掉已選日期（日期屬於方案脈絡）', async () => {
  const src = await readSource('src/components/activity/DatePlanSection.tsx');
  assert.match(
    src,
    /setSelectedDate\(null\)/,
    '切換到不同方案時必須重設 selectedDate，避免帶著 A 方案的日期去訂 B 方案',
  );
});
