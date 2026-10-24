/**
 * #1928：退款執行的 ECPay 例外不得把原始錯誤訊息回給 client。
 *
 * - requestAllRefund throw → 固定文案、code ECPAY_REFUND_FAILED、status 502；原始例外經 reportError 上報。
 * - result.ok === false 的 rtnMsg 是 ECPay 文件化的業務回應訊息，且只有 admin 呼叫端會回給 client
 *   （admin 需要它排查），此為刻意保留的行為——本測試鎖住它。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { executeRefund } from '../../src/lib/refund-execute.ts';

const order = { id: 'order-1928', status: 'refund_pending', total_twd: 1500, trade_no: 'T1', merchant_trade_no: 'M1' };
const updateOrder = async () => ({ error: null, data: [{ id: 'order-1928' }], count: 1 });

test('requestAllRefund throw → 502／ECPAY_REFUND_FAILED／固定文案，body 不含原始錯誤；原始例外有上報', async () => {
  const reported = [];
  const thrown = new Error('secret-ecpay-detail socket hang up');
  const outcome = await executeRefund({
    order,
    body: {},
    requestAllRefund: async () => { throw thrown; },
    updateOrder,
    reportError: (err) => { reported.push(err); },
  });
  assert.equal(outcome.status, 502);
  assert.equal(outcome.body.error.code, 'ECPAY_REFUND_FAILED');
  assert.equal(outcome.body.error.message, '退款請求失敗，請稍後再試或聯絡客服');
  assert.ok(!JSON.stringify(outcome).includes('secret-ecpay-detail'));
  assert.deepEqual(reported, [thrown]);
});

test('requestAllRefund throw 非 Error 值也不外洩；reportError 自身丟錯不反噬結果；未提供 reportError 也可運作', async () => {
  const a = await executeRefund({
    order, body: {}, updateOrder,
    requestAllRefund: async () => { throw 'secret-ecpay-detail raw string'; },
    reportError: () => { throw new Error('reporter down'); },
  });
  assert.equal(a.status, 502);
  assert.ok(!JSON.stringify(a).includes('secret-ecpay-detail'));
  const b = await executeRefund({
    order, body: {}, updateOrder,
    requestAllRefund: async () => { throw new Error('secret-ecpay-detail'); },
  });
  assert.equal(b.status, 502);
  assert.ok(!JSON.stringify(b).includes('secret-ecpay-detail'));
});

test('rtnMsg 路徑（刻意保留）：ok:false 照舊回傳 ECPay rtnMsg，status 502、不觸發 reportError', async () => {
  const reported = [];
  const outcome = await executeRefund({
    order, body: {}, updateOrder,
    requestAllRefund: async () => ({ ok: false, rtnCode: '10100058', rtnMsg: 'ECPay 業務訊息：已超過可退款期限', ecpayTradeNo: null }),
    reportError: (err) => reported.push(err),
  });
  assert.equal(outcome.status, 502);
  assert.equal(outcome.body.error.code, 'ECPAY_REFUND_FAILED');
  assert.equal(outcome.body.error.message, 'ECPay 業務訊息：已超過可退款期限');
  assert.equal(reported.length, 0);
});
