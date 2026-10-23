/**
 * #1761 midao2「導覽經驗年資」行為測試：實際執行 profile-extras route 的 GET／PATCH。
 * 作法：route.ts、api-response、api、route-error、db-midao-showcase 皆載入真實實作，
 * 只把 csrf／guide-auth／db.mjs（Supabase client）改寫成可控 stub，
 * 因此年資驗證、body 形狀檢查、錯誤脫敏與 session 擁有權都是真實執行（非字串比對）。
 */
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import test, { after, before } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(__dirname, '../..');
const ROUTE = path.join(WEB, 'app/api/v2/guide/midao/profile-extras/route.ts');
const LIB = path.join(WEB, 'src/lib');

const STUB_CSRF = `export const validateCsrf = () => globalThis.__PE.csrf;`;
const STUB_AUTH = `export const verifyGuideSession = () => globalThis.__PE.session;`;
// 假 Supabase client：guide_profiles 的 select/update，記錄每次寫入的 id 與 payload
const STUB_DB = `
export const hasSupabaseEnv = () => true;
export async function getSupabase() {
  const w = globalThis.__PE;
  return {
    from(table) {
      if (table !== 'guide_profiles') throw new Error('stub: unexpected table ' + table);
      return {
        select() {
          return { eq(col, val) { return { async maybeSingle() {
            if (w.fail.read) return { data: null, error: { message: 'secret-db-detail-read' } };
            const row = w.rows.find((r) => r[col] === val);
            return { data: row ? { experience_years: row.experience_years } : null, error: null };
          } }; } };
        },
        update(payload) {
          return { async eq(col, val) {
            w.writes.push({ col, val, payload });
            if (w.fail.write) return { error: { message: 'secret-db-detail-write' } };
            const row = w.rows.find((r) => r[col] === val);
            if (row) Object.assign(row, payload);
            return { error: null };
          } };
        },
      };
    },
  };
}`;

let GET;
let PATCH;
let tmpDir;

before(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tp-1761-extras-'));
  tmpDir = dir;
  const url = (name) => pathToFileURL(path.join(dir, name)).href;
  await writeFile(path.join(dir, 'csrf.mjs'), STUB_CSRF);
  await writeFile(path.join(dir, 'auth.mjs'), STUB_AUTH);
  await writeFile(path.join(dir, 'db.mjs'), STUB_DB);
  await copyFile(path.join(LIB, 'api.ts'), path.join(dir, 'api.ts'));
  await copyFile(path.join(LIB, 'api-response.ts'), path.join(dir, 'api-response.ts'));
  await copyFile(path.join(LIB, 'route-error.ts'), path.join(dir, 'route-error.ts'));
  let showcase = await readFile(path.join(LIB, 'midao/db-midao-showcase.mjs'), 'utf8');
  assert.match(showcase, /from '\.\.\/db\.mjs'/u);
  showcase = showcase.replace(/from '\.\.\/db\.mjs'/u, `from '${url('db.mjs')}'`);
  await writeFile(path.join(dir, 'showcase.mjs'), showcase);
  let src = await readFile(ROUTE, 'utf8');
  const swaps = [
    [/'(?:\.\.\/)+src\/lib\/csrf\.mjs'/u, `'${url('csrf.mjs')}'`],
    [/'(?:\.\.\/)+src\/lib\/guide-auth'/u, `'${url('auth.mjs')}'`],
    [/'(?:\.\.\/)+src\/lib\/midao\/db-midao-showcase\.mjs'/u, `'${url('showcase.mjs')}'`],
    [/'(?:\.\.\/)+src\/lib\/api-response'/u, `'${url('api-response.ts')}'`],
    [/'(?:\.\.\/)+src\/lib\/route-error'/u, `'${url('route-error.ts')}'`],
  ];
  for (const [re, to] of swaps) {
    assert.match(src, re, `route import 應可被改寫：${re}`);
    src = src.replace(re, to);
  }
  // api-response.ts 內部以 './api.ts' 載入，已一併複製到同目錄
  await writeFile(path.join(dir, 'route.ts'), src);
  ({ GET, PATCH } = await import(url('route.ts')));
});

after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

function seed({ session = { guideId: 'g1' }, csrf = null, rows, fail = {} } = {}) {
  globalThis.__PE = {
    session,
    csrf,
    fail,
    writes: [],
    rows: rows ?? [{ id: 'g1', experience_years: 4 }, { id: 'other', experience_years: 9 }],
  };
}

const patch = (rawBody) => PATCH(new Request('http://x/api/v2/guide/midao/profile-extras', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: rawBody,
}));
const patchJson = (value) => patch(JSON.stringify(value));
const get = () => GET(new Request('http://x/api/v2/guide/midao/profile-extras'));

