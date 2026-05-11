/**
 * Meta-test: Phase 12 full regression composer (AC1–AC7)
 * RED phase: verifies run-full-regression.sh and package.json wiring
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCRIPT_PATH = path.join(ROOT, 'scripts/phase12/run-full-regression.sh');
const PKG_PATH = path.join(ROOT, 'package.json');

// AC1: script exists
test('AC1: run-full-regression.sh exists', () => {
  assert.ok(existsSync(SCRIPT_PATH), `Expected ${SCRIPT_PATH} to exist`);
});

test('AC1: script has set -euo pipefail', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  assert.match(src, /set -euo pipefail/);
});

test('AC1: script uses ROOT_DIR pattern', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  assert.ok(src.includes('ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}"'), 'ROOT_DIR pattern not found in script');
});

// AC2: all 7 path test file names appear in script
test('AC2: P1 traveler booking test files referenced', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  assert.ok(src.includes('v2-available-slots.test.mjs'), 'v2-available-slots.test.mjs not found');
  assert.ok(src.includes('v2-booking-draft-checkout.test.mjs'), 'v2-booking-draft-checkout.test.mjs not found');
  assert.ok(src.includes('ecpay-callback.test.mjs'), 'ecpay-callback.test.mjs not found');
  assert.ok(src.includes('me-orders.test.mjs'), 'me-orders.test.mjs not found');
});

test('AC2: P2 admin POS create→paid→print test files referenced', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  assert.ok(src.includes('v2-admin-pos-line-regression.test.mjs'), 'v2-admin-pos-line-regression.test.mjs not found');
  assert.ok(src.includes('v2-admin-pos-manual-payment-regression.test.mjs'), 'v2-admin-pos-manual-payment-regression.test.mjs not found');
});

test('AC2: P3 admin POS additional-payment test file referenced', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  assert.ok(src.includes('v2-admin-pos-additional-payment-regression.test.mjs'), 'v2-admin-pos-additional-payment-regression.test.mjs not found');
});

test('AC2: P4 admin POS detail/timeline test file referenced', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  assert.ok(src.includes('v2-admin-pos-detail-timeline-regression.test.mjs'), 'v2-admin-pos-detail-timeline-regression.test.mjs not found');
});

test('AC2: P5 refund flow test files referenced', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  assert.ok(src.includes('refund-requests.test.mjs'), 'refund-requests.test.mjs not found');
  assert.ok(src.includes('admin-refunds.test.mjs'), 'admin-refunds.test.mjs not found');
  assert.ok(src.includes('ecpay-callback-mapping-contract.test.mjs'), 'ecpay-callback-mapping-contract.test.mjs not found');
});

test('AC2: P6 LINE LIFF test files referenced', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  assert.ok(src.includes('v2-line-liff-entry-contract.test.mjs'), 'v2-line-liff-entry-contract.test.mjs not found');
  assert.ok(src.includes('issue178-line-liff-callback-audit-contract.test.mjs'), 'issue178-line-liff-callback-audit-contract.test.mjs not found');
});

test('AC2: P7 guide dashboard sync test files referenced', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  assert.ok(src.includes('admin-dashboard-summary.test.mjs'), 'admin-dashboard-summary.test.mjs not found');
  assert.ok(src.includes('v2-guide-dashboard-booking-sync.test.mjs'), 'v2-guide-dashboard-booking-sync.test.mjs not found');
});

// AC3: no || true after npm test invocations
test('AC3: no "|| true" after npm test invocations', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  const lines = src.split('\n');
  for (const line of lines) {
    if (line.includes('npm') && line.includes('test') && line.includes('|| true')) {
      assert.fail(`Found "|| true" after npm test invocation: ${line.trim()}`);
    }
  }
});

// AC4: [FAIL] template present
test('AC4: [FAIL] print template exists in script', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  assert.ok(src.includes('[FAIL]'), '[FAIL] template not found in script');
});

// AC5: doc-write references docs/qa/phase-12-regression-final.md
test('AC5: script references docs/qa/phase-12-regression-final.md', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  assert.ok(src.includes('docs/qa/phase-12-regression-final.md'), 'doc output path not found in script');
});

// AC6: no psql, playwright, curl in script
test('AC6: script does not contain psql', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  assert.ok(!src.includes('psql'), 'psql found in script');
});

test('AC6: script does not contain playwright', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  assert.ok(!src.includes('playwright'), 'playwright found in script');
});

test('AC6: script does not contain curl', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  assert.ok(!src.includes('curl'), 'curl found in script');
});

// AC7: package.json has test:smoke:phase12-full
test('AC7: package.json has test:smoke:phase12-full script', () => {
  const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
  assert.ok(pkg.scripts && pkg.scripts['test:smoke:phase12-full'],
    'test:smoke:phase12-full not found in package.json scripts');
});
