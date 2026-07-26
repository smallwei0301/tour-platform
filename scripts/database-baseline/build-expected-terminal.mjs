#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  lstat, mkdir, readFile, rmdir,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractCatalog } from './extract-catalog.mjs';
import { materializeFreshWorkdir, POST_CUTOFF_MIGRATIONS } from './materialize-fresh-workdir.mjs';
import { normalizeCatalog } from './normalize-catalog.mjs';
import { resolveRepositoryPublicationPaths } from './publish-baseline.mjs';
import { publishExpectedTerminalTransaction } from './publish-expected-terminal.mjs';
import { validateNormalizedCatalog } from './validate-normalized-catalog.mjs';
import { validateCaptureLedger, validateCaptureManifest, verifyCaptureTransaction } from './verify-manifest.mjs';
import {
  LOCK_PATH, acquireKernelRunnerLock, canonicalProjectId, createActualAdapter,
  parseDockerHostGateway, parseSupabasePin, redactSupabaseOutput, releaseKernelRunnerLock,
  runCommand, runWithLocalSupabase, startLoopbackBridge, verifyPinnedSupabaseBinary,
} from '../testing/with-midao-local-supabase.mjs';

export { POST_CUTOFF_MIGRATIONS };
export const EXPECTED_TERMINAL_PAYLOAD_PATHS = Object.freeze([
  'catalog.expected-terminal.normalized.json',
  'catalog-expected-terminal.sha256',
]);
export const EXPECTED_TERMINAL_MANIFEST_NAME = 'manifest.json';
export const EXPECTED_TERMINAL_LEDGER_NAME = 'expected-terminal-ledger.json';
export const EXPECTED_HISTORY_VERSIONS = Object.freeze([
  '00000000000001', ...POST_CUTOFF_MIGRATIONS.map(({ filename }) => filename.slice(0, 14)),
]);

const MAX_TERMINAL_BYTES = 32 * 1024 * 1024;
const AMBIENT_DATABASE_KEYS = /^(?:DATABASE_URL|SUPABASE_DB_URL|PG[A-Z0-9_]+)$/u;

export function parseBuilderArgs(argv, repoRoot = process.cwd()) {
  const expectedFlags = ['--runs', '--baseline', '--publish-dir', '--capture-ledger', '--ledger'];
  if (!Array.isArray(argv) || argv.length !== 10
    || expectedFlags.some((flag, index) => argv[index * 2] !== flag)
    || argv.some((value) => typeof value !== 'string' || value.length === 0 || /[\0\r\n]/u.test(value))
    || argv[1] !== '2') throw new Error('builder CLI arguments invalid');
  const canonicalRoot = path.resolve(repoRoot);
  const values = {
    runs: 2,
    baselineDir: path.resolve(canonicalRoot, argv[3]),
    publishDir: path.resolve(canonicalRoot, argv[5]),
    captureLedgerPath: path.resolve(canonicalRoot, argv[7]),
    ledgerPath: path.resolve(canonicalRoot, argv[9]),
  };
  const expected = {
    baselineDir: path.join(canonicalRoot, 'supabase/baselines/v1'),
    publishDir: path.join(canonicalRoot, 'supabase/baselines/v1'),
    captureLedgerPath: path.join(canonicalRoot, 'docs/operations/baseline-ledger.json'),
    ledgerPath: path.join(canonicalRoot, 'docs/operations/expected-terminal-ledger.json'),
  };
  if (Object.keys(expected).some((key) => values[key] !== expected[key])) throw new Error('builder CLI path contract invalid');
  return values;
}

export function assertNoAmbientDatabaseEnv(environment = process.env) {
  const present = Object.keys(environment).filter((key) => AMBIENT_DATABASE_KEYS.test(key));
  if (present.length) throw new Error(`ambient database environment refused: ${present.sort()[0]}`);
}

