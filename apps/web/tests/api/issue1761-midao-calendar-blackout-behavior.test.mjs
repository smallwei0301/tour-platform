/**
 * #1761 slice 1 行為測試：GET /api/v2/guide/midao/calendar 疊加舊後台封鎖日 guide_blackout_dates。
 * 作法同 issue1761-guide-bookings-plan-name-behavior：把 route.ts 的相對 import 改寫為記憶體 stub 後載入，
 * route 的查詢條件與投影邏輯是真實執行的（非字串比對）。
 * 旅客端 available-slots 會讀 guide_blackout_dates；月曆若不顯示，導遊會看到「可用」但旅客訂不到。
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import test, { after, before } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTE = path.resolve(__dirname, '../../app/api/v2/guide/midao/calendar/route.ts');
const HELPER = path.resolve(__dirname, '../../src/lib/midao/midao-calendar-blackouts.mjs');

const STUB_DB = `
const matchRow = (row, filters) => filters.every((f) => {
  if (f.op === 'eq') return row[f.col] === f.val;
  if (f.op === 'in') return f.vals.includes(row[f.col]);
  if (f.op === 'lt') return new Date(row[f.col]).getTime() < new Date(f.val).getTime();
  if (f.op === 'gt') return new Date(row[f.col]).getTime() > new Date(f.val).getTime();
  if (f.op === 'gte') return new Date(row[f.col]).getTime() >= new Date(f.val).getTime();
  if (f.op === 'lte') return new Date(row[f.col]).getTime() <= new Date(f.val).getTime();
  return true;
});
export const hasSupabaseEnv = () => globalThis.__CAL_TEST.hasEnv;
export async function getSupabase() {
  return {
    from(table) {
      const filters = [];
      let cols = null;
      const q = {
        select(str) { cols = String(str).split(',').map((c) => c.trim()).filter(Boolean); return q; },
        eq(col, val) { filters.push({ op: 'eq', col, val }); return q; },
        in(col, vals) { filters.push({ op: 'in', col, vals }); return q; },
        lt(col, val) { filters.push({ op: 'lt', col, val }); return q; },
        gt(col, val) { filters.push({ op: 'gt', col, val }); return q; },
        gte(col, val) { filters.push({ op: 'gte', col, val }); return q; },
        lte(col, val) { filters.push({ op: 'lte', col, val }); return q; },
        order() { return q; },
        limit() { return q; },
        then(resolve) {
          const w = globalThis.__CAL_TEST;
          w.log.push({ table, cols, filters: filters.map((f) => ({ ...f })) });
          if (w.fail[table]) return resolve({ data: null, error: { message: 'secret-db-failure-' + table } });
          const rows = (w.tables[table] || []).filter((r) => matchRow(r, filters));
          const projected = rows.map((r) => (cols && !cols.includes('*')
            ? Object.fromEntries(cols.map((c) => [c, r[c] ?? null]))
            : { ...r }));
          return resolve({ data: projected, error: null });
        },
      };
      return q;
    },
  };
}`;

const STUB_AUTH = `export const verifyGuideSession = () => globalThis.__CAL_TEST.session;`;
const STUB_API = `
export const jsonOk = (data) => Response.json({ success: true, data });
export const jsonError = (code, message, status) => Response.json({ success: false, error: { code, message } }, { status });`;
// 與 route-error.ts 的 handleRouteError 同形：通用文案、不外洩 err.message
const STUB_ROUTE_ERROR = `
export async function handleRouteError(err) {
  globalThis.__CAL_TEST.reported.push(err);
  return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: '伺服器發生錯誤，請稍後再試' } }, { status: 500 });
}`;
const STUB_CANONICAL = `
export async function getCanonicalMonthCalendarDb(guideId, month) {
  const [y, m] = month.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => {
    const date = month + '-' + String(i + 1).padStart(2, '0');
    return globalThis.__CAL_TEST.canonicalDays[date] ?? {
      date, availability: { morning: false, afternoon: false, evening: false, custom: [] },
      ranges: [], revision: 0, isClosed: false, timezone: 'Asia/Taipei',
    };
  });
}`;
const STUB_REQUESTS = `export async function listMidaoRequestsDb() { return { items: [] }; }`;

let GET;
let tmpDir;

before(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tp-1761-calendar-'));
  tmpDir = dir;
  const files = {
    'db.mjs': STUB_DB, 'auth.mjs': STUB_AUTH, 'api.mjs': STUB_API,
    'route-error.mjs': STUB_ROUTE_ERROR, 'canonical.mjs': STUB_CANONICAL, 'requests.mjs': STUB_REQUESTS,
  };
  for (const [name, body] of Object.entries(files)) await writeFile(path.join(dir, name), body);
  const url = (name) => pathToFileURL(path.join(dir, name)).href;
  let src = await readFile(ROUTE, 'utf8');
  const swaps = [
    [/'(?:\.\.\/)+src\/lib\/guide-auth'/u, url('auth.mjs')],
    [/'(?:\.\.\/)+src\/lib\/midao\/db-midao-canonical-availability\.mjs'/u, url('canonical.mjs')],
    [/'(?:\.\.\/)+src\/lib\/midao\/db-midao-requests\.mjs'/u, url('requests.mjs')],
    [/'(?:\.\.\/)+src\/lib\/db\.mjs'/u, url('db.mjs')],
    [/'(?:\.\.\/)+src\/lib\/api-response'/u, url('api.mjs')],
    [/'(?:\.\.\/)+src\/lib\/route-error'/u, url('route-error.mjs')],
  ];
  for (const [re, to] of swaps) {
    assert.match(src, re, `route import 應可被改寫：${re}`);
    src = src.replace(re, `'${to}'`);
  }
  // 純函式 helper 無外部依賴：改指向真實檔案（RED 階段 route 尚未 import 它，則不替換）
  src = src.replace(/'(?:\.\.\/)+src\/lib\/midao\/midao-calendar-blackouts\.mjs'/u, `'${pathToFileURL(HELPER).href}'`);
  await writeFile(path.join(dir, 'route.ts'), src);
  ({ GET } = await import(url('route.ts')));
});

after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

const T = (s) => new Date(`${s}+08:00`).toISOString();

function seed(overrides = {}) {
  globalThis.__CAL_TEST = {
    hasEnv: true,
    session: { guideId: 'g1' },
    fail: {},
    log: [],
    reported: [],
    canonicalDays: {
      '2026-09-10': {
        date: '2026-09-10', availability: { morning: true, afternoon: false, evening: false, custom: [] },
        ranges: [{ startTimeLocal: '09:00', endTimeLocal: '12:00' }], revision: 3, isClosed: false, timezone: 'Asia/Taipei',
      },
      '2026-09-12': {
        date: '2026-09-12', availability: { morning: false, afternoon: false, evening: false, custom: [] },
        ranges: [], revision: 5, isClosed: true, timezone: 'Asia/Taipei',
      },
    },
    tables: {
      bookings: [],
      guide_blackout_dates: [
        { id: 'b1', guide_id: 'g1', starts_at: T('2026-09-10T09:00:00'), ends_at: T('2026-09-10T12:00:00'), reason: 'secret-reason-1', note: 'secret-note' },
        { id: 'b2', guide_id: 'g1', starts_at: T('2026-09-15T20:00:00'), ends_at: T('2026-09-17T10:00:00'), reason: 'secret-reason-2' },
        { id: 'b3-other-guide', guide_id: 'g2', starts_at: T('2026-09-20T00:00:00'), ends_at: T('2026-09-21T00:00:00'), reason: 'secret-other' },
        { id: 'b4-next-month', guide_id: 'g1', starts_at: T('2026-10-01T00:00:00'), ends_at: T('2026-10-02T00:00:00'), reason: null },
        { id: 'b5-prev-month-ended', guide_id: 'g1', starts_at: T('2026-08-30T00:00:00'), ends_at: T('2026-09-01T00:00:00'), reason: null },
        { id: 'b6-spills-in', guide_id: 'g1', starts_at: T('2026-08-31T22:00:00'), ends_at: T('2026-09-01T02:00:00'), reason: null },
        { id: 'b7-exact-day', guide_id: 'g1', starts_at: T('2026-09-25T00:00:00'), ends_at: T('2026-09-26T00:00:00'), reason: null },
      ],
      ...(overrides.tables ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== 'tables')),
  };
}

async function call(month = '2026-09') {
  const res = await GET(new Request(`http://localhost/api/v2/guide/midao/calendar?month=${month}`));
  const text = await res.text();
  return { status: res.status, text, json: JSON.parse(text) };
}

const dayOf = (json, date) => json.data.days.find((d) => d.date === date);

test('單日封鎖：hasBlackout=true 且帶 Asia/Taipei HH:MM 時段', async () => {
  seed();
  const { status, json } = await call();
  assert.equal(status, 200);
  const d = dayOf(json, '2026-09-10');
  assert.equal(d.hasBlackout, true);
  assert.deepEqual(d.blackouts, [{ startTime: '09:00', endTime: '12:00' }]);
});

test('跨日封鎖：涵蓋的每一天都標出，整天被涵蓋者帶 allDay:true', async () => {
  seed();
  const { json } = await call();
  assert.deepEqual(dayOf(json, '2026-09-15').blackouts, [{ startTime: '20:00', endTime: '24:00' }]);
  assert.deepEqual(dayOf(json, '2026-09-16').blackouts, [{ startTime: '00:00', endTime: '24:00', allDay: true }]);
  assert.deepEqual(dayOf(json, '2026-09-17').blackouts, [{ startTime: '00:00', endTime: '10:00' }]);
  for (const date of ['2026-09-15', '2026-09-16', '2026-09-17']) assert.equal(dayOf(json, date).hasBlackout, true);
  assert.equal(dayOf(json, '2026-09-18').hasBlackout, false);
  assert.deepEqual(dayOf(json, '2026-09-18').blackouts, []);
});

test('上月延伸進本月與剛好整天的邊界', async () => {
  seed();
  const { json } = await call();
  // 8/31 22:00 → 9/1 02:00：9/1 只標 00:00–02:00
  assert.deepEqual(dayOf(json, '2026-09-01').blackouts, [{ startTime: '00:00', endTime: '02:00' }]);
  // 9/25 00:00 → 9/26 00:00：只有 9/25 整天，9/26 不標
  assert.deepEqual(dayOf(json, '2026-09-25').blackouts, [{ startTime: '00:00', endTime: '24:00', allDay: true }]);
  assert.equal(dayOf(json, '2026-09-26').hasBlackout, false);
});

test('別的導遊與本月以外的封鎖不出現；查詢以 guide_id 與當月範圍限定', async () => {
  seed();
  const { json } = await call();
  assert.equal(dayOf(json, '2026-09-20').hasBlackout, false);
  assert.deepEqual(dayOf(json, '2026-09-20').blackouts, []);
  const q = globalThis.__CAL_TEST.log.find((l) => l.table === 'guide_blackout_dates');
  assert.ok(q, '應查詢 guide_blackout_dates');
  assert.ok(q.filters.some((f) => f.op === 'eq' && f.col === 'guide_id' && f.val === 'g1'), '必須 .eq(guide_id, session.guideId)');
  assert.ok(q.filters.some((f) => f.op === 'lt' && f.col === 'starts_at' && f.val === T('2026-10-01T00:00:00')), 'starts_at < 下月初');
  assert.ok(q.filters.some((f) => f.op === 'gt' && f.col === 'ends_at' && f.val === T('2026-09-01T00:00:00')), 'ends_at > 本月初');
});

test('blackout 查詢失敗：整個 route 5xx，不降級成可用，也不外洩 DB 錯誤字串', async () => {
  seed({ fail: { guide_blackout_dates: true } });
  const { status, text, json } = await call();
  assert.ok(status >= 500 && status < 600, `應為 5xx，實際 ${status}`);
  assert.equal(json.success, false);
  assert.doesNotMatch(text, /secret-db-failure/u);
  assert.equal(json.data, undefined);
});

test('既有欄位值不變，只新增 hasBlackout / blackouts', async () => {
  seed();
  const { json } = await call();
  const d10 = dayOf(json, '2026-09-10');
  assert.deepEqual(d10.availability, { morning: true, afternoon: false, evening: false, custom: [] });
  assert.deepEqual(d10.ranges, [{ startTimeLocal: '09:00', endTimeLocal: '12:00' }]);
  assert.equal(d10.revision, 3);
  assert.equal(d10.isClosed, false);
  assert.equal(d10.timezone, 'Asia/Taipei');
  assert.equal(d10.hasPending, false);
  assert.equal(d10.hasConfirmed, false);
  assert.deepEqual(d10.items, []);
  const d12 = dayOf(json, '2026-09-12');
  assert.equal(d12.isClosed, true);
  assert.equal(d12.revision, 5);
  assert.equal(d12.hasBlackout, false);
  assert.deepEqual(Object.keys(d12).sort(), [
    'availability', 'blackouts', 'date', 'hasBlackout', 'hasConfirmed', 'hasPending', 'isClosed', 'items', 'ranges', 'revision', 'timezone',
  ]);
});

test('資料最小化：只 select starts_at/ends_at，回應不含 reason 或備註', async () => {
  seed();
  const { text } = await call();
  assert.doesNotMatch(text, /secret-reason|secret-note|secret-other/u);
  assert.doesNotMatch(text, /"reason"|"note"/u);
  const q = globalThis.__CAL_TEST.log.find((l) => l.table === 'guide_blackout_dates');
  assert.deepEqual(q.cols?.slice().sort(), ['ends_at', 'starts_at']);
});

test('無 Supabase env：不查 blackout，每日 hasBlackout=false、blackouts=[]', async () => {
  seed({ hasEnv: false });
  const { status, json } = await call();
  assert.equal(status, 200);
  assert.equal(globalThis.__CAL_TEST.log.some((l) => l.table === 'guide_blackout_dates'), false);
  for (const day of json.data.days) {
    assert.equal(day.hasBlackout, false);
    assert.deepEqual(day.blackouts, []);
  }
});
