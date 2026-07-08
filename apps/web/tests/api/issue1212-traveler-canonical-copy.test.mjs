// Issue #1212 — Traveler-facing `messageZh` from
// /api/v2/activities/[activityId]/available-slots must route through
// `getCanonicalReasonCopy` so it matches the same canonical text that
// Admin + Guide preview surfaces render (which already do via
// `describePreviewReason` per PR #1250).
//
// Audit (post-#1307) found PR #1250 only wired 2/3 surfaces — Admin +
// Guide. The Traveler messageZh was still hard-coded inside
// `booking-availability-evaluator.ts`, so the same canonical state
// produced different copy across the three surfaces. AC #3 of #1212
// requires all three.
//
// Scope of this slice (smallest correct surface):
// 1. Expose `canonicalReasonState` on evaluator output for the
//    selectedSchedule path, derived from the existing
//    `canonicalSelectedSchedule.state` (already computed; just unhidden).
// 2. At the route-handler boundary, when canonicalReasonState is set,
//    `messageZh` is replaced with `getCanonicalReasonCopy(state).bodyZh`.
//    The legacy `reasonCode` + the evaluator's internal messageZh are
//    preserved (no downstream consumer break).
// 3. Source-contract on the route file: it imports the helper and uses
//    canonicalReasonState.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { evaluateBookingAvailability } from '../../src/lib/availability-v2/booking-availability-evaluator.ts';
import { getCanonicalReasonCopy } from '../../src/lib/availability-v2/canonical-reason-copy.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const ROUTE_HANDLER_PATH = join(
  REPO_ROOT,
  'app/api/v2/activities/[activityId]/available-slots/route-handler.ts',
);

const TZ = 'Asia/Taipei';
const GUIDE_ID = 'g-1212-traveler';
const ACTIVITY_ID = 'a-1212-traveler';
const PLAN_ID = 'p-1212-traveler';
// 測試日＝「未來（≥14 天後）的週三」動態計算——原本寫死 2026-07-08（週三），
// 當真實日期走到當天時，評估器的「今日」判定會蓋過預期 reason state（2026-07-08 實錄：
// blackout 案回 blocked_by_conflict、positive 案冒出 reason state，main CI 當日必紅）。
// 動態日期保住 weekday=3 的規則語意，永不與 today 碰撞。
function futureWednesdayTaipei(minDaysAhead = 14) {
  const taipeiNow = new Date(Date.now() + 8 * 3600_000);
  const d = new Date(Date.UTC(taipeiNow.getUTCFullYear(), taipeiNow.getUTCMonth(), taipeiNow.getUTCDate() + minDaysAhead));
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const REQUEST_DATE = futureWednesdayTaipei();
const REQUEST_START = `${REQUEST_DATE}T09:00:00+08:00`;
const REQUEST_END = `${REQUEST_DATE}T12:00:00+08:00`;

function weekdayRule(overrides = {}) {
  return {
    id: 'rule-1212',
    guide_id: GUIDE_ID,
    activity_plan_id: PLAN_ID,
    weekday: 3,
    start_time_local: '09:00',
    end_time_local: '12:00',
    timezone: TZ,
    slot_interval_minutes: 180,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    effective_from: null,
    effective_to: null,
    is_active: true,
    ...overrides,
  };
}

function activeSeason(overrides = {}) {
  // A season that does NOT cover July 8 (1/1 - 3/31)
  return {
    id: 'season-1212',
    activity_plan_id: PLAN_ID,
    start_month: 1,
    start_day: 1,
    end_month: 3,
    end_day: 31,
    timezone: TZ,
    is_active: true,
    ...overrides,
  };
}

function selectedSchedule(overrides = {}) {
  return {
    id: 'schedule-1212',
    activity_id: ACTIVITY_ID,
    plan_id: PLAN_ID,
    start_at: REQUEST_START,
    end_at: REQUEST_END,
    capacity: 8,
    booked_count: 0,
    status: 'open',
    ...overrides,
  };
}

function baseInput(overrides = {}) {
  return {
    guideId: GUIDE_ID,
    activityId: ACTIVITY_ID,
    planId: PLAN_ID,
    timezone: TZ,
    participants: 1,
    dateFrom: REQUEST_DATE,
    dateTo: REQUEST_DATE,
    minParticipants: 1,
    rules: [weekdayRule()],
    blackouts: [],
    bookings: [],
    plan: {
      id: PLAN_ID,
      activity_id: ACTIVITY_ID,
      duration_minutes: 180,
      max_participants: 8,
      booking_type: 'scheduled',
      is_year_round: false,
    },
    seasons: [],
    planStatus: 'active',
    selectedScheduleAuthority: 'authoritative',
    ...overrides,
  };
}

// ---------- evaluator: canonicalReasonState surface ----------

test('evaluator exposes canonicalReasonState=outside_season when selected schedule is outside an active season', () => {
  const out = evaluateBookingAvailability(
    baseInput({
      seasons: [activeSeason()],
      selectedSchedule: selectedSchedule(),
    }),
  );
  assert.equal(out.available, false);
  assert.equal(out.canonicalReasonState, 'outside_season', 'evaluator must surface canonical state for boundary translation');
});

test('evaluator exposes canonicalReasonState=blackout when selected schedule falls inside a blackout window', () => {
  const out = evaluateBookingAvailability(
    baseInput({
      blackouts: [
        {
          id: 'b-1212',
          guide_id: GUIDE_ID,
          starts_at: `${REQUEST_DATE}T08:00:00+08:00`,
          ends_at: `${REQUEST_DATE}T20:00:00+08:00`,
          reason: 'leave',
          source: 'manual',
        },
      ],
      selectedSchedule: selectedSchedule(),
    }),
  );
  assert.equal(out.available, false);
  assert.equal(out.canonicalReasonState, 'blackout');
});

test('evaluator exposes canonicalReasonState=blocked_by_conflict when selected schedule overlaps an existing booking (no admin override)', () => {
  const out = evaluateBookingAvailability(
    baseInput({
      bookings: [
        {
          id: 'bk-1212',
          guide_id: GUIDE_ID,
          start_at: REQUEST_START,
          end_at: REQUEST_END,
          status: 'confirmed',
          participants: 1,
          activity_id: 'a-other',
          activity_plan_id: 'p-other',
        },
      ],
      selectedSchedule: selectedSchedule(),
    }),
  );
  assert.equal(out.available, false);
  assert.equal(out.canonicalReasonState, 'blocked_by_conflict');
});

test('evaluator exposes canonicalReasonState=full when selected schedule has insufficient remaining capacity', () => {
  const out = evaluateBookingAvailability(
    baseInput({
      participants: 5,
      selectedSchedule: selectedSchedule({ capacity: 4, booked_count: 0 }),
    }),
  );
  assert.equal(out.available, false);
  assert.equal(out.canonicalReasonState, 'full');
});

test('evaluator leaves canonicalReasonState undefined when no selectedSchedule (bulk preview)', () => {
  // No selectedSchedule → no aggregate canonical state from evaluator;
  // bulk capacity / outside_rule messages stay as-is for now (richer copy
  // with numbers; future slice can bridge if needed).
  const out = evaluateBookingAvailability(
    baseInput({
      rules: [weekdayRule({ weekday: 0 })], // Sunday — does not cover REQUEST_DATE (always a Wednesday)
    }),
  );
  assert.equal(out.available, false);
  assert.equal(out.canonicalReasonState, undefined);
});

test('evaluator preserves legacy reasonCode + messageZh shape when canonicalReasonState is set (no downstream break)', () => {
  const out = evaluateBookingAvailability(
    baseInput({
      seasons: [activeSeason()],
      selectedSchedule: selectedSchedule(),
    }),
  );
  // Legacy contract preserved — downstream consumers that read these
  // exact fields keep working.
  assert.equal(out.reasonCode, 'outside_season');
  assert.match(out.messageZh, /季節/);
});

test('evaluator canonicalReasonState is undefined when slots are available (positive case must not surface a reason state)', () => {
  const out = evaluateBookingAvailability(
    baseInput({
      selectedSchedule: selectedSchedule(),
    }),
  );
  assert.equal(out.available, true);
  assert.equal(out.canonicalReasonState, undefined);
  assert.equal(out.messageZh, undefined);
});

// ---------- canonical helper sanity: every covered state produces non-empty bodyZh ----------

test('getCanonicalReasonCopy returns non-empty bodyZh for every state this slice bridges', () => {
  for (const state of ['outside_season', 'blackout', 'blocked_by_conflict', 'full']) {
    const copy = getCanonicalReasonCopy(state);
    assert.ok(copy.bodyZh && copy.bodyZh.length > 0, `${state} bodyZh must be non-empty`);
  }
});

// ---------- route-handler source contract: helper is wired ----------

test('route-handler imports getCanonicalReasonCopy', () => {
  const src = readFileSync(ROUTE_HANDLER_PATH, 'utf8');
  assert.match(
    src,
    /import\s*{[^}]*getCanonicalReasonCopy[^}]*}\s*from\s*['"][^'"]*canonical-reason-copy(\.ts)?['"]/,
    'route-handler must import getCanonicalReasonCopy from canonical-reason-copy.ts',
  );
});

