#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, rmdir, unlink,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateExpectedTerminalManifest, verifyCaptureTransaction } from './verify-manifest.mjs';
import { resolveRepositoryPublicationPaths } from './publish-baseline.mjs';

export const SYNTHETIC_BASELINE_FILENAME = '00000000000001_baseline_v1.sql';
export const SYNTHETIC_BASELINE_PREFIX = '-- MIDAO BASELINE V1: BASELINE BEGIN --\n';
export const BASELINE_OVERLAY_BOUNDARY = '\n-- MIDAO BASELINE V1: BASELINE END --\n-- MIDAO BASELINE V1: MANAGED OVERLAYS BEGIN --\n';
export const SYNTHETIC_BASELINE_FOOTER = '\n-- MIDAO BASELINE V1: MANAGED OVERLAYS END --\n';

export const POST_CUTOFF_MIGRATIONS = Object.freeze([
  Object.freeze({ filename: '20260723000000_midao_backend_mode.sql', sha256: 'fe108aa5ca68f135f49e22cbb5074941ce8ff5464a6d91a56f9f4cbdae437b17' }),
  Object.freeze({ filename: '20260723001000_midao_notification_outbox.sql', sha256: '6babce9053d6a3f7658276c9cfbbfc5ec0f10ffaeadf4fa07ed904b5f5c66569' }),
  Object.freeze({ filename: '20260723002000_midao_idempotency_records.sql', sha256: '051719cce046ce438668b9424a707b709f5bc1c254a537a525f07261b1a8d7db' }),
  Object.freeze({ filename: '20260723002500_midao_audit_events.sql', sha256: '62fa29d6d4d8fe119867ef05e69eba465f52b5cfa2ca96bddd83e93da9b9bcca' }),
  Object.freeze({ filename: '20260723003000_midao_atomic_backend_mode_switch.sql', sha256: 'c59afc5ee72da4d76ae77fb984db4b34d8f160198544ba233d0fb9f2190c90e5' }),
  Object.freeze({ filename: '20260723003500_midao_service_role_acl_hardening.sql', sha256: 'f16fd369b9ce0b405c38ec2df5a46676cc84ba2de087b3b010cc00e4415353e5' }),
  Object.freeze({ filename: '20260723004000_midao_request_read_projection.sql', sha256: '639f430e666666c2ee9418f8dd2240d0d2c1b1038345378bee11436fc99aeabb' }),
  Object.freeze({ filename: '20260723010000_midao_atomic_booking_approval.sql', sha256: 'a97d57a82bf2e70425325498b0ca96bdf64c1c3322cf81288135a71abaebc968' }),
  Object.freeze({ filename: '20260723011000_midao_atomic_booking_decision_command.sql', sha256: 'c3abc1a6cc5984bcc5239c9728ebd8d46020c43fa577382f87d2775cfb5fdf8a' }),
  Object.freeze({ filename: '20260723020000_midao_service_drafts_and_questions.sql', sha256: '38e1cd3177d459f5bae1f77366878ef809f8b6e22f323b79a7e82ddf8a410042' }),
  Object.freeze({ filename: '20260723021000_midao_service_publication_versions.sql', sha256: '0d9d5b0acb56d657fbacc638622bc36faa35b682b7d2727db80aa63cb872bda6' }),
  Object.freeze({ filename: '20260723022000_midao_atomic_service_publication.sql', sha256: 'b7b06f0029052c2187401e2b7b160545ab757099fee8ba088bc98c9743e9029c' }),
  Object.freeze({ filename: '20260723023000_midao_atomic_publication_restore.sql', sha256: 'feb4e8db59acbb1703b56ee81417026bc077b0bed12669811c52ac98db832421' }),
  Object.freeze({ filename: '20260729160000_issue1777_atomic_settlement_and_payout_confirm.sql', sha256: 'e916be151520837e7d4e2c8fd3575dc11377ffcee88ed6bbd0f7149f18a3208c' }),
  Object.freeze({ filename: '20260729170000_issue1777_refund_adjustment_ledger.sql', sha256: 'af3e498e2acd6dd0410182fd8aef60d098315df79d4d39cfbf246256840849b6' }),
  Object.freeze({ filename: '20260729180000_issue1777_revoke_atomic_fns_from_anon.sql', sha256: 'a4294771928c98a5b071168db76c8f8301bd4db933e0fb214c1bae891476be24' }),
  Object.freeze({ filename: '20260729190000_issue1777_post_review_fixes.sql', sha256: '0819ea2d54f0759ed35a995e2e4d8488e072cf22c8d2857aa7604ec6acd3668a' }),
  Object.freeze({ filename: '20260730093000_issue1777_refund_delta_accumulation.sql', sha256: '7d96dc7146424de74354fbde2af3f768e0877513e83065b601adb9120578ddd0' }),
  Object.freeze({ filename: '20260804103000_issue1777_atomic_refund_reversal.sql', sha256: '4b77a1dae78b79a43a117fa727f891b152df370653dd31dce6deee8642ab74cc' }),
  Object.freeze({ filename: '20260804113000_issue1777_settlement_recompute_amounts.sql', sha256: 'a09d73cf64af5437db45a3bc2c62af07f02c76e5724f5dcf5d4cca32ebd32331' }),
  Object.freeze({ filename: '20260806090000_midao_inquiries.sql', sha256: '2d7a2467540991d0a5faf33243ab06ca19d205f233f959fb76a8a07073638a70' }),
  Object.freeze({ filename: '20260806091000_midao_booking_intake_pricing_and_confirmation.sql', sha256: 'bf8cd71196adcb6a915455d67679c2642eee8dde123c11bf6f4405b067e27e85' }),
  Object.freeze({ filename: '20260806120000_midao_atomic_inquiry_conversion.sql', sha256: '33e9d312bc8079c1414e4900b995dbb0f1ef02384394ed27b128c2c53b8356e3' }),
  Object.freeze({ filename: '20260810033421_issue1811_atomic_booking_order_materialization.sql', sha256: '4fb09d6863a992c089be849198e13f85537a06f586797cb1ec159a8503372d5c' }),
  Object.freeze({ filename: '20260812150000_issue1812_addon_atomic_materialization.sql', sha256: '4f46c444e3b5bfda3e459c90d658538ffd5058d2d6d016daeaeb299a5a106d24' }),
  Object.freeze({ filename: '20260812160000_issue1813_points_atomic_materialization.sql', sha256: 'c104e62a04fb4ecc04962515f82e0ccc6006aa2f116082141231d27eec0acfa5' }),
  Object.freeze({ filename: '20260812213000_issue1814_checkout_idempotency_atomic.sql', sha256: 'd410646ca1064a52a5b2b5809045d4220283b33f441dbfc904da246c49692a83' }),
]);

