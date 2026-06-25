/**
 * Source-contract：鎖定 db.mjs 導遊行程審核 gateway 的關鍵 wiring。
 *
 * 這些 gateway 走 Supabase（activities 無 in-memory fallback），無法離線跑真實路徑，
 * 故以原始碼合約測試確保安全關鍵的接線不被改掉：ownership 檢查、白名單、審核狀態機、
 * audit log、衝突偵測欄位。
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
  // 抓到下一個 top-level 'export async function' 或檔尾為界（夠用於合約檢查）。
  const next = src.indexOf('\nexport async function ', start + 1);
  return src.slice(start, next > 0 ? next : undefined);
}

test('saveActivityPendingChangesDb：白名單過濾 + ownership 檢查 + 只寫 pending_changes', () => {
  const body = fnBody('saveActivityPendingChangesDb');
  assert.match(body, /pickGuideEditableFields/, '必須用白名單過濾導遊輸入');
  assert.match(body, /ACTIVITY_WRONG_GUIDE/, '必須做 guide_id 歸屬檢查');
  assert.match(body, /pending_changes/, '必須寫入 pending_changes');
  assert.doesNotMatch(body, /\.update\(\s*{[^}]*\bstatus:/, '存檔不得改 status');
});

test('submitActivityForReviewDb：用狀態機 + 記錄 base updated_at（衝突偵測）+ audit', () => {
  const body = fnBody('submitActivityForReviewDb');
  assert.match(body, /resolveActivityReviewTransition\('submit'/, '必須用審核狀態機');
  assert.match(body, /pending_base_updated_at/, '送審必須記錄 base updated_at 供衝突偵測');
  assert.match(body, /NOTHING_TO_SUBMIT/, '無 pending_changes 不可送審');
  assert.match(body, /activity_submit/, '必須寫 audit log');
  assert.match(body, /ACTIVITY_WRONG_GUIDE/, 'ownership 檢查');
});

test('resolveActivityReviewDb：只處理 pending + 狀態機 + 套用走 updateActivityDb + audit', () => {
  const body = fnBody('resolveActivityReviewDb');
  assert.match(body, /NOT_PENDING_REVIEW/, '只能對 pending 的行程審核');
  assert.match(body, /resolveActivityReviewTransition\(action/, '必須用審核狀態機');
  assert.match(body, /updateActivityDb\(activityId, meta\.pending_changes\)/, '核准套用必須複用 updateActivityDb 映射');
  assert.match(body, /activity_approve|activity_reject/, '必須寫 audit log');
});

test('getGuideActivityByIdDb：ownership 檢查 + pending overlay', () => {
  const body = fnBody('getGuideActivityByIdDb');
  assert.match(body, /owner\.guide_id !== guideId/, 'ownership 檢查');
  assert.match(body, /applyPendingOverlay/, '回傳 live 疊 pending_changes');
});

test('createGuideActivityDb：強制 guideId 歸屬 + 白名單', () => {
  const body = fnBody('createGuideActivityDb');
  assert.match(body, /guideId,/, '建立時強制帶入 guideId 歸屬');
  assert.match(body, /pickGuideEditableFields/, '只接受白名單欄位');
});

test('listPendingActivityReviewsDb：以 review_state=pending 過濾 + 衝突旗標', () => {
  const body = fnBody('listPendingActivityReviewsDb');
  assert.match(body, /\.eq\('review_state', 'pending'\)/, '只列待審');
  assert.match(body, /hasConflict/, '附帶衝突偵測旗標');
});
