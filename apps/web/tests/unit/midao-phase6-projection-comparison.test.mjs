import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  compareProjectionRows,
  summarizeObservation,
} from '../../src/lib/midao/phase6-projection-comparison.mjs';

const appRoot = fileURLToPath(new URL('../..', import.meta.url));
const fixturePath = fileURLToPath(new URL('../fixtures/midao-phase6-projection-fixture.json', import.meta.url));
const reportPath = fileURLToPath(new URL('../../.tmp/phase6-observation/fixture-report.json', import.meta.url));
const fixedClock = '2026-08-26T00:00:00.000Z';

async function readFixture() {
  return JSON.parse(await readFile(fixturePath, 'utf8'));
}

test('compares every explicit projection category with masked surrogate prefixes', async () => {
  const fixture = await readFixture();
  const comparison = compareProjectionRows(fixture.left, fixture.right, {
    now: fixedClock,
    staleAfterMs: 24 * 60 * 60 * 1000,
  });

  assert.deepEqual(comparison.categoryCounts, {
    match: 1,
    missing_left: 1,
    missing_right: 1,
    one_to_many: 1,
    many_to_one: 1,
    state_mismatch: 1,
    stale_projection: 1,
    unresolvable_key: 1,
  });
  assert.equal(comparison.rows.length, 8);
  assert.ok(comparison.rows.every((row) => Object.hasOwn(row, 'category')));
  assert.ok(comparison.rows.every((row) => !Object.hasOwn(row, 'joinKey')));
  assert.ok(comparison.rows.filter((row) => row.surrogateKeyPrefix).every((row) => row.surrogateKeyPrefix.length === 12));
  assert.ok(comparison.complete === false);
});

test('fails closed for unknown manual LINE labels and malformed projection rows', () => {
  const key = 'a'.repeat(64);
  const comparison = compareProjectionRows([
    {
      joinKey: key,
      state: 'open',
      observedAt: fixedClock,
      preConfirmationCheckoutCount: 0,
      manualLineMetric: 'sent',
    },
  ], [{
    joinKey: key,
    state: 'open',
    observedAt: fixedClock,
    preConfirmationCheckoutCount: 0,
  }], { now: fixedClock });

  assert.equal(comparison.categoryCounts.unresolvable_key, 1);
  assert.equal(comparison.complete, false);
});

test('summary fails closed when callers supply an unknown manual LINE label', () => {
  const summary = summarizeObservation([{
    category: 'match',
    manualLineMetric: 'sent',
    preConfirmationCheckoutCount: 0,
  }], {
    measurementStatus: 'complete',
    sourcePagesComplete: true,
    commandExitCode: 0,
    maskingCheck: 'pass',
  });

  assert.equal(summary.categoryCounts.match, 0);
  assert.equal(summary.categoryCounts.unresolvable_key, 1);
  assert.equal(summary.measurementStatus, 'incomplete');
  assert.equal(summary.pass, false);
});

test('summary treats direct rows missing required measurement fields as unresolvable', () => {
  const health = {
    measurementStatus: 'complete',
    sourcePagesComplete: true,
    commandExitCode: 0,
    maskingCheck: 'pass',
  };
  const validPrefix = 'a'.repeat(12);

  for (const row of [
    { category: 'match' },
    { category: 'match', preConfirmationCheckoutCount: 0, manualLineMetric: null },
    { category: 'match', surrogateKeyPrefix: validPrefix, manualLineMetric: null },
    { category: 'match', surrogateKeyPrefix: validPrefix, preConfirmationCheckoutCount: 0 },
  ]) {
    const summary = summarizeObservation([row], health);
    assert.equal(summary.categoryCounts.match, 0);
    assert.equal(summary.categoryCounts.unresolvable_key, 1);
    assert.equal(summary.measurementStatus, 'incomplete');
    assert.equal(summary.pass, false);
  }
});