export const CONFIG_SHA256 = '5289984d402959cd0d4596b056df9a3d27590b3abefa4d7551151ad54ae084ee';
export const SEED_SHA256 = 'b603bc6f0c92b7cdd8da382adfbdaa28a26431dc6ff687ea51f06fa53810c8a5';

const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_POST_CUTOFF_ENTRIES = 256;
const MAX_POST_CUTOFF_BYTES = 64 * 1024 * 1024;
const MIGRATION_NAME = /^(\d{14})_[a-z0-9][a-z0-9_]*\.sql$/u;
const DIGEST = /^[0-9a-f]{64}$/u;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function resolveJournalForRepository(repoRoot) {
  const output = execFileSync('/usr/bin/git', ['rev-parse', '--git-common-dir'], {
    cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000,
  });
  const common = output.trim();
  if (!common || common.includes('\0') || common.includes('\n')) throw new Error('repository journal namespace invalid');
  return path.resolve(repoRoot, common, 'midao-baseline-publication.journal.json');
}

function sameObjectIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.uid === right.uid && left.nlink === right.nlink;
}

function sameDirectoryObjectIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.uid === right.uid;
}

function sameIdentity(left, right) {
  return sameObjectIdentity(left, right) && left.mode === right.mode;
}

function assertOwnedRegular(identity, label) {
  if (!identity.isFile()) throw new Error(`${label} is not a regular file or is a symbolic link`);
  if (identity.uid !== process.getuid()) throw new Error(`${label} owner identity invalid`);
  if (identity.nlink !== 1) throw new Error(`${label} hardlink/link count identity invalid`);
  if ((identity.mode & 0o022) !== 0) throw new Error(`${label} writable mode identity invalid`);
  if (identity.size > MAX_SOURCE_BYTES) throw new Error(`${label} exceeds source byte bound`);
}

