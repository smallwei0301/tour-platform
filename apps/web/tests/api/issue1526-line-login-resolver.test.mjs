/**
 * Issue #1526 — LINE Login（C′ 後端 idToken 橋接）帳號解析純函式。
 *
 * 驗證帳號合併策略（decision note）：
 *   1. line_user_id 已綁定 → 直接登入該 user（bind_existing）
 *   2. 未綁定、有已驗證 email 且開啟自動連結 → 連結既有 email 帳號（link_by_email）
 *   3. 未綁定、無 email / email 未驗證 / 自動連結關閉 → 建新帳號（create_new）
 *   4. 自動連結預設關閉（decision note 第 3 點：首發只記 log 不自動併帳）
 *
 * Run: node --test apps/web/tests/api/issue1526-line-login-resolver.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { resolveLineLoginAccount, buildPlaceholderEmail } = await import('../../src/lib/line-login.mjs');

test('已綁定 line_user_id → bind_existing（直接登入該 user）', () => {
  const r = resolveLineLoginAccount({
    lineUserId: 'U123',
    email: 'a@example.com',
    emailVerified: true,
    existingMapping: { userId: 'user-existing', lineUserId: 'U123' },
    existingUserIdByEmail: 'user-other',
    autoLinkVerifiedEmail: true,
  });
  assert.equal(r.action, 'bind_existing');
  assert.equal(r.userId, 'user-existing');
});

test('未綁定 + 已驗證 email + 自動連結開啟 → link_by_email', () => {
  const r = resolveLineLoginAccount({
    lineUserId: 'U124',
    email: 'b@example.com',
    emailVerified: true,
    existingMapping: null,
    existingUserIdByEmail: 'user-byemail',
    autoLinkVerifiedEmail: true,
  });
  assert.equal(r.action, 'link_by_email');
  assert.equal(r.userId, 'user-byemail');
});

test('未綁定 + 已驗證 email + 自動連結「關閉」（預設）→ create_new（不自動併帳）', () => {
  const r = resolveLineLoginAccount({
    lineUserId: 'U125',
    email: 'c@example.com',
    emailVerified: true,
    existingMapping: null,
    existingUserIdByEmail: 'user-byemail',
    // autoLinkVerifiedEmail 省略 → 預設 false
  });
  assert.equal(r.action, 'create_new');
  assert.equal(r.email, 'c@example.com');
});

test('未綁定 + email 未驗證 → 即使開自動連結也不併帳，create_new', () => {
  const r = resolveLineLoginAccount({
    lineUserId: 'U126',
    email: 'd@example.com',
    emailVerified: false,
    existingMapping: null,
    existingUserIdByEmail: 'user-byemail',
    autoLinkVerifiedEmail: true,
  });
  assert.equal(r.action, 'create_new');
});

test('未綁定 + 無 email → create_new 帶 placeholder email', () => {
  const r = resolveLineLoginAccount({
    lineUserId: 'U127',
    email: undefined,
    emailVerified: false,
    existingMapping: null,
    existingUserIdByEmail: null,
    autoLinkVerifiedEmail: true,
  });
  assert.equal(r.action, 'create_new');
  assert.equal(r.email, buildPlaceholderEmail('U127'));
  assert.match(r.email, /@line\.local$/);
});

test('lineUserId 缺失 → invalid（route 應回 401，不建帳）', () => {
  const r = resolveLineLoginAccount({ lineUserId: '', existingMapping: null });
  assert.equal(r.action, 'invalid');
});

test('buildPlaceholderEmail — 穩定、無 PII、可反查 sub', () => {
  assert.equal(buildPlaceholderEmail('Uabc'), 'line_Uabc@line.local');
  // 非法字元清理（避免非法 email）
  assert.doesNotMatch(buildPlaceholderEmail('U a/b'), /[^\w@.\-]/);
});
