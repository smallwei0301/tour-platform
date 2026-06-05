// Issue #1106 — payout-eligibility backend slice (helpers only).
//
// Pins the canonical payout-eligibility decision so the future payout
// sweep, payout calculation, and Admin payout review can all branch
// on the same { eligible, reason } envelope. The helper reuses the
// existing isPayoutOnHold(post-trip-eligibility.mjs) hold semantics
// verbatim — a source-contract test locks the import so future
// refactors cannot silently fork the hold rules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evaluatePayoutEligibility } from '../../src/lib/post-trip/payout-eligibility.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

// ---------- order status gate ----------

test('completed order with no hold signals → eligible', () => {
  const r = evaluatePayoutEligibility({ orderStatus: 'completed' });
  assert.deepEqual(r, { eligible: true });
});

test('paid order (GMV-eligible per #847, but not yet payable) → ORDER_NOT_COMPLETED', () => {
  const r = evaluatePayoutEligibility({ orderStatus: 'paid' });
  assert.equal(r.eligible, false);
  assert.equal(r.reason, 'ORDER_NOT_COMPLETED');
});

test('confirmed order (GMV-eligible, not payable) → ORDER_NOT_COMPLETED', () => {
  assert.equal(
    evaluatePayoutEligibility({ orderStatus: 'confirmed' }).reason,
    'ORDER_NOT_COMPLETED',
  );
});

test('pending_payment / refund_pending / cancelled / refunded / no_show all → ORDER_NOT_COMPLETED', () => {
  for (const status of ['pending_payment', 'refund_pending', 'cancelled', 'refunded', 'no_show', '']) {
    const r = evaluatePayoutEligibility({ orderStatus: status });
    assert.equal(r.eligible, false, `status=${status} should not be eligible`);
    assert.equal(r.reason, 'ORDER_NOT_COMPLETED');
  }
});

test('missing orderStatus → ORDER_NOT_COMPLETED (safe-fail, never eligible)', () => {
  assert.equal(evaluatePayoutEligibility({}).reason, 'ORDER_NOT_COMPLETED');
  assert.equal(evaluatePayoutEligibility().reason, 'ORDER_NOT_COMPLETED');
  assert.equal(evaluatePayoutEligibility({ orderStatus: null }).reason, 'ORDER_NOT_COMPLETED');
});

// ---------- hold signals (delegated to isPayoutOnHold) ----------

test('completed + isDisputed=true → payment_dispute (outranks everything else)', () => {
  const r = evaluatePayoutEligibility({
    orderStatus: 'completed',
    isDisputed: true,
    isSafetyCase: true,
    hasComplaint: true,
    refundAmountTwd: 100,
  });
  assert.equal(r.eligible, false);
  assert.equal(r.reason, 'payment_dispute');
});

test('completed + isSafetyCase=true → safety_review (outranks complaint/refund/oversell)', () => {
  const r = evaluatePayoutEligibility({
    orderStatus: 'completed',
    isSafetyCase: true,
    hasComplaint: true,
    refundAmountTwd: 100,
  });
  assert.equal(r.reason, 'safety_review');
});

test('completed + hasComplaint=true → complaint_under_review (outranks refund/oversell)', () => {
  const r = evaluatePayoutEligibility({
    orderStatus: 'completed',
    hasComplaint: true,
    refundAmountTwd: 100,
  });
  assert.equal(r.reason, 'complaint_under_review');
});

test('completed + refundAmountTwd > 0 → refund_pending', () => {
  const r = evaluatePayoutEligibility({
    orderStatus: 'completed',
    refundAmountTwd: 100,
  });
  assert.equal(r.reason, 'refund_pending');
});

test('completed + hasOversellIssue=true → oversell_investigation', () => {
  const r = evaluatePayoutEligibility({
    orderStatus: 'completed',
    hasOversellIssue: true,
  });
  assert.equal(r.reason, 'oversell_investigation');
});

test('completed + refundAmountTwd=0 and all flags false → eligible', () => {
  const r = evaluatePayoutEligibility({
    orderStatus: 'completed',
    refundAmountTwd: 0,
    hasComplaint: false,
    hasOversellIssue: false,
    isDisputed: false,
    isSafetyCase: false,
  });
  assert.deepEqual(r, { eligible: true });
});

test('refundAmountTwd non-numeric / missing defaults to 0 (does not trigger refund_pending falsely)', () => {
  assert.deepEqual(
    evaluatePayoutEligibility({ orderStatus: 'completed', refundAmountTwd: undefined }),
    { eligible: true },
  );
  assert.deepEqual(
    evaluatePayoutEligibility({ orderStatus: 'completed', refundAmountTwd: 'foo' }),
    { eligible: true },
  );
});

test('truthy-but-not-boolean flag values do NOT trip the hold (only === true triggers)', () => {
  // Defensive: prevents accidental ineligibility when callers pass
  // truthy strings/numbers that aren't real signals.
  const r = evaluatePayoutEligibility({
    orderStatus: 'completed',
    hasComplaint: 'maybe',
    isDisputed: 1,
    isSafetyCase: {},
    hasOversellIssue: 'yes',
  });
  assert.deepEqual(r, { eligible: true });
});

// ---------- source contracts ----------

test('Source: helper imports isPayoutOnHold from post-trip-eligibility (no reimplementation)', () => {
  const src = readFileSync(
    join(REPO_ROOT, 'src/lib/post-trip/payout-eligibility.mjs'),
    'utf8',
  );
  assert.match(
    src,
    /import\s*\{\s*isPayoutOnHold\s*\}\s*from\s+['"]\.\.\/post-trip-eligibility\.mjs['"]/,
    'must reuse isPayoutOnHold, not re-derive hold rules',
  );
});

test('Source: helper does not encode raw PII columns (no contact_email / phone / payment payload)', () => {
  const src = readFileSync(
    join(REPO_ROOT, 'src/lib/post-trip/payout-eligibility.mjs'),
    'utf8',
  );
  assert.doesNotMatch(src, /\bcontact_email\b/);
  assert.doesNotMatch(src, /\btraveler_email\b/);
  assert.doesNotMatch(src, /\bcontact_phone\b/);
  assert.doesNotMatch(src, /\bbank_account\b/);
  assert.doesNotMatch(src, /\bcredit_card\b/);
});

test('Source: only "completed" is the payable status (lock the gate against future drift)', () => {
  const src = readFileSync(
    join(REPO_ROOT, 'src/lib/post-trip/payout-eligibility.mjs'),
    'utf8',
  );
  // PAYABLE_ORDER_STATUS must be 'completed'; this pins the spelling
  // so a future refactor cannot silently widen the gate to 'paid'
  // or 'confirmed' (which are GMV-eligible but NOT payable).
  assert.match(src, /PAYABLE_ORDER_STATUS\s*=\s*['"]completed['"]/);
});
