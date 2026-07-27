#!/usr/bin/env node
import { lstat, mkdir, readFile, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertNoAmbientDatabaseEnv,
  extractLocalTerminalAndHistory,
  parseLocalConnectionEnv,
  replayExactMigrations,
} from './build-expected-terminal.mjs';
import { materializeFreshWorkdir } from './materialize-fresh-workdir.mjs';
import { resolveRepositoryPublicationPaths } from './publish-baseline.mjs';
import { resolveExpectedTerminalPublicationPaths } from './publish-expected-terminal.mjs';
import {
  verifyCaptureTransaction,
  verifyExpectedTerminalTransaction,
} from './verify-manifest.mjs';
import {
  LOCK_PATH, acquireKernelRunnerLock, canonicalProjectId, createActualAdapter,
  parseDockerHostGateway, parseSupabasePin, redactSupabaseOutput, releaseKernelRunnerLock,
  runCommand, runWithLocalSupabase, startLoopbackBridge, verifyPinnedSupabaseBinary,
} from '../testing/with-midao-local-supabase.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FRESH_TEST = 'apps/web/tests/integration/midao-baseline-fresh-postgres.test.mjs';

export function parseFreshRunnerArgs(argv, repoRoot = REPO_ROOT) {
  if (!Array.isArray(argv) || argv.length !== 2 || argv[0] !== '--test' || argv[1] !== FRESH_TEST) {
    throw new Error('fresh-install runner arguments invalid');
  }
  const canonicalRoot = path.resolve(repoRoot);
  return Object.freeze({ testPath: path.join(canonicalRoot, FRESH_TEST) });
}

function exactFunctions(options, names) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || names.some((name) => typeof options[name] !== 'function')) {
    throw new Error('fresh-install adapter contract invalid');
  }
}

async function runFreshInstallWithAdapters(options = {}) {
  exactFunctions(options, ['verifyCapture', 'verifyExpected', 'materialize', 'runLocal', 'compare']);
  if (typeof options.testPath !== 'string' || path.resolve(options.testPath) !== path.join(REPO_ROOT, FRESH_TEST)) {
    throw new Error('fresh-install test path invalid');
  }
  let capture; let expected; let materialized; let actualTerminalBytes; let expectedTerminalBytes;
  let result; let primaryError;
  try {
    capture = await options.verifyCapture();
    expected = await options.verifyExpected({ capture });
    if (!capture || typeof capture.dispose !== 'function' || !expected || typeof expected.dispose !== 'function'
      || !Array.isArray(expected.manifest?.historyVersions)) throw new Error('fresh-install verified capabilities invalid');
    materialized = await options.materialize({ capture, expected });
    if (!materialized || !Array.isArray(materialized.history) || typeof materialized.cleanup !== 'function') {
      throw new Error('fresh-install materialized capability invalid');
    }
    const local = await options.runLocal({ materialized, expected, testPath: options.testPath });
    if (!Buffer.isBuffer(local?.terminalBytes) || !Array.isArray(local.historyVersions)) throw new Error('fresh-install local result invalid');
    actualTerminalBytes = local.terminalBytes;
    expectedTerminalBytes = expected.payloads?.get('catalog.expected-terminal.normalized.json');
    if (!Buffer.isBuffer(expectedTerminalBytes)) throw new Error('fresh-install expected terminal payload missing');
    await options.compare({
      actualTerminalBytes,
      expectedTerminalBytes,
      actualHistory: local.historyVersions,
      expectedHistory: expected.manifest.historyVersions,
    });
    result = Object.freeze({ verified: true, captureTransactionId: capture.transactionId, expectedTransactionId: expected.transactionId });
  } catch (error) { primaryError = error; }
  const cleanupErrors = [];
  if (materialized) { try { await materialized.cleanup(); } catch (error) { cleanupErrors.push(error); } }
  try { expected?.dispose(); } catch (error) { cleanupErrors.push(error); }
  try { capture?.dispose(); } catch (error) { cleanupErrors.push(error); }
  actualTerminalBytes?.fill(0); expectedTerminalBytes?.fill(0);
  const errors = [primaryError, ...cleanupErrors].filter(Boolean);
  if (errors.length > 1) throw new AggregateError(errors, 'fresh-install lifecycle and cleanup failed');
  if (errors.length === 1) throw errors[0];
  return result;
}

