/**
 * #1570 — KPI 領域檔抽出的 strangler 契約（source-contract）。
 * 鎖住「KPI 資料存取已離開 db.mjs、caller 指向 db-kpi.mjs」，防止回流。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

test('db-kpi.mjs 存在且 export 四個 KPI *Db 函式', () => {
  assert.ok(existsSync(resolve(ROOT, 'src/lib/db-kpi.mjs')));
  const src = read('src/lib/db-kpi.mjs');
  for (const fn of ['getKpiConfigDb', 'updateKpiConfigDb', 'listKpiConfigHistoryDb', 'revertKpiConfigDb']) {
    assert.match(src, new RegExp(`export async function ${fn}\\b`), `db-kpi 必須 export ${fn}`);
  }
});

test('db.mjs 不再定義 KPI *Db 函式（已抽離單體）', () => {
  const src = read('src/lib/db.mjs');
  assert.ok(!/export async function getKpiConfigDb\b/.test(src), 'KPI 函式不得留在 db.mjs');
  assert.ok(!/export async function revertKpiConfigDb\b/.test(src), 'KPI 函式不得留在 db.mjs');
});

test('KPI 路由 caller 從 db-kpi.mjs import（非 db.mjs）', () => {
  const routes = [
    'app/api/admin/settings/kpi/route.ts',
    'app/api/admin/settings/kpi/history/route.ts',
    'app/api/admin/settings/kpi/revert/route.ts',
  ];
  for (const r of routes) {
    const src = read(r);
    assert.match(src, /from '[^']*db-kpi\.mjs'/, `${r} 應從 db-kpi.mjs import`);
    assert.ok(!/KpiConfig[^']*from '[^']*\/db\.mjs'/.test(src), `${r} 不應再從 db.mjs import KPI`);
  }
});