function assertOwnedDirectory(identity, label) {
  if (!identity.isDirectory()) throw new Error(`${label} is not an owned directory or is a symbolic link`);
  if (identity.uid !== process.getuid() || (identity.mode & 0o022) !== 0) {
    throw new Error(`${label} directory identity invalid`);
  }
}

async function readIdentityBound(filePath, label, onOpen, afterOpen) {
  const before = await lstat(filePath);
  assertOwnedRegular(before, label);
  let handle;
  let bytes;
  let primaryError;
  try {
    handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat();
    assertOwnedRegular(opened, label);
    if (!sameIdentity(before, opened)) throw new Error(`${label} identity changed before open`);
    onOpen?.(filePath);
    await afterOpen?.(filePath);
    bytes = await readFile(handle);
    const afterFd = await handle.stat();
    const afterPath = await lstat(filePath);
    if (!sameIdentity(opened, afterFd) || !sameIdentity(opened, afterPath) || afterFd.size !== bytes.length) {
      throw new Error(`${label} identity changed during read`);
    }
  } catch (error) {
    primaryError = error;
  }
  let closeError;
  try { await handle?.close(); } catch (error) { closeError = error; }
  if (primaryError || closeError) {
    bytes?.fill(0);
    if (primaryError && closeError) throw new AggregateError([primaryError, closeError], `${label} read and close failed`);
    throw primaryError ?? closeError;
  }
  return bytes;
}

function validateEntries(entries) {
  if (!Array.isArray(entries) || entries.length < POST_CUTOFF_MIGRATIONS.length || entries.length > MAX_POST_CUTOFF_ENTRIES) {
    throw new Error('post-cutoff manifest is incomplete');
  }
  const normalized = entries.map((entry, index) => {
    if (!entry || Object.keys(entry).sort().join(',') !== 'filename,sha256'
      || typeof entry.filename !== 'string' || typeof entry.sha256 !== 'string') {
      throw new Error(`post-cutoff manifest entry invalid: ${index}`);
    }
    const match = MIGRATION_NAME.exec(entry.filename);
    if (!match || entry.filename.includes('rollback')) throw new Error(`rollback or invalid post-cutoff migration: ${entry.filename}`);
    if (!DIGEST.test(entry.sha256)) throw new Error(`post-cutoff digest invalid: ${entry.filename}`);
    return { filename: entry.filename, sha256: entry.sha256, version: match[1] };
  });
  const names = normalized.map(({ filename }) => filename);
  const versions = normalized.map(({ version }) => version);
  if (new Set(names).size !== names.length) throw new Error('post-cutoff manifest duplicate filename');
  if (new Set(versions).size !== versions.length) throw new Error('post-cutoff manifest duplicate version');
  if (names.some((name, index) => index > 0 && name <= names[index - 1])) throw new Error('post-cutoff manifest order invalid');
  for (const [index, required] of POST_CUTOFF_MIGRATIONS.entries()) {
    if (normalized[index].filename !== required.filename || normalized[index].sha256 !== required.sha256) {
      throw new Error(`required post-cutoff migration mismatch: ${index}`);
    }
  }
  const lastRequired = POST_CUTOFF_MIGRATIONS.at(-1).filename;
  for (const entry of normalized.slice(POST_CUTOFF_MIGRATIONS.length)) {
    if (entry.filename <= lastRequired) throw new Error(`future post-cutoff migration order invalid: ${entry.filename}`);
  }
  return normalized;
}

