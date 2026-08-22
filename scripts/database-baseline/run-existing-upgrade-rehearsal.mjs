#!/usr/bin/env node
import { lstat, mkdir, readFile, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractCatalog } from './extract-catalog.mjs';
import { normalizeCatalog } from './normalize-catalog.mjs';
import { validateNormalizedCatalog } from './validate-normalized-catalog.mjs';
import { assertNoAmbientDatabaseEnv, parseLocalConnectionEnv } from './build-expected-terminal.mjs';
import { collectFrozenMigrations, DEFAULT_EXPECTED_COUNT, renderFrozenManifest } from './build-frozen-migration-manifest.mjs';
import { materializeFreshWorkdir, POST_CUTOFF_MIGRATIONS } from './materialize-fresh-workdir.mjs';
import { resolveRepositoryPublicationPaths } from './publish-baseline.mjs';
import { resolveExpectedTerminalPublicationPaths } from './publish-expected-terminal.mjs';
import { verifyCaptureTransaction, verifyExpectedTerminalTransaction } from './verify-manifest.mjs';
import {
  LOCK_PATH, acquireKernelRunnerLock, canonicalProjectId, createActualAdapter,
  parseDockerHostGateway, parseSupabasePin, redactSupabaseOutput, releaseKernelRunnerLock,
  runCommand, runWithLocalSupabase, startLoopbackBridge, verifyPinnedSupabaseBinary,
} from '../testing/with-midao-local-supabase.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXISTING_TEST = 'apps/web/tests/integration/midao-baseline-existing-postgres.test.mjs';
const SHA256 = /^[0-9a-f]{64}$/u;
const POST_VERSIONS = Object.freeze(POST_CUTOFF_MIGRATIONS.map(({ filename }) => filename.slice(0, 14)));

export function parseExistingRunnerArgs(argv, repoRoot = REPO_ROOT) {
  if (!Array.isArray(argv) || argv.length !== 2 || argv[0] !== '--test' || argv[1] !== EXISTING_TEST) {
    throw new Error('existing rehearsal runner arguments invalid');
  }
  return Object.freeze({ testPath: path.join(path.resolve(repoRoot), EXISTING_TEST) });
}

async function runExistingWithAdapters(options = {}) {
  for (const name of ['verifyCapture', 'verifyExpected', 'buildCutoffFixture', 'upgrade', 'compare']) {
    if (typeof options[name] !== 'function') throw new Error('existing rehearsal adapter contract invalid');
  }
  if (path.resolve(options.testPath ?? '') !== path.join(REPO_ROOT, EXISTING_TEST)) throw new Error('existing rehearsal test path invalid');
  let capture; let expected; let fixture; let upgradeResult; let result; let primaryError;
  try {
    capture = await options.verifyCapture();
    expected = await options.verifyExpected({ capture });
    if (!capture || typeof capture.dispose !== 'function' || !expected || typeof expected.dispose !== 'function') throw new Error('existing verified capabilities invalid');
    const captureTransaction = capture.transactionId;
    const captureManifest = capture.ledger?.captureManifestSha256;
    const expectedCaptureTransaction = expected.manifest?.captureTransactionId;
    const expectedCaptureManifest = expected.manifest?.captureManifestSha256;
    if (![captureTransaction, captureManifest, expectedCaptureTransaction, expectedCaptureManifest].every((value) => SHA256.test(value ?? ''))
      || expectedCaptureTransaction !== captureTransaction || expectedCaptureManifest !== captureManifest) {
      throw new Error('existing capture transaction binding mismatch');
    }
    fixture = await options.buildCutoffFixture({ capture, expected });
    if (!fixture || typeof fixture.cleanup !== 'function' || fixture.occupied !== true) throw new Error('existing fixture must be occupied');
    if (fixture.hasBaselineMarker !== false) throw new Error('existing fixture must not contain a baseline marker');
    if (fixture.localOnly !== true) throw new Error('existing fixture must be local-only');
    upgradeResult = await options.upgrade({ fixture, expected, testPath: options.testPath });
    if (!upgradeResult || upgradeResult.baselineExecutionCount !== 0 || !Buffer.isBuffer(upgradeResult.terminalBytes)
      || !Buffer.isBuffer(upgradeResult.expectedTerminalBytes)) throw new Error('existing upgrade result invalid');
    await options.compare(upgradeResult);
    result = Object.freeze({ verified: true, expectedTransactionId: expected.transactionId, baselineExecutionCount: 0 });
  } catch (error) { primaryError = error; }
  const cleanupErrors = [];
  if (fixture) { try { await fixture.cleanup(); } catch (error) { cleanupErrors.push(error); } }
  try { expected?.dispose(); } catch (error) { cleanupErrors.push(error); }
  try { capture?.dispose(); } catch (error) { cleanupErrors.push(error); }
  upgradeResult?.terminalBytes?.fill(0); upgradeResult?.expectedTerminalBytes?.fill(0);
  const errors = [primaryError, ...cleanupErrors].filter(Boolean);
  if (errors.length > 1) throw new AggregateError(errors, 'existing rehearsal and cleanup failed');
  if (errors.length === 1) throw errors[0];
  return result;
}

