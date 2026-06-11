/**
 * Issue #1411 — 站內訊息 route wiring source-contract
 * 鎖定：auth → rate limit → gateway 的順序、角色固定、admin 唯讀（無 POST）、
 * 通知 best-effort（void + catch）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const meSrc = readFileSync(path.resolve('app/api/me/orders/[orderId]/messages/route.ts'), 'utf8');
const guideOrderSrc = readFileSync(path.resolve('app/api/guide/orders/[orderId]/messages/route.ts'), 'utf8');
const guideListSrc = readFileSync(path.resolve('app/api/guide/messages/route.ts'), 'utf8');
const adminSrc = readFileSync(path.resolve('app/api/admin/orders/[orderId]/messages/route.ts'), 'utf8');

test('me route: Supabase auth 在 gateway 之前；POST 順序 = auth → rate limit → create', () => {
  assert.match(meSrc, /supabase\.auth\.getUser\(\)/);

  const postStart = meSrc.indexOf('export async function POST');
  const postSrc = meSrc.slice(postStart);
  const authIdx = postSrc.indexOf('auth.getUser');
  const rateIdx = postSrc.indexOf('messageSendLimiter.check');
  const createIdx = postSrc.indexOf('createOrderMessageDb');
  assert.ok(authIdx > 0, 'POST 應驗證 Supabase auth');
  assert.ok(rateIdx > authIdx, 'rate limit 應在 auth 之後');
  assert.ok(createIdx > rateIdx, 'gateway 呼叫應在 rate limit 之後');
});

test('me route: senderRole 固定 traveler、ownership 以 user.email 傳入', () => {
  assert.match(meSrc, /senderRole:\s*'traveler'/);
  assert.match(meSrc, /contactEmail:\s*user\.email/);
});

test('me route: 通知嚮導 best-effort（void + catch，不阻斷回應）', () => {
  assert.match(meSrc, /void notifyGuideOfOrderMessage\(result\)\.catch/);
});

test('guide order route: verifyGuideSession 在 gateway 之前、senderRole 固定 guide、傳 guideId', () => {
  assert.match(guideOrderSrc, /verifyGuideSession\(req\)/);
  const postStart = guideOrderSrc.indexOf('export async function POST');
  const postSrc = guideOrderSrc.slice(postStart);
  const sessionIdx = postSrc.indexOf('verifyGuideSession');
  const rateIdx = postSrc.indexOf('messageSendLimiter.check');
  const createIdx = postSrc.indexOf('createOrderMessageDb');
  assert.ok(sessionIdx > 0 && rateIdx > sessionIdx && createIdx > rateIdx,
    'POST 順序應為 session → rate limit → gateway');
  assert.match(postSrc, /senderRole:\s*'guide'/);
  assert.match(postSrc, /guideId:\s*session\.guideId/);
  assert.match(postSrc, /void notifyTravelerOfOrderMessage\(result\)\.catch/);
});

test('guide list route: verifyGuideSession + listGuideMessageThreadsDb', () => {
  assert.match(guideListSrc, /verifyGuideSession\(req\)/);
  assert.match(guideListSrc, /listGuideMessageThreadsDb/);
});

test('admin route: 唯讀 — 只 export GET，無 POST/PATCH/DELETE', () => {
  assert.match(adminSrc, /export async function GET/);
  assert.doesNotMatch(adminSrc, /export async function (POST|PATCH|DELETE|PUT)/,
    'admin 第一期唯讀，不得有寫入 handler');
  assert.match(adminSrc, /listOrderMessagesDb\(\{ orderId \}\)/, 'admin 走 service-role 全串唯讀');
});

test('所有 route 的錯誤都走 orderMessageErrorToResponseParts（不外洩內部錯誤）', () => {
  for (const [name, src] of [['me', meSrc], ['guide-order', guideOrderSrc], ['guide-list', guideListSrc], ['admin', adminSrc]]) {
    assert.match(src, /orderMessageErrorToResponseParts/, `${name} route 缺統一錯誤轉換`);
  }
});