async function selectPostCutoffSources({ migrationsDir, entries = POST_CUTOFF_MIGRATIONS, onOpen, afterOpen } = {}) {
  if (typeof migrationsDir !== 'string' || !path.isAbsolute(migrationsDir)) throw new Error('migrationsDir must be absolute');
  const directoryIdentity = await lstat(migrationsDir);
  assertOwnedDirectory(directoryIdentity, 'migration source');
  const selected = [];
  let totalBytes = 0;
  try {
    for (const entry of validateEntries(entries)) {
      const bytes = await readIdentityBound(path.join(migrationsDir, entry.filename), `migration ${entry.filename}`, onOpen, afterOpen);
      if (sha256(bytes) !== entry.sha256) {
        bytes.fill(0);
        throw new Error(`post-cutoff digest mismatch: ${entry.filename}`);
      }
      totalBytes += bytes.length;
      if (totalBytes > MAX_POST_CUTOFF_BYTES) {
        bytes.fill(0);
        throw new Error('post-cutoff aggregate byte bound exceeded');
      }
      selected.push({ filename: entry.filename, sha256: entry.sha256, bytes });
    }
    const directoryAfter = await lstat(migrationsDir);
    if (!sameIdentity(directoryIdentity, directoryAfter)) throw new Error('migration source directory identity changed');
    return selected;
  } catch (error) {
    for (const entry of selected) entry.bytes.fill(0);
    throw error;
  }
}

async function writeExclusive(filePath, bytes) {
  const handle = await open(filePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    await handle.chmod(0o600);
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const identity = await lstat(filePath);
  if ((identity.mode & 0o777) !== 0o600) throw new Error('materialized output mode invalid');
  const readBack = await readIdentityBound(filePath, 'materialized output');
  try {
    if (readBack.length !== bytes.length || sha256(readBack) !== sha256(bytes)) throw new Error('materialized output digest mismatch');
  } finally {
    readBack.fill(0);
  }
}

async function enforceDirectoryMode(directory) {
  await chmod(directory, 0o700);
  const identity = await lstat(directory);
  assertOwnedDirectory(identity, 'materialized directory');
  if ((identity.mode & 0o777) !== 0o700) throw new Error('materialized directory mode invalid');
  return identity;
}

async function syncDirectory(directory) {
  const handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await handle.sync(); } finally { await handle.close(); }
}

function databaseOnlyConfig(source) {
  if (!Buffer.isBuffer(source) || source.includes(0) || source.includes(13)) throw new Error('Supabase config framing invalid');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(source); }
  catch (error) { throw new Error('Supabase config encoding invalid', { cause: error }); }
  const lines = text.split('\n');
  for (const section of ['storage', 'auth', 'realtime', 'db.seed']) {
    const marker = `[${section}]`;
    const matches = lines.map((line, index) => line.trim() === marker ? index : -1).filter((index) => index >= 0);
    if (matches.length > 1) throw new Error(`Supabase config section duplicate: ${section}`);
    if (matches.length === 0) {
      const insertAt = lines.at(-1) === '' ? lines.length - 1 : lines.length;
      lines.splice(insertAt, 0, ...(insertAt > 0 && lines[insertAt - 1] !== '' ? [''] : []), marker, 'enabled = false');
      continue;
    }
    const start = matches[0];
    let end = lines.findIndex((line, index) => index > start && /^\s*\[/u.test(line));
    if (end < 0) end = lines.length;
    const enabled = lines.map((line, index) => index > start && index < end && /^\s*enabled\s*=/u.test(line) ? index : -1)
      .filter((index) => index >= 0);
    if (enabled.length > 1 || enabled.some((index) => !/^\s*enabled\s*=\s*(?:true|false)\s*$/u.test(lines[index]))) {
      throw new Error(`Supabase config enabled value invalid: ${section}`);
    }
    if (enabled.length === 0) lines.splice(start + 1, 0, 'enabled = false');
    else lines[enabled[0]] = 'enabled = false';
  }
  return Buffer.from(lines.join('\n'));
}

async function assertExactNames(directory, expected, label) {
  const actual = (await readdir(directory)).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) throw new Error(`cleanup HOLD: ${label} inventory changed`);
}