async function useAdmin(databaseUrl, operation, { ClientClass } = {}) {
  parseLocalConnectionEnv(databaseUrl);
  const admin = new URL(databaseUrl); admin.username = 'supabase_admin';
  parseLocalConnectionEnv(admin.toString());
  let EffectiveClient = ClientClass;
  if (!EffectiveClient) { const { default: pg } = await import('pg'); EffectiveClient = pg.Client; }
  const client = new EffectiveClient({ connectionString: admin.toString() });
  let value; let primaryError;
  try { await client.connect(); value = await operation(client); } catch (error) { primaryError = error; }
  let closeError; try { await client.end(); } catch (error) { closeError = error; }
  if (primaryError && closeError) throw new AggregateError([primaryError, closeError], 'existing fixture query and close failed');
  if (primaryError || closeError) throw primaryError ?? closeError;
  return value;
}

async function psqlFile(databaseUrl, file, cwd, signal) {
  const admin = new URL(databaseUrl); admin.username = 'supabase_admin';
  const result = await runCommand('/usr/bin/psql', ['-X', '--set=ON_ERROR_STOP=1', '--quiet', '--file', file], {
    cwd, env: parseLocalConnectionEnv(admin.toString()), signal,
  });
  if (result.exitCode !== 0 || result.signal !== null) {
    const diagnostic = redactSupabaseOutput(result.stderr).slice(-4000).trim();
    throw new Error(diagnostic ? `existing rehearsal SQL failed: ${diagnostic}` : 'existing rehearsal SQL failed');
  }
}

async function extractExistingTerminal(databaseUrl, {
  extractCatalogFn = extractCatalog,
  normalizeFn = normalizeCatalog,
  terminalBytesFactory = (value) => Buffer.from(value),
  validateFn = validateNormalizedCatalog,
  useAdminFn = useAdmin,
} = {}) {
  let terminalBytes;
  try {
    const raw = await extractCatalogFn({ connectionEnv: parseLocalConnectionEnv(databaseUrl) });
    terminalBytes = terminalBytesFactory(normalizeFn(raw));
    if (!Buffer.isBuffer(terminalBytes)) throw new Error('existing terminal bytes invalid');
    validateFn(JSON.parse(terminalBytes));
    const history = await useAdminFn(databaseUrl, async (client) => {
      const { rows } = await client.query('SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version');
      return rows;
    });
    if (history.length !== DEFAULT_EXPECTED_COUNT + POST_VERSIONS.length || history.some(({ version }) => version === '00000000000001')
      || JSON.stringify(history.slice(-POST_VERSIONS.length).map(({ version }) => version)) !== JSON.stringify(POST_VERSIONS)) {
      throw new Error('existing rehearsal exact history invalid');
    }
    return { terminalBytes, history };
  } catch (error) {
    terminalBytes?.fill(0);
    throw error;
  }
}

