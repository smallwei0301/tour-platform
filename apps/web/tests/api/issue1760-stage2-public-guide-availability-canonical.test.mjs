/**
 * Issue #1760 Stage 2（Owner APPROVE_A）— 旅客端公開接案頁可用性 canonical 契約。
 * 保留既有 URL、回應形狀、openPeriods 契約、公開資料邊界與 fail-closed 行為；無任何寫入。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getCanonicalMonthCalendarDb,
  __resetMemCanonicalAvailability,
  __seedMemCanonicalAvailability,
} from '../../src/lib/midao/db-midao-canonical-availability.mjs';
import { canonicalRangesToOpenPeriods } from '../../src/lib/midao/midao-calendar-canonical.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '../../');
const publicRoute = path.join(webRoot, 'app/api/v2/public/midao/guides/[slug]/availability/route.ts');

const G = '11111111-1111-4111-8111-111111111111';
const TZ = 'Asia/Taipei';

test.beforeEach(() => __resetMemCanonicalAvailability());

test('public route：讀取來源改為 canonical，不再 import 平行引擎', () => {
  const src = fs.readFileSync(publicRoute, 'utf8');
  assert.match(src, /db-midao-canonical-availability\.mjs/u);
  assert.match(src, /getCanonicalMonthCalendarDb/u);
  assert.doesNotMatch(src, /db-midao-availability\.mjs/u);
  assert.doesNotMatch(src, /getMonthEffectiveDb/u);
});

test('public route：保留既有 URL 契約與 openPeriods 回應形狀', () => {
  const src = fs.readFileSync(publicRoute, 'utf8');
  assert.match(src, /export async function GET/u);
  assert.match(src, /openPeriods/u);
  assert.match(src, /jsonOk\(\{\s*month,\s*days\s*\}\)/u);
  assert.match(src, /INVALID_MONTH[\s\S]*?400/u);
  assert.match(src, /NOT_FOUND[\s\S]*?404/u);
});

test('public route：無 auth 擴張、無 mutation、無公開資料邊界外洩', () => {
  const src = fs.readFileSync(publicRoute, 'utf8');
  // 只有 GET，沒有任何寫入動詞
  assert.doesNotMatch(src, /export async function (POST|PUT|PATCH|DELETE)/u);
  assert.doesNotMatch(src, /verifyGuideSession|validateCsrf|requireAdmin/u);
  // 不外洩需求單/訂單/revision/時區細節，公開面只有 date + openPeriods
  assert.doesNotMatch(src, /listMidaoRequestsDb|bookings|hasPending|hasConfirmed/u);
  assert.doesNotMatch(src, /revision/u);
});

test('public route：可用性讀取失敗 fail-closed（沿用 handleRouteError，不 degrade）', () => {
  const src = fs.readFileSync(publicRoute, 'utf8');
  assert.match(src, /handleRouteError/u);
  assert.doesNotMatch(src, /catch\s*\{\s*return\s*jsonOk/u);
});

test('canonical → openPeriods：U-1 段別依序輸出，自訂區間不冒充段別', () => {
  assert.deepEqual(
    canonicalRangesToOpenPeriods([
      { startTimeLocal: '18:00', endTimeLocal: '21:00' },
      { startTimeLocal: '09:00', endTimeLocal: '12:00' },
    ]),
    ['morning', 'evening'],
  );
  assert.deepEqual(canonicalRangesToOpenPeriods([{ startTimeLocal: '07:00', endTimeLocal: '08:00' }]), []);
  assert.deepEqual(canonicalRangesToOpenPeriods([]), []);
});

test('公開投影與 canonical 月投影同源：closed 日不得出現任何 openPeriods', async () => {
  __seedMemCanonicalAvailability({
    rules: [{
      guide_id: G, activity_plan_id: null, weekday: 0,
      start_time_local: '09:00:00', end_time_local: '12:00:00', timezone: TZ,
      effective_from: '2026-09-06', effective_to: '2026-09-06', is_active: true,
    }],
    dayRevisions: [{ guide_id: G, local_date: '2026-09-06', timezone: TZ, revision: 4, is_closed: true }],
  });
  const days = await getCanonicalMonthCalendarDb(G, '2026-09', { timezone: TZ });
  const closed = days.find((d) => d.date === '2026-09-06');
  assert.deepEqual(canonicalRangesToOpenPeriods(closed.ranges), []);
});