async function removeCliMetadata(workdir) {
  const supabase = path.join(workdir, 'supabase');
  const specifications = [
    ['.temp', 'cli-latest', (value) => /^v\d{1,4}\.\d{1,4}\.\d{1,4}$/u.test(value)],
    ['.branches', '_current_branch', (value) => value === 'main'],
  ];
  const allowed = ['config.toml', 'migrations', 'seed.sql', ...specifications.map(([directory]) => directory)];
  const inventory = await readdir(supabase);
  if (inventory.some((name) => !allowed.includes(name))) throw new Error('cleanup HOLD: supabase CLI metadata inventory changed');
  for (const [directoryName, fileName, validate] of specifications) {
    const directory = path.join(supabase, directoryName);
    let identity;
    try { identity = await lstat(directory); } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    assertOwnedDirectory(identity, `Supabase CLI metadata ${directoryName}`);
    await assertExactNames(directory, [fileName], `Supabase CLI metadata ${directoryName}`);
    const file = path.join(directory, fileName);
    const bytes = await readIdentityBound(file, `Supabase CLI metadata ${fileName}`);
    try {
      if (!validate(bytes.toString('utf8'))) throw new Error(`Supabase CLI metadata ${fileName} content invalid`);
    } finally { bytes.fill(0); }
    const current = await lstat(directory);
    if (!sameIdentity(current, identity)) throw new Error(`Supabase CLI metadata ${directoryName} identity changed`);
    await unlink(file);
    await rmdir(directory);
  }
  await assertExactNames(supabase, ['config.toml', 'migrations', 'seed.sql'], 'supabase after CLI metadata cleanup');
}

async function removeOwnedWorkdir(workdir, identity, expectedMigrationNames) {
  let current;
  try { current = await lstat(workdir); } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  if (!current.isDirectory() || !sameDirectoryObjectIdentity(current, identity)) {
    throw new Error('materialized workdir identity replaced by foreign pathname');
  }
  if (expectedMigrationNames) {
    const supabase = path.join(workdir, 'supabase');
    await assertExactNames(workdir, ['supabase'], 'workdir');
    await assertExactNames(supabase, ['config.toml', 'migrations', 'seed.sql'], 'supabase');
    await assertExactNames(path.join(supabase, 'migrations'), expectedMigrationNames, 'migrations');
  }
  await rm(workdir, { recursive: true });
}

