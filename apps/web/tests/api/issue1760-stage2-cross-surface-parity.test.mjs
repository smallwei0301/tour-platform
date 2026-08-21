/**
 * Issue #1760 Stage 2 — 跨介面 canonical 一致性。
 *
 * 比較面：guide 行事曆 GET、旅客端公開接案頁 availability、以及 canonical 解析器
 * （traveler available-slots / guide preview 共用的 createCanonicalAvailabilityRuleSelector）。
 * 三者必須對同一組 canonical 規則／日修訂得到相同的可用結論；任一面不得自帶第二套真相。
 *
 * 註：本 repo 的 #1760 系列 API 測試皆為「in-memory fallback seam ＋ 靜態原始碼契約斷言」，
 * 無本機 Supabase 實例；此處不假造真 DB 證據。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getCanonicalMonthCalendarDb,
  replaceCanonicalDayAvailabilityDb,
  __resetMemCanonicalAvailability,
  __seedMemCanonicalAvailability,
} from '../../src/lib/midao/db-midao-canonical-availability.mjs';
import {
  canonicalRangesToOpenPeriods,
  MIDAO_SEGMENT_RANGES,
} from '../../src/lib/midao/midao-calendar-canonical.ts';
import { createCanonicalAvailabilityRuleSelector } from '../../src/lib/availability-v2/effective-availability-resolver.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '../../');
const calendarRoute = path.join(webRoot, 'app/api/v2/guide/midao/calendar/route.ts');
const publicRoute = path.join(webRoot, 'app/api/v2/public/midao/guides/[slug]/availability/route.ts');
const dayRoute = path.join(webRoot, 'app/api/v2/guide/midao/availability/days/[date]/route.ts');
const defaultsRoute = path.join(webRoot, 'app/api/v2/guide/midao/availability/defaults/route.ts');
const gateway = path.join(webRoot, 'src/lib/midao/db-midao-canonical-availability.mjs');

const G = '11111111-1111-4111-8111-111111111111';
const TZ = 'Asia/Taipei';
const HASH = 'c'.repeat(64);

/** 旅客／導覽預覽面所使用的 canonical selector，直接對同一組來源求值。 */
function selectorRangesFor(date, { rules, dayRevisions, policy = 'inherit' }) {
  const select = createCanonicalAvailabilityRuleSelector({
    guideId: G, planId: 'plan-1', policy, rules, dayRevisions, timezone: TZ,
  });
  return select(date).map((rule) => ({
    startTimeLocal: String(rule.start_time_local).slice(0, 5),
    endTimeLocal: String(rule.end_time_local).slice(0, 5),
  }));
}

test.beforeEach(() => __resetMemCanonicalAvailability());

test('四個消費端全部只讀 canonical，無任一面保留平行引擎', () => {
  for (const file of [calendarRoute, publicRoute, dayRoute, defaultsRoute]) {
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /db-midao-canonical-availability\.mjs/u, `${path.basename(file)} 應使用 canonical gateway`);
    assert.doesNotMatch(src, /db-midao-availability\.mjs/u, `${path.basename(file)} 不得保留平行引擎`);
  }
});

test('gateway 與 traveler/preview 共用同一個 canonical selector（非另建解析器）', () => {
  const src = fs.readFileSync(gateway, 'utf8');
  assert.match(src, /effective-availability-resolver/u);
  assert.match(src, /createCanonicalAvailabilityRuleSelector/u);
});

test('parity：開放日 — 行事曆、公開 openPeriods、selector 三者一致', async () => {
  const rules = [{
    guide_id: G, activity_plan_id: null, weekday: 6,
    start_time_local: '13:00:00', end_time_local: '17:00:00', timezone: TZ,
    effective_from: '2026-09-05', effective_to: '2026-09-05', is_active: true,
  }];
  const dayRevisions = [{ guide_id: G, local_date: '2026-09-05', timezone: TZ, revision: 1, is_closed: false }];
  __seedMemCanonicalAvailability({ rules, dayRevisions });

  const day = (await getCanonicalMonthCalendarDb(G, '2026-09', { timezone: TZ }))
    .find((d) => d.date === '2026-09-05');

  assert.deepEqual(day.ranges, [MIDAO_SEGMENT_RANGES.afternoon]);
  assert.deepEqual(canonicalRangesToOpenPeriods(day.ranges), ['afternoon']);
  assert.deepEqual(selectorRangesFor('2026-09-05', { rules, dayRevisions }), day.ranges);
});

