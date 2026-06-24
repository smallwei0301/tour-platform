/**
 * Source-contract：鎖定 db.mjs 導遊方案審核 gateway 的關鍵 wiring（Phase 2）。
 *
 * 這些 gateway 走 Supabase（activity_plans 無 in-memory fallback），無法離線跑真實路徑，
 * 故以原始碼合約測試確保安全關鍵接線不被改掉：ownership、白名單、狀態機、audit、
 * 新方案首次核准轉 active、衝突偵測。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '../../src/lib/db.mjs'), 'utf8');

function fnBody(name) {
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} should exist`);
  const next = src.indexOf('\nexport async function ', start + 1);
  return src.slice(start, next > 0 ? next : undefined);
}

test('createGuidePlanDb：ownership + 驗證 + 新方案以 inactive + pending_new_plan 落地 + 白名單 + audit', () => {
  const body = fnBody('createGuidePlanDb');
  assert.match(body, /loadOwnedActivity/, '建立前先確認 activity 屬於導遊');
  assert.match(body, /validateGuidePlanCreate/, '必須驗證必填欄位');
  assert.match(body, /pickGuideEditablePlanFields/, '只接受白名單欄位');
  assert.match(body, /status:\s*'inactive'/, '新方案不得直接上架');
  assert.match(body, /pending_new_plan:\s*true/, '新方案標記待首次核准');
  assert.match(body, /plan_create/, '必須寫 audit log');
});

test('savePlanPendingChangesDb：白名單 + active 走 pending_changes、未上架直接寫 row', () => {
  const body = fnBody('savePlanPendingChangesDb');
  assert.match(body, /pickGuideEditablePlanFields/, '白名單過濾');
  assert.match(body, /assertPlanEditable/, 'ownership / archived 檢查');
  assert.match(body, /plan\.status === 'active'/, '需區分已上架/未上架');
  assert.match(body, /pending_changes/, '已上架方案改動寫 pending_changes');
});

test('submitPlanForReviewDb：狀態機 + 新方案或有 pending 才可送審 + base updated_at + audit', () => {
  const body = fnBody('submitPlanForReviewDb');
  assert.match(body, /resolveActivityReviewTransition\('submit'/, '複用審核狀態機');
  assert.match(body, /NOTHING_TO_SUBMIT/, '無待審內容不可送審');
  assert.match(body, /pending_new_plan/, '新方案可送審');
  assert.match(body, /pending_base_updated_at/, '記錄 base updated_at 供衝突偵測');
  assert.match(body, /plan_submit/, '必須寫 audit log');
});

test('resolvePlanReviewDb：只處理 pending + 狀態機 + 套用走 buildPlanColumnPatch + 新方案轉 active + audit', () => {
  const body = fnBody('resolvePlanReviewDb');
  assert.match(body, /NOT_PENDING_REVIEW/, '只能對 pending 的方案審核');
  assert.match(body, /resolveActivityReviewTransition\(action/, '複用審核狀態機');
  assert.match(body, /buildPlanColumnPatch\(row\.pending_changes\)/, '核准套用走欄位映射（不寫 null 清空）');
  assert.match(body, /pending_new_plan[\s\S]*status\s*=\s*'active'/, '新方案核准轉 active');
  assert.match(body, /plan_approve|plan_reject/, '必須寫 audit log');
});

test('listPendingPlanReviewsDb：以 review_state=pending 過濾 + 新方案/衝突旗標', () => {
  const body = fnBody('listPendingPlanReviewsDb');
  assert.match(body, /\.eq\('review_state', 'pending'\)/, '只列待審');
  assert.match(body, /isNewPlan/, '附帶新方案旗標');
  assert.match(body, /hasConflict/, '附帶衝突偵測旗標');
});

test('getGuidePlanByIdDb：ownership + archived 擋 + pending overlay', () => {
  const body = fnBody('getGuidePlanByIdDb');
  assert.match(body, /owner\.guide_id !== guideId/, 'ownership 檢查');
  assert.match(body, /status === 'archived'/, '已封存方案不可編輯');
  assert.match(body, /applyPendingOverlay/, '回傳 row 疊 pending_changes');
});
