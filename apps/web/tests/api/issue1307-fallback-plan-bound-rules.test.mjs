// Issue #1307 follow-up — guide 後台「時段預覽」在預設（未選方案）視圖仍然
// 一個 slot 都不顯示，即使導遊已設定好規則。
//
// 根因（#1307 修了季節文案、沒修 slot 產生本身）：
//   route.ts 的 generateFallbackPreviewSlots() 以 activityPlanId:null 呼叫
//   generateAvailableSlots()，而 slot-generator 的 getAvailabilityRules()
//   在 planId=null 時會把所有「綁定特定方案」的規則全部濾掉
//   （rule.activity_plan_id !== null && rule.activity_plan_id !== planId）。
//   導遊在 UI 建規則時幾乎都會綁方案 → fallback 預覽永遠 0 slots →
//   「此期間無可用時段」。
//
// 修法：抽出共用 helper generateFallbackPreviewSlots（src/lib/availability-v2/
// fallback-preview-slots.ts），plan-bound 規則以自己的 activity_plan_id 進
// generator（並沿用方案真實 duration / max_participants / min_participants），
// 未綁方案規則維持舊有 synthetic（interval 當 duration）行為。guide 與
// admin 兩條 availability-preview route 都改用此 helper。
//
// Production-equivalent 資料（#1307 issue 證據）：
//   rule weekday=1（週一）09:00–20:00 interval 60、effective 2026-06-01~07-31、
//   綁定 plan 1d4bd7ee-…；traveler V2 API 對 06-15（週一）回 11 個 slot。
//   修正後 fallback 預覽必須回出同樣的 11 個 slot。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateFallbackPreviewSlots } from '../../src/lib/availability-v2/fallback-preview-slots.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const GUIDE_ROUTE = join(REPO_ROOT, 'app/api/guide/availability-preview/route.ts');
const ADMIN_ROUTE = join(REPO_ROOT, 'app/api/v2/admin/guides/[guideId]/availability-preview/route.ts');

const GUIDE_ID = 'guide-1307';
const PLAN_ID = '1d4bd7ee-56a0-4daa-8700-4fa0d1503b59';
const TIMEZONE = 'Asia/Taipei';

function makeRule(overrides = {}) {
  return {
    id: 'rule-1307',
    guide_id: GUIDE_ID,
    activity_plan_id: PLAN_ID,
    weekday: 1, // Monday
    start_time_local: '09:00',
    end_time_local: '20:00',
    timezone: TIMEZONE,
    slot_interval_minutes: 60,
    buffer_before_minutes: 15,
    buffer_after_minutes: 15,
    effective_from: '2026-06-01',
    effective_to: '2026-07-31',
    is_active: true,
    ...overrides,
  };
}

const RANGE = { dateFrom: '2026-06-09', dateTo: '2026-06-16', timezone: TIMEZONE };

// ---------- helper unit: plan-bound rules must NOT be dropped ----------

test('fallback: plan-bound rule generates slots (production repro — 11 slots on Monday 06-15)', () => {
  const slots = generateFallbackPreviewSlots({
    guideId: GUIDE_ID,
    rules: [makeRule()],
    blackouts: [],
    bookings: [],
    ...RANGE,
    planMetaById: {
      [PLAN_ID]: { duration_minutes: 60, max_participants: 10, booking_type: 'scheduled', min_participants: 2 },
    },
  });
  assert.equal(slots.length, 11, 'plan-bound rule must produce 11 slots, not be silently dropped');
  assert.ok(slots[0].startAt.startsWith('2026-06-15T09:00'), `first slot at 09:00 local, got ${slots[0].startAt}`);
  assert.ok(slots[10].startAt.startsWith('2026-06-15T19:00'), `last slot at 19:00 local, got ${slots[10].startAt}`);
});

test('fallback: plan-bound rule without plan meta still generates (interval approximates duration)', () => {
  const slots = generateFallbackPreviewSlots({
    guideId: GUIDE_ID,
    rules: [makeRule()],
    blackouts: [],
    bookings: [],
    ...RANGE,
    planMetaById: {},
  });
  assert.equal(slots.length, 11, 'missing plan meta must not drop the rule');
});

test('fallback: plan duration is respected (duration 90 / interval 60 → slotEnd = start + 90m)', () => {
  const slots = generateFallbackPreviewSlots({
    guideId: GUIDE_ID,
    rules: [makeRule()],
    blackouts: [],
    bookings: [],
    ...RANGE,
    planMetaById: {
      [PLAN_ID]: { duration_minutes: 90, max_participants: 10, booking_type: 'scheduled', min_participants: null },
    },
  });
  assert.ok(slots.length > 0);
  const start = new Date(slots[0].startAt).getTime();
  const end = new Date(slots[0].endAt).getTime();
  assert.equal((end - start) / 60000, 90, 'slot length must come from plan duration, not interval');
});

test('fallback: minParticipants from plan meta is attached to every slot (成團人數)', () => {
  const slots = generateFallbackPreviewSlots({
    guideId: GUIDE_ID,
    rules: [makeRule()],
    blackouts: [],
    bookings: [],
    ...RANGE,
    planMetaById: {
      [PLAN_ID]: { duration_minutes: 60, max_participants: 10, booking_type: 'scheduled', min_participants: 2 },
    },
  });
  assert.ok(slots.every((s) => s.minParticipants === 2));
});

