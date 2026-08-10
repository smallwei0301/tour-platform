import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { POST_CUTOFF_MIGRATIONS } from '../../../../scripts/database-baseline/materialize-fresh-workdir.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const subjectPath = path.join(root, 'scripts/database-baseline/run-fresh-install.mjs');
const integrationPath = 'apps/web/tests/integration/midao-baseline-fresh-postgres.test.mjs';
const expectedHistory = [
  '00000000000001',
  ...POST_CUTOFF_MIGRATIONS.map(({ filename }) => filename.slice(0, 14)),
];

async function subject() {
  assert.equal(existsSync(subjectPath), true, 'fresh-install runner missing');
  return import(`${pathToFileURL(subjectPath).href}?t=${Date.now()}`);
}

test('fresh runner accepts only the exact tracked integration test argument', async () => {
  const api = await subject();
  assert.deepEqual(api.parseFreshRunnerArgs(['--test', integrationPath], root), {
    testPath: path.join(root, integrationPath),
  });
  for (const hostile of [
    [], ['--test'], ['--test', '../foreign.test.mjs'], ['--test', integrationPath, '--extra'],
    ['--linked', integrationPath], ['--test', 'apps/web/tests/integration/other.test.mjs'],
  ]) assert.throws(() => api.parseFreshRunnerArgs(hostile, root), /argument|test|runner/iu);
});

test('capture and expected transactions verify before materialization or payload consumers', async () => {
  const api = await subject();
  for (const failureAt of ['capture', 'expected']) {
    const calls = []; let consumerReads = 0;
    await assert.rejects(api.__internal.runFreshInstallWithAdapters({
      testPath: path.join(root, integrationPath),
      verifyCapture: async () => {
        calls.push('verify-capture');
        if (failureAt === 'capture') throw new Error('CAPTURE_HOLD');
        return { transactionId: 'capture', dispose: () => calls.push('dispose-capture') };
      },
      verifyExpected: async () => {
        calls.push('verify-expected');
        if (failureAt === 'expected') throw new Error('EXPECTED_HOLD');
        return { transactionId: 'expected', manifest: { historyVersions: expectedHistory }, dispose: () => calls.push('dispose-expected') };
      },
      materialize: async () => { consumerReads += 1; calls.push('materialize'); },
      runLocal: async () => { consumerReads += 1; calls.push('run-local'); },
      compare: async () => { consumerReads += 1; calls.push('compare'); },
    }), /HOLD/u);
    assert.equal(consumerReads, 0);
    assert.deepEqual(calls, failureAt === 'capture'
      ? ['verify-capture']
      : ['verify-capture', 'verify-expected', 'dispose-capture']);
  }
});

test('fresh lifecycle binds expected capture references to the immediately verified capture capability', async () => {
  const api = await subject(); let consumers = 0;
  await assert.rejects(api.__internal.runFreshInstallWithAdapters({
    testPath: path.join(root, integrationPath),
    verifyCapture: async () => ({
      transactionId: 'a'.repeat(64), ledger: { captureManifestSha256: 'b'.repeat(64) }, dispose() {},
    }),
    verifyExpected: async () => ({
      transactionId: 'c'.repeat(64),
      manifest: { captureTransactionId: 'd'.repeat(64), captureManifestSha256: 'e'.repeat(64), historyVersions: expectedHistory },
      dispose() {},
    }),
    materialize: async () => { consumers += 1; }, runLocal: async () => { consumers += 1; }, compare: async () => { consumers += 1; },
  }), /capture|transaction|reference|binding/iu);
  assert.equal(consumers, 0);
});

test('verified fresh lifecycle materializes single-marker history then exact-compares terminal truth', async () => {
  const api = await subject(); const calls = [];
  const result = await api.__internal.runFreshInstallWithAdapters({
    testPath: path.join(root, integrationPath),
    verifyCapture: async () => ({
      transactionId: 'capture', ledger: { captureManifestSha256: 'capture-manifest' },
      dispose: () => calls.push('dispose-capture'),
    }),
    verifyExpected: async () => ({
      transactionId: 'expected',
      manifest: {
        captureTransactionId: 'capture', captureManifestSha256: 'capture-manifest', historyVersions: expectedHistory,
      },
      payloads: { get: () => Buffer.from('terminal') },
      dispose: () => calls.push('dispose-expected'),
    }),
    materialize: async () => ({ history: ['00000000000001_baseline_v1.sql', ...expectedHistory.slice(1).map((version) => `${version}_migration.sql`)], cleanup: async () => calls.push('cleanup') }),
    runLocal: async ({ materialized, testPath }) => {
      calls.push(`run-local:${path.basename(testPath)}`);
      assert.equal(materialized.history.length, expectedHistory.length);
      return { terminalBytes: Buffer.from('terminal'), historyVersions: expectedHistory };
    },
    compare: async ({ actualTerminalBytes, expectedTerminalBytes, actualHistory, expectedHistory: wanted }) => {
      calls.push('compare');
      assert.equal(actualTerminalBytes.equals(expectedTerminalBytes), true);
      assert.deepEqual(actualHistory, wanted);
    },
  });
  assert.equal(result.verified, true);
  assert.deepEqual(calls, [
    `run-local:${path.basename(integrationPath)}`, 'compare', 'cleanup', 'dispose-expected', 'dispose-capture',
  ]);
});
