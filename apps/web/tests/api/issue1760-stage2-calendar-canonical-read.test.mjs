/**
 * Issue #1760 Stage 2 — /api/v2/guide/midao/calendar canonical 月讀取契約。
 * 讀取真相：guide_availability_rules（global）＋ guide_availability_day_revisions，
 * 經 createCanonicalAvailabilityRuleSelector；不得回退 midao_* 舊表。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getCanonicalMonthCalendarDb,
  getCanonicalDayDb,
  __resetMemCanonicalAvailability,
  __seedMemCanonicalAvailability,
} from '../../src/lib/midao/db-midao-canonical-availability.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '../../');
const calendarRoute = path.join(webRoot, 'app/api/v2/guide/midao/calendar/route.ts');
const gateway = path.join(webRoot, 'src/lib/midao/db-midao-canonical-availability.mjs');

const G = '11111111-1111-4111-8111-111111111111';
const TZ = 'Asia/Taipei';

test.beforeEach(() => __resetMemCanonicalAvailability());

test('calendar GET route 只讀 canonical gateway，不再 import 平行引擎', () => {
  const src = fs.readFileSync(calendarRoute, 'utf8');
  assert.match(src, /db-midao-canonical-availability\.mjs/u);
  assert.match(src, /getCanonicalMonthCalendarDb/u);
  assert.doesNotMatch(src, /db-midao-availability\.mjs/u);
  assert.doesNotMatch(src, /getMonthEffectiveDb/u);
});

test('calendar GET 保留 requests/bookings 疊加與 degrade 契約', () => {
  const src = fs.readFileSync(calendarRoute, 'utf8');
  assert.match(src, /listMidaoRequestsDb/u);
  assert.match(src, /hasPending/u);
  assert.match(src, /hasConfirmed/u);
  assert.match(src, /fetchBookingsOverlay/u);
  // bookings 查詢失敗 degrade 為空陣列（既有 spec §8），不整頁 500
  assert.match(src, /catch\s*\{\s*return\s*\[\]/u);
  // 新增欄位
  assert.match(src, /revision/u);
  assert.match(src, /isClosed/u);
  assert.match(src, /timezone/u);
});

test('gateway 走 canonical selector，且不含任何 midao_* 舊表存取', () => {
  const src = fs.readFileSync(gateway, 'utf8');
  assert.match(src, /createCanonicalAvailabilityRuleSelector/u);
  assert.match(src, /guide_availability_rules/u);
  assert.match(src, /guide_availability_day_revisions/u);
  assert.doesNotMatch(src, /midao_availability_defaults/u);
  assert.doesNotMatch(src, /midao_day_overrides/u);
  // 不得經 db.mjs 取 client
  assert.doesNotMatch(src, /from '\.\.\/db\.mjs'/u);
  assert.match(src, /supabase-env\.mjs/u);
});

test('月投影：每日皆有 date/ranges/revision/isClosed/timezone/availability', async () => {
  const days = await getCanonicalMonthCalendarDb(G, '2026-09', { timezone: TZ });
  assert.equal(days.length, 30);
  for (const day of days) {
    assert.match(day.date, /^2026-09-\d{2}$/u);
    assert.deepEqual(day.ranges, []);
    assert.equal(day.revision, 0);
    assert.equal(day.isClosed, false);
    assert.equal(day.timezone, TZ);
    assert.deepEqual(day.availability, { morning: false, afternoon: false, evening: false, custom: [] });
  }
});

test('單日覆寫規則投影為 U-1 段別並帶出 revision', async () => {
  __seedMemCanonicalAvailability({
    rules: [{
      guide_id: G, activity_plan_id: null, weekday: 6,
      start_time_local: '13:00:00', end_time_local: '17:00:00', timezone: TZ,
      effective_from: '2026-09-05', effective_to: '2026-09-05', is_active: true,
    }],
    dayRevisions: [{ guide_id: G, local_date: '2026-09-05', timezone: TZ, revision: 3, is_closed: false }],
  });
  const day = await getCanonicalDayDb(G, '2026-09-05', { timezone: TZ });
  assert.deepEqual(day.ranges, [{ startTimeLocal: '13:00', endTimeLocal: '17:00' }]);
  assert.equal(day.availability.afternoon, true);
  assert.equal(day.availability.morning, false);
  assert.equal(day.revision, 3);
  assert.equal(day.isClosed, false);
});

test('closed 日（is_closed=true）不得回任何開放區間', async () => {
  __seedMemCanonicalAvailability({
    rules: [{
      guide_id: G, activity_plan_id: null, weekday: 0,
      start_time_local: '09:00:00', end_time_local: '12:00:00', timezone: TZ,
      effective_from: '2026-09-06', effective_to: '2026-09-06', is_active: true,
    }],
    dayRevisions: [{ guide_id: G, local_date: '2026-09-06', timezone: TZ, revision: 9, is_closed: true }],
  });
  const day = await getCanonicalDayDb(G, '2026-09-06', { timezone: TZ });
  assert.deepEqual(day.ranges, []);
  assert.equal(day.isClosed, true);
  assert.equal(day.revision, 9);
});

test('週期性 global 規則在無日修訂時依 weekday 生效', async () => {
  // 2026-09-05 為週六（getUTCDay=6）
  __seedMemCanonicalAvailability({
    rules: [{
      guide_id: G, activity_plan_id: null, weekday: 6,
      start_time_local: '09:00:00', end_time_local: '12:00:00', timezone: TZ,
      effective_from: null, effective_to: null, is_active: true,
    }],
  });
  const days = await getCanonicalMonthCalendarDb(G, '2026-09', { timezone: TZ });
  const saturday = days.find((d) => d.date === '2026-09-05');
  const sunday = days.find((d) => d.date === '2026-09-06');
  assert.equal(saturday.availability.morning, true);
  assert.equal(sunday.availability.morning, false);
});

test('跨導遊隔離：他人的規則不得外洩', async () => {
  __seedMemCanonicalAvailability({
    rules: [{
      guide_id: '22222222-2222-4222-8222-222222222222', activity_plan_id: null, weekday: 6,
      start_time_local: '09:00:00', end_time_local: '12:00:00', timezone: TZ,
      effective_from: null, effective_to: null, is_active: true,
    }],
  });
  const days = await getCanonicalMonthCalendarDb(G, '2026-09', { timezone: TZ });
  assert.equal(days.every((d) => d.ranges.length === 0), true);
});

test('可用性讀取失敗必須 5xx，不得 degrade 成全部可用', () => {
  const src = fs.readFileSync(gateway, 'utf8');
  assert.match(src, /AVAILABILITY_READ_FAILED[\s\S]*?500/u);
  assert.doesNotMatch(src, /catch\s*\{\s*return\s*\{\s*morning:\s*true/u);
});
