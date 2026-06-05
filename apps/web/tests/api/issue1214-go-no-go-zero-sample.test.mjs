/**
 * Tests for issue #1214 — Fix Booking V2 Go/No-Go zero-sample decision semantics.
 *
 * Bug: When paymentCallbackReceived=0, paymentSuccessRatePct=0 triggers
 * PAYMENT_SUCCESS_LOW even though it's a no-traffic pre-launch state.
 * The fix gates rollback checks behind sample-size adequacy.
 *
 * AC1: zero-sample → HOLD (not ROLLBACK WATCH), no PAYMENT_SUCCESS_LOW,
 *      hold_reasons contains LOW_SAMPLE_CALLBACK.
 * AC2: real low-success (cb >= minCallback, payPct < threshold) → ROLLBACK WATCH,
 *      rollback_reasons contains PAYMENT_SUCCESS_LOW(80%<95%).
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(ROOT, '../..');
const SCRIPTS = path.resolve(REPO_ROOT, 'scripts/rollout');
const TMP_DIR = path.resolve(REPO_ROOT, 'docs/operations/reports', `issue1214-tmp-${process.pid}`);
mkdirSync(TMP_DIR, { recursive: true });

function runGoNoGo(fixture, env = {}) {
  const inputPath = path.join(TMP_DIR, 'booking-v2-dashboard-latest.json');
  writeFileSync(inputPath, JSON.stringify(fixture, null, 2));

  execFileSync(
    process.execPath,
    [path.join(SCRIPTS, 'booking-v2-go-no-go.mjs')],
    {
      env: {
        ...process.env,
        ...env,
        GO_NO_GO_INPUT_PATH: inputPath,
        GO_NO_GO_REPORTS_DIR: TMP_DIR,
      },
      encoding: 'utf8',
      cwd: REPO_ROOT,
    }
  );

  return readFileSync(path.join(TMP_DIR, 'booking-v2-go-no-go-latest.md'), 'utf8');
}

function makeZeroSampleFixture() {
  return {
    generatedAt: new Date().toISOString(),
    window: { hours: 24 },
    funnel: {
      bookingPageView: 0,
      bookingPageViewLegacy: 0,
      bookingPageViewV2: 0,
      beginCheckout: 0,
      beginCheckoutLegacy: 0,
      beginCheckoutV2: 0,
      purchaseIntent: 0,
      purchaseIntentLegacy: 0,
      purchaseIntentV2: 0,
      paymentCallbackReceived: 0,
      paymentSucceeded: 0,
      fallbackClicked: 0,
      beginCheckoutRatePct: 0,
      purchaseIntentRatePct: 0,
      paymentSuccessRatePct: 0,
      fallbackRateVsV2PageViewPct: 0,
      checkoutInitiated: 0,
      checkoutInitSucceeded: 0,
      checkoutInitSuccessRatePct: 0,
    },
    orders: { paid: 0, failed: 0 },
    bookings: { completed: 0, cancelled: 0 },
    errors: { eventError: 0, errorRateVsPageViewPct: 0 },
    latency: {},
    notes: [],
  };
}

function makeLowSuccessFixture() {
  return {
    generatedAt: new Date().toISOString(),
    window: { hours: 24 },
    funnel: {
      bookingPageView: 50,
      bookingPageViewLegacy: 20,
      bookingPageViewV2: 30,
      beginCheckout: 35,
      beginCheckoutLegacy: 14,
      beginCheckoutV2: 21,
      purchaseIntent: 30,
      purchaseIntentLegacy: 12,
      purchaseIntentV2: 18,
      paymentCallbackReceived: 30,
      paymentSucceeded: 24,
      fallbackClicked: 1,
      beginCheckoutRatePct: 70,
      purchaseIntentRatePct: 85.71,
      paymentSuccessRatePct: 80,
      fallbackRateVsV2PageViewPct: 3.33,
      checkoutInitiated: 35,
      checkoutInitSucceeded: 32,
      checkoutInitSuccessRatePct: 91.43,
    },
    orders: { paid: 24, failed: 6 },
    bookings: { completed: 24, cancelled: 0 },
    errors: { eventError: 1, errorRateVsPageViewPct: 2 },
    latency: {},
    notes: [],
  };
}

describe('issue #1214 — go/no-go zero-sample decision semantics', () => {
  test('AC1: zero-sample input → HOLD, no PAYMENT_SUCCESS_LOW, hold_reasons has LOW_SAMPLE_CALLBACK', () => {
    const fixture = makeZeroSampleFixture();
    const output = runGoNoGo(fixture);

    assert.ok(
      output.includes('Decision: **HOLD**'),
      `Expected Decision: **HOLD** but got:\n${output}`
    );
    assert.ok(
      !output.includes('PAYMENT_SUCCESS_LOW'),
      `Expected no PAYMENT_SUCCESS_LOW in zero-sample output but found one:\n${output}`
    );
    assert.ok(
      output.includes('LOW_SAMPLE_CALLBACK'),
      `Expected hold_reasons to contain LOW_SAMPLE_CALLBACK:\n${output}`
    );
  });

  test('AC2: real low-success (cb=30 >= 5, payPct=80 < 95) → ROLLBACK WATCH with PAYMENT_SUCCESS_LOW(80%<95%)', () => {
    const fixture = makeLowSuccessFixture();
    const output = runGoNoGo(fixture);

    assert.ok(
      output.includes('Decision: **ROLLBACK WATCH**'),
      `Expected Decision: **ROLLBACK WATCH** but got:\n${output}`
    );
    assert.ok(
      output.includes('PAYMENT_SUCCESS_LOW(80%<95%)'),
      `Expected rollback_reasons to contain PAYMENT_SUCCESS_LOW(80%<95%):\n${output}`
    );
  });
});
