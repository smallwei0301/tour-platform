/**
 * Tests for issue #965 — Booking V2 Go/No-Go legacy vs V2 funnel delta metrics.
 *
 * Verifies:
 * 1. Dashboard source emits the 6 new keys:
 *    funnel.beginCheckoutLegacy, funnel.beginCheckoutV2,
 *    funnel.purchaseIntentLegacy, funnel.purchaseIntentV2,
 *    errors.errorRateVsPageViewLegacyPct, errors.errorRateVsPageViewV2Pct
 * 2. Frontend pages emit rollout_variant on begin_checkout / purchase_intent
 * 3. Go/No-Go fixture: data present → deltas computed (MISSING_DELTA_INPUT warnings absent)
 * 4. Go/No-Go fixture: missing variant data → MISSING_DELTA_INPUT warning, still not false-GO block
 * 5. Go/No-Go fixture: zero data → MISSING_DELTA_INPUT warning, not false ROLLBACK WATCH
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SCRIPTS = path.resolve(ROOT, '../../scripts/rollout');
// Use an isolated tmp directory per process to avoid racing with other go-no-go tests
// (issue888, issue978) that also write to the shared booking-v2-dashboard-latest.json.
const REPORTS_DIR = path.resolve(ROOT, '../../docs/operations/reports', `issue965-tmp-${process.pid}`);
mkdirSync(REPORTS_DIR, { recursive: true });

const dashboardSrc = readFileSync(path.join(SCRIPTS, 'booking-v2-dashboard.mjs'), 'utf8');
const goNoGoSrc = readFileSync(path.join(SCRIPTS, 'booking-v2-go-no-go.mjs'), 'utf8');

// ── Checkout page source assertions ────────────────────────────────────────────

const checkoutPageSrc = readFileSync(
  path.resolve(ROOT, 'app/checkout/page.tsx'),
  'utf8',
);

const bookingPageSrc = readFileSync(
  path.resolve(ROOT, 'app/booking/[activityId]/page.tsx'),
  'utf8',
);

describe('issue #965 — checkout/page.tsx source contract', () => {
  test('legacy checkout page emits rollout_variant: legacy on begin_checkout', () => {
    // The begin_checkout track() call in checkout/page.tsx must include rollout_variant: 'legacy'
    const beginCheckoutIdx = checkoutPageSrc.indexOf("event_name: 'begin_checkout'");
    assert.ok(beginCheckoutIdx !== -1, "checkout page must have begin_checkout track call");
    const snippet = checkoutPageSrc.slice(beginCheckoutIdx, beginCheckoutIdx + 400);
    assert.ok(
      snippet.includes("rollout_variant: 'legacy'"),
      "begin_checkout in checkout/page.tsx must emit rollout_variant: 'legacy'"
    );
  });

  test('legacy checkout page emits rollout_variant: legacy on purchase_intent', () => {
    const purchaseIntentIdx = checkoutPageSrc.indexOf("event_name: 'purchase_intent'");
    assert.ok(purchaseIntentIdx !== -1, "checkout page must have purchase_intent track call");
    const snippet = checkoutPageSrc.slice(purchaseIntentIdx, purchaseIntentIdx + 400);
    assert.ok(
      snippet.includes("rollout_variant: 'legacy'"),
      "purchase_intent in checkout/page.tsx must emit rollout_variant: 'legacy'"
    );
  });
});

describe('issue #965 — booking/[activityId]/page.tsx source contract (V2)', () => {
  test('v2 booking page emits rollout_variant: v2 on begin_checkout', () => {
    // begin_checkout v2 is emitted in the BookingInnerV2FlagShell step-1 "下一步" button
    const beginCheckoutIdx = bookingPageSrc.indexOf("event_name: 'begin_checkout'");
    assert.ok(beginCheckoutIdx !== -1, "booking v2 page must have begin_checkout track call");
    const snippet = bookingPageSrc.slice(beginCheckoutIdx, beginCheckoutIdx + 400);
    assert.ok(
      snippet.includes("rollout_variant: 'v2'"),
      "begin_checkout in booking/[activityId]/page.tsx must emit rollout_variant: 'v2'"
    );
  });

  test('v2 booking page emits rollout_variant: v2 on purchase_intent', () => {
    const purchaseIntentIdx = bookingPageSrc.indexOf("event_name: 'purchase_intent'");
    assert.ok(purchaseIntentIdx !== -1, "booking v2 page must have purchase_intent track call");
    const snippet = bookingPageSrc.slice(purchaseIntentIdx, purchaseIntentIdx + 400);
    assert.ok(
      snippet.includes("rollout_variant: 'v2'"),
      "purchase_intent in booking/[activityId]/page.tsx must emit rollout_variant: 'v2'"
    );
  });
});

// ── Dashboard source contract ──────────────────────────────────────────────────

describe('issue #965 — dashboard source contract', () => {
  test('dashboard emits beginCheckoutLegacy in funnel', () => {
    assert.ok(
      dashboardSrc.includes('beginCheckoutLegacy'),
      'booking-v2-dashboard.mjs must output beginCheckoutLegacy in funnel'
    );
  });

  test('dashboard emits beginCheckoutV2 in funnel', () => {
    assert.ok(
      dashboardSrc.includes('beginCheckoutV2'),
      'booking-v2-dashboard.mjs must output beginCheckoutV2 in funnel'
    );
  });

  test('dashboard emits purchaseIntentLegacy in funnel', () => {
    assert.ok(
      dashboardSrc.includes('purchaseIntentLegacy'),
      'booking-v2-dashboard.mjs must output purchaseIntentLegacy in funnel'
    );
  });

  test('dashboard emits purchaseIntentV2 in funnel', () => {
    assert.ok(
      dashboardSrc.includes('purchaseIntentV2'),
      'booking-v2-dashboard.mjs must output purchaseIntentV2 in funnel'
    );
  });

  test('dashboard emits errorRateVsPageViewLegacyPct in errors', () => {
    assert.ok(
      dashboardSrc.includes('errorRateVsPageViewLegacyPct'),
      'booking-v2-dashboard.mjs must output errorRateVsPageViewLegacyPct in errors'
    );
  });

  test('dashboard emits errorRateVsPageViewV2Pct in errors', () => {
    assert.ok(
      dashboardSrc.includes('errorRateVsPageViewV2Pct'),
      'booking-v2-dashboard.mjs must output errorRateVsPageViewV2Pct in errors'
    );
  });

  test('dashboard guards errorRateVsPageViewLegacyPct behind bookingPageViewLegacy > 0', () => {
    assert.ok(
      dashboardSrc.includes('bookingPageViewLegacy > 0'),
      'dashboard must guard errorRateVsPageViewLegacyPct to avoid false 0% when no legacy data'
    );
  });

  test('dashboard guards errorRateVsPageViewV2Pct behind bookingPageViewV2 > 0', () => {
    assert.ok(
      dashboardSrc.includes('bookingPageViewV2 > 0'),
      'dashboard must guard errorRateVsPageViewV2Pct to avoid false 0% when no v2 data'
    );
  });

  test('dashboard uses countEventByVariant for begin_checkout legacy and v2', () => {
    assert.ok(
      dashboardSrc.includes("countEventByVariant('begin_checkout', 'legacy')"),
      "dashboard must use countEventByVariant('begin_checkout', 'legacy')"
    );
    assert.ok(
      dashboardSrc.includes("countEventByVariant('begin_checkout', 'v2')"),
      "dashboard must use countEventByVariant('begin_checkout', 'v2')"
    );
  });

  test('dashboard uses countEventByVariant for purchase_intent legacy and v2', () => {
    assert.ok(
      dashboardSrc.includes("countEventByVariant('purchase_intent', 'legacy')"),
      "dashboard must use countEventByVariant('purchase_intent', 'legacy')"
    );
    assert.ok(
      dashboardSrc.includes("countEventByVariant('purchase_intent', 'v2')"),
      "dashboard must use countEventByVariant('purchase_intent', 'v2')"
    );
  });
});

// ── Go/No-Go source contract ───────────────────────────────────────────────────

describe('issue #965 — go-no-go source contract', () => {
  test('go-no-go reads beginCheckoutLegacy and beginCheckoutV2', () => {
    assert.ok(
      goNoGoSrc.includes('beginCheckoutLegacy') && goNoGoSrc.includes('beginCheckoutV2'),
      'go-no-go must reference beginCheckoutLegacy and beginCheckoutV2'
    );
  });

  test('go-no-go reads purchaseIntentLegacy and purchaseIntentV2', () => {
    assert.ok(
      goNoGoSrc.includes('purchaseIntentLegacy') && goNoGoSrc.includes('purchaseIntentV2'),
      'go-no-go must reference purchaseIntentLegacy and purchaseIntentV2'
    );
  });

  test('go-no-go reads errorRateVsPageViewLegacyPct and errorRateVsPageViewV2Pct', () => {
    assert.ok(
      goNoGoSrc.includes('errorRateVsPageViewLegacyPct') && goNoGoSrc.includes('errorRateVsPageViewV2Pct'),
      'go-no-go must reference errorRateVsPageViewLegacyPct and errorRateVsPageViewV2Pct'
    );
  });

  test('go-no-go emits MISSING_DELTA_INPUT warning for missing begin_checkout delta inputs', () => {
    assert.ok(
      goNoGoSrc.includes("MISSING_DELTA_INPUT(begin_checkout_rate)"),
      'go-no-go must warn MISSING_DELTA_INPUT(begin_checkout_rate) when delta inputs are absent'
    );
  });

  test('go-no-go emits MISSING_DELTA_INPUT warning for missing purchase_intent delta inputs', () => {
    assert.ok(
      goNoGoSrc.includes("MISSING_DELTA_INPUT(purchase_intent_rate)"),
      'go-no-go must warn MISSING_DELTA_INPUT(purchase_intent_rate) when delta inputs are absent'
    );
  });

  test('go-no-go emits MISSING_DELTA_INPUT warning for missing error_rate delta inputs', () => {
    assert.ok(
      goNoGoSrc.includes("MISSING_DELTA_INPUT(error_rate)"),
      'go-no-go must warn MISSING_DELTA_INPUT(error_rate) when delta inputs are absent'
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

  return readFileSync(path.join(REPORTS_DIR, 'booking-v2-go-no-go-latest.md'), 'utf8');
}

function makeBaseFunnel(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function makeBaseErrors(overrides = {}) {
  return {
    eventError: 3,
    errorRateVsPageViewPct: 3,
    errorRateVsPageViewLegacyPct: 2.5,
    errorRateVsPageViewV2Pct: 3.33,
    ...overrides,
  };
}

function makeBaseReport(funnelOverrides = {}, errorsOverrides = {}) {
  return {
    generatedAt: new Date().toISOString(),
    window: { hours: 24 },
    funnel: makeBaseFunnel(funnelOverrides),
    orders: { paid: 15, failed: 1 },
    bookings: { completed: 14, cancelled: 0 },
    errors: makeBaseErrors(errorsOverrides),
    latency: {},
    notes: [],
  };
}

describe('issue #965 — go-no-go fixture: data present → deltas computed', () => {
  test('no MISSING_DELTA_INPUT warnings when all 6 new keys are present', () => {
    const fixture = makeBaseReport();
    const output = runGoNoGo(fixture);
    assert.ok(
      !output.includes('MISSING_DELTA_INPUT(begin_checkout_rate)'),
      'should NOT trigger MISSING_DELTA_INPUT(begin_checkout_rate) when data is present'
    );
    assert.ok(
      !output.includes('MISSING_DELTA_INPUT(purchase_intent_rate)'),
      'should NOT trigger MISSING_DELTA_INPUT(purchase_intent_rate) when data is present'
    );
    assert.ok(
      !output.includes('MISSING_DELTA_INPUT(error_rate)'),
      'should NOT trigger MISSING_DELTA_INPUT(error_rate) when data is present'
    );
  });

  test('delta fields appear in the report output', () => {
    const fixture = makeBaseReport();
    const output = runGoNoGo(fixture);
    assert.ok(
      output.includes('begin_checkout_rate_legacy_pct'),
      'report must include begin_checkout_rate_legacy_pct'
    );
    assert.ok(
      output.includes('begin_checkout_rate_v2_pct'),
      'report must include begin_checkout_rate_v2_pct'
    );
    assert.ok(
      output.includes('purchase_intent_rate_legacy_pct'),
      'report must include purchase_intent_rate_legacy_pct'
    );
    assert.ok(
      output.includes('purchase_intent_rate_v2_pct'),
      'report must include purchase_intent_rate_v2_pct'
    );
    assert.ok(
      output.includes('error_rate_legacy_pct'),
      'report must include error_rate_legacy_pct'
    );
    assert.ok(
      output.includes('error_rate_v2_pct'),
      'report must include error_rate_v2_pct'
    );
  });

  test('GO verdict when all metrics are healthy', () => {
    const fixture = makeBaseReport();
    const output = runGoNoGo(fixture);
    assert.ok(output.includes('GO'), 'report should reach GO verdict with healthy metrics');
  });
});

describe('issue #965 — go-no-go fixture: missing variant data → warning not false-GO block', () => {
  test('MISSING_DELTA_INPUT warning for begin_checkout when variant counts absent', () => {
    const fixture = makeBaseReport();
    // Remove variant-level counts so delta computation falls back to NaN
    delete fixture.funnel.beginCheckoutLegacy;
    delete fixture.funnel.beginCheckoutV2;
    const output = runGoNoGo(fixture);
    assert.ok(
      output.includes('MISSING_DELTA_INPUT(begin_checkout_rate)'),
      'should warn MISSING_DELTA_INPUT(begin_checkout_rate) when beginCheckoutLegacy/V2 absent'
    );
  });

  test('MISSING_DELTA_INPUT warning for error_rate when variant error rates absent', () => {
    const fixture = makeBaseReport();
    delete fixture.errors.errorRateVsPageViewLegacyPct;
    delete fixture.errors.errorRateVsPageViewV2Pct;
    const output = runGoNoGo(fixture);
    assert.ok(
      output.includes('MISSING_DELTA_INPUT(error_rate)'),
      'should warn MISSING_DELTA_INPUT(error_rate) when variant error rates absent'
    );
  });

  test('missing variant data produces WARNING not HOLD (does not block GO)', () => {
    const fixture = makeBaseReport();
    delete fixture.funnel.beginCheckoutLegacy;
    delete fixture.funnel.beginCheckoutV2;
    delete fixture.funnel.purchaseIntentLegacy;
    delete fixture.funnel.purchaseIntentV2;
    delete fixture.errors.errorRateVsPageViewLegacyPct;
    delete fixture.errors.errorRateVsPageViewV2Pct;
    const output = runGoNoGo(fixture);
    // Warnings must not become HOLD reasons — deltas are informational only
    assert.ok(
      !output.includes('hold_reasons: MISSING_DELTA_INPUT'),
      'MISSING_DELTA_INPUT must appear under warnings, not hold_reasons'
    );
    // Decision should remain GO (other core metrics are healthy)
    assert.ok(output.includes('GO'), 'report should remain GO even with missing delta variant data');
  });
});

describe('issue #965 — go-no-go fixture: zero data → warning', () => {
  test('MISSING_DELTA_INPUT warning when all variant counts are 0', () => {
    const fixture = makeBaseReport({
      bookingPageViewLegacy: 0,
      bookingPageViewV2: 0,
      beginCheckoutLegacy: 0,
      beginCheckoutV2: 0,
      purchaseIntentLegacy: 0,
      purchaseIntentV2: 0,
    }, {
      // No variant error rates when page views are 0
    });
    delete fixture.errors.errorRateVsPageViewLegacyPct;
    delete fixture.errors.errorRateVsPageViewV2Pct;
    const output = runGoNoGo(fixture);
    assert.ok(
      output.includes('MISSING_DELTA_INPUT'),
      'zero variant data must produce at least one MISSING_DELTA_INPUT warning'
    );
  });

  test('zero variant data does not produce ROLLBACK WATCH', () => {
    const fixture = makeBaseReport({
      bookingPageViewLegacy: 0,
      bookingPageViewV2: 0,
      beginCheckoutLegacy: 0,
      beginCheckoutV2: 0,
      purchaseIntentLegacy: 0,
      purchaseIntentV2: 0,
    });
    delete fixture.errors.errorRateVsPageViewLegacyPct;
    delete fixture.errors.errorRateVsPageViewV2Pct;
    const output = runGoNoGo(fixture);
    // Missing delta data must never fabricate a ROLLBACK WATCH
    assert.ok(
      !output.includes('rollback_reasons: MISSING_DELTA_INPUT'),
      'MISSING_DELTA_INPUT must not appear in rollback_reasons — missing data is a warning only'
    );
  });
});