test('summary reports comparator unresolvable-only input as incomplete', () => {
  const malformedComparison = compareProjectionRows([{
    joinKey: 'not-a-surrogate-key',
    state: 'open',
    observedAt: fixedClock,
    preConfirmationCheckoutCount: 0,
  }], [], { now: fixedClock });
  const summary = summarizeObservation(malformedComparison.rows, {
    measurementStatus: 'complete',
    sourcePagesComplete: true,
    commandExitCode: 0,
    maskingCheck: 'pass',
  });

  assert.equal(summary.eligible, 0);
  assert.equal(summary.categoryCounts.unresolvable_key, 1);
  assert.equal(summary.measurementStatus, 'incomplete');
  assert.equal(summary.pass, false);
});

test('requires complete health, eligible observations, and zero pre-confirmation checkout', () => {
  const healthyMatch = compareProjectionRows([{
    joinKey: 'b'.repeat(64),
    state: 'confirmed',
    observedAt: fixedClock,
    preConfirmationCheckoutCount: 0,
  }], [{
    joinKey: 'b'.repeat(64),
    state: 'confirmed',
    observedAt: fixedClock,
    preConfirmationCheckoutCount: 0,
  }], { now: fixedClock });

  assert.equal(summarizeObservation(healthyMatch.rows, {
    measurementStatus: 'complete',
    sourcePagesComplete: true,
    commandExitCode: 0,
    maskingCheck: 'pass',
  }).pass, true);
  assert.equal(summarizeObservation([], {
    measurementStatus: 'incomplete',
    sourcePagesComplete: false,
    commandExitCode: 1,
    maskingCheck: 'fail',
  }).pass, false);
  assert.equal(summarizeObservation([], {
    measurementStatus: 'complete',
    sourcePagesComplete: true,
    commandExitCode: 0,
    maskingCheck: 'pass',
  }).measurementStatus, 'no_eligible');

  const checkoutBeforeConfirmation = compareProjectionRows([{
    joinKey: 'c'.repeat(64),
    state: 'open',
    observedAt: fixedClock,
    preConfirmationCheckoutCount: 1,
  }], [{
    joinKey: 'c'.repeat(64),
    state: 'open',
    observedAt: fixedClock,
    preConfirmationCheckoutCount: 1,
  }], { now: fixedClock });
  assert.equal(summarizeObservation(checkoutBeforeConfirmation.rows, {
    measurementStatus: 'complete',
    sourcePagesComplete: true,
    commandExitCode: 0,
    maskingCheck: 'pass',
  }).pass, false);
});

test('CLI emits only the masked allowlist and removes its local report residue', async (t) => {
  await rm(reportPath, { force: true });
  t.after(() => rm(reportPath, { force: true }));

  const result = spawnSync(process.execPath, [
    'scripts/midao-phase6-observation-report.mjs',
    '--fixture', 'tests/fixtures/midao-phase6-projection-fixture.json',
    '--out', '.tmp/phase6-observation/fixture-report.json',
  ], {
    cwd: appRoot,
    encoding: 'utf8',
    timeout: 30_000,
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const serialized = JSON.stringify(report);
  const fixture = await readFixture();
  const allowedTopLevel = ['schemaVersion', 'generatedAt', 'summary', 'rows', 'digest'];

  assert.deepEqual(Object.keys(report).sort(), allowedTopLevel.sort());
  assert.equal(report.summary.manualLine.prepared_or_opened_manually, 1);
  assert.equal(report.summary.measurementStatus, 'incomplete');
  assert.equal(report.rows.some((row) => row.category === 'unresolvable_key'), true);
  assert.equal(serialized.includes(fixture.left[0].joinKey), false);
  assert.equal(/"(?:joinKey|rawId|email|phone|token|cookie|session|url)"/i.test(serialized), false);
  assert.equal(/delivered|sent|delivery_succeeded|replied|retry|receipt/i.test(serialized), false);
});
