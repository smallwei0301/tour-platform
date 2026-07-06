/**
 * #1637 — callback RPC 收斂 migration（20260706150000）＋ callback route 補強的契約測試。
 *
 * - migration：source-contract 鎖定 DROP 4-arg overload、6-arg 簽名、booking_type
 *   auto-confirm、order 終態隨 booking_type、TradeAmt 金額驗證、原子序不變
 *   （NOT_VERIFIED-live：未連真 DB；套用後以 pg_proc SELECT 驗證）。
 * - route（P0-OVERRIDE 授權修補）：憑證缺失 fail-closed（僅 form-urlencoded 正式
 *   callback）、amount_mismatch incident reason 分流。
 * - rollback：同名 .rollback.sql 必須同時還原 6-arg（614 版）與 4-arg（#195 版）。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = path.resolve(webRoot, '..', '..');

const MIG = readFileSync(
  path.join(repoRoot, 'supabase/migrations/20260706150000_issue1637_callback_rpc_unify_auto_confirm.sql'),
  'utf8'
);
const ROLLBACK = readFileSync(
  path.join(repoRoot, 'supabase/migrations/20260706150000_issue1637_callback_rpc_unify_auto_confirm.rollback.sql'),
  'utf8'
);
const ROUTE = readFileSync(
  path.join(webRoot, 'app/api/payments/ecpay/callback/route.ts'),
  'utf8'
);

describe('migration：overload 收斂', () => {
  it('DROP 4-arg overload（死 overload 移除，PostgREST 解析唯一化）', () => {
    assert.match(MIG, /DROP FUNCTION IF EXISTS fn_process_payment_callback_atomic\(uuid, text, text, jsonb\);/);
  });

  it('重建 6-arg 簽名（p_merchant_trade_no + p_provider，與 db.mjs 呼叫參數一致）', () => {
    assert.match(MIG, /p_merchant_trade_no text DEFAULT NULL/);
    assert.match(MIG, /p_provider text DEFAULT 'ecpay'/);
  });
});

describe('migration：booking_type auto-confirm（20260624130000 決策移植）', () => {
  it('讀 activity_plans.booking_type 並 map 三種模式 → confirmed、其餘 → pending_confirmation', () => {
    assert.match(MIG, /SELECT ap\.booking_type INTO v_booking_type/);
    assert.match(MIG, /IF v_booking_type IN \('instant', 'scheduled', 'request'\) THEN/);
    const confirmIdx = MIG.indexOf("v_target_status := 'confirmed'");
    const fallbackIdx = MIG.indexOf("v_target_status := 'pending_confirmation'");
    assert.ok(confirmIdx > 0 && fallbackIdx > confirmIdx, 'confirmed 分支在 pending fallback 之前');
  });

  it('confirmed 時寫 confirmed_at（coalesce 保留既有值）', () => {
    assert.match(MIG, /confirmed_at = CASE WHEN v_target_status = 'confirmed' THEN coalesce\(confirmed_at, now\(\)\) ELSE confirmed_at END/);
  });

  it('保留 614 版 booking_status_logs metadata（sourceChannel/correlationId/auditSignal）＋新增 bookingType', () => {
    assert.match(MIG, /'sourceChannel', v_origin_source_channel/);
    assert.match(MIG, /'correlationId', v_correlation_id/);
    assert.match(MIG, /'bookingType', v_booking_type/);
    assert.match(MIG, /line_liff_payment_callback_status_transition/);
  });
});

describe('migration：order 終態隨 booking_type（P0-1 修復核心）', () => {
  it('可 auto-confirm 者 order 直上 confirmed、否則維持 paid', () => {
    assert.match(MIG, /v_order_final_status := 'confirmed'/);
    assert.match(MIG, /v_order_final_status text := 'paid'/);
    assert.match(MIG, /SET status = v_order_final_status,/);
  });

  it('回傳列使用 v_order_final_status（route 依此回報實際狀態）', () => {
    assert.match(MIG, /v_order_final_status,\s*\n\s*v_order\.total_twd/);
  });
});

describe('migration：TradeAmt 金額驗證（P1-1）', () => {
  it('TradeAmt 存在且為數字時必須等於 total_twd，不符 RAISE（ERRCODE 22000）', () => {
    assert.match(MIG, /p_raw_payload->>'TradeAmt'/);
    assert.match(MIG, /~ '\^\[0-9\]\+\$'/);
    assert.match(MIG, /payment amount mismatch/);
  });

  it('金額驗證在守門之後、扣位之前（不符不得消耗座位）', () => {
    const guardIdx = MIG.indexOf('illegal order status transition');
    const amtIdx = MIG.indexOf('payment amount mismatch');
    const bookIdx = MIG.indexOf('SELECT fn_book_schedule');
    assert.ok(guardIdx > 0 && amtIdx > guardIdx && bookIdx > amtIdx, '順序必須為 守門 → 金額驗證 → 扣位');
  });

  it('replay 冪等路徑不做金額驗證（已付訂單重放仍 noop）', () => {
    const replayIdx = MIG.indexOf("IN ('paid', 'confirmed', 'completed')");
    const amtIdx = MIG.indexOf('payment amount mismatch');
    assert.ok(replayIdx > 0 && amtIdx > replayIdx, '金額驗證必須在 replay 檢查之後');
  });
});

describe('migration：原子序不變（對齊 issue1384 契約）', () => {
  it('鎖定 → replay → 守門 → 扣位 → 轉態', () => {
    const lockIdx = MIG.indexOf('FOR UPDATE');
    const replayIdx = MIG.indexOf("IN ('paid', 'confirmed', 'completed')");
    const guardIdx = MIG.indexOf('illegal order status transition');
    const bookIdx = MIG.indexOf('SELECT fn_book_schedule');
    const statusIdx = MIG.indexOf('SET status = v_order_final_status');
    assert.ok(lockIdx > 0 && replayIdx > lockIdx && guardIdx > replayIdx && bookIdx > guardIdx && statusIdx > bookIdx);
  });

  it('鎖序 orders → bookings', () => {
    const ordersLock = MIG.indexOf('FROM orders');
    const bookingsLock = MIG.indexOf('FROM bookings');
    assert.ok(ordersLock > 0 && bookingsLock > ordersLock);
  });
});

describe('rollback 檔', () => {
  it('同時還原 6-arg（614 版，booking → pending_confirmation）與 4-arg（#195 版）', () => {
    const createCount = (ROLLBACK.match(/CREATE OR REPLACE FUNCTION fn_process_payment_callback_atomic\(/g) ?? []).length;
    assert.equal(createCount, 2, 'rollback 必須重建兩個 overload');
    assert.match(ROLLBACK, /p_merchant_trade_no text DEFAULT NULL/);
  });
});

describe('callback route（P0-OVERRIDE 授權修補）', () => {
  it('P1-2：憑證缺失時，form-urlencoded 正式 callback fail-closed 回 500', () => {
    assert.match(ROUTE, /credentials_missing/);
    assert.match(ROUTE, /PAYMENT_CONFIG_ERROR/);
    assert.match(ROUTE, /\{ status: 500 \}/);
  });

  it('P1-2：JSON／模擬付款路徑維持舊行為（無憑證仍可測試）', () => {
    assert.match(ROUTE, /CheckMacValue verification skipped/);
  });

  it('P1-1：amount_mismatch incident reason 分流', () => {
    assert.match(ROUTE, /payment amount mismatch.*amount_mismatch.*db_processing_error/s);
  });
});
