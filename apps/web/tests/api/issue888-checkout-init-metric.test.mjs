/**
 * Tests for issue #888 — Booking V2 Go/No-Go checkout-init success metric contract.
 *
 * Verifies:
 * 1. Dashboard script outputs checkoutInitiated + checkoutInitSucceeded + checkoutInitSuccessRatePct
 * 2. Go/No-Go report consumes these fields and does NOT trigger MISSING_REQUIRED_METRIC when present
 * 3. Zero-data case produces HOLD (MISSING_REQUIRED_METRIC), not false ROLLBACK WATCH
 * 4. Low checkout success triggers ROLLBACK WATCH
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SCRIPTS = path.resolve(ROOT, '../../scripts/rollout');
// Use an isolated tmp directory per process to avoid racing with other go-no-go tests
// (issue965, issue978) that also write to the shared booking-v2-dashboard-latest.json.
const REPORTS_DIR = path.resolve(ROOT, '../../docs/operations/reports', `issue888-tmp-${process.pid}`);
mkdirSync(REPORTS_DIR, { recursive: true });

const dashboardSrc = readFileSync(path.join(SCRIPTS, 'booking-v2-dashboard.mjs'), 'utf8');
const goNoGoSrc = readFileSync(path.join(SCRIPTS, 'booking-v2-go-no-go.mjs'), 'utf8');

// ── Source-level contract checks ─────────────────────────────────────────────

describe('issue #888 — dashboard source contract', () => {
  test('dashboard outputs checkoutInitiated field in funnel', () => {
    assert.ok(
      dashboardSrc.includes('checkoutInitiated'),
      'booking-v2-dashboard.mjs must output checkoutInitiated in funnel'
    );
  });

  test('dashboard outputs checkoutInitSucceeded field in funnel', () => {
    assert.ok(
      dashboardSrc.includes('checkoutInitSucceeded'),
      'booking-v2-dashboard.mjs must output checkoutInitSucceeded in funnel'
    );
  });

  test('dashboard outputs checkoutInitSuccessRatePct field in funnel', () => {
    assert.ok(
      dashboardSrc.includes('checkoutInitSuccessRatePct'),
      'booking-v2-dashboard.mjs must output checkoutInitSuccessRatePct in funnel'
    );
  });

  test('dashboard omits checkoutInitSuccessRatePct when beginCheckout is 0 (no data)', () => {
    // Guard: the dashboard must only spread checkoutInitSuccessRatePct conditionally
    assert.ok(
      dashboardSrc.includes('beginCheckout > 0'),
      'dashboard must guard checkoutInitSuccessRatePct behind beginCheckout > 0 to avoid false 0%'
    );
  });

  test('go-no-go reads checkoutInitSuccessRatePct or falls back to raw counts', () => {
    assert.ok(
      goNoGoSrc.includes('checkoutInitSuccessRatePct'),
      'go-no-go must reference checkoutInitSuccessRatePct'
    );
    assert.ok(
      goNoGoSrc.includes('checkoutInitSucceeded') && goNoGoSrc.includes('checkoutInitiated'),
      'go-no-go must reference fallback raw count fields'
    );
  });
});

// ── Fixture-driven go-no-go behaviour ────────────────────────────────────────

function runGoNoGo(fixture, env = {}) {
  const inputPath = path.join(REPORTS_DIR, 'booking-v2-dashboard-latest.json');
  writeFileSync(inputPath, JSON.stringify(fixture, null, 2));

  execFileSync(
    process.execPath,
    [path.join(SCRIPTS, 'booking-v2-go-no-go.mjs')],
    // Run from repo root so the script's `path.join(cwd, 'docs/...')` resolves correctly.
    {
      env: {
        ...process.env,
        ...env,
        GO_NO_GO_INPUT_PATH: inputPath,
        GO_NO_GO_REPORTS_DIR: REPORTS_DIR,
      },
      encoding: 'utf8',
      cwd: path.resolve(ROOT, '../..'),
    }
  );
  // go-no-go writes results to a file; read it to inspect the content
  return readFileSync(path.join(REPORTS_DIR, 'booking-v2-go-no-go-latest.md'), 'utf8');
}

function makeBaseFunnel(overrides = {}) {
  return {
    bookingPageView: 50,
    bookingPageViewLegacy: 25,
    bookingPageViewV2: 25,
    beginCheckout: 30,
    purchaseIntent: 28,
    paymentCallbackReceived: 20,
    paymentSucceeded: 19,
    fallbackClicked: 1,
    beginCheckoutRatePct: 60,
    purchaseIntentRatePct: 93.33,
    paymentSuccessRatePct: 95,
    fallbackRateVsV2PageViewPct: 4,
    checkoutInitiated: 30,
    checkoutInitSucceeded: 28,
    checkoutInitSuccessRatePct: 93.33,
    ...overrides,
  };
}

function makeBaseReport(funnelOverrides = {}, errorsOverrides = {}) {
  return {
    generatedAt: new Date().toISOString(),
    window: { hours: 24 },
    funnel: makeBaseFunnel(funnelOverrides),
    orders: { paid: 10, failed: 1 },
    bookings: { completed: 8, cancelled: 0 },
    errors: {
      eventError: 1,
      errorRateVsPageViewPct: 2,
      ...errorsOverrides,
    },
    latency: {},
    notes: [],
  };
}

describe('issue #888 — go-no-go fixture: checkout success metric present', () => {
  test('GO verdict when checkoutInitSuccessRatePct is above threshold', () => {
    const fixture = makeBaseReport();
    const output = runGoNoGo(fixture, { GO_NOGO_CHECKOUT_SUCCESS_MIN_PCT: '90' });
    assert.ok(
      !output.includes('MISSING_REQUIRED_METRIC(funnel.checkoutInitSuccessRatePct)'),
      'should NOT trigger MISSING_REQUIRED_METRIC when checkoutInitSuccessRatePct is present'
    );
    assert.ok(
      !output.includes('CHECKOUT_SUCCESS_LOW'),
      'should NOT trigger CHECKOUT_SUCCESS_LOW when rate >= threshold'
    );
    assert.ok(output.includes('GO'), 'report should reach GO verdict');
  });

  test('ROLLBACK WATCH when checkoutInitSuccessRatePct is below threshold', () => {
    const fixture = makeBaseReport({ checkoutInitSuccessRatePct: 70, checkoutInitSucceeded: 21, checkoutInitiated: 30 });
    const output = runGoNoGo(fixture, { GO_NOGO_CHECKOUT_SUCCESS_MIN_PCT: '90' });
    assert.ok(
      output.includes('CHECKOUT_SUCCESS_LOW'),
      'should trigger CHECKOUT_SUCCESS_LOW when rate < threshold'
    );
  });
});

describe('issue #888 — go-no-go fixture: zero data case (no events)', () => {
  test('HOLD with MISSING_REQUIRED_METRIC when checkoutInitiated is 0 and field is absent', () => {
    // Dashboard omits checkoutInitSuccessRatePct when beginCheckout=0; raw counts are 0
    const fixture = makeBaseReport({
      beginCheckout: 0,
      checkoutInitiated: 0,
      checkoutInitSucceeded: 0,
      // checkoutInitSuccessRatePct deliberately absent (as dashboard would output)
    });
    delete fixture.funnel.checkoutInitSuccessRatePct;

    const output = runGoNoGo(fixture);
    assert.ok(
      output.includes('MISSING_REQUIRED_METRIC(funnel.checkoutInitSuccessRatePct)'),
      'should trigger MISSING_REQUIRED_METRIC when no checkout events and field is absent'
    );
    assert.ok(
      !output.includes('CHECKOUT_SUCCESS_LOW'),
      'should NOT trigger CHECKOUT_SUCCESS_LOW for the zero-data case (HOLD not ROLLBACK WATCH)'
    );
  });

  test('HOLD not ROLLBACK WATCH when checkoutInitSuccessRatePct is absent (fallback pct(0,0) = NaN)', () => {
    const fixture = makeBaseReport({
      checkoutInitiated: 0,
      checkoutInitSucceeded: 0,
    });
    delete fixture.funnel.checkoutInitSuccessRatePct;

    const output = runGoNoGo(fixture);
    // go-no-go pct(0, 0) returns NaN → MISSING_REQUIRED_METRIC → HOLD (not ROLLBACK WATCH)
    assert.ok(
      output.includes('HOLD') || output.includes('MISSING_REQUIRED_METRIC'),
      'zero-data case must produce HOLD or MISSING_REQUIRED_METRIC, never silent pass'
    );
    assert.ok(
      !output.includes('CHECKOUT_SUCCESS_LOW'),
      'zero-data must not produce CHECKOUT_SUCCESS_LOW — that would be a false alarm'
    );
  });
});
