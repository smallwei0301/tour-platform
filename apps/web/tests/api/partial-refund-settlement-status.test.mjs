/**
 * 部分退款結算串接修正 — 部分退款訂單必須維持「可結算」狀態。
 *
 * 背景（staging 實測 + 用戶回報）：部分退款功能上線後，導遊後台看不到也拿不到
 * 未退部分的款。根因：refund-execute 對「部分」退款也把 order.status 設成
 * 'refunded'，但
 *   - 結算 sweep（app/api/internal/settlement/sweep/route.ts）只撈 status='completed'
 *   - 導遊儀表板（app/api/guide/dashboard/route.ts）GMV 只算 paid/confirmed/completed
 * 兩者都把 'refunded' 整筆排除 → computeSweepPayoutItem 根本不會跑 → 未退部分（effective
 * = total − refund_amount_twd）的撥款（#847/結算規則 §4「扣除已退款部分後」）完全消失。
 *
 * 修正（owner 拍板：方向 A「部分退款保持可結算」）：
 *   - 部分退款不把 order.status 設為 'refunded'，改還原退款前的可結算狀態
 *     （previousOrderStatus，refund 申請時已記入 audit_logs）；payment_status 仍記
 *     'partially_refunded' 以資區分。
 *   - 全額退款維持 'refunded'（effective=0 本就不撥款，行為不變）。
 *   - void（authorization_voided，授權未請款）一律全額，維持 'refunded'/'voided'。
 *
 * Run: node --test apps/web/tests/api/partial-refund-settlement-status.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  executeRefund,
  resolvePartialRefundStatus,
  SETTLEABLE_ORDER_STATUSES,
} from '../../src/lib/refund-execute.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

// ── resolvePartialRefundStatus（純函式） ─────────────────────────────────────

test('resolvePartialRefundStatus：可結算的退款前狀態原樣保留', () => {
  for (const s of SETTLEABLE_ORDER_STATUSES) {
    assert.equal(resolvePartialRefundStatus(s), s, `${s} 應原樣還原`);
  }
});

test('resolvePartialRefundStatus：未知/非可結算狀態 → fallback completed（仍可結算，受 sweep T+7 保護）', () => {
  for (const s of [null, undefined, '', 'refund_pending', 'refunded', 'cancelled_by_user', 'pending_payment']) {
    assert.equal(resolvePartialRefundStatus(s), 'completed', `${s} 應 fallback completed`);
  }
});

test('resolvePartialRefundStatus：回傳值一律在可結算集合內', () => {
  for (const s of ['paid', 'confirmed', 'completed', 'refunded', null, 'garbage']) {
    assert.ok(
      SETTLEABLE_ORDER_STATUSES.includes(resolvePartialRefundStatus(s)),
      `${s} 的結果必須是可結算狀態`,
    );
  }
});

// ── executeRefund：部分退款不再寫死 status='refunded' ─────────────────────────

test('executeRefund 現金部分退款：status 還原可結算狀態（不是 refunded）', async () => {
  const captured = { payload: null };
  const outcome = await executeRefund({
    order: { id: 'cash-p1', status: 'refund_pending', total_twd: 1998 },
    body: { reason: '部分退款' },
    refundAmount: 1000,
    partialTargetStatus: 'paid', // 退款前為 paid
    requestAllRefund: async () => { throw new Error('cash 不打 ECPay'); },
    updateOrder: async (_id, payload) => { captured.payload = payload; return { error: null, data: [{ id: 'cash-p1' }], count: 1 }; },
  });

  assert.equal(outcome.status, 200);
  assert.equal(captured.payload.status, 'paid', '部分退款應還原退款前可結算狀態，而非 refunded');
  assert.notEqual(captured.payload.status, 'refunded', '部分退款不得設成 refunded（會被結算/儀表板排除）');
  assert.equal(captured.payload.payment_status, 'partially_refunded');
  assert.ok(SETTLEABLE_ORDER_STATUSES.includes(captured.payload.status), 'status 必須可結算');
});

test('executeRefund 現金部分退款：未提供 partialTargetStatus → fallback completed（仍可結算）', async () => {
  const captured = { payload: null };
  const outcome = await executeRefund({
    order: { id: 'cash-p2', status: 'refund_pending', total_twd: 1998 },
    body: { reason: '部分退款' },
    refundAmount: 500,
    requestAllRefund: async () => { throw new Error('cash 不打 ECPay'); },
    updateOrder: async (_id, payload) => { captured.payload = payload; return { error: null, data: [{ id: 'cash-p2' }], count: 1 }; },
  });

  assert.equal(outcome.status, 200);
  assert.equal(captured.payload.status, 'completed');
  assert.equal(captured.payload.payment_status, 'partially_refunded');
});

test('executeRefund 現金全額退款：status 維持 refunded（行為不變）', async () => {
  const captured = { payload: null };
  const outcome = await executeRefund({
    order: { id: 'cash-f1', status: 'refund_pending', total_twd: 1998 },
    body: { reason: '全額' },
    partialTargetStatus: 'paid',
    requestAllRefund: async () => { throw new Error('cash 不打 ECPay'); },
    updateOrder: async (_id, payload) => { captured.payload = payload; return { error: null, data: [{ id: 'cash-f1' }], count: 1 }; },
  });

  assert.equal(outcome.status, 200);
  assert.equal(captured.payload.status, 'refunded', '全額退款維持 refunded');
  assert.equal(captured.payload.payment_status, 'refunded');
});

test('executeRefund ECPay AllRefund 部分退款：status 還原可結算狀態', async () => {
  const captured = { payload: null };
  const outcome = await executeRefund({
    order: { id: 'ec-p1', status: 'refund_pending', total_twd: 1500, trade_no: 'TN-P', merchant_trade_no: 'MTN-P' },
    body: {},
    refundAmount: 600,
    partialTargetStatus: 'confirmed',
    requestAllRefund: async () => ({ ok: true, rtnCode: '1', rtnMsg: 'ok', ecpayTradeNo: 'RF-P' }),
    updateOrder: async (_id, payload) => { captured.payload = payload; return { error: null, data: [{ id: 'ec-p1' }], count: 1 }; },
  });

  assert.equal(outcome.status, 200);
  assert.equal(captured.payload.status, 'confirmed');
  assert.equal(captured.payload.payment_status, 'partially_refunded');
});

// ── source-contract：route + 上游結算過濾的一致性 ───────────────────────────

test('route：部分退款用 partialTargetStatus（不寫死 refunded）', () => {
  const routeSrc = readFileSync(
    join(repoRoot, 'app/api/admin/orders/[orderId]/refund-execute/route.ts'),
    'utf8',
  );
  assert.match(routeSrc, /resolvePartialRefundStatus/, 'route 應 import/呼叫 resolvePartialRefundStatus');
  assert.match(routeSrc, /partialTargetStatus/, 'route 應計算並傳遞 partialTargetStatus');
  assert.match(
    routeSrc,
    /previousOrderStatus/,
    'route 應讀取退款前狀態（audit_logs.previousOrderStatus）以還原可結算狀態',
  );
});

test('helper：refund-execute.ts 匯出 resolvePartialRefundStatus + SETTLEABLE_ORDER_STATUSES', () => {
  const helperSrc = readFileSync(join(repoRoot, 'src/lib/refund-execute.ts'), 'utf8');
  assert.match(helperSrc, /export function resolvePartialRefundStatus/);
  assert.match(helperSrc, /export const SETTLEABLE_ORDER_STATUSES/);
});

test('sweep + 儀表板：部分退款還原的狀態落在各自的結算/GMV 過濾集合內', () => {
  // 防迴歸：若日後有人收窄 sweep/dashboard 的狀態過濾，這條會抓出與
  // resolvePartialRefundStatus fallback('completed') 的脫節。
  const sweepSrc = readFileSync(
    join(repoRoot, 'app/api/internal/settlement/sweep/route.ts'),
    'utf8',
  );
  const dashSrc = readFileSync(
    join(repoRoot, 'app/api/guide/dashboard/route.ts'),
    'utf8',
  );
  // sweep 撈 completed → fallback completed 必能被撈到
  assert.match(sweepSrc, /\.eq\(\s*['"]status['"]\s*,\s*['"]completed['"]\s*\)/);
  // dashboard GMV 含 paid/confirmed/completed
  assert.match(dashSrc, /gmvStatuses\s*=\s*\[[^\]]*['"]completed['"]/);
});
