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

test('actual fixture binds materializer transaction and rolls back setup failures', async () => {
  const api = await subject();
  assert.equal(typeof api.__internal.buildCutoffFixtureActual, 'function');
  for (const scenario of ['mismatch', 'lstat-failure', 'materialize-failure']) {
    const calls = [];
    await assert.rejects(api.__internal.buildCutoffFixtureActual({
      canonicalRoot: root, projectId: 'fixture', capture: captureCapability(), expected: expectedCapability(),
      dependencies: {
        prepareFrozen: async () => [],
        mkdir: async () => calls.push('mkdir'),
        lstat: async () => {
          if (scenario === 'lstat-failure') throw new Error('LSTAT_FAIL');
          return { dev: 1, ino: 2, uid: 0, nlink: 1, mode: 0o40700, isDirectory: () => true };
        },
        rmdir: async () => calls.push('rmdir'),
        materialize: async (options) => {
          assert.equal(options.postCutoffManifest.captureTransactionId, 'a'.repeat(64));
          if (scenario === 'materialize-failure') throw new Error('MATERIALIZE_FAIL');
          return { transactionId: 'f'.repeat(64), cleanup: async () => calls.push('cleanup-materialized') };
        },
      },
    }), {
      mismatch: /transaction|binding/iu,
      'lstat-failure': /LSTAT_FAIL/u,
      'materialize-failure': /MATERIALIZE_FAIL/u,
    }[scenario]);
    assert.equal(calls.includes('rmdir'), true);
    if (scenario === 'mismatch') assert.equal(calls.includes('cleanup-materialized'), true);
  }
});

test('admin connection rejects remote URL before constructing a database client', async () => {
  const api = await subject(); let constructed = 0;
  class Client { constructor() { constructed += 1; } }
  await assert.rejects(api.__internal.useAdmin('postgresql://user:pass@production.example.com:5432/postgres', async () => {}, { ClientClass: Client }), /local|loopback|host|connection/iu);
  assert.equal(constructed, 0);
});

test('terminal bytes are zeroed when validation or history extraction fails', async () => {
  const api = await subject(); const bytes = Buffer.from('{}');
  await assert.rejects(api.__internal.extractExistingTerminal('postgresql://postgres:pass@127.0.0.1:54322/postgres', {
    extractCatalogFn: async () => ({}), normalizeFn: () => '{}', terminalBytesFactory: () => bytes,
    validateFn: () => { throw new Error('VALIDATE_FAIL'); },
    useAdminFn: async () => { throw new Error('history must not run'); },
  }), /VALIDATE_FAIL/u);
  assert.equal(bytes.every((value) => value === 0), true);
});

test('existing terminal requires all 128 frozen migrations plus the exact 26-entry post-cutoff suffix', async () => {
  const api = await subject();
  const frozen = Array.from({ length: 128 }, (_, index) => ({
    version: (10_000_000_000_000n + BigInt(index)).toString(),
    name: `frozen_${index}`,
  }));
  const postCutoff = [
    '20260723000000', '20260723001000', '20260723002000', '20260723002500',
    '20260723003000', '20260723003500', '20260723004000', '20260723010000',
    '20260723011000', '20260723020000', '20260723021000', '20260723022000',
    '20260723023000', '20260729160000', '20260729170000', '20260729180000',
    '20260729190000', '20260730093000', '20260804103000', '20260804113000',
    '20260806090000', '20260806091000', '20260806120000',
    '20260810033421',
    '20260812150000',
    '20260812160000',
  ].map((version) => ({ version, name: `midao_${version}` }));
  const result = await api.__internal.extractExistingTerminal('postgresql://postgres:***@127.0.0.1:54322/postgres', {
    extractCatalogFn: async () => ({}),
    normalizeFn: () => '{}',
    validateFn: () => {},
    useAdminFn: async () => [...frozen, ...postCutoff],
  });
  assert.equal(result.history.length, 154);
  result.terminalBytes.fill(0);

  await assert.rejects(api.__internal.extractExistingTerminal('postgresql://postgres:***@127.0.0.1:54322/postgres', {
    extractCatalogFn: async () => ({}),
    normalizeFn: () => '{}',
    validateFn: () => {},
    useAdminFn: async () => [...frozen, ...postCutoff.slice(0, -1)],
  }), /exact history/iu);
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