async function materializeWithPaths(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
  const baselineDir = path.resolve(options.baselineDir ?? path.join(repoRoot, 'supabase/baselines/v1'));
  const ledgerPath = path.resolve(options.ledgerPath ?? path.join(repoRoot, 'docs/operations/baseline-ledger.json'));
  const migrationsDir = path.resolve(options.migrationsDir ?? path.join(repoRoot, 'supabase/migrations'));
  const seedSource = path.resolve(options.seedSource ?? path.join(repoRoot, 'supabase/seed.sql'));
  const configSource = path.resolve(options.configSource ?? path.join(repoRoot, 'supabase/config.toml'));
  const outputParent = path.resolve(options.outputParent ?? path.join(repoRoot, '.hermes/tmp'));
  const projectId = options.projectId;
  if (projectId !== undefined && (typeof projectId !== 'string' || !/^[a-z0-9_-]{1,64}$/u.test(projectId))) {
    throw new Error('materializer projectId invalid');
  }
  const journalPath = path.resolve(options.journalPath ?? resolveRepositoryPublicationPaths().journalPath);
  const entries = options.entries ?? POST_CUTOFF_MIGRATIONS;

  const verified = await verifyCaptureTransaction({ baselineDir, ledgerPath, journalPath });
  let workdir;
  let workdirIdentity;
  let selected = [];
  let seed;
  let config;
  let runtimeConfig;
  let marker;
  let baseline;
  let overlay;
  try {
    options.onPayloadRead?.('baseline.sql');
    baseline = verified.payloads.get('baseline.sql');
    options.onPayloadRead?.('managed-overlays.sql');
    overlay = verified.payloads.get('managed-overlays.sql');
    if (!Buffer.isBuffer(baseline) || !Buffer.isBuffer(overlay)) throw new Error('verified SQL payloads unavailable');

    selected = await selectPostCutoffSources({
      migrationsDir, entries, onOpen: options.onSourceOpen, afterOpen: options.afterSourceOpen,
    });
    config = await readIdentityBound(configSource, 'Supabase config source', options.onSourceOpen, options.afterSourceOpen);
    seed = await readIdentityBound(seedSource, 'seed source', options.onSourceOpen, options.afterSourceOpen);
    if (sha256(config) !== CONFIG_SHA256 || sha256(seed) !== SEED_SHA256) throw new Error('config or seed digest mismatch');
    runtimeConfig = databaseOnlyConfig(config);
    marker = Buffer.concat([
      Buffer.from(SYNTHETIC_BASELINE_PREFIX), baseline,
      Buffer.from(BASELINE_OVERLAY_BOUNDARY), overlay, Buffer.from(SYNTHETIC_BASELINE_FOOTER),
    ]);

    const parentStat = await lstat(outputParent);
    if (!parentStat.isDirectory() || parentStat.uid !== process.getuid() || (parentStat.mode & 0o077) !== 0) {
      throw new Error('materializer output parent identity invalid');
    }
    if (projectId) {
      workdir = path.join(outputParent, projectId);
      await mkdir(workdir, { mode: 0o700 });
    } else {
      workdir = await mkdtemp(path.join(outputParent, 'midao-fresh-'));
    }
    workdirIdentity = await lstat(workdir);
    await enforceDirectoryMode(workdir);
    await mkdir(path.join(workdir, 'supabase'), { mode: 0o700 });
    await enforceDirectoryMode(path.join(workdir, 'supabase'));
    const outputMigrations = path.join(workdir, 'supabase/migrations');
    await mkdir(outputMigrations, { mode: 0o700 });
    await enforceDirectoryMode(outputMigrations);

    await writeExclusive(path.join(outputMigrations, SYNTHETIC_BASELINE_FILENAME), marker);
    for (const entry of selected) await writeExclusive(path.join(outputMigrations, entry.filename), entry.bytes);
    const configPath = path.join(workdir, 'supabase/config.toml');
    await writeExclusive(configPath, runtimeConfig);
    const seedPath = path.join(workdir, 'supabase/seed.sql');
    await writeExclusive(seedPath, seed);
    await syncDirectory(outputMigrations);
    await syncDirectory(path.join(workdir, 'supabase'));
    await syncDirectory(workdir);
    await syncDirectory(outputParent);

    const expectedNames = [SYNTHETIC_BASELINE_FILENAME, ...selected.map(({ filename }) => filename)].sort();
    const actualNames = (await readdir(outputMigrations)).sort();
    if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) throw new Error('materialized migration inventory mismatch');

    let cleaned = false;
    let replayActive = false;
    const bootstrapName = '00000000000000_midao_history_bootstrap.sql';
    const pendingMigrationsDir = `${outputMigrations}.midao-pending`;
    const migrationsIdentity = await lstat(outputMigrations);
    return {
      workdir,
      migrationsDir: outputMigrations,
      configPath,
      seedPath,
      transactionId: verified.transactionId,
      history: [SYNTHETIC_BASELINE_FILENAME, ...selected.map(({ filename }) => filename)],
      historyVersions: [SYNTHETIC_BASELINE_FILENAME.slice(0, 14), ...selected.map(({ filename }) => filename.slice(0, 14))],
      async stageCliReplay() {
        if (cleaned || replayActive) throw new Error('materialized replay staging state invalid');
        await assertExactNames(outputMigrations, expectedNames, 'migrations before replay staging');
        try { await lstat(pendingMigrationsDir); throw new Error('materialized replay pending path exists'); }
        catch (error) { if (error?.code !== 'ENOENT') throw error; }
        await rename(outputMigrations, pendingMigrationsDir);
        const pendingIdentity = await lstat(pendingMigrationsDir);
        if (!sameIdentity(pendingIdentity, migrationsIdentity)) throw new Error('materialized replay pending identity changed');
        await mkdir(outputMigrations, { mode: 0o700 });
        const bootstrapIdentity = await enforceDirectoryMode(outputMigrations);
        const bootstrapBytes = Buffer.from('SELECT 1;\n');
        try { await writeExclusive(path.join(outputMigrations, bootstrapName), bootstrapBytes); }
        finally { bootstrapBytes.fill(0); }
        await syncDirectory(outputMigrations);
        await syncDirectory(path.dirname(outputMigrations));
        replayActive = true;
        let restored = false;
        return {
          pendingMigrationsDir,
          bootstrapName,
          async restore() {
            if (restored || !replayActive) throw new Error('materialized replay restore state invalid');
            const currentBootstrap = await lstat(outputMigrations);
            if (!sameIdentity(currentBootstrap, bootstrapIdentity)) throw new Error('materialized replay bootstrap identity changed');
            await assertExactNames(outputMigrations, [bootstrapName], 'bootstrap migrations');
            await assertExactNames(pendingMigrationsDir, expectedNames, 'pending migrations');
            const currentPending = await lstat(pendingMigrationsDir);
            if (!sameIdentity(currentPending, migrationsIdentity)) throw new Error('materialized replay pending identity changed');
            await unlink(path.join(outputMigrations, bootstrapName));
            await rmdir(outputMigrations);
            await rename(pendingMigrationsDir, outputMigrations);
            const restoredIdentity = await lstat(outputMigrations);
            if (!sameIdentity(restoredIdentity, migrationsIdentity)) throw new Error('materialized replay restored identity changed');
            await syncDirectory(path.dirname(outputMigrations));
            replayActive = false; restored = true;
          },
        };
      },
      async cleanupCliMetadata() {
        if (cleaned || replayActive) throw new Error('materialized CLI metadata cleanup state invalid');
        await removeCliMetadata(workdir);
      },
      async cleanup() {
        if (replayActive) throw new Error('materialized replay must restore before cleanup');
        if (cleaned) return;
        await removeOwnedWorkdir(workdir, workdirIdentity, expectedNames);
        cleaned = true;
      },
    };
  } catch (error) {
    if (workdir && workdirIdentity) {
      try { await removeOwnedWorkdir(workdir, workdirIdentity); } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'materializer failed and cleanup held');
      }
    }
    throw error;
  } finally {
    verified.dispose();
    baseline?.fill(0);
    overlay?.fill(0);
    marker?.fill(0);
    config?.fill(0);
    runtimeConfig?.fill(0);
    seed?.fill(0);
    for (const entry of selected) entry.bytes.fill(0);
  }
}

