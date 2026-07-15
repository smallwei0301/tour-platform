/**
 * Issue #1387 — 旅客 profile（最小版）：/api/me/profile + checkout 預填 + 通知偏好
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

import {
  validateTravelerProfileInput,
  shouldSendEmailKind,
  TRANSACTIONAL_EMAIL_KINDS,
} from '../../src/lib/traveler-profile.mjs';

// ── 欄位驗證（純函式，離線）────────────────────────────────────────────────

test('validate: 合法輸入 → ok + 正規化欄位', () => {
  const r = validateTravelerProfileInput({
    displayName: '  小明  ',
    phone: '0912-345-678',
    marketingEmailOptIn: false,
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.displayName, '小明');
  assert.equal(r.value.phone, '0912345678', '電話應去除分隔符');
  assert.equal(r.value.marketingEmailOptIn, false);
});

test('validate: 台灣手機格式（09xxxxxxxx 或 +8869xxxxxxxx）；空電話允許', () => {
  assert.equal(validateTravelerProfileInput({ phone: '0987654321' }).ok, true);
  assert.equal(validateTravelerProfileInput({ phone: '+886912345678' }).ok, true);
  assert.equal(validateTravelerProfileInput({ phone: '' }).ok, true);
  for (const bad of ['12345', '09123', 'abc', '0212345678九']) {
    const r = validateTravelerProfileInput({ phone: bad });
    assert.equal(r.ok, false, `phone=${bad} 應被拒`);
    assert.equal(r.error.code, 'INVALID_PHONE');
  }
});

test('validate: displayName 長度上限 50、不得只剩空白', () => {
  assert.equal(validateTravelerProfileInput({ displayName: 'x'.repeat(50) }).ok, true);
  assert.equal(validateTravelerProfileInput({ displayName: 'x'.repeat(51) }).ok, false);
  const r = validateTravelerProfileInput({ displayName: '   ' });
  assert.equal(r.ok, true);
  assert.equal(r.value.displayName, '', '全空白視為清空');
});

test('validate: region 未帶 → null（不更新）；空字串 → 清空；已知 slug → 通過；未知 → 拒', () => {
  // 未帶 region
  const none = validateTravelerProfileInput({ displayName: 'a' });
  assert.equal(none.ok, true);
  assert.equal(none.value.region, null, '未帶 region 應為 null（不更新）');
  // 空字串清空
  const cleared = validateTravelerProfileInput({ region: '' });
  assert.equal(cleared.ok, true);
  assert.equal(cleared.value.region, '');
  // 已知 slug
  const ok = validateTravelerProfileInput({ region: 'taipei' });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.region, 'taipei');
  // 未知 slug
  const bad = validateTravelerProfileInput({ region: 'atlantis' });
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, 'INVALID_REGION');
});

// ── 通知偏好（交易類不可關）─────────────────────────────────────────────────

test('email kinds: 交易類不受 opt-out 影響；行銷類遵守 opt-in', () => {
  for (const kind of TRANSACTIONAL_EMAIL_KINDS) {
    assert.equal(shouldSendEmailKind(kind, { marketingEmailOptIn: false }), true, `${kind} 為交易類，不可關`);
  }
  assert.equal(shouldSendEmailKind('marketing', { marketingEmailOptIn: false }), false);
  assert.equal(shouldSendEmailKind('marketing', { marketingEmailOptIn: true }), true);
  assert.equal(shouldSendEmailKind('marketing', null), true, '無 profile 預設可寄（opt-out 模型）');
});

// ── source-contract ─────────────────────────────────────────────────────────

test('migration: traveler_profiles 表 + RLS（本人讀寫）', () => {
  const p = path.resolve('../../supabase/migrations/20260611_issue1387_traveler_profiles.sql');
  assert.ok(existsSync(p), 'migration 應存在（timestamp 制）');
  const sql = readFileSync(p, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS.*traveler_profiles/s);
  assert.match(sql, /display_name/);
  assert.match(sql, /phone/);
  assert.match(sql, /marketing_email_opt_in/);
  assert.match(sql, /ROW LEVEL SECURITY/i);
  assert.match(sql, /auth\.uid\(\)/, 'RLS 應限本人');
});

test('route: /api/me/profile 存在，GET+PATCH、未登入 401、不落明文電話 log', () => {
  const p = path.resolve('app/api/me/profile/route.ts');
  assert.ok(existsSync(p), 'route 應存在');
  const src = readFileSync(p, 'utf8');
  assert.match(src, /export async function GET/);
  assert.match(src, /export async function PATCH/);
  assert.match(src, /UNAUTHORIZED/, '未登入應 401');
  assert.match(src, /validateTravelerProfileInput/, '應用統一驗證 helper');
  assert.ok(!/console\.(log|info|warn|error)\([^)]*phone/i.test(src), 'route 不得 log 電話（PII）');
});

test('route: region 欄位有 schema-drift guard（42703/PGRST204 → 退回不含 region 的讀寫）', () => {
  const src = readFileSync(path.resolve('app/api/me/profile/route.ts'), 'utf8');
  assert.match(src, /isMissingRegionColumn/, '應有 region 欄位缺失判斷 helper');
  assert.match(src, /42703/, '應比對 undefined_column 錯誤碼');
  assert.match(src, /PGRST204/, '應比對 PostgREST schema-cache 錯誤碼');
  // GET 與 PATCH 都要呼叫 guard（兩處 isMissingRegionColumn 呼叫 + 一處宣告）
  const occurrences = (src.match(/isMissingRegionColumn\(/g) || []).length;
  assert.ok(occurrences >= 2, `GET/PATCH 都應套 guard，找到 ${occurrences} 處呼叫`);
});

// legacy checkout 頁的 profile 預填測試已隨 #1407 頁面刪除移除。

test('/me/profile 頁面存在且為 client component（auth gate）', () => {
  const p = path.resolve('app/(non-locale)/me/profile/page.tsx');
  assert.ok(existsSync(p), '/me/profile 頁面應存在');
  const src = readFileSync(p, 'utf8');
  assert.match(src, /'use client'/);
  assert.match(src, /router\.replace\(`?\/login/, '未登入應導向登入');
  // #multilingual: 「交易通知不可關」說明已移到 profile.marketingHelper catalog；
  // 頁面改引用 m.marketingHelper，內容類斷言改讀繁中 catalog。
  assert.match(src, /m\.marketingHelper/, '頁面應引用 m.marketingHelper');
  const zh = JSON.parse(readFileSync(path.resolve('messages/zh-Hant.json'), 'utf8'));
  assert.match(zh.profile.marketingHelper, /交易/, 'profile.marketingHelper 應說明交易通知不可關');
});
