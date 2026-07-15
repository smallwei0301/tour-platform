// #1497 — 導遊確認/婉拒幫手：source-contract（auth + 所有權 + 純函式守門 + audit）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, '../..');
const read = (rel) => readFileSync(join(APP, rel), 'utf8');

const LIST = read('app/api/guide/conflict-overrides/route.ts');
const PATCH = read('app/api/guide/conflict-overrides/[overrideId]/route.ts');
const NAV = read('app/(non-locale)/guide/layout.tsx');

test('GET list: guide-auth + 只列自己 active 且需幫手待協調的 override', () => {
  assert.match(LIST, /verifyGuideSession/);
  assert.match(LIST, /guide_slot_conflict_overrides/);
  assert.match(LIST, /\.eq\('guide_id', session\.guideId\)/);
  assert.match(LIST, /\.eq\('status', 'active'\)/);
  assert.match(LIST, /\.eq\('requires_helper', true\)/);
  assert.match(LIST, /GUIDE_ACTIONABLE_HELPER_STATUSES/);
  // 隱私：清單不外洩 admin_note。
  assert.doesNotMatch(LIST, /admin_note|adminNote/);
});

test('PATCH: CSRF + guide-auth + 所有權 + 純函式守門 + audit', () => {
  assert.match(PATCH, /validateCsrf/);
  assert.match(PATCH, /verifyGuideSession/);
  // 所有權：override.guide_id 必須等於 session.guideId。
  assert.match(PATCH, /existing\.guide_id !== session\.guideId/);
  // 合法性由純函式統一判定。
  assert.match(PATCH, /resolveConflictOverrideHelperTransition/);
  // 寫入 helper_status + 決策時間。
  assert.match(PATCH, /helper_status: transition\.nextStatus/);
  assert.match(PATCH, /helper_decided_at/);
  // audit log。
  assert.match(PATCH, /insertAuditLogDb/);
  assert.match(PATCH, /conflict_override\.helper_decision/);
  // 隱私：不外洩 admin_note。
  assert.doesNotMatch(PATCH, /admin_note|adminNote/);
});

test('導遊後台導覽含「幫手確認」入口', () => {
  assert.match(NAV, /\/guide\/conflict-overrides/);
  assert.match(NAV, /幫手確認/);
});
