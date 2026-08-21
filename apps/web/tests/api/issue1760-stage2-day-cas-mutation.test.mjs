/**
 * Issue #1760 Stage 2 — PUT /api/v2/guide/midao/availability/days/[date] canonical CAS 契約。
 * 唯一寫入路徑為 midao_replace_global_day_availability RPC（service-role）；
 * 需要 expectedRevision＋Idempotency-Key；409/422/404 對映精確；CSRF 與 guide session 不放寬。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  replaceCanonicalDayAvailabilityDb,
  applyCanonicalDayBatchDb,
  MidaoCanonicalAvailabilityError,
  __resetMemCanonicalAvailability,
  __seedMemCanonicalAvailability,
} from '../../src/lib/midao/db-midao-canonical-availability.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '../../');
const dayRoute = path.join(webRoot, 'app/api/v2/guide/midao/availability/days/[date]/route.ts');
const defaultsRoute = path.join(webRoot, 'app/api/v2/guide/midao/availability/defaults/route.ts');
const gateway = path.join(webRoot, 'src/lib/midao/db-midao-canonical-availability.mjs');

const G = '11111111-1111-4111-8111-111111111111';
const TZ = 'Asia/Taipei';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const cmd = (over = {}) => ({
  guideId: G,
  date: '2026-09-05',
  timezone: TZ,
  expectedRevision: 0,
  ranges: [{ startTimeLocal: '13:00', endTimeLocal: '17:00' }],
  idempotencyKey: 'key-1',
  requestHash: HASH_A,
  ...over,
});

test.beforeEach(() => __resetMemCanonicalAvailability());

test('day PUT route：CSRF＋guide session，且 guideId 取自 session 而非 client', () => {
  const src = fs.readFileSync(dayRoute, 'utf8');
  assert.match(src, /validateCsrf/u);
  assert.match(src, /verifyGuideSession/u);
  assert.match(src, /session\.guideId/u);
  assert.doesNotMatch(src, /body\.guideId|body\?\.guideId/u);
});

test('day PUT route：只用 canonical gateway，退出平行引擎', () => {
  const src = fs.readFileSync(dayRoute, 'utf8');
  assert.match(src, /db-midao-canonical-availability\.mjs/u);
  assert.match(src, /replaceCanonicalDayAvailabilityDb/u);
  assert.doesNotMatch(src, /db-midao-availability\.mjs/u);
  assert.doesNotMatch(src, /setDayOverrideDb|getMonthEffectiveDb/u);
});

test('day PUT route：必填 expectedRevision 與 Idempotency-Key，缺一 422', () => {
  const src = fs.readFileSync(dayRoute, 'utf8');
  assert.match(src, /expectedRevision/u);
  assert.match(src, /[Ii]dempotency-[Kk]ey/u);
  assert.match(src, /MISSING_EXPECTED_REVISION[\s\S]*?422/u);
  assert.match(src, /MISSING_IDEMPOTENCY_KEY[\s\S]*?422/u);
});

test('gateway：唯一寫入路徑是 RPC，不在 JS 重造第二套 CAS 真相', () => {
  const src = fs.readFileSync(gateway, 'utf8');
  assert.match(src, /midao_replace_global_day_availability/u);
  assert.match(src, /p_expected_revision/u);
  assert.match(src, /p_idempotency_key/u);
  assert.match(src, /p_request_hash/u);
  assert.doesNotMatch(src, /midao_availability_defaults|midao_day_overrides/u);
});

test('gateway：RPC code → HTTP status 對映精確', () => {
  const src = fs.readFileSync(gateway, 'utf8');
  assert.match(src, /REVISION_CONFLICT:\s*409/u);
  assert.match(src, /IDEMPOTENCY_KEY_REUSED:\s*409/u);
  assert.match(src, /DAY_TIMEZONE_MISMATCH:\s*422/u);
  assert.match(src, /INVALID_RANGES:\s*422/u);
  assert.match(src, /GUIDE_NOT_FOUND:\s*404/u);
});

test('成功寫入：revision 遞增、isClosed 由空區間決定', async () => {
  const first = await replaceCanonicalDayAvailabilityDb(cmd());
  assert.equal(first.revision, 1);
  assert.equal(first.isClosed, false);
  assert.deepEqual(first.ranges, [{ startTimeLocal: '13:00', endTimeLocal: '17:00' }]);

  const closed = await replaceCanonicalDayAvailabilityDb(
    cmd({ expectedRevision: 1, ranges: [], idempotencyKey: 'key-2', requestHash: HASH_B }),
  );
  assert.equal(closed.revision, 2);
  assert.equal(closed.isClosed, true);
  assert.deepEqual(closed.ranges, []);
});

test('相同 key＋相同 hash：重播原結果，revision 不再遞增', async () => {
  const first = await replaceCanonicalDayAvailabilityDb(cmd());
  const replay = await replaceCanonicalDayAvailabilityDb(cmd());
  assert.deepEqual(replay, first);
});

test('相同 key＋不同 hash：IDEMPOTENCY_KEY_REUSED 409', async () => {
  await replaceCanonicalDayAvailabilityDb(cmd());
  await assert.rejects(
    () => replaceCanonicalDayAvailabilityDb(cmd({ requestHash: HASH_B, ranges: [] })),
    (err) => {
      assert.ok(err instanceof MidaoCanonicalAvailabilityError);
      assert.equal(err.code, 'IDEMPOTENCY_KEY_REUSED');
      assert.equal(err.status, 409);
      return true;
    },
  );
});

test('過期 revision：REVISION_CONFLICT 409 並帶 currentRevision', async () => {
  await replaceCanonicalDayAvailabilityDb(cmd());
  await assert.rejects(
    () => replaceCanonicalDayAvailabilityDb(cmd({ expectedRevision: 0, idempotencyKey: 'key-stale' })),
    (err) => {
      assert.equal(err.code, 'REVISION_CONFLICT');
      assert.equal(err.status, 409);
      assert.equal(err.details.currentRevision, 1);
      return true;
    },
  );
});

test('時區不符：DAY_TIMEZONE_MISMATCH 422', async () => {
  __seedMemCanonicalAvailability({
    dayRevisions: [{ guide_id: G, local_date: '2026-09-05', timezone: TZ, revision: 0, is_closed: false }],
  });
  await assert.rejects(
    () => replaceCanonicalDayAvailabilityDb(cmd({ timezone: 'UTC', idempotencyKey: 'key-tz' })),
    (err) => {
      assert.equal(err.code, 'DAY_TIMEZONE_MISMATCH');
      assert.equal(err.status, 422);
      return true;
    },
  );
});

test('W-2 批次：逐日走同一條 CAS 寫入，衝突日不中斷其他日', async () => {
  __seedMemCanonicalAvailability({
    dayRevisions: [{ guide_id: G, local_date: '2026-09-12', timezone: TZ, revision: 5, is_closed: false }],
  });
  const result = await applyCanonicalDayBatchDb({
    guideId: G,
    days: [
      { date: '2026-09-05', timezone: TZ, expectedRevision: 0, ranges: [{ startTimeLocal: '09:00', endTimeLocal: '12:00' }], idempotencyKey: 'b-1', requestHash: HASH_A },
      { date: '2026-09-12', timezone: TZ, expectedRevision: 0, ranges: [{ startTimeLocal: '09:00', endTimeLocal: '12:00' }], idempotencyKey: 'b-2', requestHash: HASH_A },
      { date: '2026-09-19', timezone: TZ, expectedRevision: 0, ranges: [], idempotencyKey: 'b-3', requestHash: HASH_B },
    ],
  });
  assert.equal(result.applied.length, 2);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].date, '2026-09-12');
  assert.equal(result.conflicts[0].currentRevision, 5);
});

test('W-2 defaults route：批次轉單日 canonical 寫入，不寫週預設durable 表', () => {
  const src = fs.readFileSync(defaultsRoute, 'utf8');
  assert.match(src, /db-midao-canonical-availability\.mjs/u);
  assert.match(src, /applyCanonicalDayBatchDb/u);
  assert.doesNotMatch(src, /db-midao-availability\.mjs/u);
  assert.doesNotMatch(src, /setWeeklyDefaultsDb|getWeeklyDefaultsDb/u);
  assert.doesNotMatch(src, /midao_availability_defaults/u);
  assert.match(src, /validateCsrf/u);
});