export async function runFreshInstallActual({ testPath, repoRoot = REPO_ROOT, signal } = {}) {
  const canonicalRoot = path.resolve(repoRoot);
  if (process.versions.node !== '22.23.1') throw new Error('NODE_TOOLCHAIN_MISMATCH');
  assertNoAmbientDatabaseEnv();
  const pin = parseSupabasePin(await readFile(path.join(canonicalRoot, 'package-lock.json'), 'utf8'));
  if (pin !== '2.87.2') throw new Error('SUPABASE_PIN_MISMATCH');
  await verifyPinnedSupabaseBinary();
  const projectId = canonicalProjectId(canonicalRoot);
  const stat = await readFile(`/proc/${process.pid}/stat`, 'utf8');
  const close = stat.lastIndexOf(')');
  const metadata = { pid: process.pid, processStartTicks: stat.slice(close + 2).split(/\s+/u)[19], repoRoot: canonicalRoot, task: 'fresh-install' };
  let lock; let bridge; let result; let primaryError;
  try {
    lock = await acquireKernelRunnerLock({ lockDir: LOCK_PATH, metadata });
    const gateway = parseDockerHostGateway(await readFile('/proc/net/route', 'utf8'), await readFile('/proc/1/cgroup', 'utf8'));
    if (gateway) bridge = await startLoopbackBridge({ listenPort: 54322, targetHost: gateway, targetPort: 54322 });
    const captureJournalPath = resolveRepositoryPublicationPaths().journalPath;
    const expectedJournalPath = resolveExpectedTerminalPublicationPaths().journalPath;
    result = await runFreshInstallWithAdapters({
      testPath,
      verifyCapture: () => verifyCaptureTransaction({
        baselineDir: path.join(canonicalRoot, 'supabase/baselines/v1'),
        ledgerPath: path.join(canonicalRoot, 'docs/operations/baseline-ledger.json'),
        journalPath: captureJournalPath,
      }),
      verifyExpected: () => verifyExpectedTerminalTransaction({
        baselineDir: path.join(canonicalRoot, 'supabase/baselines/v1'),
        ledgerPath: path.join(canonicalRoot, 'docs/operations/expected-terminal-ledger.json'),
        captureLedgerPath: path.join(canonicalRoot, 'docs/operations/baseline-ledger.json'),
        journalPath: expectedJournalPath,
      }),
      materialize: async () => {
        const runParent = path.join(LOCK_PATH, 'fresh-install-run');
        await mkdir(runParent, { mode: 0o700 });
        const parentIdentity = await lstat(runParent);
        let materialized;
        try { materialized = await materializeFreshWorkdir({ outputParent: runParent, projectId }); }
        catch (primary) {
          try { await rmdir(runParent); } catch (cleanup) { throw new AggregateError([primary, cleanup], 'fresh materializer creation and parent cleanup failed'); }
          throw primary;
        }
        return {
          ...materialized,
          async cleanup() {
            let materializerError; let parentError;
            try { await materialized.cleanup(); } catch (error) { materializerError = error; }
            try {
              const current = await lstat(runParent);
              if (!sameIdentity(current, parentIdentity) || !current.isDirectory()) throw new Error('fresh run parent identity changed');
              await rmdir(runParent);
            } catch (error) { parentError = error; }
            if (materializerError && parentError) throw new AggregateError([materializerError, parentError], 'fresh materialized cleanup failed');
            if (materializerError || parentError) throw materializerError ?? parentError;
          },
        };
      },
      runLocal: async ({ materialized, testPath: exactTestPath }) => {
        const replay = await materialized.stageCliReplay();
        let local; let runError;
        try {
          local = await runWithLocalSupabase({
            adapter: createActualAdapter({
              repoRoot: canonicalRoot, pin, nodeBin: process.execPath, signal, cliWorkdir: materialized.workdir,
              lifecycleContract: { migrationNames: [replay.bootstrapName], noticesByMigration: {} },
            }),
            expectedProjectId: projectId,
            initialize: 'start-only',
            onReady: async ({ localEnv }) => {
              await replayExactMigrations({
                databaseUrl: localEnv.DATABASE_URL, pendingMigrationsDir: replay.pendingMigrationsDir,
                history: materialized.history, signal,
              });
              const seed = await runCommand('/usr/bin/psql', ['-X', '--set=ON_ERROR_STOP=1', '--quiet', '--file', materialized.seedPath], {
                cwd: materialized.workdir, env: parseLocalConnectionEnv(localEnv.DATABASE_URL), signal,
              });
              if (seed.exitCode !== 0 || seed.signal !== null) throw new Error(`fresh seed failed: ${redactSupabaseOutput(seed.stderr).slice(-4000).trim()}`);
              const integration = await runCommand(process.execPath, ['--test', '--test-concurrency=1', exactTestPath], {
                cwd: canonicalRoot, env: { ...process.env, ...localEnv }, signal,
              });
              if (integration.exitCode !== 0 || integration.signal !== null) {
                throw new Error(`fresh integration failed: ${redactSupabaseOutput(`${integration.stdout}\n${integration.stderr}`).slice(-8000).trim()}`);
              }
              return extractLocalTerminalAndHistory({ databaseUrl: localEnv.DATABASE_URL });
            },
            signal,
          });
        } catch (error) { runError = error; }
        const cleanupErrors = [];
        try { await replay.restore(); } catch (error) { cleanupErrors.push(error); }
        if (cleanupErrors.length === 0) {
          try { await materialized.cleanupCliMetadata(); } catch (error) { cleanupErrors.push(error); }
        }
        const errors = [runError, ...cleanupErrors].filter(Boolean);
        if (errors.length > 1) throw new AggregateError(errors, 'fresh local replay and restoration failed');
        if (errors.length === 1) throw errors[0];
        return local.value;
      },
      compare: async ({ actualTerminalBytes, expectedTerminalBytes, actualHistory, expectedHistory }) => {
        if (!actualTerminalBytes.equals(expectedTerminalBytes)) throw new Error('fresh terminal differs from expected-terminal truth');
        if (JSON.stringify(actualHistory) !== JSON.stringify(expectedHistory)) throw new Error('fresh migration history differs from expected-terminal truth');
      },
    });
  } catch (error) { primaryError = error; }
  const cleanupErrors = [];
  if (bridge) { try { await bridge.close(); } catch (error) { cleanupErrors.push(error); } }
  if (lock) { try { await releaseKernelRunnerLock(lock); } catch (error) { cleanupErrors.push(error); } }
  const errors = [primaryError, ...cleanupErrors].filter(Boolean);
  if (errors.length > 1) throw new AggregateError(errors, 'fresh-install runner and cleanup failed');
  if (errors.length === 1) throw errors[0];
  return result;
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.uid === right.uid && left.nlink === right.nlink;
}

export const __internal = Object.freeze({ runFreshInstallWithAdapters });
export const __dependencies = Object.freeze({ verifyCaptureTransaction, verifyExpectedTerminalTransaction });

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const controller = new AbortController();
  const abort = () => controller.abort(new Error('FRESH_INSTALL_SIGNALLED'));
  process.on('SIGTERM', abort); process.on('SIGINT', abort);
  let options;
  try { options = parseFreshRunnerArgs(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
  if (options) {
    runFreshInstallActual({ ...options, signal: controller.signal })
      .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
      .catch((error) => {
        process.stderr.write(`${redactSupabaseOutput(error instanceof Error ? error.stack || error.message : String(error))}\n`);
        process.exitCode = 1;
      })
      .finally(() => {
        process.removeListener('SIGTERM', abort); process.removeListener('SIGINT', abort);
      });
  } else {
    process.removeListener('SIGTERM', abort); process.removeListener('SIGINT', abort);
  }
}
