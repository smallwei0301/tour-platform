#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectFrozenMigrations, renderFrozenManifest } from './database-baseline/build-frozen-migration-manifest.mjs';
import { POST_CUTOFF_MIGRATIONS } from './database-baseline/materialize-fresh-workdir.mjs';
import { resolveRepositoryPublicationPaths } from './database-baseline/publish-baseline.mjs';
import { resolveExpectedTerminalPublicationPaths } from './database-baseline/publish-expected-terminal.mjs';
import { verifyCaptureTransaction, verifyExpectedTerminalTransaction } from './database-baseline/verify-manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA = /^[0-9a-f]{64}$/u;
const FUTURE = /^\d{14}_[A-Za-z0-9_.-]+\.sql$/u;

async function safeBytes(file) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1) throw new Error('source payload identity invalid');
    const bytes = await handle.readFile(); const after = await handle.stat();
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      bytes.fill(0); throw new Error('source payload changed during read');
    }
    return bytes;
  } finally { await handle.close(); }
}

export async function runSourceGateWithAdapters({ verifyCapture, verifyExpected, inspectSources } = {}) {
  if (![verifyCapture, verifyExpected, inspectSources].every((value) => typeof value === 'function')) throw new Error('source gate adapter contract invalid');
  let capture; let expected; let result; let primaryError;
  try {
    capture = await verifyCapture(); expected = await verifyExpected({ capture });
    const values = [capture?.transactionId, capture?.ledger?.captureManifestSha256,
      expected?.manifest?.captureTransactionId, expected?.manifest?.captureManifestSha256];
    if (typeof capture?.dispose !== 'function' || typeof expected?.dispose !== 'function' || !values.every((value) => SHA.test(value ?? ''))
      || values[0] !== values[2] || values[1] !== values[3]) throw new Error('source gate capture binding invalid');
    result = await inspectSources({ capture, expected });
    if (result?.status !== 'verified' || result.mode !== 'source') throw new Error('source inspection invalid');
  } catch (error) { primaryError = error; }
  const cleanup = [];
  try { expected?.dispose(); } catch (error) { cleanup.push(error); }
  try { capture?.dispose(); } catch (error) { cleanup.push(error); }
  const errors = [primaryError, ...cleanup].filter(Boolean);
  if (errors.length > 1) throw new AggregateError(errors, 'source gate and cleanup failed');
  if (errors.length === 1) throw errors[0];
  return result;
}

async function inspectRepositorySources() {
  const frozen = await collectFrozenMigrations({ repoRoot: ROOT });
  const tracked = await safeBytes(path.join(ROOT, 'supabase/baselines/v1/frozen-migrations.sha256'));
  const rendered = Buffer.from(renderFrozenManifest(frozen));
  try { if (!tracked.equals(rendered)) throw new Error('frozen migration manifest drift'); }
  finally { tracked.fill(0); rendered.fill(0); }
  const migrationDir = path.join(ROOT, 'supabase/migrations');
  const names = (await readdir(migrationDir)).filter((name) => name.endsWith('.sql') && !name.endsWith('.rollback.sql')).sort();
  const frozenNames = new Set(frozen.map(({ filename }) => filename));
  const post = names.filter((name) => !frozenNames.has(name));
  if (post.length < POST_CUTOFF_MIGRATIONS.length || new Set(post).size !== post.length) throw new Error('post-cutoff source inventory invalid');
  for (let index = 0; index < post.length; index += 1) {
    const name = post[index];
    if (!FUTURE.test(name)) throw new Error(`post-cutoff migration filename invalid: ${name}`);
    const file = path.join(migrationDir, name);
    if (path.dirname(file) !== migrationDir) throw new Error('post-cutoff source path invalid');
    const bytes = await safeBytes(file);
    try {
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (index < POST_CUTOFF_MIGRATIONS.length) {
        const expected = POST_CUTOFF_MIGRATIONS[index];
        if (name !== expected.filename || digest !== expected.sha256) throw new Error(`pinned post-cutoff migration drift: ${name}`);
      } else if (name <= POST_CUTOFF_MIGRATIONS.at(-1).filename) throw new Error('future migration order invalid');
    } finally { bytes.fill(0); }
  }
  return Object.freeze({ mode: 'source', status: 'verified', frozenCount: frozen.length, postCutoffCount: post.length });
}

export async function checkMigrationSourceGate() {
  return runSourceGateWithAdapters({
    verifyCapture: () => verifyCaptureTransaction({
      baselineDir: path.join(ROOT, 'supabase/baselines/v1'), ledgerPath: path.join(ROOT, 'docs/operations/baseline-ledger.json'),
      journalPath: resolveRepositoryPublicationPaths().journalPath,
    }),
    verifyExpected: async ({ capture }) => {
      const expected = await verifyExpectedTerminalTransaction({
        baselineDir: path.join(ROOT, 'supabase/baselines/v1'), ledgerPath: path.join(ROOT, 'docs/operations/expected-terminal-ledger.json'),
        captureLedgerPath: path.join(ROOT, 'docs/operations/baseline-ledger.json'), journalPath: resolveExpectedTerminalPublicationPaths().journalPath,
      });
      if (expected.manifest.captureTransactionId !== capture.transactionId
        || expected.manifest.captureManifestSha256 !== capture.ledger.captureManifestSha256) {
        expected.dispose(); throw new Error('source gate verified publication changed');
      }
      return expected;
    },
    inspectSources: inspectRepositorySources,
  });
}

function parseArgs(argv) {
  if (!Array.isArray(argv) || !argv.includes('--mode') || argv[argv.indexOf('--mode') + 1] !== 'source'
    || argv.some((value) => !['--mode', 'source', '--json'].includes(value))) throw new Error('source gate requires exact --mode source');
  return { json: argv.includes('--json') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let args;
  try { args = parseArgs(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
  if (args) checkMigrationSourceGate().then((result) => {
    process.stdout.write(args.json ? `${JSON.stringify(result)}\n` : `migration source gate: ${result.status}\n`);
  }).catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
