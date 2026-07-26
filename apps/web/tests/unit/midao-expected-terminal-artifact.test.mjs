import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
];

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