export function parseLocalConnectionEnv(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error('local database connection invalid'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
    || url.port !== '54322' || url.pathname !== '/postgres' || url.search || url.hash
    || !url.username || !url.password) throw new Error('local loopback database connection refused');
  let username;
  let password;
  try { username = decodeURIComponent(url.username); password = decodeURIComponent(url.password); }
  catch { throw new Error('local database connection encoding invalid'); }
  if (!username || !password || /[\0\r\n]/u.test(`${username}${password}`)) throw new Error('local database connection credential invalid');
  return {
    PGHOST: '127.0.0.1', PGPORT: '54322', PGDATABASE: 'postgres', PGUSER: username, PGPASSWORD: password, PGSSLMODE: 'disable',
  };
}

async function extractLocalTerminalAndHistory({ databaseUrl, extractCatalogAdapter = extractCatalog, ClientClass } = {}) {
  const connectionEnv = parseLocalConnectionEnv(databaseUrl);
  const raw = await extractCatalogAdapter({ connectionEnv });
  const terminalBytes = Buffer.from(normalizeCatalog(raw));
  validateTerminal(terminalBytes);
  let EffectiveClient = ClientClass;
  if (!EffectiveClient) {
    const { default: pg } = await import('pg');
    EffectiveClient = pg.Client;
  }
  const client = new EffectiveClient({ connectionString: databaseUrl });
  let rows;
  let primaryError;
  try {
    await client.connect();
    ({ rows } = await client.query('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version'));
  } catch (error) { primaryError = error; }
  let closeError;
  try { await client.end(); } catch (error) { closeError = error; }
  if (primaryError || closeError) {
    terminalBytes.fill(0);
    if (primaryError && closeError) throw new AggregateError([primaryError, closeError], 'migration history query and close failed');
    throw primaryError ?? closeError;
  }
  const historyVersions = Array.isArray(rows) && rows.every((row) => row && Object.keys(row).join(',') === 'version'
    && typeof row.version === 'string' && /^\d{14}$/u.test(row.version)) ? rows.map(({ version }) => version) : null;
  if (!historyVersions || JSON.stringify(historyVersions) !== JSON.stringify(EXPECTED_HISTORY_VERSIONS)) {
    terminalBytes.fill(0);
    throw new Error('actual migration history mismatch');
  }
  return { terminalBytes, historyVersions };
}

