/**
 * 結算 sweep 付款 gate（owner 待辦 2026-06-22）。
 *
 * 背景（live 實測）：settlement sweep 只用 `.eq('status','completed')` 當資格，
 * 沒檢查「錢是否真的收到」。發現 `Ava Preview Smoke …1158aa21` 為 completed 但
 * paid_at IS NULL（未付款）卻已被結算進 payout_items。owner 拍板用
 * `paid_at IS NOT NULL` 當 gate（對舊資料最安全：每條付款路徑都會寫 paid_at，
 * 而 payment_status 文字欄在 #197 前可能 stale）。
 *
 * Run: node --test apps/web/tests/api/settlement-payment-collected-gate.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  evaluatePayoutEligibility,
  isSettlementPaymentCollected,
} from '../../src/lib/post-trip/payout-eligibility.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

test('isSettlementPaymentCollected: paid_at 有值 → true', () => {
  assert.equal(isSettlementPaymentCollected('2026-06-01T00:00:00Z'), true);
  assert.equal(isSettlementPaymentCollected(new Date()), true);
});

test('isSettlementPaymentCollected: null / undefined / 空字串 → false', () => {
  assert.equal(isSettlementPaymentCollected(null), false);
  assert.equal(isSettlementPaymentCollected(undefined), false);
  assert.equal(isSettlementPaymentCollected(''), false);
  assert.equal(isSettlementPaymentCollected('   '), false);
});

test('evaluatePayoutEligibility: completed + paidAt=null → PAYMENT_NOT_COLLECTED', () => {
  const r = evaluatePayoutEligibility({ orderStatus: 'completed', paidAt: null });
  assert.equal(r.eligible, false);
  assert.equal(r.reason, 'PAYMENT_NOT_COLLECTED');
});

test('evaluatePayoutEligibility: completed + paidAt 有值 → eligible', () => {
  const r = evaluatePayoutEligibility({ orderStatus: 'completed', paidAt: '2026-06-01T00:00:00Z' });
  assert.equal(r.eligible, true);
});

test('evaluatePayoutEligibility: 未提供 paidAt → 維持舊行為（向後相容）', () => {
  assert.equal(evaluatePayoutEligibility({ orderStatus: 'completed' }).eligible, true);
});

test('evaluatePayoutEligibility: status 未完成優先於付款 gate', () => {
  assert.equal(
    evaluatePayoutEligibility({ orderStatus: 'paid', paidAt: null }).reason,
    'ORDER_NOT_COMPLETED',
  );
});

test('evaluatePayoutEligibility: completed + paidAt 有值但有 hold → 回 hold reason', () => {
  const r = evaluatePayoutEligibility({ orderStatus: 'completed', paidAt: '2026-06-01T00:00:00Z', isDisputed: true });
  assert.equal(r.eligible, false);
  assert.equal(r.reason, 'payment_dispute');
});

test('源碼契約：settlement sweep route 選 paid_at 並用 isSettlementPaymentCollected gate', () => {
  const src = readFileSync(join(repoRoot, 'app/api/internal/settlement/sweep/route.ts'), 'utf8');
  assert.match(src, /\bpaid_at\b/, 'sweep select 必須包含 paid_at');
  assert.match(src, /isSettlementPaymentCollected/, 'sweep 必須用 isSettlementPaymentCollected 過濾（未付款 completed 不得結算）');
});