test('route-handler uses availability.canonicalReasonState to override messageZh with helper bodyZh', () => {
  const src = readFileSync(ROUTE_HANDLER_PATH, 'utf8');
  // The route must read canonicalReasonState from the evaluator output
  // and call the canonical helper to derive messageZh.
  assert.match(src, /availability\.canonicalReasonState\b/, 'route must read canonicalReasonState');
  assert.match(src, /getCanonicalReasonCopy\(\s*availability\.canonicalReasonState/, 'route must pass canonicalReasonState to the helper');
});

test('route-handler still exposes legacy `messageZh` field in the success response (AC #5 — no shape change)', () => {
  const src = readFileSync(ROUTE_HANDLER_PATH, 'utf8');
  assert.match(src, /messageZh\s*:/, 'response must still include messageZh');
});

test('route-handler exposes canonicalReasonState in the response so downstream surfaces can re-derive copy if needed', () => {
  const src = readFileSync(ROUTE_HANDLER_PATH, 'utf8');
  assert.match(src, /canonicalReasonState\s*:/, 'response must include canonicalReasonState');
});

// ---------- evaluator source contract: keep messageZh + reasonCode emission intact ----------

test('evaluator still emits both reasonCode and messageZh keys (legacy contract preserved)', () => {
  const evaluatorSrc = readFileSync(
    join(REPO_ROOT, 'src/lib/availability-v2/booking-availability-evaluator.ts'),
    'utf8',
  );
  // Belt-and-suspenders: the return object must still have reasonCode + messageZh,
  // so old consumers (admin draft, guide preview, evaluator-parity tests) keep working.
  assert.match(evaluatorSrc, /\breasonCode\b/);
  assert.match(evaluatorSrc, /\bmessageZh\b/);
  assert.match(evaluatorSrc, /\bcanonicalReasonState\b/, 'evaluator must surface canonicalReasonState in its output');
});
