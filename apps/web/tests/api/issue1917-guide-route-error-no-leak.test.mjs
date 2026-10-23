/**
 * #1917：guide 端 v2 route 不得把 DB error.message 回給 client。
 *
 * 行為測試（實際執行 route handler；相對 import 與 supabase-js 改寫為記憶體 stub 後在暫存目錄載入）：
 *   - guide/bookings GET：orders 查詢失敗
 *   - guide/trip-reports-due GET：orders 查詢失敗
 *   - guide/orders/[orderId]/trip-report POST：guide_trip_reports 讀取失敗、insert 失敗
 * 原始碼斷言（輔助）：四個檔案不再出現 fail('…', <x>.message) 形式。
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import test, { after, before } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(__dirname, '../..');
const ROUTES = {
  bookings: 'app/api/v2/guide/bookings/route.ts',
  due: 'app/api/v2/guide/trip-reports-due/route.ts',
  report: 'app/api/v2/guide/orders/[orderId]/trip-report/route.ts',
};
const SECRET = 'secret-db-detail relation "orders" column x';

const STUB_SUPABASE = `
export function createClient() {
  return {
    from(table) {
      let op = 'select';
      const q = {
        select() { return q; },
        insert() { op = 'insert'; return q; },
        eq() { return q; }, in() { return q; }, order() { return q; }, limit() { return q; },
        single() { return q; },
        then(resolve) {
          const w = globalThis.__T1917;
          const key = table + '.' + op;
          if (w.throwOn === key) throw new Error(w.fail[key]);
          if (w.fail[key]) return resolve({ data: null, error: { message: w.fail[key] } });
          const v = w.data[key];
          return resolve({ data: v === undefined ? [] : v, error: null });
        },
      };
      return q;
    },
  };
}`;
const STUB_API = `
export const ok = (data) => ({ success: true, data });
export const fail = (code, message) => ({ ok: false, error: { code, message } });`;
const STUB_AUTH = `
export const verifyGuideSession = () => ({ guideId: 'g1' });
export const maskEmail = () => 'm***';`;
const STUB_ENV = `
export const getSupabaseUrl = () => 'http://stub.invalid';
export const getSupabaseServiceRoleKey = () => 'stub-key';`;
const STUB_CSRF = `export const validateCsrf = () => null;`;
const STUB_ROUTE_ERROR = `
export async function reportRouteError(err, opts) { (globalThis.__T1917.reported ||= []).push({ message: err instanceof Error ? err.message : String(err), route: opts.route }); }
export async function handleRouteError(err, opts) { await reportRouteError(err, opts); return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: '伺服器發生錯誤，請稍後再試' } }, { status: 500 }); }`;
const STUB_NEXT = `export class NextRequest extends Request {}`;

let tmpDir;
const handlers = {};

async function loadRoute(name, rel) {
  const dir = tmpDir;
  const url = (f) => pathToFileURL(path.join(dir, f)).href;
  let src = await readFile(path.join(WEB, rel), 'utf8');
  const map = {
    'lib/api': url('api.mjs'),
    'lib/guide-auth': url('auth.mjs'),
    'lib/csrf.mjs': url('csrf.mjs'),
    'lib/route-error': url('route-error.mjs'),
    'config/supabase-service-env.mjs': url('env.mjs'),
    'lib/post-trip/guide-trip-report.mjs': pathToFileURL(path.join(WEB, 'src/lib/post-trip/guide-trip-report.mjs')).href,
    'lib/post-trip-eligibility.mjs': pathToFileURL(path.join(WEB, 'src/lib/post-trip-eligibility.mjs')).href,
  };
  src = src.replace(/from '(?:\.\.\/)+src\/([^']+)'/g, (m, rest) => {
    assert.ok(map[rest], `未知的 import：${rest}`);
    return `from '${map[rest]}'`;
  });
  src = src.replace(/import\('@supabase\/supabase-js'\)/u, `import('${url('supabase.mjs')}')`);
  src = src.replace(/from 'next\/server'/u, `from '${url('next.mjs')}'`);
  assert.ok(!/from '\.\.?\//.test(src), `${name} 仍有未改寫的相對 import`);
  await writeFile(path.join(dir, `${name}.ts`), src);
  return import(url(`${name}.ts`));
}

before(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'tp-1917-'));
  const files = {
    'supabase.mjs': STUB_SUPABASE, 'api.mjs': STUB_API, 'auth.mjs': STUB_AUTH, 'env.mjs': STUB_ENV,
    'csrf.mjs': STUB_CSRF, 'route-error.mjs': STUB_ROUTE_ERROR, 'next.mjs': STUB_NEXT,
  };
  for (const [n, body] of Object.entries(files)) await writeFile(path.join(tmpDir, n), body);
  for (const [name, rel] of Object.entries(ROUTES)) handlers[name] = await loadRoute(name, rel);
});

after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

function seed(fail = {}, extra = {}) {
  globalThis.__T1917 = {
    fail,
    reported: [],
    data: {
      'activities.select': [{ id: 'a1', title: 'A1' }],
      ...extra,
    },
  };
}

async function assertNoLeak(res, label) {
  const text = await res.text();
  assert.equal(res.status, 500, `${label} 應回 500`);
  assert.ok(!text.includes('secret-db-detail'), `${label} 回應不得含 DB 錯誤字串：${text}`);
  assert.ok(!/relation/i.test(text), `${label} 回應不得含 relation：${text}`);
  const parsed = JSON.parse(text);
  assert.equal(parsed.error?.code ?? parsed.code, 'SERVER_ERROR', `${label} code 維持 SERVER_ERROR`);
}

test('guide/bookings：orders 查詢失敗不外洩 DB 錯誤，且 server 端有上報', async () => {
  seed({ 'orders.select': SECRET });
  const res = await handlers.bookings.GET(new Request('http://x/api/v2/guide/bookings'));
  await assertNoLeak(res, 'bookings');
  assert.equal(globalThis.__T1917.reported.length, 1);
  assert.ok(globalThis.__T1917.reported[0].message.includes('secret-db-detail'), '原始錯誤應交給 reportRouteError');
});

test('guide/bookings：supabase 查詢 reject（throw）也回通用 500 並上報', async () => {
  seed({ 'orders.select': SECRET }, {});
  globalThis.__T1917.throwOn = 'orders.select';
  const res = await handlers.bookings.GET(new Request('http://x/api/v2/guide/bookings'));
  const text = await res.text();
  assert.equal(res.status, 500);
  assert.ok(!text.includes('secret-db-detail'), text);
  assert.ok(!/relation/i.test(text), text);
  assert.equal(globalThis.__T1917.reported.length, 1);
  assert.ok(globalThis.__T1917.reported[0].message.includes('secret-db-detail'));
});

test('guide/trip-reports-due：orders 查詢失敗不外洩 DB 錯誤，且 server 端有上報', async () => {
  seed({ 'orders.select': SECRET });
  const res = await handlers.due.GET(new Request('http://x/api/v2/guide/trip-reports-due'));
  await assertNoLeak(res, 'trip-reports-due');
  assert.equal(globalThis.__T1917.reported.length, 1);
  assert.ok(globalThis.__T1917.reported[0].message.includes('secret-db-detail'));
});

const REPORT_ORDER = {
  id: 'o1', status: 'paid', booking_id: 'b1',
  bookings: { id: 'b1', guide_id: 'g1', is_refunded: false, activity_schedules: { end_at: '2020-01-01T00:00:00Z' } },
};
function postReport() {
  return handlers.report.POST(
    new Request('http://x/api/v2/guide/orders/o1/trip-report', { method: 'POST', body: JSON.stringify({ notes: 'n' }) }),
    { params: Promise.resolve({ orderId: 'o1' }) },
  );
}

test('trip-report POST：既有報告讀取失敗不外洩 DB 錯誤', async () => {
  seed({ 'guide_trip_reports.select': SECRET }, { 'orders.select': REPORT_ORDER });
  const res = await postReport();
  await assertNoLeak(res, 'trip-report(select)');
  assert.equal(globalThis.__T1917.reported.length, 1);
});

test('trip-report POST：insert 失敗不外洩 DB 錯誤', async () => {
  seed({ 'guide_trip_reports.insert': SECRET }, { 'orders.select': REPORT_ORDER, 'guide_trip_reports.select': [] });
  const res = await postReport();
  await assertNoLeak(res, 'trip-report(insert)');
  assert.equal(globalThis.__T1917.reported.length, 1);
});

test('trip-report POST：正常路徑仍回 201（stub 自檢，避免失敗路徑測試空轉）', async () => {
  seed({}, { 'orders.select': REPORT_ORDER, 'guide_trip_reports.select': [], 'guide_trip_reports.insert': { id: 'r1' } });
  const res = await postReport();
  assert.equal(res.status, 201);
});

test('原始碼斷言：四個 guide route 不再出現 fail(…, <x>.message) 形式', () => {
  for (const rel of Object.values(ROUTES)) {
    const src = readFileSync(path.join(WEB, rel), 'utf8');
    assert.ok(!/fail\(\s*'[A-Z_]+'\s*,\s*[A-Za-z_.]*\.message\s*\)/.test(src), `${rel} 仍把 .message 放進 fail()`);
  }
});
