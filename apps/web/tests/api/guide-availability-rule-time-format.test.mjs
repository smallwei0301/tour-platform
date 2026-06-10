// 導遊（與管理員）時段規則「時間格式」round-trip 修復。
//
// 根因：guide_availability_rules.start_time_local / end_time_local 是
// Postgres `time` 欄位，讀回來一律帶秒（"09:00:00"）。但四條寫入 route
// 的 isValidTimeString 只接受 /^HH:MM$/，於是：
//   1. 列表 GET 回傳 "09:00:00" → 卡片顯示 "09:00:00-17:00:00"，且把
//      "09:00:00" 灌進 <input type="time">（只吃 HH:MM）→ 顯示錯亂。
//   2. 編輯後原值 "09:00:00" 被原封不動送回 → 驗證失敗
//      「Invalid start_time_local (HH:MM)」。導遊完全無法編輯既有規則。
//
// 修法（系統層）：
//   - 共用 pure helper normalizeTimeLocal()：接受 H:MM / HH:MM / HH:MM:SS，
//     正規化成 HH:MM，非法回 null。
//   - 四條寫入 route 改用 helper 驗證並「儲存正規化後的 HH:MM」，start<end
//     比較也用正規化值；錯誤訊息改中文且精準。
//   - 讀取 route（guide / admin GET）把 start/end 正規化成 HH:MM 回傳，
//     讓既有 "HH:MM:SS" 資料在卡片與編輯框都正確顯示。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  normalizeTimeLocal,
  isValidTimeLocal,
} from '../../src/lib/availability-v2/time-local.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const GUIDE_POST = join(REPO_ROOT, 'app/api/guide/availability-rules/route.ts');
const GUIDE_PUT = join(REPO_ROOT, 'app/api/guide/availability-rules/[ruleId]/route.ts');
const ADMIN_POST = join(REPO_ROOT, 'app/api/v2/admin/guides/[guideId]/availability-rules/route.ts');
const ADMIN_PUT = join(REPO_ROOT, 'app/api/v2/admin/guides/[guideId]/availability-rules/[ruleId]/route.ts');
const ALL_WRITE_ROUTES = [GUIDE_POST, GUIDE_PUT, ADMIN_POST, ADMIN_PUT];

// ---------- helper unit ----------

test('normalizeTimeLocal: HH:MM:SS (Postgres time) → HH:MM', () => {
  assert.equal(normalizeTimeLocal('09:00:00'), '09:00');
  assert.equal(normalizeTimeLocal('17:00:00'), '17:00');
  assert.equal(normalizeTimeLocal('23:59:59'), '23:59');
});

test('normalizeTimeLocal: already HH:MM passes through', () => {
  assert.equal(normalizeTimeLocal('09:00'), '09:00');
  assert.equal(normalizeTimeLocal('17:30'), '17:30');
});

test('normalizeTimeLocal: single-digit hour is zero-padded', () => {
  assert.equal(normalizeTimeLocal('9:00'), '09:00');
  assert.equal(normalizeTimeLocal('9:05:00'), '09:05');
});

test('normalizeTimeLocal: trims surrounding whitespace', () => {
  assert.equal(normalizeTimeLocal('  09:00  '), '09:00');
});

test('normalizeTimeLocal: invalid input → null', () => {
  for (const bad of ['', '24:00', '09:60', '9', '09:00:60', 'abc', '09-00', null, undefined, 900]) {
    assert.equal(normalizeTimeLocal(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test('isValidTimeLocal mirrors normalizeTimeLocal', () => {
  assert.equal(isValidTimeLocal('09:00:00'), true);
  assert.equal(isValidTimeLocal('09:00'), true);
  assert.equal(isValidTimeLocal('24:00'), false);
  assert.equal(isValidTimeLocal('nope'), false);
});

// ---------- write-route source contracts ----------

for (const routePath of ALL_WRITE_ROUTES) {
  const label = routePath.replace(REPO_ROOT + '/', '');

  test(`${label}: imports the shared normalizeTimeLocal helper`, () => {
    const src = readFileSync(routePath, 'utf8');
    assert.match(
      src,
      /from\s+['"][^'"]*availability-v2\/time-local(\.mjs)?['"]/,
      'route must import the shared time-local helper',
    );
    assert.match(src, /normalizeTimeLocal/);
  });

  test(`${label}: no longer hard-rejects HH:MM:SS via the old HH:MM-only regex`, () => {
    const src = readFileSync(routePath, 'utf8');
    assert.doesNotMatch(
      src,
      /function\s+isValidTimeString/,
      'old HH:MM-only validator must be removed in favour of the shared normalizer',
    );
    assert.doesNotMatch(
      src,
      /\^\(\[01\]\\d\|2\[0-3\]\):\[0-5\]\\d\$/,
      'the HH:MM-only regex must be gone',
    );
  });

  test(`${label}: surfaces precise Chinese time-format error copy`, () => {
    const src = readFileSync(routePath, 'utf8');
    assert.match(src, /開始時間格式不正確/, 'start-time error must be in Chinese');
    assert.match(src, /結束時間格式不正確/, 'end-time error must be in Chinese');
    assert.match(src, /開始時間必須早於結束時間/, 'ordering error must be in Chinese');
    assert.doesNotMatch(src, /Invalid start_time_local \(HH:MM\)/, 'English copy must be replaced');
  });
}

// ---------- read-route normalization contracts ----------

test('guide GET normalizes start/end time to HH:MM in the response', () => {
  const src = readFileSync(GUIDE_POST, 'utf8');
  assert.match(src, /normalizeTimeLocal/);
  // The GET handler must map the rules and normalize the time fields,
  // not return the raw HH:MM:SS rows.
  assert.match(
    src,
    /start_time_local:\s*normalizeTimeLocal/,
    'GET must normalize start_time_local before returning rules',
  );
  assert.match(
    src,
    /end_time_local:\s*normalizeTimeLocal/,
    'GET must normalize end_time_local before returning rules',
  );
});