async function prepareFrozenActual(canonicalRoot) {
  const frozen = await collectFrozenMigrations({ repoRoot: canonicalRoot });
  const trackedFrozen = await readFile(path.join(canonicalRoot, 'supabase/baselines/v1/frozen-migrations.sha256'));
  const renderedFrozen = Buffer.from(renderFrozenManifest(frozen));
  try { if (!renderedFrozen.equals(trackedFrozen)) throw new Error('existing frozen migration manifest drifted'); }
  finally { trackedFrozen.fill(0); renderedFrozen.fill(0); }
  return frozen;
}

async function buildCutoffFixtureActual({ canonicalRoot, projectId, capture, expected, dependencies = {} }) {
  if (expected?.manifest?.captureTransactionId !== capture?.transactionId) throw new Error('existing fixture verified transaction binding invalid');
  const prepareFrozen = dependencies.prepareFrozen ?? prepareFrozenActual;
  const mkdirFn = dependencies.mkdir ?? mkdir;
  const lstatFn = dependencies.lstat ?? lstat;
  const rmdirFn = dependencies.rmdir ?? rmdir;
  const materialize = dependencies.materialize ?? materializeFreshWorkdir;
  const frozen = await prepareFrozen(canonicalRoot);
  const runParent = path.join(LOCK_PATH, 'existing-rehearsal-run');
  let parentCreated = false; let parentIdentity; let materialized;
  try {
    await mkdirFn(runParent, { mode: 0o700 }); parentCreated = true;
    parentIdentity = await lstatFn(runParent);
    materialized = await materialize({
      outputParent: runParent,
      projectId,
      postCutoffManifest: expected.manifest,
    });
    if (materialized?.transactionId !== capture.transactionId) throw new Error('existing materializer capture transaction binding mismatch');
  } catch (primary) {
    const cleanup = [];
    if (materialized) { try { await materialized.cleanup(); } catch (error) { cleanup.push(error); } }
    if (parentCreated) {
      try {
        if (parentIdentity) {
          const current = await lstatFn(runParent);
          if (!sameIdentity(current, parentIdentity) || !current.isDirectory()) throw new Error('existing setup parent identity changed');
        }
        await rmdirFn(runParent);
      } catch (error) { cleanup.push(error); }
    }
    if (cleanup.length) throw new AggregateError([primary, ...cleanup], 'existing fixture setup and rollback failed');
    throw primary;
  }
  return {
    occupied: true, hasBaselineMarker: false, localOnly: true, frozen, materialized,
    async cleanup() {
      let first;
      try { await materialized.cleanup(); } catch (error) { first = error; }
      try {
        const current = await lstatFn(runParent);
        if (!sameIdentity(current, parentIdentity) || !current.isDirectory()) throw new Error('existing run parent identity changed');
        await rmdirFn(runParent);
      } catch (error) { if (first) throw new AggregateError([first, error], 'existing fixture cleanup failed'); throw error; }
      if (first) throw first;
    },
  };
}