export async function materializeFreshWorkdir(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('materializer public options contain forbidden path override');
  }
  const keys = Object.keys(options).sort();
  if (keys.some((key) => !['outputParent', 'postCutoffManifest', 'projectId'].includes(key))) {
    throw new Error('materializer public options contain forbidden path override');
  }
  let entries = POST_CUTOFF_MIGRATIONS;
  if (Object.hasOwn(options, 'postCutoffManifest')) {
    let manifest;
    try { manifest = structuredClone(options.postCutoffManifest); } catch {
      throw new Error('expected-terminal manifest is not cloneable');
    }
    validateExpectedTerminalManifest(manifest);
    entries = Object.freeze(manifest.postCutoffMigrations.map((entry) => Object.freeze({ ...entry })));
  }
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  return materializeWithPaths({
    repoRoot,
    outputParent: options.outputParent,
    projectId: options.projectId,
    journalPath: resolveJournalForRepository(repoRoot),
    entries,
  });
}

export const __internal = Object.freeze({ materializeWithPaths, selectPostCutoffSources, sameDirectoryObjectIdentity });

async function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Task 9 materializer is library-only; Tasks 10/11 must retain and call result.cleanup().\n');
    return;
  }
  throw new Error('LIBRARY_ONLY: use materializeFreshWorkdir() in the owning process and call cleanup()');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`fresh materializer: ${error.message}\n`);
    process.exitCode = 1;
  });
}
