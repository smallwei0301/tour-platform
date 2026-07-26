import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const baselineDir = path.join(root, 'supabase/baselines/v1');
const ledgerPath = path.join(root, 'docs/operations/baseline-ledger.json');
const verifierPath = path.join(root, 'scripts/database-baseline/verify-manifest.mjs');
const publisherPath = path.join(root, 'scripts/database-baseline/publish-baseline.mjs');
const canonical = (value) => `${JSON.stringify(value)}\n`;

async function transactionApi() {
  const verifier = await import(`${pathToFileURL(verifierPath).href}?artifact=${Date.now()}`);
  const publisher = await import(`${pathToFileURL(publisherPath).href}?artifact=${Date.now()}`);
  return { ...verifier, journalPath: publisher.resolveRepositoryPublicationPaths().journalPath };
}

async function consumeVerified({ baseline = baselineDir, ledger = ledgerPath, journal, onConsume }) {
  const { verifyCaptureTransaction } = await transactionApi();
  const verified = await verifyCaptureTransaction({ baselineDir: baseline, ledgerPath: ledger, journalPath: journal });
  try { return onConsume(verified); } finally { verified.dispose(); }
}

async function copyTransaction(parent) {
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const baseline = path.join(parent, 'v1');
  const docs = path.join(parent, 'docs');
  await mkdir(baseline, { mode: 0o700 });
  await mkdir(docs, { mode: 0o700 });
  const { CAPTURE_PAYLOAD_PATHS } = await transactionApi();
  for (const name of [...CAPTURE_PAYLOAD_PATHS, 'capture-manifest.json']) {
    await copyFile(path.join(baselineDir, name), path.join(baseline, name));
  }
  const ledger = path.join(docs, 'baseline-ledger.json');
  await copyFile(ledgerPath, ledger);
  return { baseline, ledger, journal: path.join(parent, 'publication.journal.json') };
}

test('Git whitespace policy exempts only immutable generated baseline SQL artifacts', () => {
  const files = [
    'supabase/baselines/v1/baseline.sql',
    'supabase/baselines/v1/managed-overlays.sql',
    'supabase/migrations/20260723000000_midao_backend_mode.sql',
    'apps/web/tests/fixtures/database-baseline/supabase-dump-dry-run-redacted.txt',
  ];
  const result = spawnSync('/usr/bin/git', ['check-attr', 'whitespace', '--', ...files], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), [
    'supabase/baselines/v1/baseline.sql: whitespace: unset',
    'supabase/baselines/v1/managed-overlays.sql: whitespace: unset',
    'supabase/migrations/20260723000000_midao_backend_mode.sql: whitespace: unspecified',
    'apps/web/tests/fixtures/database-baseline/supabase-dump-dry-run-redacted.txt: whitespace: -blank-at-eof',
  ]);
});

test('published production cutoff transaction is complete, semantically bound and not an apply ledger', async () => {
  const { CAPTURE_PAYLOAD_PATHS, journalPath } = await transactionApi();
  let consumerReads = 0;
  const summary = await consumeVerified({
    journal: journalPath,
    onConsume: (verified) => {
      const get = (name) => { consumerReads += 1; return verified.payloads.get(name); };
      assert.deepEqual([...verified.payloads.keys()], CAPTURE_PAYLOAD_PATHS);
      assert.equal(verified.manifest.transactionId, verified.ledger.transactionId);
      assert.equal(verified.ledger.kind, 'midao-baseline-capture-ledger');
      assert.equal(Object.hasOwn(verified.ledger, 'migrationHistory'), false);
      assert.equal(verified.manifest.assertions.catalogEquivalent, true);
      assert.equal(verified.manifest.assertions.securityPolicyStatus, 'known_drift');
      const closure = JSON.parse(get('dependency-closure.json').toString('utf8'));
      const tocMap = JSON.parse(get('toc-ownership-map.json').toString('utf8'));
      const drift = JSON.parse(get('security-drift.json').toString('utf8'));
      assert.equal(closure.length, 789);
      assert.equal(tocMap.expectedTocIds.length, 789);
      assert.equal(new Set(closure.map((entry) => entry.tocId)).size, 789);
      for (const entry of closure) {
        assert.match(entry.captureASha256, /^[0-9a-f]{64}$/u);
        assert.equal(entry.captureASha256, entry.captureBSha256);
        assert.match(entry.renderBindingSha256, /^[0-9a-f]{64}$/u);
      }
      assert.equal(drift.status, 'known_drift');
      assert.equal(drift.tableCount, 59);
      assert.equal(drift.tables.length, 59);
      return { transactionId: verified.transactionId, payloads: CAPTURE_PAYLOAD_PATHS.length };
    },
  });
  assert.match(summary.transactionId, /^[0-9a-f]{64}$/u);
  assert.equal(summary.payloads, 13);
  assert.equal(consumerReads, 3);
});

test('hostile journal, ledger, manifest or payload blocks consumers before payload get', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'midao-cutoff-artifact-hostile-'));
  try {
    const { journalPath } = await transactionApi();
    const cases = [];

    const journalFx = await copyTransaction(path.join(parent, 'journal'));
    await writeFile(journalFx.journal, canonical({ state: 'PROMOTING' }), { mode: 0o600, flag: 'wx' });
    cases.push(journalFx);

    const ledgerFx = await copyTransaction(path.join(parent, 'ledger'));
    const ledger = JSON.parse(await readFile(ledgerFx.ledger, 'utf8'));
    ledger.transactionId = 'f'.repeat(64);
    await writeFile(ledgerFx.ledger, canonical(ledger), { mode: 0o600 });
    cases.push(ledgerFx);

    const manifestFx = await copyTransaction(path.join(parent, 'manifest'));
    const manifestLedger = JSON.parse(await readFile(manifestFx.ledger, 'utf8'));
    manifestLedger.captureManifestSha256 = 'e'.repeat(64);
    await writeFile(manifestFx.ledger, canonical(manifestLedger), { mode: 0o600 });
    cases.push(manifestFx);

    const payloadFx = await copyTransaction(path.join(parent, 'payload'));
    await writeFile(path.join(payloadFx.baseline, 'baseline.sql'), 'SELECT 1;\n', { mode: 0o600 });
    cases.push(payloadFx);

    for (const fx of cases) {
      let consumerReads = 0;
      await assert.rejects(consumeVerified({
        baseline: fx.baseline,
        ledger: fx.ledger,
        journal: fx.journal ?? journalPath,
        onConsume: (verified) => { consumerReads += 1; return verified.payloads.get('baseline.sql'); },
      }), /journal|unfinished|ledger|manifest|digest|payload/iu);
      assert.equal(consumerReads, 0);
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