test('parity：關閉日（tombstone）— 三面皆為空，公開面不得洩漏任何開放段別', async () => {
  const rules = [{
    guide_id: G, activity_plan_id: null, weekday: 0,
    start_time_local: '09:00:00', end_time_local: '12:00:00', timezone: TZ,
    effective_from: '2026-09-06', effective_to: '2026-09-06', is_active: true,
  }];
  const dayRevisions = [{ guide_id: G, local_date: '2026-09-06', timezone: TZ, revision: 2, is_closed: true }];
  __seedMemCanonicalAvailability({ rules, dayRevisions });

  const day = (await getCanonicalMonthCalendarDb(G, '2026-09', { timezone: TZ }))
    .find((d) => d.date === '2026-09-06');

  assert.deepEqual(day.ranges, []);
  assert.equal(day.isClosed, true);
  assert.deepEqual(canonicalRangesToOpenPeriods(day.ranges), []);
  assert.deepEqual(selectorRangesFor('2026-09-06', { rules, dayRevisions }), []);
});

test('parity：plan policy=closed 時 selector 關閉，行事曆全域面不受 plan 政策污染', async () => {
  const rules = [{
    guide_id: G, activity_plan_id: null, weekday: 6,
    start_time_local: '09:00:00', end_time_local: '12:00:00', timezone: TZ,
    effective_from: null, effective_to: null, is_active: true,
  }];
  assert.deepEqual(selectorRangesFor('2026-09-05', { rules, dayRevisions: [], policy: 'closed' }), []);

  __seedMemCanonicalAvailability({ rules });
  const day = (await getCanonicalMonthCalendarDb(G, '2026-09', { timezone: TZ }))
    .find((d) => d.date === '2026-09-05');
  assert.deepEqual(day.ranges, [MIDAO_SEGMENT_RANGES.morning]);
});

test('parity：單日 CAS 寫入後，行事曆與公開面立即同步到同一份新真相', async () => {
  await replaceCanonicalDayAvailabilityDb({
    guideId: G, date: '2026-09-05', timezone: TZ, expectedRevision: 0,
    ranges: [MIDAO_SEGMENT_RANGES.evening],
    idempotencyKey: 'parity-1', requestHash: HASH,
  });
  const day = (await getCanonicalMonthCalendarDb(G, '2026-09', { timezone: TZ }))
    .find((d) => d.date === '2026-09-05');
  assert.equal(day.revision, 1);
  assert.deepEqual(day.ranges, [MIDAO_SEGMENT_RANGES.evening]);
  assert.deepEqual(canonicalRangesToOpenPeriods(day.ranges), ['evening']);
  assert.equal(day.availability.evening, true);
});

test('parity：時區欄位在三面一致沿用 day revision 的 timezone', async () => {
  __seedMemCanonicalAvailability({
    dayRevisions: [{ guide_id: G, local_date: '2026-09-07', timezone: 'Asia/Tokyo', revision: 1, is_closed: false }],
  });
  const day = (await getCanonicalMonthCalendarDb(G, '2026-09', { timezone: TZ }))
    .find((d) => d.date === '2026-09-07');
  assert.equal(day.timezone, 'Asia/Tokyo');
});

test('parity：scheduled fixed-session 隔離未被本次收斂影響', () => {
  const scheduled = path.join(webRoot, 'src/lib/availability-v2/scheduled-plan-slots.ts');
  assert.equal(fs.existsSync(scheduled), true);
  const gatewaySrc = fs.readFileSync(gateway, 'utf8');
  assert.doesNotMatch(gatewaySrc, /scheduled-plan-slots/u);
});