async function replayExactMigrations({
  databaseUrl, pendingMigrationsDir, history, signal,
  ClientClass, commandRunner = runCommand,
} = {}) {
  const expectedHistory = [
    '00000000000001_baseline_v1.sql', ...POST_CUTOFF_MIGRATIONS.map(({ filename }) => filename),
  ];
  if (!Array.isArray(history) || JSON.stringify(history) !== JSON.stringify(expectedHistory)
    || typeof pendingMigrationsDir !== 'string' || !path.isAbsolute(pendingMigrationsDir)) {
    throw new Error('exact migration replay contract invalid');
  }
  parseLocalConnectionEnv(databaseUrl);
  const adminUrl = new URL(databaseUrl); adminUrl.username = 'supabase_admin';
  const adminConnection = adminUrl.toString();
  const connectionEnv = parseLocalConnectionEnv(adminConnection);
  let EffectiveClient = ClientClass;
  if (!EffectiveClient) {
    const { default: pg } = await import('pg'); EffectiveClient = pg.Client;
  }
  const useClient = async (operation) => {
    const client = new EffectiveClient({ connectionString: adminConnection });
    let value; let primaryError;
    try { await client.connect(); value = await operation(client); } catch (error) { primaryError = error; }
    let closeError;
    try { await client.end(); } catch (error) { closeError = error; }
    if (primaryError && closeError) throw new AggregateError([primaryError, closeError], 'migration replay query and close failed');
    if (primaryError || closeError) throw primaryError ?? closeError;
    return value;
  };
  const expectedSchema = [
    { column_name: 'version', data_type: 'text', udt_name: 'text', is_nullable: 'NO' },
    { column_name: 'statements', data_type: 'ARRAY', udt_name: '_text', is_nullable: 'YES' },
    { column_name: 'name', data_type: 'text', udt_name: 'text', is_nullable: 'YES' },
  ];
  await useClient(async (client) => {
    const schema = await client.query("SELECT column_name, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_schema='supabase_migrations' AND table_name='schema_migrations' ORDER BY ordinal_position");
    if (JSON.stringify(schema.rows) !== JSON.stringify(expectedSchema)) throw new Error('migration history schema invalid');
    const existing = await client.query('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version');
    if (JSON.stringify(existing.rows) !== JSON.stringify([{ version: '00000000000000' }])) throw new Error('bootstrap migration history invalid');
    const deleted = await client.query("DELETE FROM supabase_migrations.schema_migrations WHERE version = '00000000000000'");
    if (deleted.rowCount !== 1) throw new Error('bootstrap migration history delete invalid');
  });
  for (const name of history) {
    const file = path.join(pendingMigrationsDir, name);
    if (path.dirname(file) !== pendingMigrationsDir) throw new Error('migration replay path invalid');
    const result = await commandRunner('/usr/bin/psql', ['-X', '--set=ON_ERROR_STOP=1', '--quiet', '--file', file], {
      cwd: pendingMigrationsDir, env: connectionEnv, signal,
    });
    if (result.exitCode !== 0 || result.signal !== null) {
      const diagnostic = redactSupabaseOutput(result.stderr).slice(-4000).trim();
      throw new Error(diagnostic ? `exact migration replay failed: ${diagnostic}` : 'exact migration replay failed');
    }
    const version = name.slice(0, 14); const migrationName = name.slice(15, -4);
    await useClient((client) => client.query(
      'INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ($1, $2::text[], $3)',
      [version, [], migrationName],
    ));
  }
  const versions = await useClient(async (client) => {
    const { rows } = await client.query('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version');
    return rows.map(({ version }) => version);
  });
  if (JSON.stringify(versions) !== JSON.stringify(EXPECTED_HISTORY_VERSIONS)) throw new Error('exact migration replay history mismatch');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(stable(value))}\n`);
}

function parseJson(bytes, label) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 4 * 1024 * 1024 || bytes.includes(0) || bytes.includes(13)) {
    throw new Error(`${label} bytes invalid`);
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch (error) { throw new Error(`${label} JSON invalid`, { cause: error }); }
}

function validateTerminal(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_TERMINAL_BYTES || bytes.includes(0) || bytes.includes(13)) {
    throw new Error('terminal catalog bytes invalid');
  }
  const parsed = parseJson(bytes, 'terminal catalog');
  validateNormalizedCatalog(parsed);
  const canonical = Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`);
  try {
    if (!bytes.equals(canonical)) throw new Error('terminal catalog canonical framing invalid');
  } finally { canonical.fill(0); }
}

function validateCaptureBinding(captureManifestBytes, captureLedgerBytes) {
  const manifest = validateCaptureManifest(parseJson(captureManifestBytes, 'capture manifest'));
  const ledger = validateCaptureLedger(parseJson(captureLedgerBytes, 'capture ledger'));
  const manifestDigest = sha256(captureManifestBytes);
  if (ledger.transactionId !== manifest.transactionId || ledger.captureManifestSha256 !== manifestDigest
    || JSON.stringify(ledger.payloadDigests) !== JSON.stringify(manifest.payloadDigests)) {
    throw new Error('capture transaction binding invalid');
  }
  return { manifest, ledger, manifestDigest };
}

