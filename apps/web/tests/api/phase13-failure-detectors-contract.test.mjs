/**
 * Phase 13 — Failure-Rate Detectors Contract Tests (AC1–AC5)
 * Issue #327: ECPay callback failure-rate + threshold alerting
 *
 * Uses node:test + readFileSync pattern (no live server, no live credentials).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// ── Cycle 1: Pure function unit tests (AC1, AC4) ──────────────────────────────

test('AC1: shouldAlertEcpayFailures — 4 failed events in window returns true (above threshold=3)', async () => {
  const { shouldAlertEcpayFailures } = await import('../../src/lib/alerting/thresholds.ts').catch(() =>
    import('../../src/lib/alerting/thresholds.js'));

  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 60 min

  const events = [
    { timestamp: now - 1000, status: 'failed' },
    { timestamp: now - 2000, status: 'failed' },
    { timestamp: now - 3000, status: 'failed' },
    { timestamp: now - 4000, status: 'failed' },
  ];

  assert.equal(shouldAlertEcpayFailures(events, windowMs, 3), true,
    'Should return true: 4 failures > threshold 3');
});

test('AC1b: shouldAlertEcpayFailures — exactly 3 failed events in window returns false (boundary at threshold=3)', async () => {
  const { shouldAlertEcpayFailures } = await import('../../src/lib/alerting/thresholds.ts').catch(() =>
    import('../../src/lib/alerting/thresholds.js'));

  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 60 min

  const events = [
    { timestamp: now - 1000, status: 'failed' },
    { timestamp: now - 2000, status: 'failed' },
    { timestamp: now - 3000, status: 'failed' },
  ];

  assert.equal(shouldAlertEcpayFailures(events, windowMs, 3), false,
    'Should return false: 3 failures === threshold 3 (not strictly greater)');
});

test('AC1c: shouldAlertEcpayFailures — success events do not count toward failure threshold', async () => {
  const { shouldAlertEcpayFailures } = await import('../../src/lib/alerting/thresholds.ts').catch(() =>
    import('../../src/lib/alerting/thresholds.js'));

  const now = Date.now();
  const windowMs = 60 * 60 * 1000;

  const events = [
    { timestamp: now - 1000, status: 'failed' },
    { timestamp: now - 2000, status: 'success' },
    { timestamp: now - 3000, status: 'success' },
    { timestamp: now - 4000, status: 'success' },
  ];

  assert.equal(shouldAlertEcpayFailures(events, windowMs, 3), false,
    'Should return false: only 1 failure, success events do not count');
});

test('AC1d: shouldAlertEcpayFailures — events outside window are excluded', async () => {
  const { shouldAlertEcpayFailures } = await import('../../src/lib/alerting/thresholds.ts').catch(() =>
    import('../../src/lib/alerting/thresholds.js'));

  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 60 min

  const events = [
    { timestamp: now - 1000, status: 'failed' },
    { timestamp: now - 2000, status: 'failed' },
    // Old failures outside window
    { timestamp: now - 2 * windowMs - 1000, status: 'failed' },
    { timestamp: now - 2 * windowMs - 2000, status: 'failed' },
    { timestamp: now - 2 * windowMs - 3000, status: 'failed' },
  ];

  assert.equal(shouldAlertEcpayFailures(events, windowMs, 3), false,
    'Should return false: only 2 failures within window');
});

test('AC4: shouldAlertSlowQueries — 6 samples all >1000ms returns true (above threshold=5)', async () => {
  const { shouldAlertSlowQueries } = await import('../../src/lib/alerting/thresholds.ts').catch(() =>
    import('../../src/lib/alerting/thresholds.js'));

  const now = Date.now();
  const windowMs = 60 * 1000; // 60 sec

  const samples = [
    { timestamp: now - 1000, durationMs: 1500 },
    { timestamp: now - 2000, durationMs: 2000 },
    { timestamp: now - 3000, durationMs: 1100 },
    { timestamp: now - 4000, durationMs: 3000 },
    { timestamp: now - 5000, durationMs: 1200 },
    { timestamp: now - 6000, durationMs: 1800 },
  ];

  assert.equal(shouldAlertSlowQueries(samples, windowMs, 5), true,
    'Should return true: 6 slow samples > threshold 5');
});

test('AC4b: shouldAlertSlowQueries — exactly 5 samples >1000ms returns false (boundary at threshold=5)', async () => {
  const { shouldAlertSlowQueries } = await import('../../src/lib/alerting/thresholds.ts').catch(() =>
    import('../../src/lib/alerting/thresholds.js'));

  const now = Date.now();
  const windowMs = 60 * 1000; // 60 sec

  const samples = [
    { timestamp: now - 1000, durationMs: 1500 },
    { timestamp: now - 2000, durationMs: 2000 },
    { timestamp: now - 3000, durationMs: 1100 },
    { timestamp: now - 4000, durationMs: 3000 },
    { timestamp: now - 5000, durationMs: 1200 },
  ];

  assert.equal(shouldAlertSlowQueries(samples, windowMs, 5), false,
    'Should return false: 5 slow samples === threshold 5 (not strictly greater)');
});

test('AC4c: shouldAlertSlowQueries — samples <=1000ms do not count', async () => {
  const { shouldAlertSlowQueries } = await import('../../src/lib/alerting/thresholds.ts').catch(() =>
    import('../../src/lib/alerting/thresholds.js'));

  const now = Date.now();
  const windowMs = 60 * 1000;

  const samples = [
    { timestamp: now - 1000, durationMs: 800 },
    { timestamp: now - 2000, durationMs: 999 },
    { timestamp: now - 3000, durationMs: 1000 }, // exactly 1000ms — not strictly >1000
    { timestamp: now - 4000, durationMs: 1001 }, // only this counts
  ];

  assert.equal(shouldAlertSlowQueries(samples, windowMs, 5), false,
    'Should return false: only 1 sample strictly >1000ms');
});

// ── Cycle 2: Contract tests (AC2, AC3, AC5) ───────────────────────────────────

test('AC2: sweep route exists and has x-internal-token auth guard', () => {
  const sweepPath = path.resolve(ROOT, 'app/api/internal/alerts/ecpay-failure-sweep/route.ts');
  assert.ok(existsSync(sweepPath), `Sweep route not found: ${sweepPath}`);

  const src = readFileSync(sweepPath, 'utf8');

  // Auth guard: checks x-internal-token header
  assert.match(src, /x-internal-token/, 'Must check x-internal-token header');
  assert.match(src, /INTERNAL_ALERT_TOKEN/, 'Must reference INTERNAL_ALERT_TOKEN env var');
  assert.match(src, /401/, 'Must return 401 when auth fails');
});

test('AC2b: sweep route queries payment_callback_audit table', () => {
  const sweepPath = path.resolve(ROOT, 'app/api/internal/alerts/ecpay-failure-sweep/route.ts');
  assert.ok(existsSync(sweepPath), `Sweep route not found: ${sweepPath}`);

  const src = readFileSync(sweepPath, 'utf8');

  // References payment_callback_audit table (via audit_logs or direct table reference)
  assert.match(src, /payment_callback_audit|audit_logs/, 'Must reference payment_callback_audit or audit_logs table');
});

test('AC2c: sweep route calls recordIncident', () => {
  const sweepPath = path.resolve(ROOT, 'app/api/internal/alerts/ecpay-failure-sweep/route.ts');
  assert.ok(existsSync(sweepPath), `Sweep route not found: ${sweepPath}`);

  const src = readFileSync(sweepPath, 'utf8');

  // Imports and calls recordIncident
  assert.match(src, /recordIncident/, 'Must import and call recordIncident');
  assert.match(src, /from.*incidents/, 'Must import from incidents module');
});

test('AC3: sweep route auth guard — token present in source (contract)', () => {
  const sweepPath = path.resolve(ROOT, 'app/api/internal/alerts/ecpay-failure-sweep/route.ts');
  assert.ok(existsSync(sweepPath), `Sweep route not found: ${sweepPath}`);

  const src = readFileSync(sweepPath, 'utf8');

  // Verify the guard logic: get header, compare with env var, return 401
  assert.match(
    src,
    /get\s*\(\s*['"]x-internal-token['"]\s*\)/,
    'Must read x-internal-token via headers.get()'
  );
  assert.match(
    src,
    /process\.env\.INTERNAL_ALERT_TOKEN/,
    'Must compare against process.env.INTERNAL_ALERT_TOKEN'
  );
  // Returns 401 when token absent or mismatched
  assert.match(src, /status.*401|401.*status/, 'Must include 401 status in response');
});

test('AC5: ECPay callback still has idempotency markers (regression guard)', () => {
  const callbackPath = path.resolve(ROOT, 'app/api/payments/ecpay/callback/route.ts');
  assert.ok(existsSync(callbackPath), `ECPay callback route not found: ${callbackPath}`);

  const src = readFileSync(callbackPath, 'utf8');

  // idempotency markers from #195/#197 must still be present
  assert.match(
    src,
    /processPaymentCallbackDb|BOOKING_CONFLICT/,
    'Idempotency markers (processPaymentCallbackDb or BOOKING_CONFLICT) must still be present in callback route'
  );
});