export async function runExistingActual({ testPath, repoRoot = REPO_ROOT, signal } = {}) {
  const canonicalRoot = path.resolve(repoRoot);
  if (process.versions.node !== '22.23.1') throw new Error('NODE_TOOLCHAIN_MISMATCH');
  assertNoAmbientDatabaseEnv();
  const pin = parseSupabasePin(await readFile(path.join(canonicalRoot, 'package-lock.json'), 'utf8'));
  if (pin !== '2.87.2') throw new Error('SUPABASE_PIN_MISMATCH');
  await verifyPinnedSupabaseBinary();
  const projectId = canonicalProjectId(canonicalRoot);
  const stat = await readFile(`/proc/${process.pid}/stat`, 'utf8'); const close = stat.lastIndexOf(')');
  const metadata = { pid: process.pid, processStartTicks: stat.slice(close + 2).split(/\s+/u)[19], repoRoot: canonicalRoot, task: 'existing-rehearsal' };
  let lock; let bridge; let result; let primaryError;
  try {
    lock = await acquireKernelRunnerLock({ lockDir: LOCK_PATH, metadata });
    const gateway = parseDockerHostGateway(await readFile('/proc/net/route', 'utf8'), await readFile('/proc/1/cgroup', 'utf8'));
    if (gateway) bridge = await startLoopbackBridge({ listenPort: 54322, targetHost: gateway, targetPort: 54322 });
    result = await runExistingWithAdapters({
      testPath,
      verifyCapture: () => verifyCaptureTransaction({
        baselineDir: path.join(canonicalRoot, 'supabase/baselines/v1'), ledgerPath: path.join(canonicalRoot, 'docs/operations/baseline-ledger.json'),
        journalPath: resolveRepositoryPublicationPaths().journalPath,
      }),
      verifyExpected: async ({ capture }) => {
        const verified = await verifyExpectedTerminalTransaction({
          baselineDir: path.join(canonicalRoot, 'supabase/baselines/v1'), ledgerPath: path.join(canonicalRoot, 'docs/operations/expected-terminal-ledger.json'),
          captureLedgerPath: path.join(canonicalRoot, 'docs/operations/baseline-ledger.json'), journalPath: resolveExpectedTerminalPublicationPaths().journalPath,
        });
        if (verified.manifest.captureTransactionId !== capture.transactionId
          || verified.manifest.captureManifestSha256 !== capture.ledger.captureManifestSha256) {
          verified.dispose(); throw new Error('existing verified capture publication changed');
        }
        return verified;
      },
      buildCutoffFixture: ({ capture, expected }) => buildCutoffFixtureActual({
        canonicalRoot, projectId, capture, expected,
      }),
      upgrade: async ({ fixture, expected, testPath: exactTestPath }) => {
        const replay = await fixture.materialized.stageCliReplay(); let local; let runError; let producedTerminalBytes;
        try {
          local = await runWithLocalSupabase({
            adapter: createActualAdapter({
              repoRoot: canonicalRoot, pin, nodeBin: process.execPath, signal, cliWorkdir: fixture.materialized.workdir,
              lifecycleContract: { migrationNames: [replay.bootstrapName], noticesByMigration: {} },
            }), expectedProjectId: projectId, initialize: 'start-only', signal,
            onReady: async ({ localEnv }) => {
              const baselineFile = path.join(replay.pendingMigrationsDir, fixture.materialized.history[0]);
              await useAdmin(localEnv.DATABASE_URL, async (client) => {
                const { rows } = await client.query('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version');
                if (JSON.stringify(rows) !== JSON.stringify([{ version: '00000000000000' }])) throw new Error('existing bootstrap history invalid');
                await client.query("DELETE FROM supabase_migrations.schema_migrations WHERE version='00000000000000'");
              });
              let phase = 'fixture-setup'; let baselineExecutionCount = 0;
              const applyMigrationFile = async (file) => {
                if (phase === 'upgrade' && file === baselineFile) baselineExecutionCount += 1;
                await psqlFile(localEnv.DATABASE_URL, file, replay.pendingMigrationsDir, signal);
              };
              await applyMigrationFile(baselineFile);
              await useAdmin(localEnv.DATABASE_URL, async (client) => {
                const versions = fixture.frozen.map(({ filename }) => filename.slice(0, -4));
                await client.query("INSERT INTO supabase_migrations.schema_migrations(version, statements, name) SELECT value, ARRAY[]::text[], 'fixture_cutoff:' || value FROM unnest($1::text[]) value", [versions]);
                const occupied = await client.query("SELECT count(*)::int AS count FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')");
                if (occupied.rows[0].count < 1) throw new Error('existing cutoff fixture is empty');
              });
              phase = 'upgrade';
              for (const { filename } of POST_CUTOFF_MIGRATIONS) {
                const file = path.join(replay.pendingMigrationsDir, filename);
                if (path.dirname(file) !== replay.pendingMigrationsDir) throw new Error('existing post-cutoff path invalid');
                await applyMigrationFile(file);
                await useAdmin(localEnv.DATABASE_URL, (client) => client.query(
                  'INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ($1,$2::text[],$3)',
                  [filename.slice(0, 14), [], filename.slice(15, -4)],
                ));
              }
              const integration = await runCommand(process.execPath, ['--test', '--test-concurrency=1', exactTestPath], {
                cwd: canonicalRoot, env: { ...process.env, ...localEnv }, signal,
              });
              if (integration.exitCode !== 0 || integration.signal !== null) throw new Error(`existing integration failed: ${redactSupabaseOutput(`${integration.stdout}\n${integration.stderr}`).slice(-8000).trim()}`);
              const extracted = await extractExistingTerminal(localEnv.DATABASE_URL);
              producedTerminalBytes = extracted.terminalBytes;
              return { ...extracted, baselineExecutionCount };
            },
          });
        } catch (error) { runError = error; producedTerminalBytes?.fill(0); }
        const cleanupErrors = [];
        try { await replay.restore(); } catch (error) { cleanupErrors.push(error); }
        if (cleanupErrors.length === 0) { try { await fixture.materialized.cleanupCliMetadata(); } catch (error) { cleanupErrors.push(error); } }
        const errors = [runError, ...cleanupErrors].filter(Boolean);
        if (errors.length > 1) throw new AggregateError(errors, 'existing local upgrade and restoration failed');
        if (errors.length === 1) throw errors[0];
        return {
          baselineExecutionCount: local.value.baselineExecutionCount,
          terminalBytes: local.value.terminalBytes,
          expectedTerminalBytes: expected.payloads.get('catalog.expected-terminal.normalized.json'),
        };
      },
      compare: async ({ terminalBytes, expectedTerminalBytes }) => {
        if (!terminalBytes.equals(expectedTerminalBytes)) throw new Error('existing terminal differs from expected-terminal truth');
      },
    });
  } catch (error) { primaryError = error; }
  const cleanupErrors = [];
  if (bridge) { try { await bridge.close(); } catch (error) { cleanupErrors.push(error); } }
  if (lock) { try { await releaseKernelRunnerLock(lock); } catch (error) { cleanupErrors.push(error); } }
  const errors = [primaryError, ...cleanupErrors].filter(Boolean);
  if (errors.length > 1) throw new AggregateError(errors, 'existing runner and cleanup failed');
  if (errors.length === 1) throw errors[0];
  return result;
}

function sameIdentity(left, right) { return left.dev === right.dev && left.ino === right.ino && left.uid === right.uid && left.nlink === right.nlink; }
export const __internal = Object.freeze({ runExistingWithAdapters, buildCutoffFixtureActual, useAdmin, extractExistingTerminal });
export const __dependencies = Object.freeze({ verifyCaptureTransaction, verifyExpectedTerminalTransaction });

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const controller = new AbortController(); const abort = () => controller.abort(new Error('EXISTING_REHEARSAL_SIGNALLED'));
  process.on('SIGTERM', abort); process.on('SIGINT', abort); let options;
  try { options = parseExistingRunnerArgs(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
  if (options) runExistingActual({ ...options, signal: controller.signal })
    .then((value) => process.stdout.write(`${JSON.stringify(value)}\n`))
    .catch((error) => { process.stderr.write(`${redactSupabaseOutput(error instanceof Error ? error.stack || error.message : String(error))}\n`); process.exitCode = 1; })
    .finally(() => { process.removeListener('SIGTERM', abort); process.removeListener('SIGINT', abort); });
}
