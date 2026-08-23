import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const script = path.join(root, 'scripts/check-migration-source-gate.mjs');

test('source gate exists and imports both transaction verifiers before source consumers', () => {
  assert.equal(existsSync(script), true, 'migration source gate missing');
  const source = readFileSync(script, 'utf8');
  assert.match(source, /verifyCaptureTransaction/u);
  assert.match(source, /verifyExpectedTerminalTransaction/u);
  assert.match(source, /captureTransactionId/u);
  assert.match(source, /captureManifestSha256/u);
  assert.match(source, /frozen-migrations\.sha256/u);
  assert.match(source, /POST_CUTOFF_MIGRATIONS/u);
});

test('source and verified gates open zero consumers when either transaction verification HOLDs', async () => {
  const sourceApi = await import(`${pathToFileURL(script).href}?t=${Date.now()}`);
  const verifiedPath = path.join(root, 'scripts/check-migration-ledger.mjs');
  const verifiedApi = await import(`${pathToFileURL(verifiedPath).href}?t=${Date.now()}`);
  const validCapture = () => ({
    transactionId: 'a'.repeat(64), ledger: { captureManifestSha256: 'b'.repeat(64) }, dispose() {},
  });
  const validExpected = () => ({
    manifest: { captureTransactionId: 'a'.repeat(64), captureManifestSha256: 'b'.repeat(64) }, dispose() {},
  });
  for (const api of [
    { run: sourceApi.runSourceGateWithAdapters, consumer: 'inspectSources' },
    { run: verifiedApi.runVerifiedGateWithAdapters, consumer: 'checkLedger' },
  ]) for (const failureAt of ['capture', 'expected']) {
    let reads = 0;
    await assert.rejects(api.run({
      verifyCapture: async () => { if (failureAt === 'capture') throw new Error('CAPTURE_HOLD'); return validCapture(); },
      verifyExpected: async () => { if (failureAt === 'expected') throw new Error('EXPECTED_HOLD'); return validExpected(); },
      [api.consumer]: async () => { reads += 1; return { mode: 'source', status: 'verified' }; },
    }), /HOLD/u);
    assert.equal(reads, 0);
  }
});

test('source gate CLI validates current repo source without requiring production ledger verification', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, [script, '--mode', 'source', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const body = JSON.parse(result.stdout);
  assert.equal(body.mode, 'source');
  assert.equal(body.status, 'verified');
  assert.equal(body.frozenCount, 130);
  assert.equal(body.postCutoffCount >= 6, true);
});
