import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  verifyCaptureTransaction,
  verifyExpectedTerminalTransaction,
} from '../../../../scripts/database-baseline/verify-manifest.mjs';
import { resolveRepositoryPublicationPaths } from '../../../../scripts/database-baseline/publish-baseline.mjs';
import { resolveExpectedTerminalPublicationPaths } from '../../../../scripts/database-baseline/publish-expected-terminal.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const baselineDir = path.join(root, 'supabase/baselines/v1');
const captureLedgerPath = path.join(root, 'docs/operations/baseline-ledger.json');
const expectedLedgerPath = path.join(root, 'docs/operations/expected-terminal-ledger.json');
const captureJournalPath = resolveRepositoryPublicationPaths().journalPath;
const expectedJournalPath = resolveExpectedTerminalPublicationPaths().journalPath;
const expectedHistory = [
  '00000000000001',
  '20260723000000',
  '20260723001000',
  '20260723002000',
  '20260723002500',
  '20260723003000',
  '20260723003500',
  '20260723004000',
  '20260723010000',
  '20260723011000',
];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
function canonical(value) { return Buffer.from(`${JSON.stringify(stable(value))}\n`); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

test('published expected terminal verifies capture first and exposes exact PG17 terminal truth', async () => {
  const opened = [];
  const capture = await verifyCaptureTransaction({
    baselineDir, ledgerPath: captureLedgerPath, journalPath: captureJournalPath,
  });
  let expected;
  try {
    expected = await verifyExpectedTerminalTransaction({
      baselineDir,
      ledgerPath: expectedLedgerPath,
      captureLedgerPath,
      journalPath: expectedJournalPath,
      onPayloadOpen: (name) => opened.push(name),
    });
    assert.equal(expected.ledger.captureTransactionId, capture.transactionId);
    assert.deepEqual(expected.manifest.historyVersions, expectedHistory);
    const terminal = expected.payloads.get('catalog.expected-terminal.normalized.json');
    try {
      const catalog = JSON.parse(terminal);
      assert.equal(catalog.serverMajorVersion, 17);
    } finally { terminal.fill(0); }
    assert.deepEqual(opened, [
      'catalog.expected-terminal.normalized.json',
      'catalog-expected-terminal.sha256',
    ]);
  } finally {
    expected?.dispose();
    capture.dispose();
  }
});

test('unfinished journals and metadata mismatch reject before either transaction payload is opened', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'midao-terminal-artifact-hostile-'));
  const hostileCaptureJournal = path.join(parent, 'capture.journal');
  const hostileExpectedJournal = path.join(parent, 'expected.journal');
  const hostileLedgerPath = path.join(parent, 'expected-terminal-ledger.json');
  try {
    await writeFile(hostileCaptureJournal, 'unfinished\n', { mode: 0o600, flag: 'wx' });
    let captureReads = 0; let expectedReads = 0;
    await assert.rejects(async () => {
      const capture = await verifyCaptureTransaction({
        baselineDir, ledgerPath: captureLedgerPath, journalPath: hostileCaptureJournal,
        onPayloadOpen: () => { captureReads += 1; },
      });
      try {
        await verifyExpectedTerminalTransaction({
          baselineDir, ledgerPath: expectedLedgerPath, captureLedgerPath,
          journalPath: expectedJournalPath, onPayloadOpen: () => { expectedReads += 1; },
        });
      } finally { capture.dispose(); }
    }, /journal|unfinished|present/iu);
    assert.equal(captureReads, 0); assert.equal(expectedReads, 0);

    await rm(hostileCaptureJournal);
    await writeFile(hostileExpectedJournal, 'unfinished\n', { mode: 0o600, flag: 'wx' });
    await assert.rejects(verifyExpectedTerminalTransaction({
      baselineDir, ledgerPath: expectedLedgerPath, captureLedgerPath,
      journalPath: hostileExpectedJournal, onPayloadOpen: () => { expectedReads += 1; },
    }), /journal|unfinished|present/iu);
    assert.equal(expectedReads, 0);
    await rm(hostileExpectedJournal);

    const ledger = JSON.parse(await readFile(expectedLedgerPath, 'utf8'));
    ledger.transactionId = 'f'.repeat(64);
    await writeFile(hostileLedgerPath, `${JSON.stringify(ledger)}\n`, { mode: 0o600, flag: 'wx' });
    await assert.rejects(verifyExpectedTerminalTransaction({
      baselineDir, ledgerPath: hostileLedgerPath, captureLedgerPath,
      journalPath: hostileExpectedJournal, onPayloadOpen: () => { expectedReads += 1; },
    }), /manifest|metadata|transaction/iu);
    assert.equal(expectedReads, 0);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('exact metadata semantics and content-derived transaction bind before expected payload opens', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'midao-terminal-metadata-hostile-'));
  try {
    const originalManifest = JSON.parse(await readFile(path.join(baselineDir, 'manifest.json'), 'utf8'));
    const originalLedger = JSON.parse(await readFile(expectedLedgerPath, 'utf8'));
    for (const [label, mutate] of [
      ['history', (manifest) => { manifest.historyVersions[0] = '99999999999999'; }],
      ['transaction', () => {}],
    ]) {
      const fixture = path.join(parent, label); const fixtureBaseline = path.join(fixture, 'baseline');
      await mkdir(fixtureBaseline, { recursive: true, mode: 0o700 });
      for (const name of ['catalog.expected-terminal.normalized.json', 'catalog-expected-terminal.sha256']) {
        await copyFile(path.join(baselineDir, name), path.join(fixtureBaseline, name));
      }
      const manifest = structuredClone(originalManifest); mutate(manifest);
      if (label === 'history') {
        const core = structuredClone(manifest); delete core.transactionId;
        manifest.transactionId = sha256(canonical(core));
      } else manifest.transactionId = 'e'.repeat(64);
      const manifestBytes = canonical(manifest);
      const ledger = structuredClone(originalLedger);
      ledger.transactionId = manifest.transactionId; ledger.manifestSha256 = sha256(manifestBytes);
      const ledgerPath = path.join(fixture, 'expected-terminal-ledger.json');
      await writeFile(path.join(fixtureBaseline, 'manifest.json'), manifestBytes, { mode: 0o600 });
      await writeFile(ledgerPath, canonical(ledger), { mode: 0o600 });
      let opened = 0;
      await assert.rejects(verifyExpectedTerminalTransaction({
        baselineDir: fixtureBaseline, ledgerPath, captureLedgerPath,
        journalPath: path.join(fixture, 'absent.journal'), onPayloadOpen: () => { opened += 1; },
      }), /history|migration|transaction|metadata/iu);
      assert.equal(opened, 0, `${label} metadata drift must reject before payload open`);
    }
  } finally { await rm(parent, { recursive: true, force: true }); }
});
