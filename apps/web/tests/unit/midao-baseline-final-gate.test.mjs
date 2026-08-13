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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const baselineDir = path.join(root, 'supabase/baselines/v1');
const captureLedgerPath = path.join(root, 'docs/operations/baseline-ledger.json');
const expectedLedgerPath = path.join(root, 'docs/operations/expected-terminal-ledger.json');
const worklogPath = path.join(root, 'docs/operations/worklogs/issue1756.md');
const packagePlanPath = path.join(root, 'docs/plans/2026-07-22-midao-package-01-foundation-shell.md');
const captureJournalPath = resolveRepositoryPublicationPaths().journalPath;
const expectedJournalPath = resolveExpectedTerminalPublicationPaths().journalPath;

const CAPTURE_TRANSACTION = 'c90dfe6ce32f77010354615795df95c085f16f53f8a830ac8553196b5d178e13';
const CAPTURE_MANIFEST = '9834579fba9bd13cf4d0d35bfb6498ce1661f04a1d80ae8bfd5b29ea3cbe0cfd';
const EXPECTED_TRANSACTION = '46ee39be5f38172ff782bcc73d37ba4ef4f442647c125009eef7f7150c0b31f2';
const EXPECTED_MANIFEST = '1ff4e63c57cc161e4c5e087955451c3358251107dfee4bda2e22927134deb6ae';
const CODE_EVIDENCE_SHA = '54cee346b2797a89cd6c1cf6b15b5a22c218c6f7';

async function verifyTransactionsThenReadEvidence({
  captureOptions = {},
  expectedOptions = {},
  readEvidence = (file) => readFile(file, 'utf8'),
} = {}) {
  const capture = await verifyCaptureTransaction({
    baselineDir,
    ledgerPath: captureLedgerPath,
    journalPath: captureJournalPath,
    ...captureOptions,
  });
  let expected;
  try {
    expected = await verifyExpectedTerminalTransaction({
      baselineDir,
      ledgerPath: expectedLedgerPath,
      captureLedgerPath,
      journalPath: expectedJournalPath,
      ...expectedOptions,
    });
    assert.equal(expected.ledger.captureTransactionId, capture.transactionId);
    assert.equal(expected.ledger.captureManifestSha256, capture.ledger.captureManifestSha256);
    const [worklog, packagePlan] = await Promise.all([
      readEvidence(worklogPath),
      readEvidence(packagePlanPath),
    ]);
    return { capture, expected, worklog, packagePlan };
  } catch (error) {
    expected?.dispose();
    capture.dispose();
    throw error;
  }
}

function disposeEvidence(evidence) {
  evidence.expected.dispose();
  evidence.capture.dispose();
}

test('final gate verifies both published transactions before accepting exact Task 14 and Task 15 evidence', async () => {
  const evidence = await verifyTransactionsThenReadEvidence();
  try {
    assert.equal(evidence.capture.transactionId, CAPTURE_TRANSACTION);
    assert.equal(evidence.capture.ledger.captureManifestSha256, CAPTURE_MANIFEST);
    assert.equal(evidence.expected.transactionId, EXPECTED_TRANSACTION);
    assert.equal(evidence.expected.ledger.manifestSha256, EXPECTED_MANIFEST);
    for (const document of [evidence.worklog, evidence.packagePlan]) {
      assert.match(document, new RegExp(CODE_EVIDENCE_SHA, 'u'));
      assert.match(document, /30263368122/u);
      assert.match(document, /89969021451/u);
      assert.match(document, /Midao baseline browser[^\n]*PASS/iu);
      assert.match(document, /legacy login compatibility[^\n]*PASS/iu);
      assert.match(document, /162\/162 PASS/u);
      assert.match(document, /known_drift[^\n]*59/iu);
      assert.match(document, /fresh reviews?[^\n]*(?:blocking|blockers?)\s*[:=]?\s*0/iu);
      assert.match(document, /merge[^\n]*(?:未授權|HOLD|待授權)/iu);
    }
  } finally {
    disposeEvidence(evidence);
  }
});

test('hostile journal or expected ledger mismatch blocks affected payload and all evidence reads', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'midao-final-gate-hostile-'));
  let capturePayloadReads = 0;
  let expectedPayloadReads = 0;
  let evidenceReads = 0;
  const readEvidence = async () => {
    evidenceReads += 1;
    return '';
  };
  try {
    const hostileCaptureJournal = path.join(temporary, 'capture.journal');
    await writeFile(hostileCaptureJournal, 'unfinished\n', { mode: 0o600, flag: 'wx' });
    await assert.rejects(verifyTransactionsThenReadEvidence({
      captureOptions: {
        journalPath: hostileCaptureJournal,
        onPayloadOpen: () => { capturePayloadReads += 1; },
      },
      expectedOptions: { onPayloadOpen: () => { expectedPayloadReads += 1; } },
      readEvidence,
    }), /journal|unfinished|present/iu);
    assert.equal(capturePayloadReads, 0);
    assert.equal(expectedPayloadReads, 0);
    assert.equal(evidenceReads, 0);

    const hostileExpectedLedger = path.join(temporary, 'expected-terminal-ledger.json');
    const expectedLedger = JSON.parse(await readFile(expectedLedgerPath, 'utf8'));
    expectedLedger.transactionId = 'f'.repeat(64);
    await writeFile(hostileExpectedLedger, `${JSON.stringify(expectedLedger)}\n`, { mode: 0o600, flag: 'wx' });
    await assert.rejects(verifyTransactionsThenReadEvidence({
      captureOptions: { onPayloadOpen: () => { capturePayloadReads += 1; } },
      expectedOptions: {
        ledgerPath: hostileExpectedLedger,
        onPayloadOpen: () => { expectedPayloadReads += 1; },
      },
      readEvidence,
    }), /manifest|metadata|transaction/iu);
    assert.equal(capturePayloadReads > 0, true, 'capture transaction must verify before expected-terminal');
    assert.equal(expectedPayloadReads, 0, 'hostile expected ledger must reject before expected payload opens');
    assert.equal(evidenceReads, 0);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
