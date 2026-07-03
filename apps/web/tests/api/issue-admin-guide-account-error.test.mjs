import { test } from 'node:test';
import assert from 'node:assert/strict';

const { classifyGuideAccountUpdateError } = await import(
  '../../src/lib/guide-account-error.mjs'
);

// 背景：admin 後台 PATCH /api/admin/guides/:id 之前用 `throw updateError`，
// 而 Supabase 的 PostgrestError 是純物件（非 Error 實例），導致 route 的
// `err instanceof Error` 為 false → 真正的 DB 訊息被丟掉、UI 只看到字面
// 「SERVER_ERROR」，且 unique(email) 衝突永遠無法被辨識成 EMAIL_TAKEN。

test('PostgrestError unique_violation (code 23505) → EMAIL_TAKEN 409', () => {
  const err = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "guide_profiles_guide_email_key"',
    details: 'Key (guide_email)=(smallwei0301@gmail.com) already exists.',
  };
  const out = classifyGuideAccountUpdateError(err);
  assert.equal(out.code, 'EMAIL_TAKEN');
  assert.equal(out.status, 409);
  assert.equal(out.message, '此 Email 已被使用');
});

test('unique/duplicate 出現在 message（無 code）也判為 EMAIL_TAKEN', () => {
  const out = classifyGuideAccountUpdateError({ message: 'unique constraint failed' });
  assert.equal(out.code, 'EMAIL_TAKEN');
  assert.equal(out.status, 409);
});

test('一般 PostgrestError → 保留真正的 DB 訊息，不再吞成字面 SERVER_ERROR', () => {
  const err = { code: '42703', message: 'column "guide_password_hash" does not exist' };
  const out = classifyGuideAccountUpdateError(err);
  assert.equal(out.code, 'SERVER_ERROR');
  assert.equal(out.status, 500);
  assert.equal(out.message, 'column "guide_password_hash" does not exist');
});

test('真正的 Error 實例也能取出 message', () => {
  const out = classifyGuideAccountUpdateError(new Error('boom'));
  assert.equal(out.code, 'SERVER_ERROR');
  assert.equal(out.message, 'boom');
});

test('無法辨識的 falsy/空錯誤 → 退回字面 SERVER_ERROR，永不拋例外', () => {
  for (const bad of [null, undefined, {}, { message: '' }, 'weird']) {
    const out = classifyGuideAccountUpdateError(bad);
    assert.equal(out.code, 'SERVER_ERROR');
    assert.equal(out.status, 500);
    assert.equal(out.message, 'SERVER_ERROR');
  }
});
