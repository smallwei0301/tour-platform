import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFile(path.join(ROOT, p), 'utf8');

test('midao calendar route：month 驗證＋canonical 月曆讀取＋三來源聚合＋bookings degrade', async () => {
  const src = await read('app/api/v2/guide/midao/calendar/route.ts');
  assert.match(src, /jsonError\('INVALID_MONTH'/);
  assert.match(src, /getCanonicalMonthCalendarDb\(session\.guideId, month\)/);
  assert.doesNotMatch(src, /getMonthEffectiveDb\(/);
  assert.match(src, /listMidaoRequestsDb\(session\.guideId/);
  assert.match(src, /from\('bookings'\)/);
  assert.match(src, /catch \{\s*return \[\];/); // degrade 不整頁 500
  assert.match(src, /hasPending/);
  assert.match(src, /hasConfirmed/);
  assert.match(src, /taipeiDateOf/);
  assert.match(src, /b\.status === 'confirmed'/);
  assert.match(src, /mm < 1 \|\| mm > 12/);
});

test('midao availability defaults route：GET\/POST canonical batch CAS＋CSRF＋idempotency', async () => {
  const src = await read('app/api/v2/guide/midao/availability/defaults/route.ts');
  assert.match(src, /export\s+async\s+function\s+GET/);
  assert.match(src, /export\s+async\s+function\s+POST/);
  assert.match(src, /validateCsrf\(request\)/);
  assert.match(src, /applyCanonicalDayBatchDb\(\{ guideId: session\.guideId, days \}\)/);
  assert.match(src, /expectedRevision/);
  assert.match(src, /idempotency-key/);
  assert.doesNotMatch(src, /setWeeklyDefaultsDb\(/);
});

test('midao availability day route：日期驗證＋canonical CAS/idempotency 寫入＋回生效結果', async () => {
  const src = await read('app/api/v2/guide/midao/availability/days/[date]/route.ts');
  assert.match(src, /jsonError\('INVALID_DATE'/);
  assert.match(src, /replaceCanonicalDayAvailabilityDb\(\{/);
  assert.match(src, /guideId:\s*session\.guideId/);
  assert.match(src, /expectedRevision/);
  assert.match(src, /idempotency-key/);
  assert.match(src, /getCanonicalDayDb\(session\.guideId, date/);
  assert.doesNotMatch(src, /setDayOverrideDb\(/);
});
