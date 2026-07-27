import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const subjectPath = path.join(root, 'scripts/database-baseline/run-existing-upgrade-rehearsal.mjs');
const integrationPath = 'apps/web/tests/integration/midao-baseline-existing-postgres.test.mjs';
const captureCapability = () => ({
  transactionId: 'a'.repeat(64), ledger: { captureManifestSha256: 'b'.repeat(64) }, dispose() {},
});
const expectedCapability = () => ({
  transactionId: 'c'.repeat(64),
  manifest: { captureTransactionId: 'a'.repeat(64), captureManifestSha256: 'b'.repeat(64) }, dispose() {},
});

async function subject() {
  assert.equal(existsSync(subjectPath), true, 'existing rehearsal runner missing');
  return import(`${pathToFileURL(subjectPath).href}?t=${Date.now()}`);
}

test('existing runner accepts only its exact tracked integration test argument', async () => {
  const api = await subject();
  assert.deepEqual(api.parseExistingRunnerArgs(['--test', integrationPath], root), { testPath: path.join(root, integrationPath) });
  for (const hostile of [[], ['--test'], ['--linked', integrationPath], ['--test', '../foreign.test.mjs'], ['--test', integrationPath, '--extra']]) {
    assert.throws(() => api.parseExistingRunnerArgs(hostile, root), /argument|test|runner/iu);
  }
});

test('transaction verification blocks fixture and migration payload consumers', async () => {
  const api = await subject();
  for (const failureAt of ['capture', 'expected']) {
    const calls = []; let payloadReads = 0;
    await assert.rejects(api.__internal.runExistingWithAdapters({
      testPath: path.join(root, integrationPath),
      verifyCapture: async () => { calls.push('capture'); if (failureAt === 'capture') throw new Error('CAPTURE_HOLD'); return { dispose: () => calls.push('dispose-capture') }; },
      verifyExpected: async () => { calls.push('expected'); if (failureAt === 'expected') throw new Error('EXPECTED_HOLD'); return { dispose: () => calls.push('dispose-expected') }; },
      buildCutoffFixture: async () => { payloadReads += 1; },
      upgrade: async () => { payloadReads += 1; },
      compare: async () => { payloadReads += 1; },
    }), /HOLD/u);
    assert.equal(payloadReads, 0);
    assert.deepEqual(calls, failureAt === 'capture' ? ['capture'] : ['capture', 'expected', 'dispose-capture']);
  }
});

test('existing lifecycle requires and binds capture references before fixture construction', async () => {
  const api = await subject(); let consumers = 0;
  await assert.rejects(api.__internal.runExistingWithAdapters({
    testPath: path.join(root, integrationPath),
    verifyCapture: async () => ({ dispose() {} }),
    verifyExpected: async () => ({ manifest: {}, dispose() {} }),
    buildCutoffFixture: async () => { consumers += 1; }, upgrade: async () => { consumers += 1; }, compare: async () => { consumers += 1; },
  }), /capture|transaction|binding|reference/iu);
  assert.equal(consumers, 0);
});

test('upgrade requires an occupied cutoff fixture and executes no baseline during upgrade', async () => {
  const api = await subject(); const calls = [];
  const result = await api.__internal.runExistingWithAdapters({
    testPath: path.join(root, integrationPath),
    verifyCapture: async () => ({
      ...captureCapability(), dispose: () => calls.push('dispose-capture'),
    }),
    verifyExpected: async () => ({
      ...expectedCapability(), dispose: () => calls.push('dispose-expected'),
    }),
    buildCutoffFixture: async () => ({ occupied: true, hasBaselineMarker: false, localOnly: true, cleanup: async () => calls.push('cleanup') }),
    upgrade: async () => ({ baselineExecutionCount: 0, terminalBytes: Buffer.from('same'), expectedTerminalBytes: Buffer.from('same') }),
    compare: async ({ baselineExecutionCount, terminalBytes, expectedTerminalBytes }) => {
      calls.push('compare'); assert.equal(baselineExecutionCount, 0); assert.equal(terminalBytes.equals(expectedTerminalBytes), true);
    },
  });
  assert.equal(result.verified, true);
  assert.deepEqual(calls, ['compare', 'cleanup', 'dispose-expected', 'dispose-capture']);

  for (const hostileFixture of [
    { occupied: false, hasBaselineMarker: false, localOnly: true },
    { occupied: true, hasBaselineMarker: true, localOnly: true },
    { occupied: true, hasBaselineMarker: false, localOnly: false },
  ]) await assert.rejects(api.__internal.runExistingWithAdapters({
    testPath: path.join(root, integrationPath),
    verifyCapture: async () => captureCapability(), verifyExpected: async () => expectedCapability(),
    buildCutoffFixture: async () => ({ ...hostileFixture, cleanup: async () => {} }),
    upgrade: async () => { throw new Error('upgrade must not run'); }, compare: async () => {},
  }), /occupied|marker|local/iu);
});