test('GET 未登入 → 401 UNAUTHORIZED', async () => {
  seed({ session: null });
  const res = await get();
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, 'UNAUTHORIZED');
});

test('GET 成功回該導遊自己的 experienceYears', async () => {
  seed();
  const res = await get();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.data.experienceYears, 4);
});

test('GET DB 讀取錯誤 → 500，不得回成 null（會讓頁面誤以為未填），且 body 不含原始錯誤字串', async () => {
  seed({ fail: { read: true } });
  const res = await get();
  assert.equal(res.status, 500);
  const text = await res.text();
  assert.ok(!text.includes('secret-db-detail'), text);
  assert.equal(JSON.parse(text).success, false);
});

test('PATCH 無 CSRF → 403，且不寫入', async () => {
  seed({ csrf: Response.json({ success: false }, { status: 403 }) });
  const res = await patchJson({ experienceYears: 5 });
  assert.equal(res.status, 403);
  assert.equal(globalThis.__PE.writes.length, 0);
});

test('PATCH 有效 CSRF 但未登入 → 401，且不寫入', async () => {
  seed({ session: null });
  const res = await patchJson({ experienceYears: 5 });
  assert.equal(res.status, 401);
  assert.equal(globalThis.__PE.writes.length, 0);
});

const BAD_YEARS = [
  ['空字串', ''], ['null', null], ['false', false], ['空陣列', []], ['abc', 'abc'],
  ['前後空白', ' 5 '], ['指數', '1e1'], ['小數', 3.7], ['負數', -1], ['超過 60', 61],
  ['字串超過 60', '61'], ['字串負號', '-1'], ['字串小數', '3.5'], ['三位數字串', '007'], ['物件', {}],
];
for (const [label, value] of BAD_YEARS) {
  test(`PATCH 非法年資（${label}）→ 400 INVALID_YEARS，不寫入`, async () => {
    seed();
    const res = await patchJson({ experienceYears: value });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'INVALID_YEARS');
    assert.equal(globalThis.__PE.writes.length, 0);
  });
}

test('PATCH 缺少 experienceYears 欄位 → 400 INVALID_YEARS，不寫入', async () => {
  seed();
  const res = await patchJson({});
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'INVALID_YEARS');
  assert.equal(globalThis.__PE.writes.length, 0);
});

for (const [label, raw] of [['null', 'null'], ['陣列', '[]'], ['數字', '5'], ['字串', '"5"'], ['非 JSON', 'not-json{']]) {
  test(`PATCH body 為 ${label} → 400 INVALID_REQUEST（不是 500），不寫入`, async () => {
    seed();
    const res = await patch(raw);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'INVALID_REQUEST');
    assert.equal(globalThis.__PE.writes.length, 0);
  });
}

test('PATCH 合法數字 7 → 200，回傳 7，且寫入的是 session 的 guideId', async () => {
  seed();
  const res = await patchJson({ experienceYears: 7 });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.experienceYears, 7);
  assert.deepEqual(globalThis.__PE.writes, [{ col: 'id', val: 'g1', payload: { experience_years: 7 } }]);
});

test("PATCH 合法字串 '12' → 200，回傳數字 12", async () => {
  seed();
  const res = await patchJson({ experienceYears: '12' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.experienceYears, 12);
  assert.equal(globalThis.__PE.writes[0].payload.experience_years, 12);
});

test('PATCH 邊界 0 與 60 可接受', async () => {
  for (const v of [0, 60, '0', '60']) {
    seed();
    const res = await patchJson({ experienceYears: v });
    assert.equal(res.status, 200, String(v));
    assert.equal((await res.json()).data.experienceYears, Number(v));
  }
});

test("PATCH body 夾帶 guideId／id: 'other' 仍只寫 session 的 guideId，別人的資料不變", async () => {
  seed();
  const res = await patchJson({ experienceYears: 11, guideId: 'other', id: 'other' });
  assert.equal(res.status, 200);
  const { writes, rows } = globalThis.__PE;
  assert.equal(writes.length, 1);
  assert.equal(writes[0].val, 'g1');
  assert.equal(rows.find((r) => r.id === 'g1').experience_years, 11);
  assert.equal(rows.find((r) => r.id === 'other').experience_years, 9);
});

test('PATCH DB 寫入錯誤 → 500，body 不含原始錯誤字串', async () => {
  seed({ fail: { write: true } });
  const res = await patchJson({ experienceYears: 5 });
  assert.equal(res.status, 500);
  const text = await res.text();
  assert.ok(!text.includes('secret-db-detail'), text);
  assert.equal(JSON.parse(text).success, false);
});
