// issue #1501 — admin 外部佔位（external_hold）清單 gateway 與 route 契約
//
// listExternalHoldsDb 以 bookings（status='external_hold'、source_channel='external'）為源，
// 不碰 orders（非營收）。external_hold 為 RPC-only，無 in-memory 建立路徑，fallback 回 []。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { listExternalHoldsFallback } from '../../src/lib/admin.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8');

test('fallback：無 Supabase 環境回 []（external_hold 為 RPC-only，無 in-memory 建立路徑）', () => {
  const out = listExternalHoldsFallback();
  assert.ok(Array.isArray(out));
  assert.equal(out.length, 0);
});

test('source-contract：listExternalHoldsDb 以 bookings + external_hold/external 為源，不碰 orders', () => {
  const DB = read('apps/web/src/lib/db.mjs');
  const start = DB.indexOf('export async function listExternalHoldsDb');
  assert.notEqual(start, -1, '找不到 listExternalHoldsDb');
  const fn = DB.slice(start, DB.indexOf('\nexport ', start + 1));

  assert.match(fn, /\.from\(\s*['"]bookings['"]\s*\)/, '需以 bookings 為源');
  assert.match(fn, /\.eq\(\s*['"]status['"]\s*,\s*['"]external_hold['"]\s*\)/, '需過濾 status=external_hold');
  assert.match(fn, /\.eq\(\s*['"]source_channel['"]\s*,\s*['"]external['"]\s*\)/, '需過濾 source_channel=external');
  // 非營收：不得查 orders（避免被當成訂單/營收）
  assert.doesNotMatch(fn, /\.from\(\s*['"]orders['"]\s*\)/, '外部佔位清單不得查 orders');
  // 回傳 shape 關鍵欄位
  for (const field of ['holdId', 'participants', 'activityTitle', 'scheduleStartAt', 'guideId']) {
    assert.match(fn, new RegExp(`${field}:`), `回傳需含 ${field}`);
  }
});

test('source-contract：/api/admin/external-holds GET route 呼叫 listExternalHoldsDb', () => {
  const route = read('apps/web/app/api/admin/external-holds/route.ts');
  assert.match(route, /export async function GET/, '需提供 GET handler');
  assert.match(route, /listExternalHoldsDb\(\)/, '需呼叫 listExternalHoldsDb');
});

test('source-contract：admin 導覽列含外部佔位入口', () => {
  const shell = read('apps/web/src/components/admin/AdminShell.tsx');
  assert.match(shell, /\/admin\/external-holds/, 'AdminShell 需有 /admin/external-holds 連結');
});