export function prepareExpectedTerminalArtifacts({ terminalRuns, captureManifestBytes, captureLedgerBytes }) {
  if (!Array.isArray(terminalRuns) || terminalRuns.length !== 2 || !terminalRuns.every(Buffer.isBuffer)) {
    throw new Error('expected terminal requires exactly two runs');
  }
  if (!terminalRuns[0].equals(terminalRuns[1])) throw new Error('terminal runs are not byte-identical deterministic output');
  validateTerminal(terminalRuns[0]);
  const capture = validateCaptureBinding(captureManifestBytes, captureLedgerBytes);
  const terminalBytes = Buffer.from(terminalRuns[0]);
  const digestBytes = Buffer.from(`${sha256(terminalBytes)}  ${EXPECTED_TERMINAL_PAYLOAD_PATHS[0]}\n`);
  const payloads = new Map([
    [EXPECTED_TERMINAL_PAYLOAD_PATHS[0], terminalBytes],
    [EXPECTED_TERMINAL_PAYLOAD_PATHS[1], digestBytes],
  ]);
  const payloadDigests = Object.fromEntries([...payloads].map(([name, bytes]) => [name, sha256(bytes)]));
  const core = {
    schemaVersion: 1,
    kind: 'midao-expected-terminal-manifest',
    captureTransactionId: capture.manifest.transactionId,
    captureManifestSha256: capture.manifestDigest,
    historyVersions: [...EXPECTED_HISTORY_VERSIONS],
    postCutoffMigrations: POST_CUTOFF_MIGRATIONS.map((entry) => ({ ...entry })),
    payloadDigests,
  };
  const transactionId = sha256(canonicalBytes(core));
  const manifestBytes = canonicalBytes({ ...core, transactionId });
  const ledgerBytes = canonicalBytes({
    schemaVersion: 1,
    kind: 'midao-expected-terminal-ledger',
    transactionId,
    manifestSha256: sha256(manifestBytes),
    captureTransactionId: capture.manifest.transactionId,
    captureManifestSha256: capture.manifestDigest,
    payloadDigests,
  });
  let disposed = false;
  return {
    payloads,
    manifestBytes,
    ledgerBytes,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const bytes of payloads.values()) bytes.fill(0);
      payloads.clear();
      manifestBytes.fill(0);
      ledgerBytes.fill(0);
    },
  };
}

export function validateExpectedTerminalPublicationSemantics(prepared, captureLedgerBytes) {
  if (!(prepared?.payloads instanceof Map) || !Buffer.isBuffer(prepared.manifestBytes) || !Buffer.isBuffer(prepared.ledgerBytes)) {
    throw new Error('expected-terminal prepared semantic input invalid');
  }
  const manifest = parseJson(prepared.manifestBytes, 'expected-terminal manifest');
  const ledger = parseJson(prepared.ledgerBytes, 'expected-terminal ledger');
  const captureLedger = validateCaptureLedger(parseJson(captureLedgerBytes, 'capture ledger'));
  if (manifest.kind !== 'midao-expected-terminal-manifest' || ledger.kind !== 'midao-expected-terminal-ledger'
    || manifest.transactionId !== ledger.transactionId
    || manifest.captureTransactionId !== captureLedger.transactionId
    || ledger.captureTransactionId !== captureLedger.transactionId
    || manifest.captureManifestSha256 !== captureLedger.captureManifestSha256
    || ledger.captureManifestSha256 !== captureLedger.captureManifestSha256
    || JSON.stringify(manifest.historyVersions) !== JSON.stringify(EXPECTED_HISTORY_VERSIONS)
    || JSON.stringify(manifest.postCutoffMigrations) !== JSON.stringify(POST_CUTOFF_MIGRATIONS)) {
    throw new Error('expected-terminal capture transaction reference or history invalid');
  }
  return true;
}

