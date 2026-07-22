import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFile(path.join(ROOT, p), 'utf8');

test('midao calendar route：month 驗證＋三來源聚合＋bookings degrade', async () => {
  const src = await read('app/api/v2/guide/midao/calendar/route.ts');
  assert.match(src, /jsonError\('INVALID_MONTH'/);
  assert.match(src, /getMonthEffectiveDb\(session\.guideId, month\)/);
  assert.match(src, /listMidaoRequestsDb\(session\.guideId/);
  assert.match(src, /from\('bookings'\)/);
  assert.match(src, /catch \{\s*return \[\];/); // degrade 不整頁 500
  assert.match(src, /hasPending/);
  assert.match(src, /hasConfirmed/);
});

test('midao availability defaults route：GET/PUT＋CSRF', async () => {
  const src = await read('app/api/v2/guide/midao/availability/defaults/route.ts');
  assert.match(src, /export\s+async\s+function\s+GET/);
  assert.match(src, /export\s+async\s+function\s+PUT/);
  assert.match(src, /validateCsrf\(request\)/);
  assert.match(src, /setWeeklyDefaultsDb\(session\.guideId, body\.weekdays\)/);
});

test('midao availability day route：日期驗證＋回生效結果', async () => {
  const src = await read('app/api/v2/guide/midao/availability/days/[date]/route.ts');
  assert.match(src, /jsonError\('INVALID_DATE'/);
  assert.match(src, /setDayOverrideDb\(session\.guideId, date/);
  assert.match(src, /getMonthEffectiveDb\(session\.guideId, month\)/);
});
