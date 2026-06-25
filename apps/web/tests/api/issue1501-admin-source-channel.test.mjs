// issue #1501 — admin 訂單列表 source_channel 呈現與篩選
//
// 讓後台能依來源通路（web / line / admin_pos / external）區分訂單。
// 行為測試鎖 in-memory fallback；source-contract 鎖 Supabase 實作與 route 的 wiring，
// 確保 fallback 與 DB 實作契約一致（#1376 準則）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { orders } from '../../src/lib/store.mjs';
import { listAdminOrdersFallback } from '../../src/lib/admin.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8');

function seed() {
  const base = { peopleCount: 1, totalTwd: 1000, contactEmail: 't@e.com', createdAt: '2026-06-25T00:00:00Z', status: 'paid' };
  orders.push({ ...base, id: 'issue1501-web', sourceChannel: 'web' });
  orders.push({ ...base, id: 'issue1501-line', sourceChannel: 'line' });
  orders.push({ ...base, id: 'issue1501-pos', sourceChannel: 'admin_pos' });
  orders.push({ ...base, id: 'issue1501-ext', sourceChannel: 'external' });
  orders.push({ ...base, id: 'issue1501-legacy' }); // 無 sourceChannel → 視為 web
}
function cleanup() {
  for (let i = orders.length - 1; i >= 0; i--) {
    if (String(orders[i].id).startsWith('issue1501-')) orders.splice(i, 1);
  }
}

test('fallback：每列都帶 sourceChannel；缺值預設 web', () => {
  seed();
  try {
    const rows = listAdminOrdersFallback({});
    const mine = rows.filter((r) => String(r.id).startsWith('issue1501-'));
    assert.equal(mine.length, 5);
    for (const r of mine) assert.ok(typeof r.sourceChannel === 'string' && r.sourceChannel.length > 0, '每列需有 sourceChannel');
    assert.equal(mine.find((r) => r.id === 'issue1501-legacy').sourceChannel, 'web', '缺 sourceChannel 預設 web');
  } finally { cleanup(); }
});

test('fallback：sourceChannel=external 只回外部來源訂單', () => {
  seed();
  try {
    const ext = listAdminOrdersFallback({ sourceChannel: 'external' }).filter((r) => String(r.id).startsWith('issue1501-'));
    assert.deepEqual(ext.map((r) => r.id), ['issue1501-ext']);
    assert.ok(ext.every((r) => r.sourceChannel === 'external'));
  } finally { cleanup(); }
});

test('fallback：sourceChannel=web 含 legacy 無來源訂單（預設 web）', () => {
  seed();
  try {
    const web = listAdminOrdersFallback({ sourceChannel: 'web' }).filter((r) => String(r.id).startsWith('issue1501-')).map((r) => r.id).sort();
    assert.deepEqual(web, ['issue1501-legacy', 'issue1501-web']);
  } finally { cleanup(); }
});

test('source-contract：listAdminOrdersDb 查 orders.source_channel 並支援 sourceChannel 篩選', () => {
  const DB = read('apps/web/src/lib/db.mjs');
  const start = DB.indexOf('export async function listAdminOrdersDb');
  const fn = DB.slice(start, DB.indexOf('\nexport ', start + 1));
  assert.match(fn, /source_channel/, 'select 需包含 source_channel');
  assert.match(fn, /\.eq\(\s*['"]source_channel['"]\s*,\s*sourceChannel\s*\)/, '需支援 source_channel 篩選');
  assert.match(fn, /sourceChannel:\s*r\.source_channel/, '回傳需含 sourceChannel');
});

test('source-contract：/api/admin/orders route 透傳 sourceChannel 查詢參數', () => {
  const route = read('apps/web/app/api/admin/orders/route.ts');
  assert.match(route, /searchParams\.get\(\s*['"]sourceChannel['"]\s*\)/, 'route 需讀取 sourceChannel 參數');
  assert.match(route, /listAdminOrdersDb\(\{[^}]*sourceChannel[^}]*\}\)/, 'route 需把 sourceChannel 傳入 gateway');
});
