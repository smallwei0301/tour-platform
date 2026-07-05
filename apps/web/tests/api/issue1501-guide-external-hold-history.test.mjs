// issue #1501 — 導遊外部佔位登記/釋放歷史 route 契約
//
// GET /api/guide/external-holds/history 取自 booking_status_logs
// （reason ∈ {external_hold_created, external_hold_released}），以 metadata.guide_id 限本人。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8');

const ROUTE = read('apps/web/app/api/guide/external-holds/history/route.ts');

test('需 guide session 驗證', () => {
  assert.match(ROUTE, /verifyGuideSession\(req\)/);
  assert.match(ROUTE, /UNAUTHORIZED/);
});

test('以 booking_status_logs 為源、限定 external_hold 事件並以 metadata.guide_id 限本人', () => {
  assert.match(ROUTE, /\.from\(\s*['"]booking_status_logs['"]\s*\)/);
  assert.match(ROUTE, /external_hold_created/);
  assert.match(ROUTE, /external_hold_released/);
  assert.match(ROUTE, /metadata->>guide_id/, '需以 metadata.guide_id 限定本人');
  assert.match(ROUTE, /session\.guideId/);
});

test('回傳將 reason 映射為 created/released action，並帶 participants', () => {
  assert.match(ROUTE, /action:\s*r\.reason === ['"]external_hold_created['"]\s*\?\s*['"]created['"]\s*:\s*['"]released['"]/);
  assert.match(ROUTE, /participants:/);
});

test('無 Supabase 環境回 []（與 external_hold RPC-only 一致）', () => {
  assert.match(ROUTE, /if \(!getSupabaseUrl\(\)\)/); // #1616 env 走 config getter
  assert.match(ROUTE, /ok\(\[\]\)/);
});