async function buildWithAdapters(options = {}) {
  if (options.runs !== 2 || typeof options.verifyCapture !== 'function') throw new Error('builder adapter contract invalid');
  const verified = await options.verifyCapture({ onPayloadOpen: options.onCapturePayloadRead ?? (() => {}) });
  if (!verified || verified.transactionId !== verified.manifest?.transactionId
    || verified.ledger?.transactionId !== verified.transactionId
    || typeof verified.dispose !== 'function') {
    verified?.dispose?.();
    throw new Error('verified capture capability invalid');
  }
  const captureManifestBytes = Buffer.from(`${JSON.stringify(verified.manifest)}\n`);
  const captureLedgerBytes = Buffer.from(`${JSON.stringify(verified.ledger)}\n`);
  const terminals = [];
  try {
    for (let run = 0; run < options.runs; run += 1) {
      const materialized = await options.materialize({ verified, run });
      let extracted;
      let primaryError;
      try {
        const local = await options.runLocal({ materialized, run });
        extracted = await options.extractTerminal({ local, materialized, run });
        if (!Buffer.isBuffer(extracted?.terminalBytes)
          || JSON.stringify(extracted.historyVersions) !== JSON.stringify(EXPECTED_HISTORY_VERSIONS)) {
          throw new Error('terminal extractor or actual migration history invalid');
        }
      } catch (error) { primaryError = error; }
      let cleanupError;
      try { await materialized?.cleanup?.(); } catch (error) { cleanupError = error; }
      if (primaryError || cleanupError) {
        extracted?.terminalBytes?.fill(0);
        if (primaryError && cleanupError) throw new AggregateError([primaryError, cleanupError], 'local build and materializer cleanup failed');
        throw primaryError ?? cleanupError;
      }
      terminals.push(extracted.terminalBytes);
    }
    return prepareExpectedTerminalArtifacts({ terminalRuns: terminals, captureManifestBytes, captureLedgerBytes });
  } finally {
    verified.dispose();
    captureManifestBytes.fill(0);
    captureLedgerBytes.fill(0);
    for (const bytes of terminals) bytes.fill(0);
  }
}

