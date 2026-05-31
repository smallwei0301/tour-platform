/**
 * Tests for issue #978 — DATA_QUALITY_WARNING when aggregate funnel counts > 0
 * but all variant counts = 0.
 *
 * Distinguishes instrumentation gap (events tracked but rollout_variant not set)
 * from true no-traffic state (aggregate also zero).
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SCRIPTS = path.resolve(ROOT, '../../scripts/rollout');
// Use an isolated tmp directory per process to avoid racing with issue965 tests
// that also write to the shared booking-v2-dashboard-latest.json path.
const TMP_DIR = path.resolve(ROOT, '../../docs/operations/reports', `issue978-tmp-${process.pid}`);
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
      cwd: path.resolve(ROOT, '../..'),
    }
  );

  return readFileSync(path.join(TMP_DIR, 'booking-v2-go-no-go-latest.md'), 'utf8');
}

function makeUntaggedFixture() {
  return {
    generatedAt: new Date().toISOString(),
    window: { hours: 24 },
    funnel: {
      bookingPageView: 100,       // aggregate > 0
      bookingPageViewLegacy: 0,   // but variant counts = 0 (instrumentation gap)
      bookingPageViewV2: 0,
      beginCheckout: 70,
      beginCheckoutLegacy: 0,
      beginCheckoutV2: 0,
      purchaseIntent: 65,
      purchaseIntentLegacy: 0,
      purchaseIntentV2: 0,
      paymentCallbackReceived: 30,
      paymentSucceeded: 29,
      fallbackClicked: 2,
      beginCheckoutRatePct: 70,
      purchaseIntentRatePct: 92.86,
      paymentSuccessRatePct: 96.67,
      fallbackRateVsV2PageViewPct: 0,
      checkoutInitiated: 70,
      checkoutInitSucceeded: 65,
      checkoutInitSuccessRatePct: 92.86,
    },
    orders: { paid: 15, failed: 1 },
    bookings: { completed: 14, cancelled: 0 },
    errors: { eventError: 3, errorRateVsPageViewPct: 3 },
    latency: {},
    notes: [],
  };
}

describe('issue #978 — DATA_QUALITY_WARNING: aggregate > 0 but variants all zero', () => {
  test('emits DATA_QUALITY_WARNING(variant_instrumentation_untagged) when aggregate>0 and variant counts are all zero', () => {
    const fixture = makeUntaggedFixture();
    const output = runGoNoGo(fixture);
    assert.ok(
      output.includes('DATA_QUALITY_WARNING(variant_instrumentation_untagged)'),
      'should emit DATA_QUALITY_WARNING when aggregate>0 but all variant counts = 0'
    );
  });

  test('warning does NOT appear in hold_reasons or rollback_reasons — decision remains GO', () => {
    const fixture = makeUntaggedFixture();
    const output = runGoNoGo(fixture);
    assert.ok(
      !output.includes('rollback_reasons: DATA_QUALITY'),
      'DATA_QUALITY_WARNING should not be a rollback reason'
    );
    assert.ok(
      !output.includes('hold_reasons: DATA_QUALITY'),
      'DATA_QUALITY_WARNING should not be a hold reason'
    );
    assert.ok(output.includes('GO'), 'decision should still be GO with healthy core metrics');
  });

  test('does NOT emit warning when variant counts are populated (healthy state)', () => {
    const fixture = {
      generatedAt: new Date().toISOString(),
      window: { hours: 24 },
      funnel: {
        bookingPageView: 100,
        bookingPageViewLegacy: 40,
        bookingPageViewV2: 60,
        beginCheckout: 70,
        beginCheckoutLegacy: 28,
        beginCheckoutV2: 42,
        purchaseIntent: 65,
        purchaseIntentLegacy: 26,
        purchaseIntentV2: 39,
        paymentCallbackReceived: 30,
        paymentSucceeded: 29,
        fallbackClicked: 2,
        beginCheckoutRatePct: 70,
        purchaseIntentRatePct: 92.86,
        paymentSuccessRatePct: 96.67,
        fallbackRateVsV2PageViewPct: 3.33,
        checkoutInitiated: 70,
        checkoutInitSucceeded: 65,
        checkoutInitSuccessRatePct: 92.86,
      },
      orders: { paid: 15, failed: 1 },
      bookings: { completed: 14, cancelled: 0 },
      errors: {
        eventError: 3,
        errorRateVsPageViewPct: 3,
        errorRateVsPageViewLegacyPct: 2.5,
        errorRateVsPageViewV2Pct: 3.33,
      },
      latency: {},
      notes: [],
    };
    const output = runGoNoGo(fixture);
    assert.ok(
      !output.includes('DATA_QUALITY_WARNING(variant_instrumentation_untagged)'),
      'should NOT warn when variant counts are populated'
    );
  });

  test('does NOT emit warning when aggregate is also zero (no-traffic state)', () => {
    const fixture = {
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
        paymentSuccessRatePct: 100,
        fallbackRateVsV2PageViewPct: 0,
        checkoutInitiated: 0,
        checkoutInitSucceeded: 0,
        checkoutInitSuccessRatePct: 100,
      },
      orders: { paid: 0, failed: 0 },
      bookings: { completed: 0, cancelled: 0 },
      errors: { eventError: 0, errorRateVsPageViewPct: 0 },
      latency: {},
      notes: [],
    };
    const output = runGoNoGo(fixture);
    assert.ok(
      !output.includes('DATA_QUALITY_WARNING(variant_instrumentation_untagged)'),
      'should NOT warn when aggregate is also zero (no-traffic, not instrumentation gap)'
    );
  });

  test('go-no-go source contains DATA_QUALITY_WARNING(variant_instrumentation_untagged) literal', () => {
    const src = readFileSync(path.join(SCRIPTS, 'booking-v2-go-no-go.mjs'), 'utf8');
    assert.ok(
      src.includes('DATA_QUALITY_WARNING(variant_instrumentation_untagged)'),
      'booking-v2-go-no-go.mjs must contain DATA_QUALITY_WARNING(variant_instrumentation_untagged)'
    );
  });
});
