/**
 * #1761 Stage 5C 行為測試：直接執行 route 的 GET，擋住 ownership 守門邏輯被移除。
 * 作法：把 route.ts 的相對 import 與 supabase-js 改寫為記憶體 stub 後在暫存目錄載入，
 * 守門邏輯本身是真實執行的（非字串比對）。
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import test, { after, before } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTE = path.resolve(__dirname, '../../app/api/v2/guide/bookings/route.ts');

const STUB_SUPABASE = `
// 依 select 字串投影欄位：頂層以逗號切分（括號內不切），嵌入語法 name!fk(...)／name(...) 以 name 為 key 整段保留
const topLevelKeys = (selectStr) => {
  const keys = [];
  let depth = 0;
  let cur = '';
  for (const ch of selectStr) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { keys.push(cur); cur = ''; } else cur += ch;
  }
  keys.push(cur);
  return keys.map((k) => k.trim()).filter(Boolean).map((k) => k.split(/[!(]/)[0].trim());
};
const project = (row, cols) => (cols ? Object.fromEntries(cols.filter((c) => c in row).map((c) => [c, row[c]])) : row);
const matchRow = (row, filters) => filters.every((f) => f.op === 'eq'
  ? row[f.col] === f.val
  : f.vals.includes(row[f.col]));
export function createClient() {
  return {
    from(table) {
      const filters = [];
      let cols = null;
      const q = {
        select(str) { cols = topLevelKeys(String(str)); return q; },
        eq(col, val) { filters.push({ op: 'eq', col, val }); return q; },
        in(col, vals) { filters.push({ op: 'in', col, vals }); return q; },
        order() { return q; },
        limit() { return q; },
        then(resolve, reject) {
          const w = globalThis.__PLAN_TEST;
          if (w.fail[table]) return resolve({ data: null, error: { message: 'secret-db-failure-' + table } });
          return resolve({ data: (w.tables[table] || []).filter((r) => matchRow(r, filters)).map((r) => project(r, cols)), error: null });
        },
      };
      return q;
    },
  };
}`;
const STUB_API = `
export const ok = (data) => ({ success: true, data });
export const fail = (code, message) => ({ success: false, code, message });`;
const STUB_AUTH = `
export const verifyGuideSession = () => ({ guideId: 'g1' });
export const maskEmail = () => 'm***';`;
const STUB_ENV = `
export const getSupabaseUrl = () => 'http://stub.invalid';
export const getSupabaseServiceRoleKey = () => 'stub-key';`;

let GET;
let tmpDir;

before(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tp-1761-bookings-'));
  tmpDir = dir;
  const files = { 'supabase.mjs': STUB_SUPABASE, 'api.mjs': STUB_API, 'auth.mjs': STUB_AUTH, 'env.mjs': STUB_ENV };
  for (const [name, body] of Object.entries(files)) await writeFile(path.join(dir, name), body);
  const url = (name) => pathToFileURL(path.join(dir, name)).href;
  let src = await readFile(ROUTE, 'utf8');
  const swaps = [
    [/'\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/src\/lib\/api'/u, `'${url('api.mjs')}'`],
    [/'\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/src\/lib\/guide-auth'/u, `'${url('auth.mjs')}'`],
    [/'\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/src\/config\/supabase-service-env\.mjs'/u, `'${url('env.mjs')}'`],
    [/import\('@supabase\/supabase-js'\)/u, `import('${url('supabase.mjs')}')`],
  ];
  for (const [re, to] of swaps) {
    assert.match(src, re, `route import 應可被改寫：${re}`);
    src = src.replace(re, to);
  }
  await writeFile(path.join(dir, 'route.ts'), src);
  ({ GET } = await import(url('route.ts')));
});

after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

function seed(overrides = {}) {
  globalThis.__PLAN_TEST = {
    fail: {},
    tables: {
      activities: [
        { id: 'a1', title: 'A1', guide_id: 'g1' },
        { id: 'a2', title: 'A2', guide_id: 'g1' },
        { id: 'ax', title: 'X', guide_id: 'g2' },
      ],
      orders: [
        { id: 'o-book-wins', activity_id: 'a1', booking_id: 'b1', activity_schedules: { start_at: 's', plan_id: 'p-sched' } },
        { id: 'o-legacy', activity_id: 'a1', booking_id: null, activity_schedules: { start_at: 's', plan_id: 'p-sched' } },
        { id: 'o-other-guide', activity_id: 'a1', booking_id: 'b3', activity_schedules: { start_at: 's', plan_id: 'p-sched' } },
        { id: 'o-sibling', activity_id: 'a1', booking_id: 'b4', activity_schedules: { start_at: 's', plan_id: 'p-sched' } },
        { id: 'o-none', activity_id: 'a1', booking_id: 'b5', activity_schedules: null },
        { id: 'o-foreign-order', activity_id: 'ax', booking_id: null, activity_schedules: { start_at: 's', plan_id: 'p-sched' } },
      ],
      bookings: [
        { id: 'b1', activity_plan_id: 'p-book' },
        { id: 'b3', activity_plan_id: 'p-foreign' },
        { id: 'b4', activity_plan_id: 'p-sibling' },
        { id: 'b5', activity_plan_id: null },
      ],
      activity_plans: [
        { id: 'p-book', name: '預約方案', activity_id: 'a1' },
        { id: 'p-sched', name: '檔期方案', activity_id: 'a1' },
        { id: 'p-foreign', name: 'LEAK-OTHER-GUIDE', activity_id: 'ax' },
        { id: 'p-sibling', name: 'LEAK-SIBLING-ACTIVITY', activity_id: 'a2' },
      ],
      ...overrides,
    },
  };
}

async function load() {
  const res = await GET(new Request('http://x/api/v2/guide/bookings'));
  const body = await res.json();
  return { res, body, byId: Object.fromEntries((body.data || []).map((o) => [o.id, o])) };
}

test('orders 查詢的 ownership 範圍：別的導遊的訂單不在回傳結果，且正常情況 planName 有值', async () => {
  seed();
  const { body, byId } = await load();
  assert.equal(byId['o-foreign-order'], undefined);
  assert.ok(!body.data.some((o) => o.id === 'o-foreign-order'));
  assert.equal(body.data.length, 5);
  assert.equal(byId['o-legacy'].planName, '檔期方案');
  assert.equal(typeof byId['o-book-wins'].planName, 'string');
});

test('(a) 別的導遊的 plan：planName 與 planId 皆為 null，且名稱不外洩', async () => {
  seed();
  const { res, body, byId } = await load();
  assert.equal(res.status, 200);
  assert.equal(byId['o-other-guide'].planName, null);
  assert.equal(byId['o-other-guide'].planId, null);
  assert.ok(!JSON.stringify(body).includes('LEAK-OTHER-GUIDE'));
});

test('(b) 同導遊但屬於別的 activity 的 plan：planName 與 planId 皆為 null', async () => {
  seed();
  const { body, byId } = await load();
  assert.equal(byId['o-sibling'].planName, null);
  assert.equal(byId['o-sibling'].planId, null);
  assert.ok(!JSON.stringify(body).includes('LEAK-SIBLING-ACTIVITY'));
});

test('(c) bookings.activity_plan_id 優先於 schedule.plan_id，且 planId 與 planName 指向同一方案', async () => {
  seed();
  const { byId } = await load();
  assert.equal(byId['o-book-wins'].planId, 'p-book');
  assert.equal(byId['o-book-wins'].planName, '預約方案');
});

test('(d) 沒有 booking_id 的 legacy 訂單仍取 schedule.plan_id；無任何方案則 null', async () => {
  seed();
  const { byId } = await load();
  assert.equal(byId['o-legacy'].planId, 'p-sched');
  assert.equal(byId['o-legacy'].planName, '檔期方案');
  assert.equal(byId['o-none'].planId, null);
  assert.equal(byId['o-none'].planName, null);
});

test('(e) activity_plans 查詢失敗：降級為 null、回 200，且回應沒有錯誤字串', async () => {
  seed();
  globalThis.__PLAN_TEST.fail.activity_plans = true;
  const { res, body, byId } = await load();
  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.length, 5);
  for (const o of Object.values(byId)) {
    assert.equal(o.planName, null);
    assert.equal(o.planId, null);
  }
  assert.ok(!JSON.stringify(body).includes('secret-db-failure'));
});
