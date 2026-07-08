/**
 * Issue #826 →（#1649 改寫為退役殘留守門）
 *
 * 原測試鎖定 `submitEcpayCallback`（client-api.ts）的 text/plain `1|OK` ack 解析。
 * 該 helper 自 legacy checkout 退役（#1407）後即為零消費者死碼，#1649 traveler 端
 * 全面切 v2 時一併移除——client 端不再有任何直接 POST ECPay callback 的路徑
 * （mock 付款走 /api/payments/mock-confirm；正式 callback 是 ECPay server→server）。
 * `1|OK` ack 語意由 callback route 的既有測試鎖定（ecpay-callback-* 系列）。
 *
 * 本檔改為殘留守門：死碼不得回流。
 */

import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '../..');

const clientApiSrc = readFileSync(
  path.join(webRoot, 'src/lib/client-api.ts'),
  'utf-8'
);

describe('issue #826/#1649 — submitEcpayCallback 死碼退役殘留守門', () => {
  it('client-api.ts 不得再定義 submitEcpayCallback', () => {
    // 鎖函式定義而非字面（檔頭退役說明註解允許提及名稱）
    assert.ok(
      !/function\s+submitEcpayCallback/.test(clientApiSrc),
      'submitEcpayCallback 已隨 #1649 移除，不得回流'
    );
  });

  it('client-api.ts 不得直接 POST ECPay callback 端點', () => {
    assert.ok(
      !clientApiSrc.includes('/api/payments/ecpay/callback'),
      'client 端不得直接打 ECPay callback（server→server 專用）'
    );
  });

  it('訂單/退款死碼 helper 全數退役', () => {
    for (const dead of ['fetchMyOrders', 'fetchMyOrderDetail', 'fetchRefundRequests', 'createRefundRequest', 'fetchExperiences']) {
      assert.ok(!clientApiSrc.includes(`function ${dead}`), `${dead} 已隨 #1649 移除，不得回流`);
    }
  });
});