export async function buildExpectedTerminalPrepared({
  runs, baselineDir, publishDir, captureLedgerPath, ledgerPath,
  repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), signal,
} = {}) {
  const canonicalRoot = path.resolve(repoRoot);
  const expected = parseBuilderArgs([
    '--runs', String(runs), '--baseline', path.relative(canonicalRoot, baselineDir ?? ''),
    '--publish-dir', path.relative(canonicalRoot, publishDir ?? ''),
    '--capture-ledger', path.relative(canonicalRoot, captureLedgerPath ?? ''),
    '--ledger', path.relative(canonicalRoot, ledgerPath ?? ''),
  ], canonicalRoot);
  if (process.versions.node !== '22.23.1') throw new Error('NODE_TOOLCHAIN_MISMATCH');
  assertNoAmbientDatabaseEnv();
  const pin = parseSupabasePin(await readFile(path.join(canonicalRoot, 'package-lock.json'), 'utf8'));
  if (pin !== '2.87.2') throw new Error('SUPABASE_PIN_MISMATCH');
  await verifyPinnedSupabaseBinary();
  const projectId = canonicalProjectId(canonicalRoot);
  const stat = await readFile(`/proc/${process.pid}/stat`, 'utf8');
  const close = stat.lastIndexOf(')');
  const metadata = { pid: process.pid, processStartTicks: stat.slice(close + 2).split(/\s+/u)[19], repoRoot: canonicalRoot, task: 'expected-terminal' };
  let lock;
  let bridge;
  let prepared;
  let primaryError;
  try {
    lock = await acquireKernelRunnerLock({ lockDir: LOCK_PATH, metadata });
    const gateway = parseDockerHostGateway(
      await readFile('/proc/net/route', 'utf8'),
      await readFile('/proc/1/cgroup', 'utf8'),
    );
    if (gateway) bridge = await startLoopbackBridge({ listenPort: 54322, targetHost: gateway, targetPort: 54322 });
    const journalPath = resolveRepositoryPublicationPaths().journalPath;
    prepared = await buildWithAdapters({
      runs: expected.runs,
      verifyCapture: () => verifyCaptureTransaction({
        baselineDir: expected.baselineDir, ledgerPath: expected.captureLedgerPath, journalPath,
      }),
      materialize: async ({ run }) => {
        const runParent = path.join(LOCK_PATH, `expected-terminal-run-${run}`);
        await mkdir(runParent, { mode: 0o700 });
        const parentIdentity = await lstat(runParent);
        let materialized;
        try { materialized = await materializeFreshWorkdir({ outputParent: runParent, projectId }); }
        catch (primary) {
          try { await rmdir(runParent); } catch (cleanup) {
            throw new AggregateError([primary, cleanup], 'materializer creation and run parent cleanup failed');
          }
          throw primary;
        }
        return {
          ...materialized,
          async cleanup() {
            let materializerError;
            try { await materialized.cleanup(); } catch (error) { materializerError = error; }
            let parentError;
            try {
              const current = await lstat(runParent);
              if (!sameIdentity(current, parentIdentity) || !current.isDirectory()) throw new Error('run parent identity changed');
              await rmdir(runParent);
            } catch (error) { parentError = error; }
            if (materializerError && parentError) throw new AggregateError([materializerError, parentError], 'materialized cleanup failed');
            if (materializerError || parentError) throw materializerError ?? parentError;
          },
        };
      },
      runLocal: async ({ materialized }) => {
        const replay = await materialized.stageCliReplay();
        let local; let primaryError;
        try {
          local = await runWithLocalSupabase({
            adapter: createActualAdapter({
              repoRoot: canonicalRoot, pin, nodeBin: process.execPath, signal,
              cliWorkdir: materialized.workdir,
              lifecycleContract: {
                migrationNames: [replay.bootstrapName],
                noticesByMigration: {},
              },
            }),
            expectedProjectId: projectId,
            initialize: 'start-only',
            onReady: async ({ localEnv }) => {
              await replayExactMigrations({
                databaseUrl: localEnv.DATABASE_URL,
                pendingMigrationsDir: replay.pendingMigrationsDir,
                history: materialized.history,
                signal,
              });
              return extractLocalTerminalAndHistory({ databaseUrl: localEnv.DATABASE_URL });
            },
            signal,
          });
        } catch (error) { primaryError = error; }
        const cleanupErrors = [];
        try { await replay.restore(); } catch (error) { cleanupErrors.push(error); }
        if (cleanupErrors.length === 0) {
          try { await materialized.cleanupCliMetadata(); } catch (error) { cleanupErrors.push(error); }
        }
        const errors = [primaryError, ...cleanupErrors].filter(Boolean);
        if (errors.length > 1) throw new AggregateError(errors, 'local replay and materialized restoration failed');
        if (errors.length === 1) throw errors[0];
        return local;
      },
      extractTerminal: async ({ local }) => local.value,
    });
  } catch (error) { primaryError = error; }
  const cleanupErrors = [];
  if (bridge) { try { await bridge.close(); } catch (error) { cleanupErrors.push(error); } }
  if (lock) { try { await releaseKernelRunnerLock(lock); } catch (error) { cleanupErrors.push(error); } }
  if (primaryError || cleanupErrors.length) {
    prepared?.dispose?.();
    const errors = [primaryError, ...cleanupErrors].filter(Boolean);
    if (errors.length > 1) throw new AggregateError(errors, 'expected-terminal local build and cleanup failed');
    throw errors[0];
  }
  return prepared;
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.uid === right.uid && left.nlink === right.nlink;
}

export const __internal = Object.freeze({ buildWithAdapters, extractLocalTerminalAndHistory, replayExactMigrations });

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const options = parseBuilderArgs(process.argv.slice(2), repoRoot);
  const controller = new AbortController();
  const abort = () => controller.abort(new Error('EXPECTED_TERMINAL_SIGNALLED'));
  process.on('SIGTERM', abort);
  process.on('SIGINT', abort);
  let prepared;
  try {
    prepared = await buildExpectedTerminalPrepared({ ...options, repoRoot, signal: controller.signal });
    const result = await publishExpectedTerminalTransaction({ prepared });
    process.stdout.write(`${JSON.stringify({ transactionId: result.transactionId, runs: 2, published: true })}\n`);
  } finally {
    prepared?.dispose();
    process.removeListener('SIGTERM', abort);
    process.removeListener('SIGINT', abort);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${redactSupabaseOutput(error instanceof Error ? error.stack || error.message : String(error))}\n`);
    process.exitCode = 1;
  });
}
