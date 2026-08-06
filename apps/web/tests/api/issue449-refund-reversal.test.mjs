/**
 * Contract tests for issue #449: Refund reversal in settlements (carry-forward)
 *
 * Strategy:
 *   - Structural: check migration file exists with correct SQL
 *   - Export: recordRefundReversalDb exported from db.mjs
 *   - Behavioral (mock): pre-settlement returns skipped, post-settlement creates reversal + debits balance
 *   - Behavioral (mock): idempotency — already reversed returns skipped
 *   - Structural: refund-execute.ts contains postRefundHook wiring
 *
 * Run: node --test tests/api/issue449-refund-reversal.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATION = join(
  __dirname,
  '../../../../supabase/migrations/20260513_issue449_payout_items_reversal.sql'
);
const DB_LIB = join(__dirname, '../../src/lib/db.mjs');
const REFUND_EXECUTE = join(__dirname, '../../src/lib/refund-execute.ts');
const ADMIN_ROUTE = join(
  __dirname,
  '../../app/api/v2/admin/orders/[orderId]/refund-execute/route.ts'
);

let migrationSrc;
try { migrationSrc = readFileSync(MIGRATION, 'utf8'); } catch { migrationSrc = null; }

let dbSrc;
try { dbSrc = readFileSync(DB_LIB, 'utf8'); } catch { dbSrc = null; }

let refundExecuteSrc;
try { refundExecuteSrc = readFileSync(REFUND_EXECUTE, 'utf8'); } catch { refundExecuteSrc = null; }

let adminRouteSrc;
try { adminRouteSrc = readFileSync(ADMIN_ROUTE, 'utf8'); } catch { adminRouteSrc = null; }

// ── Migration structural checks ───────────────────────────────────────────────

test('migration file exists', () => {
  assert.ok(migrationSrc !== null, `migration should exist at ${MIGRATION}`);
});

test('migration adds settlement_kind column', () => {
  assert.ok(migrationSrc !== null, 'migration must be readable');
  assert.match(migrationSrc, /ADD COLUMN IF NOT EXISTS settlement_kind/);
});

test('migration has CHECK constraint for settlement|reversal', () => {
  assert.ok(migrationSrc !== null, 'migration must be readable');
  assert.match(migrationSrc, /CHECK.*settlement_kind.*IN.*settlement.*reversal/s);
});

test('migration drops old single-column unique constraint', () => {
  assert.ok(migrationSrc !== null, 'migration must be readable');
  assert.match(migrationSrc, /DROP CONSTRAINT IF EXISTS payout_items_order_unique/);
});

test('migration creates compound unique index on (order_id, settlement_kind)', () => {
  assert.ok(migrationSrc !== null, 'migration must be readable');
  assert.match(migrationSrc, /CREATE UNIQUE INDEX IF NOT EXISTS payout_items_order_kind_unique/);
  assert.match(migrationSrc, /ON public\.payout_items \(order_id, settlement_kind\)/);
});

// ── DB lib export check ───────────────────────────────────────────────────────

// ⚠️ #1777 F4（2026-08-04）：以下原本是對 db.mjs 舊實作的 source-string 斷言
// （newBalance = beforeBalance - debit、ignoreDuplicates、audit marker…）。那個
// 實作已整包搬到 fn_record_refund_reversal_atomic —— 它正是本 issue 要修的最後
// 一處應用層 read-modify-write（寫回絕對值 ⇒ 併發 lost update；reversal 寫成功
// 但餘額扣失敗 ⇒ 重跑走 already_reversed ⇒ 餘額永久漏扣）。
//
// #449 的不變量沒有改變，只是換了執行機制，因此改鎖**不變量**而非舊實作的字串：
//   - 匯出路徑仍在（既有 import 不必改）
//   - 三種 outcome 的回傳形狀逐字相容
//   - 餘額允許扣成負數（carry-forward）
// 逐條行為由 tests/api/issue1777-atomic-refund-reversal.test.mjs 以行為測試覆蓋，
// SQL 屬性由 tests/api/issue1777-migration-contract.test.mjs 鎖住。

test('recordRefundReversalDb is exported from db.mjs', () => {
  assert.ok(dbSrc !== null, 'db.mjs must be readable');
  assert.match(dbSrc, /export async function recordRefundReversalDb/);
});

test('recordRefundReversalDb 委派給原子 RPC（不再自行 read-modify-write）', () => {
  assert.ok(dbSrc !== null, 'db.mjs must be readable');
  assert.match(dbSrc, /recordRefundReversalAtomicDb/, 'db.mjs 應委派到領域檔的原子實作');
  const code = dbSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(
    code,
    /newBalance = beforeBalance - debit/,
    '不得再於應用層算出餘額絕對值——那是 #1777 F4 的 lost update 成因',
  );
  assert.doesNotMatch(code, /ignoreDuplicates/, '冪等改由 payout_items 的部分唯一索引判定');
});

test('紅沖的三種 outcome 仍是 #449 的原契約', async () => {
  const { recordRefundReversalDb } = await import('../../src/lib/db.mjs');
  const client = (result) => ({
    from() { throw new Error('不得直接讀寫資料表'); },
    rpc: () => Promise.resolve({ data: result, error: null }),
  });

  assert.deepEqual(
    await recordRefundReversalDb(client({ outcome: 'pre_settlement' }), { orderId: 'o' }),
    { skipped: 'pre_settlement' },
  );
  assert.deepEqual(
    await recordRefundReversalDb(client({ outcome: 'already_reversed' }), { orderId: 'o' }),
    { skipped: 'already_reversed' },
  );

  const reversed = await recordRefundReversalDb(
    client({ outcome: 'reversed', reversal_id: 'rev-1', before_balance: 5000, after_balance: 2300 }),
    { orderId: 'o' },
  );
  assert.equal(reversed.reversed, true);
  assert.equal(reversed.reversal_id, 'rev-1');
  assert.equal(reversed.before_balance, 5000);
  assert.equal(reversed.after_balance, 2300);
});

test('carry-forward：餘額可扣成負數，不得截成 0', async () => {
  const { recordRefundReversalDb } = await import('../../src/lib/db.mjs');
  const out = await recordRefundReversalDb(
    {
      from() { throw new Error('不得直接讀寫資料表'); },
      rpc: () => Promise.resolve({
        data: { outcome: 'reversed', reversal_id: 'rev-2', before_balance: 3000, after_balance: -6000 },
        error: null,
      }),
    },
    { orderId: 'o' },
  );
  assert.equal(out.after_balance, -6000, '3000 - 9000 = -6000（carry-forward）');
});

test('migration 帶兩筆 audit（payout_reversal_created ＋ guide_balance_debited_reversal）', () => {
  const sql = readFileSync(
    join(__dirname, '../../../../supabase/migrations/20260804103000_issue1777_atomic_refund_reversal.sql'),
    'utf8',
  ).replace(/--.*$/gm, '');
  assert.match(sql, /payout_reversal_created/);
  assert.match(sql, /guide_balance_debited_reversal/);
});

// ── refund-execute.ts structural checks ───────────────────────────────────────

test('refund-execute.ts defines postRefundHook in ExecuteRefundInput', () => {
  assert.ok(refundExecuteSrc !== null, 'refund-execute.ts must be readable');
  assert.match(refundExecuteSrc, /postRefundHook/);
});

test('refund-execute.ts calls postRefundHook after successful refund with try/catch', () => {
  assert.ok(refundExecuteSrc !== null, 'refund-execute.ts must be readable');
  assert.match(refundExecuteSrc, /postRefundHook.*order\.id/s);
  assert.match(refundExecuteSrc, /catch.*reversalErr/s);
  assert.match(refundExecuteSrc, /settlement reversal failed/);
});

// ── Admin route wiring ────────────────────────────────────────────────────────

test('admin refund-execute route imports recordRefundReversalDb', () => {
  assert.ok(adminRouteSrc !== null, 'admin route must be readable');
  assert.match(adminRouteSrc, /recordRefundReversalDb/);
});

test('admin refund-execute route passes postRefundHook to executeRefund', () => {
  assert.ok(adminRouteSrc !== null, 'admin route must be readable');
  assert.match(adminRouteSrc, /postRefundHook.*recordRefundReversalDb/s);
});

// ── Behavioral mock tests ─────────────────────────────────────────────────────

// ⚠️ #1777 F4：這裡原本有四個以 `.from()` chain 模擬 supabase 的行為測試
// （pre-settlement／post-settlement 建分錄扣餘額／carry-forward 轉負／已紅沖冪等）。
// 紅沖已不再從應用層讀寫資料表，那些 mock 模擬的是一條不存在的路徑——留著只會
// 測到 mock 自己。
//
// 同樣的四個不變量已改由上方「紅沖的三種 outcome 仍是 #449 的原契約」與
// 「carry-forward：餘額可扣成負數」以 RPC 契約覆蓋，交易語意與冪等（部分唯一索引
// ＋ 只有真正插入新分錄才動餘額）由 issue1777-migration-contract 鎖住 SQL，
// 端到端由 production 實跑驗證。

test('postRefundHook failure does not propagate in executeRefund', async () => {
  const { executeRefund } = await import('../../src/lib/refund-execute.ts');

  let hookCalled = false;
  const outcome = await executeRefund({
    order: {
      id: 'order-hook-test',
      total_twd: 1000,
      trade_no: null,
      merchant_trade_no: null,
      ecpay_refund_trade_no: null,
    },
    body: { reason: 'test refund' },
    requestAllRefund: async () => ({ ok: true, rtnCode: '1', rtnMsg: 'ok', ecpayTradeNo: null }),
    updateOrder: async () => ({ data: [{ id: 'order-hook-test' }], error: null, count: 1 }),
    postRefundHook: async () => {
      hookCalled = true;
      throw new Error('simulated reversal failure');
    },
  });

  // Refund should succeed even though hook threw
  assert.equal(outcome.status, 200);
  assert.equal(hookCalled, true);
  assert.equal(outcome.body?.data?.cashOrder, true);
});
