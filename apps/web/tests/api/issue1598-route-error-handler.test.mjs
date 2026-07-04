/**
 * Issue #1598 — handleRouteError 行為測試。
 *
 * 驗證：(1) 回 errorV2 500 shape、(2) 呼叫 recordIncident 並帶正確 severity/source、
 * (3) recordIncident 拋錯不反噬 response、(4) 預設不外洩 err.message、可覆寫。
 *
 * 用 module mock 攔 recordIncident——node:test 的 mock.module 需 --experimental-*，
 * 故改以「注入式」驗證：直接讀 route-error.ts 呼叫 recordIncident 的行為由整合面確認，
 * 這裡以真實 recordIncident（Sentry/Telegram 皆 fire-and-forget、無 env 時 no-op）跑，
 * 斷言回應 shape 與不拋錯即可；上報內容的 PII 遮罩由 incidents.ts 自有測試覆蓋。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRouteError } from '../../src/lib/route-error.ts';

test('T1598.1 — 回 errorV2 500 shape，預設通用訊息不外洩 err.message', async () => {
  const res = await handleRouteError(new Error('DB secret table leak detail'), { route: 'v2/test' });
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'INTERNAL_ERROR');
  assert.ok(!/secret table leak/.test(body.error.message), 'client 訊息不得含 err.message 內部細節');
});

test('T1598.2 — 可覆寫 code/message/status', async () => {
  const res = await handleRouteError(new Error('x'), {
    route: 'v2/test',
    code: 'PAYMENT_PROVIDER_DOWN',
    message: '付款服務暫時無法使用',
    status: 502,
  });
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.error.code, 'PAYMENT_PROVIDER_DOWN');
  assert.equal(body.error.message, '付款服務暫時無法使用');
});

test('T1598.3 — 非 Error 值（throw 字串）也安全處理', async () => {
  const res = await handleRouteError('plain string thrown', { route: 'v2/test' });
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.success, false);
});

test('T1598.4 — recordIncident 失敗不反噬（route 仍回 500，不拋）', async () => {
  // 傳入會讓 metadata 序列化炸掉的循環結構——recordIncident 內部 redact/序列化若拋錯，
  // handleRouteError 的內層 try 必須兜住，仍回正常 500。
  const circular = {};
  circular.self = circular;
  const res = await handleRouteError(new Error('boom'), { route: 'v2/test', metadata: { circular } });
  assert.equal(res.status, 500);
});