test('fallback: unbound (activity_plan_id null) rule keeps legacy synthetic behavior', () => {
  const slots = generateFallbackPreviewSlots({
    guideId: GUIDE_ID,
    rules: [makeRule({ activity_plan_id: null, end_time_local: '12:00' })],
    blackouts: [],
    bookings: [],
    ...RANGE,
  });
  assert.equal(slots.length, 3, 'unbound rule 09:00-12:00 interval 60 → 3 contiguous slots');
  assert.ok(slots.every((s) => s.minParticipants === null));
});

test('fallback: mixed bound + unbound rules both contribute, sorted and deduped', () => {
  const slots = generateFallbackPreviewSlots({
    guideId: GUIDE_ID,
    rules: [
      makeRule({ id: 'r-bound', end_time_local: '11:00' }),
      // unbound rule covering the exact same window → identical startAt/endAt must dedupe
      makeRule({ id: 'r-unbound', activity_plan_id: null, end_time_local: '11:00' }),
    ],
    blackouts: [],
    bookings: [],
    ...RANGE,
    planMetaById: {
      [PLAN_ID]: { duration_minutes: 60, max_participants: 10, booking_type: 'scheduled', min_participants: null },
    },
  });
  const keys = slots.map((s) => `${s.startAt}|${s.endAt}`);
  assert.equal(new Set(keys).size, keys.length, 'no duplicate startAt|endAt pairs');
  assert.equal(slots.length, 2, '09:00-11:00 interval 60 → 2 slots after dedupe');
  const sorted = [...slots].sort((a, b) => a.startAt.localeCompare(b.startAt));
  assert.deepEqual(slots.map((s) => s.startAt), sorted.map((s) => s.startAt), 'slots sorted by startAt');
});

test('fallback: blackout still filters plan-bound slots', () => {
  const slots = generateFallbackPreviewSlots({
    guideId: GUIDE_ID,
    rules: [makeRule()],
    blackouts: [
      {
        id: 'blackout-1',
        guide_id: GUIDE_ID,
        // covers the whole Monday window (UTC: 06-15 01:00–12:00 = TPE 09:00–20:00)
        starts_at: '2026-06-15T01:00:00Z',
        ends_at: '2026-06-15T12:00:00Z',
        source: 'manual',
      },
    ],
    bookings: [],
    ...RANGE,
    planMetaById: {
      [PLAN_ID]: { duration_minutes: 60, max_participants: 10, booking_type: 'scheduled', min_participants: null },
    },
  });
  assert.equal(slots.length, 0, 'blackout must still suppress slots');
});

test('fallback: rules from another guide are not generated', () => {
  const slots = generateFallbackPreviewSlots({
    guideId: GUIDE_ID,
    rules: [makeRule({ guide_id: 'someone-else' })],
    blackouts: [],
    bookings: [],
    ...RANGE,
  });
  assert.equal(slots.length, 0);
});

// ---------- route source contracts ----------

test('guide route imports the shared fallback helper (no local divergent copy)', () => {
  const src = readFileSync(GUIDE_ROUTE, 'utf8');
  assert.match(
    src,
    /from\s+['"][^'"]*availability-v2\/fallback-preview-slots(\.ts)?['"]/,
    'guide preview route must import the shared fallback-preview-slots helper',
  );
  assert.doesNotMatch(
    src,
    /function\s+generateFallbackPreviewSlots/,
    'guide route must not keep a local generateFallbackPreviewSlots copy',
  );
});

test('guide route fallback plans select includes duration/capacity/booking_type/min_participants', () => {
  const src = readFileSync(GUIDE_ROUTE, 'utf8');
  const planSelectMatch = src.match(
    /\.from\(\s*['"]activity_plans['"]\s*\)\s*\.select\(\s*['"]([^'"]+)['"]\s*\)\s*\.in\(/,
  );
  assert.ok(planSelectMatch, 'expected .from("activity_plans").select(...).in(...) for fallback planIds');
  for (const col of ['duration_minutes', 'max_participants', 'booking_type', 'min_participants', 'is_year_round']) {
    assert.match(planSelectMatch[1], new RegExp(`\\b${col}\\b`), `plans select must include ${col}`);
  }
});

test('admin route uses the shared fallback helper for the no-plan path', () => {
  const src = readFileSync(ADMIN_ROUTE, 'utf8');
  assert.match(
    src,
    /from\s+['"][^'"]*availability-v2\/fallback-preview-slots(\.ts)?['"]/,
    'admin preview route must import the shared fallback-preview-slots helper',
  );
  assert.match(src, /generateFallbackPreviewSlots\s*\(/, 'admin route must call the shared helper');
});

test('admin route aggregates the fallback season gate like #1307 (no outside_season false positive)', () => {
  const src = readFileSync(ADMIN_ROUTE, 'utf8');
  assert.match(
    src,
    /aggregateFallbackSeasonGate/,
    'admin no-plan preview must aggregate seasons across rule-linked plans (parity with guide route #1307)',
  );
});
