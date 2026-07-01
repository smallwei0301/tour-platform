/**
 * Unit tests for synthetic-health-probe.mjs retry behavior.
 * Issue #1472 — main healthcheck false alarm at / (status=N/A, single 5s timeout).
 *
 * 目標：probe 失敗（timeout / 非 2xx）不得單次即判 fail，需 retry（間隔遞增）
 * 全數失敗才回報；預設 timeout 由 5000ms 放寬為 10000ms（cold start 防誤報）。
 *
 * Run:
 *   node --test apps/web/tests/unit/issue1472-probe-retry.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROBE_PATH = path.resolve(__dirname, '../../../../scripts/cron/synthetic-health-probe.mjs');

// Prevent the top-level main guard from exiting on import.
process.env.NEXT_PUBLIC_VERCEL_URL = 'https://probe-test.example.com';

const { probeWithRetry, DEFAULT_PROBE_TIMEOUT_MS, DEFAULT_PROBE_MAX_ATTEMPTS } = await import(PROBE_PATH);

function makeResult(overrides = {}) {
  return {
    timestamp: '2026-07-01T00:00:00.000Z',
    label: 'root',
    target: 'https://probe-test.example.com/',
    status: 0,
    ok: false,
    latencyMs: 5001,
    version: null,
    error: 'request timed out after 5000ms',
    ...overrides,
  };
}

test('probeWithRetry is exported as a function', () => {
  assert.equal(typeof probeWithRetry, 'function', 'probeWithRetry must be exported for testing');
});

test('defaults — timeout relaxed to 10000ms, at least 2 attempts', () => {
  assert.equal(DEFAULT_PROBE_TIMEOUT_MS, 10000, 'default timeout must be 10000ms (cold-start tolerant)');
  assert.ok(DEFAULT_PROBE_MAX_ATTEMPTS >= 2, 'default max attempts must allow at least one retry');
});

test('probeWithRetry — transient failure then success returns ok with attempts=2', async () => {
  const calls = [];
  const sleeps = [];
  const probeFn = async (label, url) => {
    calls.push({ label, url });
    return calls.length === 1 ? makeResult() : makeResult({ ok: true, status: 200, error: null });
  };
  const sleepFn = async (ms) => {
    sleeps.push(ms);
  };

  const result = await probeWithRetry('root', 'https://probe-test.example.com/', {
    maxAttempts: 3,
    retryDelayMs: 2000,
    probeFn,
    sleepFn,
  });

  assert.equal(result.ok, true, 'transient failure must recover to ok');
  assert.equal(result.attempts, 2, 'should report 2 attempts');
  assert.equal(calls.length, 2, 'probe called exactly twice');
  assert.equal(sleeps.length, 1, 'slept exactly once between attempts');
});

test('probeWithRetry — first success does not retry nor sleep', async () => {
  let calls = 0;
  const sleeps = [];
  const probeFn = async () => {
    calls += 1;
    return makeResult({ ok: true, status: 200, error: null });
  };
  const sleepFn = async (ms) => {
    sleeps.push(ms);
  };

  const result = await probeWithRetry('root', 'https://probe-test.example.com/', {
    maxAttempts: 3,
    probeFn,
    sleepFn,
  });

  assert.equal(result.ok, true);
  assert.equal(result.attempts, 1);
  assert.equal(calls, 1, 'no extra probe after success');
  assert.equal(sleeps.length, 0, 'no sleep after success');
});

test('probeWithRetry — persistent failure exhausts attempts with increasing backoff', async () => {
  let calls = 0;
  const sleeps = [];
  const probeFn = async () => {
    calls += 1;
    return makeResult();
  };
  const sleepFn = async (ms) => {
    sleeps.push(ms);
  };

  const result = await probeWithRetry('root', 'https://probe-test.example.com/', {
    maxAttempts: 3,
    retryDelayMs: 2000,
    probeFn,
    sleepFn,
  });

  assert.equal(result.ok, false, 'persistent failure stays failed');
  assert.equal(result.attempts, 3, 'all attempts consumed');
  assert.equal(calls, 3, 'probe called maxAttempts times');
  assert.deepEqual(sleeps, [2000, 4000], 'backoff must increase between attempts');
});

test('probeWithRetry — failure result carries the last attempt error', async () => {
  let calls = 0;
  const probeFn = async () => {
    calls += 1;
    return makeResult({ error: `failure #${calls}` });
  };

  const result = await probeWithRetry('root', 'https://probe-test.example.com/', {
    maxAttempts: 2,
    probeFn,
    sleepFn: async () => {},
  });

  assert.equal(result.error, 'failure #2', 'must surface the final attempt error');
});
