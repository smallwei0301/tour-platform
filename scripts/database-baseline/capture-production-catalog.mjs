#!/usr/bin/env node
import { createHash, randomBytes as cryptoRandomBytes } from 'node:crypto';
import { constants, mkdirSync } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rmdir, rm, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FIXED_SQL, parseCatalogChildResult } from './extract-catalog.mjs';
import { normalizeCatalog } from './normalize-catalog.mjs';
import { parsePg17Toc } from './render-baseline-from-archive.mjs';
import { verifyLockedPg17Runtime } from './verify-toolchain-lock.mjs';
import { FIXED_CLI_SHA256 } from './resolve-toolchain-supply.mjs';

export const FIXED_SUPABASE_CLI = '/root/.hermes/toolchains/supabase/2.87.2/supabase';
export const DRY_RUN_MAX_BYTES = 64 * 1024;
export const CHILD_TIMEOUT_MS = 120_000;
export const MAX_USE_LIST_BYTES = 64 * 1024;
export const FIXED_RENDER_SCRIPT = `umask 077
: "\${MIDAO_USE_LIST_B64:?}"
printf '%s' "$MIDAO_USE_LIST_B64" | /usr/bin/base64 --decode > /tmp/use-list.txt
unset MIDAO_USE_LIST_B64
exec /usr/bin/pg_restore --exit-on-error --schema-only --use-list=/tmp/use-list.txt --restrict-key="$1" --file=-`;
const FIXTURE_GRAMMAR_SHA256 = '36fe7a60fd33c50d9e3d34cb9fe0bda7b5eef38b347492d8bd1c43638b251a1f';
const PINNED_PG17_IMAGE = 'postgres@sha256:0027bef26712baaee437a4ea48fdf3d2d2e2bc5f0d81615374408ca320f3c7e3';
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const FIXED_PROJECT_ROOT = path.resolve(scriptDirectory, '../..');
export const FIXED_PROJECT_REF_FILE = path.join(FIXED_PROJECT_ROOT, 'supabase/.temp/project-ref');
export const FIXED_TOOLCHAIN_LOCK = path.join(FIXED_PROJECT_ROOT, 'supabase/baselines/v1/toolchain-lock.json');
const TRUSTED_TOOLCHAINS = new WeakSet();
const CONNECTION_FIELDS = ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'];
const SYNTHETIC_VALUES = {
  PGHOST: 'db.synthetic.invalid',
  PGPORT: '5432',
  PGUSER: 'postgres',
  PGPASSWORD: '__REDACTED__',
  PGDATABASE: 'postgres',
};

function newContainerName() {
  const entropy = cryptoRandomBytes(16);
  if (!Buffer.isBuffer(entropy) || entropy.length !== 16 || entropy.every((byte) => byte === 0)) {
    entropy?.fill?.(0);
    throw new Error('container name entropy invalid');
  }
  const name = `midao-baseline-${entropy.toString('hex')}`;
  entropy.fill(0);
  return name;
}

function assertContainerName(name) {
  if (typeof name !== 'string' || !/^midao-baseline-[0-9a-f]{32}$/u.test(name)) throw new Error('owned container name invalid');
}

async function runDockerControl(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env: { HOME: '/tmp', LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
      stdio: ['ignore', 'ignore', 'ignore'], shell: false, detached: false,
    });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('docker cleanup control timeout')); }, 10_000);
    timer.unref?.();
    child.once('error', () => { clearTimeout(timer); reject(new Error('docker cleanup control failed')); });
    child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
  });
}

export async function ensureDockerContainerAbsent(invocation) {
  if (!invocation?.containerName) return;
  assertContainerName(invocation.containerName);
  const removed = await runDockerControl(invocation.executable, ['rm', '-f', invocation.containerName]);
  if (removed.signal !== null || ![0, 1].includes(removed.code)) throw new Error('docker orphan removal failed');
  const inspected = await runDockerControl(invocation.executable, ['container', 'inspect', invocation.containerName]);
  if (inspected.signal !== null || inspected.code !== 1) throw new Error('docker orphan container remains');
}

function assertAbsoluteOwnedHome(home) {
  if (typeof home !== 'string' || !path.isAbsolute(home) || home.includes('\0')) throw new Error('owned empty HOME must be absolute');
}

function decodeQuotedExport(text, name) {
  const expression = new RegExp(`^export ${name}="((?:[^"\\\\]|\\\\")*)"$`, 'gmu');
  const matches = [...text.matchAll(expression)];
  if (matches.length !== 1) throw new Error(`dry-run shape invalid for ${name}`);
  const raw = matches[0][1];
  if (/\\(?!")/u.test(raw)) throw new Error(`dry-run unsafe escape in ${name}`);
  return raw.replaceAll('\\"', '"');
}

function validateCredential(credential) {
  if (!credential || typeof credential !== 'object' || Array.isArray(credential)) throw new Error('credential invalid');
  const keys = Object.keys(credential);
  const expected = [...CONNECTION_FIELDS, 'PGSSLMODE'];
  if (keys.length !== expected.length || expected.some((key) => !Object.hasOwn(credential, key))) throw new Error('credential fields invalid');
  if (!/^[a-z0-9.-]+$/u.test(credential.PGHOST) || credential.PGHOST.startsWith('.') || credential.PGHOST.endsWith('.')) throw new Error('credential host invalid');
  if (!/^[1-9][0-9]{0,4}$/u.test(credential.PGPORT) || Number(credential.PGPORT) > 65535) throw new Error('credential port invalid');
  if (!/^[A-Za-z0-9_.-]+$/u.test(credential.PGUSER) || !/^[A-Za-z0-9_.-]+$/u.test(credential.PGDATABASE)) throw new Error('credential identity invalid');
  if (typeof credential.PGPASSWORD !== 'string' || credential.PGPASSWORD.length === 0 || credential.PGPASSWORD.length > 4096 || /[\u0000-\u001f\u007f]/u.test(credential.PGPASSWORD)) throw new Error('credential password invalid');
  if (credential.PGSSLMODE !== 'require') throw new Error('credential SSL mode invalid');
  return credential;
}

export function parseDumpDryRunEnvelope(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('dry-run output must be a Buffer');
  try {
    if (buffer.length === 0 || buffer.length > DRY_RUN_MAX_BYTES) throw new Error('dry-run output outside bounded size');
    if (buffer.includes(0) || buffer.includes(13)) throw new Error('dry-run framing contains unsafe bytes');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (!text.startsWith('#!/usr/bin/env bash\nset -euo pipefail\n\n') || !text.endsWith('\n\n')) throw new Error('dry-run framing invalid');
    const parsed = {};
    for (const name of CONNECTION_FIELDS) parsed[name] = decodeQuotedExport(text, name);
    parsed.PGSSLMODE = 'require';
    validateCredential(parsed);

    let normalized = text;
    for (const name of CONNECTION_FIELDS) {
      const expression = new RegExp(`^export ${name}="(?:[^"\\\\]|\\\\")*"$`, 'mu');
      normalized = normalized.replace(expression, `export ${name}="${SYNTHETIC_VALUES[name]}"`);
    }
    const digest = createHash('sha256').update(normalized, 'utf8').digest('hex');
    if (digest !== FIXTURE_GRAMMAR_SHA256) throw new Error('dry-run shape does not match pinned Supabase CLI v2.87.2 grammar');
    return Object.freeze(parsed);
  } catch (error) {
    if (error instanceof Error && /dry-run|credential/u.test(error.message)) throw error;
    throw new Error('dry-run output invalid', { cause: error });
  } finally {
    buffer.fill(0);
  }
}

export async function verifyLinkedProjectRef(projectRef) {
  if (typeof projectRef !== 'string' || !/^[a-z]{20}$/u.test(projectRef)
    || await realpath(FIXED_PROJECT_REF_FILE) !== FIXED_PROJECT_REF_FILE) throw new Error('linked project ref invalid');
  const stat = await lstat(FIXED_PROJECT_REF_FILE, { bigint: true });
  if (!stat.isFile() || stat.uid !== BigInt(process.geteuid()) || stat.nlink !== 1n
    || Number(stat.mode & 0o7777n) !== 0o644 || stat.size !== 20n) throw new Error('linked project ref identity invalid');
  const bytes = await readFile(FIXED_PROJECT_REF_FILE);
  try {
    const actual = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (actual !== projectRef) throw new Error('linked project ref mismatch');
    return true;
  } finally {
    bytes.fill(0);
  }
}

const FIXED_ACCESS_TOKEN = '/root/.supabase/access-token';

export function loadSupabaseDbPassword(env = process.env) {
  const value = env?.SUPABASE_DB_PASSWORD;
  if (value === undefined) return null;
  if (typeof value !== 'string' || value === '' || Buffer.byteLength(value, 'utf8') > 1024 || /[\0\r\n]/u.test(value)) {
    throw new Error('Supabase DB password environment invalid');
  }
  return Buffer.from(value);
}

export async function loadSupabaseAccessToken(tokenPath = FIXED_ACCESS_TOKEN) {
  if (path.resolve(tokenPath) !== FIXED_ACCESS_TOKEN) throw new Error('Supabase access token path substitution refused');
  const bytes = await readIdentityBoundFile(tokenPath, {
    expectedPath: FIXED_ACCESS_TOKEN, maxBytes: 128, label: 'Supabase access token', allowedModes: [0o600],
  });
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!/^sbp_(?:oauth_)?[a-f0-9]{40}$/u.test(text)) {
    bytes.fill(0);
    throw new Error('Supabase access token format invalid');
  }
  return bytes;
}

export function buildDryRunInvocation({ projectRef, home, accessToken = null, dbPassword = null, cliPath = FIXED_SUPABASE_CLI, workdir = FIXED_PROJECT_ROOT }) {
  if (typeof projectRef !== 'string' || !/^[a-z]{20}$/u.test(projectRef)) throw new Error('project ref invalid');
  assertAbsoluteOwnedHome(home);
  const privatePrefix = `${home}${path.sep}`;
  if (!path.isAbsolute(cliPath) || !path.isAbsolute(workdir)
    || (cliPath !== FIXED_SUPABASE_CLI && !cliPath.startsWith(privatePrefix))
    || (workdir !== FIXED_PROJECT_ROOT && !workdir.startsWith(privatePrefix))) {
    throw new Error('dry-run runtime path invalid');
  }
  const tokenPresent = accessToken !== null;
  const passwordPresent = dbPassword !== null;
  if (tokenPresent === passwordPresent) throw new Error('exactly one Supabase dry-run credential required');
  const tokenValid = Buffer.isBuffer(accessToken) && /^sbp_(?:oauth_)?[a-f0-9]{40}$/u.test(accessToken.toString('utf8'));
  const passwordValid = Buffer.isBuffer(dbPassword) && dbPassword.length > 0 && dbPassword.length <= 1024
    && !dbPassword.includes(0) && !dbPassword.includes(10) && !dbPassword.includes(13);
  if ((tokenPresent && !tokenValid) || (passwordPresent && !passwordValid)) {
    throw new Error('Supabase dry-run credential invalid');
  }
  const credentialEnv = passwordValid
    ? { SUPABASE_DB_PASSWORD: dbPassword.toString('utf8') }
    : { SUPABASE_ACCESS_TOKEN: accessToken.toString('utf8') };
  return Object.freeze({
    executable: cliPath,
    args: Object.freeze(['db', 'dump', '--linked', '--dry-run', '--workdir', workdir]),
    env: Object.freeze({ HOME: home, LANG: 'C', LC_ALL: 'C', ...credentialEnv }),
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    projectRef,
  });
}

const LINKED_METADATA_FILES = Object.freeze([
  'gotrue-version', 'linked-project.json', 'pooler-url', 'postgres-version',
  'project-ref', 'rest-version', 'storage-migration', 'storage-version',
]);

export function pinnedCliLatestBytes(lock) {
  if (lock?.cli?.version !== '2.87.2') throw new Error('locked Supabase CLI version mismatch');
  return Buffer.from(`v${lock.cli.version}`);
}

async function writeAll(handle, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset, null);
    if (bytesWritten < 1) throw new Error('private runtime short write');
    offset += bytesWritten;
  }
}

async function writePrivateFile(filePath, bytes, mode) {
  let handle;
  let readback;
  try {
    handle = await open(filePath, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
    await writeAll(handle, bytes);
    await handle.sync();
    const stat = await handle.stat({ bigint: true });
    const pathStat = await lstat(filePath, { bigint: true });
    if (!stat.isFile() || stat.uid !== BigInt(process.geteuid()) || stat.nlink !== 1n
      || Number(stat.mode & 0o7777n) !== mode || stat.size !== BigInt(bytes.length)
      || !matchesIdentity(pathStat, fsIdentity(stat))) {
      throw new Error('private runtime file identity invalid');
    }
    readback = Buffer.alloc(bytes.length);
    let offset = 0;
    while (offset < readback.length) {
      const { bytesRead } = await handle.read(readback, offset, readback.length - offset, offset);
      if (bytesRead < 1) throw new Error('private runtime file read-back short');
      offset += bytesRead;
    }
    if (!readback.equals(bytes)) throw new Error('private runtime file read-back mismatch');
  } finally {
    readback?.fill(0);
    await handle?.close();
  }
}

async function copyPinnedCli(lock, home) {
  const expected = lock?.cli;
  if (!expected || expected.path !== FIXED_SUPABASE_CLI || expected.realpath !== FIXED_SUPABASE_CLI
    || expected.sha256 !== FIXED_CLI_SHA256 || expected.version !== '2.87.2'
    || expected.uid !== 0 || expected.gid !== 0 || expected.mode !== '0755' || expected.nlink !== 1) {
    throw new Error('locked Supabase CLI metadata mismatch');
  }
  const destination = path.join(home, 'supabase');
  let source;
  let target;
  try {
    source = await open(FIXED_SUPABASE_CLI, constants.O_RDONLY | constants.O_NOFOLLOW);
    const sourceStat = await source.stat({ bigint: true });
    const pathStat = await lstat(FIXED_SUPABASE_CLI, { bigint: true });
    const snapshot = snapshotRegularFile(sourceStat, 'Supabase CLI', 128 * 1024 * 1024, [0o755]);
    if (!matchesSnapshot(pathStat, snapshot) || sourceStat.gid !== 0n || await realpath(FIXED_SUPABASE_CLI) !== FIXED_SUPABASE_CLI) {
      throw new Error('Supabase CLI identity mismatch');
    }
    target = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o500);
    const digest = createHash('sha256');
    let copied = 0;
    for await (const chunk of source.createReadStream({ start: 0, autoClose: false })) {
      digest.update(chunk);
      await writeAll(target, chunk);
      copied += chunk.length;
    }
    if (copied !== Number(sourceStat.size) || digest.digest('hex') !== expected.sha256) throw new Error('Supabase CLI copy digest mismatch');
    await target.sync();
    await verifyPinnedFile({ handle: source, path: FIXED_SUPABASE_CLI, snapshot }, 'Supabase CLI');
    const targetStat = await target.stat({ bigint: true });
    if (!targetStat.isFile() || targetStat.uid !== BigInt(process.geteuid()) || targetStat.nlink !== 1n
      || Number(targetStat.mode & 0o7777n) !== 0o500 || targetStat.size !== sourceStat.size) {
      throw new Error('private Supabase CLI identity invalid');
    }
  } finally {
    await target?.close();
    await source?.close();
  }
  return destination;
}

export async function preparePinnedCaptureRuntime({ lock, projectRef, home }) {
  if (typeof projectRef !== 'string' || !/^[a-z]{20}$/u.test(projectRef)) {
    throw new Error('pinned capture runtime arguments invalid');
  }
  assertAbsoluteOwnedHome(home);
  const cliPath = await copyPinnedCli(lock, home);
  const workdir = path.join(home, 'workdir');
  const supabaseDir = path.join(workdir, 'supabase');
  const tempDir = path.join(supabaseDir, '.temp');
  await mkdir(tempDir, { recursive: true, mode: 0o700 });
  await chmod(workdir, 0o700);
  await chmod(supabaseDir, 0o700);
  await chmod(tempDir, 0o700);
  const config = await readIdentityBoundFile(path.join(FIXED_PROJECT_ROOT, 'supabase/config.toml'), {
    expectedPath: path.join(FIXED_PROJECT_ROOT, 'supabase/config.toml'), maxBytes: 1024 * 1024,
    label: 'Supabase config', allowedModes: [0o644],
  });
  try { await writePrivateFile(path.join(supabaseDir, 'config.toml'), config, 0o600); }
  finally { config.fill(0); }

  const cliLatest = pinnedCliLatestBytes(lock);
  try { await writePrivateFile(path.join(tempDir, 'cli-latest'), cliLatest, 0o600); }
  finally { cliLatest.fill(0); }

  for (const name of LINKED_METADATA_FILES) {
    const sourcePath = path.join(FIXED_PROJECT_ROOT, 'supabase/.temp', name);
    const bytes = await readIdentityBoundFile(sourcePath, {
      expectedPath: sourcePath, maxBytes: 64 * 1024, label: `linked metadata ${name}`, allowedModes: [0o644],
    });
    try {
      if (name === 'project-ref' && !bytes.equals(Buffer.from(projectRef))) throw new Error('linked project ref mismatch');
      if (['linked-project.json', 'pooler-url'].includes(name) && !bytes.includes(Buffer.from(projectRef))) {
        throw new Error(`linked metadata ${name} project binding mismatch`);
      }
      if (name === 'linked-project.json') {
        const linked = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        if (linked?.project_ref !== projectRef && linked?.projectRef !== projectRef && linked?.ref !== projectRef) {
          throw new Error('linked project JSON binding mismatch');
        }
      }
      await writePrivateFile(path.join(tempDir, name), bytes, 0o600);
    } finally { bytes.fill(0); }
  }
  return Object.freeze({ cliPath, workdir });
}

export function buildStrictPgEnvironment({ credential, home }) {
  assertAbsoluteOwnedHome(home);
  validateCredential(credential);
  return Object.freeze({
    HOME: home,
    LANG: 'C',
    LC_ALL: 'C',
    PGHOST: credential.PGHOST,
    PGPORT: credential.PGPORT,
    PGUSER: credential.PGUSER,
    PGPASSWORD: credential.PGPASSWORD,
    PGDATABASE: credential.PGDATABASE,
    PGSSLMODE: credential.PGSSLMODE,
    PGOPTIONS: '-c default_transaction_read_only=on',
  });
}

export function validateLockedPg17(lock) {
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) throw new Error('toolchain lock invalid');
  if (lock.schemaVersion !== 1 || lock.architecture !== 'amd64'
    || lock.docker?.path !== '/usr/bin/docker' || lock.docker?.realpath !== '/usr/bin/docker'
    || lock.docker?.endpoint !== 'unix:///var/run/docker.sock'
    || lock.pg17?.majorVersion !== 17 || lock.pg17?.image !== PINNED_PG17_IMAGE
    || lock.pg17?.binaries?.psql?.path !== '/usr/bin/psql'
    || lock.pg17?.binaries?.pg_dump?.path !== '/usr/bin/pg_dump'
    || lock.pg17?.binaries?.pg_restore?.path !== '/usr/bin/pg_restore'
    || !String(lock.pg17?.binaries?.psql?.version).startsWith('psql (PostgreSQL) 17.')
    || !Array.isArray(lock.images)
    || !lock.images.some((entry) => entry?.role === 'pg17-client' && entry.repoDigest === PINNED_PG17_IMAGE
      && entry.architecture === 'amd64' && entry.platform === 'linux/amd64')) {
    throw new Error('pinned PG17 toolchain mismatch');
  }
  return Object.freeze({
    dockerPath: '/usr/bin/docker', image: PINNED_PG17_IMAGE,
    psqlPath: '/usr/bin/psql', pgDumpPath: '/usr/bin/pg_dump', pgRestorePath: '/usr/bin/pg_restore',
  });
}

export async function loadCaptureToolchain(lockPath = FIXED_TOOLCHAIN_LOCK) {
  if (path.resolve(lockPath) !== FIXED_TOOLCHAIN_LOCK || await realpath(lockPath) !== FIXED_TOOLCHAIN_LOCK) {
    throw new Error('toolchain lock path substitution refused');
  }
  const stat = await lstat(lockPath, { bigint: true });
  if (!stat.isFile() || stat.uid !== BigInt(process.geteuid()) || stat.nlink !== 1n
    || Number(stat.mode & 0o7777n) !== 0o600 || stat.size < 1n || stat.size > 64n * 1024n) {
    throw new Error('toolchain lock filesystem identity invalid');
  }
  const bytes = await readFile(lockPath);
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch (error) { throw new Error('toolchain lock JSON invalid', { cause: error }); }
  finally { bytes.fill(0); }
  const trusted = validateLockedPg17(parsed);
  TRUSTED_TOOLCHAINS.add(trusted);
  return Object.freeze({ lock: parsed, trusted });
}

export function buildPg17CatalogInvocation({ toolchain, home, connectionEnv }) {
  if (!TRUSTED_TOOLCHAINS.has(toolchain)) throw new Error('trusted toolchain required');
  const env = buildStrictPgEnvironment({ credential: connectionEnv, home });
  const envFlags = Object.keys(env).filter((key) => key.startsWith('PG')).sort().map((key) => `--env=${key}`);
  const containerName = newContainerName();
  return Object.freeze({
    executable: toolchain.dockerPath,
    containerName,
    args: Object.freeze([
      'run', '--pull=never', '--rm', `--name=${containerName}`, '-i', '--network=bridge', '--read-only', '--security-opt=no-new-privileges', '--cap-drop=ALL',
      '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m',
      '--env=HOME=/tmp', '--env=LANG=C', '--env=LC_ALL=C',
      ...envFlags, toolchain.image, toolchain.psqlPath,
      '-X', '--set=ON_ERROR_STOP=1', '--quiet', '--tuples-only', '--no-align',
    ]),
    env,
    stdin: 'pipe', stdout: 'pipe', stderr: 'pipe',
  });
}

export function buildPg17DumpInvocation({ toolchain, home, connectionEnv }) {
  if (!TRUSTED_TOOLCHAINS.has(toolchain)) throw new Error('trusted toolchain required');
  const env = buildStrictPgEnvironment({ credential: connectionEnv, home });
  const envFlags = Object.keys(env).sort().map((key) => `--env=${key}`);
  const containerName = newContainerName();
  return Object.freeze({
    executable: toolchain.dockerPath,
    containerName,
    args: Object.freeze([
      'run', '--pull=never', '--rm', `--name=${containerName}`, '--network=bridge', '--read-only', '--security-opt=no-new-privileges', '--cap-drop=ALL',
      '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m', ...envFlags,
      toolchain.image, toolchain.pgDumpPath,
      '--format=custom', '--schema-only', '--no-password', '--file=-',
    ]),
    env,
    stdin: 'ignore', stdout: 'pipe', stderr: 'pipe',
  });
}

export function buildPg17RestoreListInvocation({ toolchain, home }) {
  if (!TRUSTED_TOOLCHAINS.has(toolchain)) throw new Error('trusted toolchain required');
  assertAbsoluteOwnedHome(home);
  const env = Object.freeze({ HOME: home, LANG: 'C', LC_ALL: 'C' });
  const containerName = newContainerName();
  return Object.freeze({
    executable: toolchain.dockerPath,
    containerName,
    args: Object.freeze([
      'run', '--pull=never', '--rm', `--name=${containerName}`, '-i', '--network=none', '--read-only', '--security-opt=no-new-privileges', '--cap-drop=ALL',
      '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m',
      '--env=HOME=/tmp', '--env=LANG=C', '--env=LC_ALL=C',
      toolchain.image, toolchain.pgRestorePath, '--list',
    ]),
    env,
    stdin: 'pipe', stdout: 'pipe', stderr: 'pipe',
  });
}

export function buildPg17RenderInvocation({ toolchain, useList, home, restrictKey }) {
  if (!TRUSTED_TOOLCHAINS.has(toolchain)) throw new Error('trusted toolchain required');
  assertAbsoluteOwnedHome(home);
  if (!Buffer.isBuffer(useList) || useList.length < 1 || useList.length > MAX_USE_LIST_BYTES
    || useList.includes(0) || useList.includes(13) || useList.at(-1) !== 10) throw new Error('render use-list invalid');
  if (typeof restrictKey !== 'string' || !/^[0-9a-f]{64}$/u.test(restrictKey) || /^0+$/u.test(restrictKey)) {
    throw new Error('restrict key invalid');
  }
  const env = Object.freeze({ HOME: home, LANG: 'C', LC_ALL: 'C', MIDAO_USE_LIST_B64: useList.toString('base64') });
  const containerName = newContainerName();
  return Object.freeze({
    executable: toolchain.dockerPath,
    containerName,
    args: Object.freeze([
      'run', '--pull=never', '--rm', `--name=${containerName}`, '-i', '--network=none', '--read-only', '--security-opt=no-new-privileges', '--cap-drop=ALL',
      '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m,mode=0700',
      '--env=HOME=/tmp', '--env=LANG=C', '--env=LC_ALL=C', '--env=MIDAO_USE_LIST_B64',
      toolchain.image, '/bin/sh', '-ceu', FIXED_RENDER_SCRIPT, 'sh', restrictKey,
    ]),
    env,
    stdin: 'pipe', stdout: 'pipe', stderr: 'pipe',
  });
}

async function legacyBindMountRenderAdapter({ toolchain, archivePaths, scratchDir, home, runChild = runBoundedChild }) {
  if (!TRUSTED_TOOLCHAINS.has(toolchain) || !Array.isArray(archivePaths) || archivePaths.length !== 2
    || typeof scratchDir !== 'string' || !path.isAbsolute(scratchDir) || typeof runChild !== 'function') {
    throw new Error('locked render adapter arguments invalid');
  }
  assertAbsoluteOwnedHome(home);
  const archiveHandles = [];
  let scratchHandle;
  let closed = false;
  let sequence = 0;
  const assertRegularIdentity = (stat, label) => {
    if (!stat.isFile() || stat.uid !== BigInt(process.geteuid()) || stat.nlink !== 1n
      || Number(stat.mode & 0o7777n) !== 0o600 || stat.size < 1n) {
      throw new Error(`${label} identity invalid`);
    }
  };
  try {
    scratchHandle = await open(scratchDir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const scratchFdStat = await scratchHandle.stat({ bigint: true });
    const scratchPathStat = await lstat(scratchDir, { bigint: true });
    if (!scratchFdStat.isDirectory() || scratchFdStat.uid !== BigInt(process.geteuid())
      || Number(scratchFdStat.mode & 0o7777n) !== 0o700 || !matchesIdentity(scratchPathStat, fsIdentity(scratchFdStat))) {
      throw new Error('render scratch identity invalid');
    }
    for (const [index, archivePath] of archivePaths.entries()) {
      if (typeof archivePath !== 'string' || !path.isAbsolute(archivePath) || /[\0\r\n,]/u.test(archivePath)) {
        throw new Error(`archive ${index} path invalid`);
      }
      const handle = await open(archivePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      const fdStat = await handle.stat({ bigint: true });
      const pathStat = await lstat(archivePath, { bigint: true });
      assertRegularIdentity(fdStat, `archive ${index}`);
      if (!matchesIdentity(pathStat, fsIdentity(fdStat))) throw new Error(`archive ${index} identity mismatch`);
      const entry = { handle, path: archivePath, identity: fsIdentity(fdStat) };
      archiveHandles.push(entry);
      const stagedName = `archive-${index}.dump`;
      const stagedPath = path.join(scratchDir, stagedName);
      const stagedHandle = await open(
        `/proc/self/fd/${scratchHandle.fd}/${stagedName}`,
        constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
      entry.stagedHandle = stagedHandle;
      entry.stagedPath = stagedPath;
      for await (const chunk of handle.createReadStream({ start: 0, autoClose: false })) await stagedHandle.write(chunk);
      await stagedHandle.sync();
      const stagedStat = await stagedHandle.stat({ bigint: true });
      const stagedPathStat = await lstat(stagedPath, { bigint: true });
      assertRegularIdentity(stagedStat, `staged archive ${index}`);
      if (!matchesIdentity(stagedPathStat, fsIdentity(stagedStat))) throw new Error(`staged archive ${index} identity mismatch`);
      entry.stagedIdentity = fsIdentity(stagedStat);
    }
    await scratchHandle.sync();
  } catch (error) {
    const cleanupErrors = [];
    for (const entry of archiveHandles) {
      if (entry.stagedHandle) await entry.stagedHandle.close().catch((cleanupError) => cleanupErrors.push(cleanupError));
      await entry.handle.close().catch((cleanupError) => cleanupErrors.push(cleanupError));
      if (entry.stagedPath) await unlink(entry.stagedPath).catch((cleanupError) => cleanupErrors.push(cleanupError));
    }
    if (scratchHandle) {
      await scratchHandle.sync().catch((cleanupError) => cleanupErrors.push(cleanupError));
      await scratchHandle.close().catch((cleanupError) => cleanupErrors.push(cleanupError));
    }
    if (cleanupErrors.length) throw new AggregateError([error, ...cleanupErrors], 'render adapter initialization and cleanup failed');
    throw error;
  }

  async function render({ archiveIndex, destination, useList, restrictKey }) {
    if (closed || ![0, 1].includes(archiveIndex) || !['baseline.sql', 'managed-overlays.sql'].includes(destination)
      || !Buffer.isBuffer(useList) || useList.length < 1 || useList.length > 4 * 1024 * 1024
      || useList.includes(0) || useList.includes(13)) {
      throw new Error('locked render request invalid');
    }
    const archive = archiveHandles[archiveIndex];
    const currentArchive = await lstat(archive.path, { bigint: true });
    if (!matchesIdentity(currentArchive, archive.identity)) throw new Error(`archive ${archiveIndex} identity mismatch`);
    const currentStagedArchive = await lstat(archive.stagedPath, { bigint: true });
    if (!matchesIdentity(currentStagedArchive, archive.stagedIdentity)) throw new Error(`staged archive ${archiveIndex} identity mismatch`);
    const currentScratch = await lstat(scratchDir, { bigint: true });
    const scratchFdStat = await scratchHandle.stat({ bigint: true });
    if (!matchesIdentity(currentScratch, fsIdentity(scratchFdStat))) throw new Error('render scratch identity mismatch');

    const name = `use-list-${String(++sequence).padStart(8, '0')}.txt`;
    const usePath = path.join(scratchDir, name);
    let useHandle;
    let useIdentity;
    let output;
    let primaryError;
    const cleanupErrors = [];
    try {
      useHandle = await open(
        `/proc/self/fd/${scratchHandle.fd}/${name}`,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
      await useHandle.writeFile(useList);
      await useHandle.sync();
      const useStat = await useHandle.stat({ bigint: true });
      const usePathStat = await lstat(usePath, { bigint: true });
      assertRegularIdentity(useStat, 'render use-list');
      useIdentity = fsIdentity(useStat);
      if (!matchesIdentity(usePathStat, useIdentity)) throw new Error('render use-list identity mismatch');
      const invocation = buildPg17RenderInvocation({
        toolchain,
        archivePath: archive.stagedPath,
        useListPath: usePath,
        home,
        restrictKey,
      });
      output = await runSuccessfulChild(runChild, invocation,
        { maxBytes: 64 * 1024 * 1024, timeoutMs: CHILD_TIMEOUT_MS },
        `${destination} render`);
      const postStagedArchive = await lstat(archive.stagedPath, { bigint: true });
      const postUseList = await lstat(usePath, { bigint: true });
      if (!matchesIdentity(postStagedArchive, archive.stagedIdentity) || !matchesIdentity(postUseList, useIdentity)) {
        throw new Error('render mount identity changed during child execution');
      }
    } catch (error) {
      primaryError = error;
    }
    let canUnlinkUseList = false;
    if (useHandle) {
      try {
        const finalUseFdStat = await useHandle.stat({ bigint: true });
        const finalUsePathStat = await lstat(usePath, { bigint: true });
        const finalIdentity = fsIdentity(finalUseFdStat);
        canUnlinkUseList = matchesIdentity(finalUsePathStat, finalIdentity)
          && (!useIdentity || (useIdentity.dev === finalIdentity.dev && useIdentity.ino === finalIdentity.ino));
        if (!canUnlinkUseList) cleanupErrors.push(new Error('render use-list cleanup identity mismatch'));
      } catch (error) {
        cleanupErrors.push(error);
      }
      await useHandle.close().catch((error) => cleanupErrors.push(error));
      if (canUnlinkUseList) await unlink(usePath).catch((error) => cleanupErrors.push(error));
    }
    await scratchHandle.sync().catch((error) => cleanupErrors.push(error));
    if (cleanupErrors.length) {
      if (output) output.fill(0);
      throw new AggregateError(primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors, 'render and temporary use-list cleanup failed');
    }
    if (primaryError) {
      if (output) output.fill(0);
      throw primaryError;
    }
    return output;
  }

  async function close() {
    if (closed) return;
    closed = true;
    const errors = [];
    for (const entry of archiveHandles) {
      let canUnlinkStaged = false;
      try {
        const stagedFdStat = await entry.stagedHandle.stat({ bigint: true });
        const stagedPathStat = await lstat(entry.stagedPath, { bigint: true });
        canUnlinkStaged = matchesIdentity(stagedPathStat, entry.stagedIdentity)
          && matchesIdentity(stagedFdStat, entry.stagedIdentity);
        if (!canUnlinkStaged) errors.push(new Error('staged archive cleanup identity mismatch'));
      } catch (error) {
        errors.push(error);
      }
      await entry.stagedHandle.close().catch((error) => errors.push(error));
      await entry.handle.close().catch((error) => errors.push(error));
      if (canUnlinkStaged) await unlink(entry.stagedPath).catch((error) => errors.push(error));
    }
    await scratchHandle.sync().catch((error) => errors.push(error));
    await scratchHandle.close().catch((error) => errors.push(error));
    if (errors.length) throw new AggregateError(errors, 'render adapter close failed');
  }
  return Object.freeze({ render, close });
}

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

function snapshotRegularFile(stat, label, maxBytes, allowedModes = [0o600]) {
  if (!stat.isFile() || stat.uid !== BigInt(process.geteuid()) || stat.nlink !== 1n
    || !allowedModes.includes(Number(stat.mode & 0o7777n)) || stat.size < 1n || stat.size > BigInt(maxBytes)) {
    throw new Error(`${label} identity invalid`);
  }
  return Object.freeze({ dev: String(stat.dev), ino: String(stat.ino), size: String(stat.size), uid: String(stat.uid), nlink: String(stat.nlink), mode: Number(stat.mode & 0o7777n) });
}

function matchesSnapshot(stat, snapshot) {
  return String(stat.dev) === snapshot.dev && String(stat.ino) === snapshot.ino && String(stat.size) === snapshot.size
    && String(stat.uid) === snapshot.uid && String(stat.nlink) === snapshot.nlink && Number(stat.mode & 0o7777n) === snapshot.mode;
}

async function verifyPinnedFile(entry, label) {
  const [fdStat, pathStat] = await Promise.all([entry.handle.stat({ bigint: true }), lstat(entry.path, { bigint: true })]);
  if (!matchesSnapshot(fdStat, entry.snapshot) || !matchesSnapshot(pathStat, entry.snapshot)) throw new Error(`${label} identity changed`);
}

async function readPinnedFile(entry, label) {
  await verifyPinnedFile(entry, label);
  const size = Number(entry.snapshot.size);
  const bytes = Buffer.allocUnsafe(size);
  let offset = 0;
  try {
    while (offset < size) {
      const { bytesRead } = await entry.handle.read(bytes, offset, size - offset, offset);
      if (bytesRead < 1) throw new Error(`${label} short read`);
      offset += bytesRead;
    }
    await verifyPinnedFile(entry, label);
    return bytes;
  } catch (error) {
    bytes.fill(0);
    throw error;
  }
}

export async function readIdentityBoundFile(filePath, { expectedPath, maxBytes = MAX_ARCHIVE_BYTES, label = 'file', allowedModes = [0o600] } = {}) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || (expectedPath && path.resolve(filePath) !== expectedPath)
    || !Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error(`${label} path invalid`);
  let handle;
  let result;
  let primaryError;
  try {
    handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const snapshot = snapshotRegularFile(await handle.stat({ bigint: true }), label, maxBytes, allowedModes);
    result = await readPinnedFile({ handle, path: filePath, snapshot }, label);
  } catch (error) {
    primaryError = error;
  }
  let cleanupError;
  if (handle) await handle.close().catch((error) => { cleanupError = error; });
  if (cleanupError) {
    result?.fill(0);
    throw new AggregateError(primaryError ? [primaryError, cleanupError] : [cleanupError], `${label} read and cleanup failed`);
  }
  if (primaryError) throw primaryError;
  return result;
}

export async function createLockedRenderAdapter({ toolchain, archivePaths, home, runChild = runBoundedChild }) {
  if (!TRUSTED_TOOLCHAINS.has(toolchain) || !Array.isArray(archivePaths) || archivePaths.length !== 2 || typeof runChild !== 'function') {
    throw new Error('locked render adapter arguments invalid');
  }
  assertAbsoluteOwnedHome(home);
  const archives = [];
  let closed = false;
  try {
    for (const [index, archivePath] of archivePaths.entries()) {
      if (typeof archivePath !== 'string' || !path.isAbsolute(archivePath) || /[\0\r\n,]/u.test(archivePath)) throw new Error(`archive ${index} path invalid`);
      const handle = await open(archivePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      const snapshot = snapshotRegularFile(await handle.stat({ bigint: true }), `archive ${index}`, MAX_ARCHIVE_BYTES);
      const entry = { handle, path: archivePath, snapshot };
      await verifyPinnedFile(entry, `archive ${index}`);
      archives.push(entry);
    }
  } catch (error) {
    const cleanupErrors = [];
    for (const entry of archives) await entry.handle.close().catch((cleanupError) => cleanupErrors.push(cleanupError));
    if (cleanupErrors.length) throw new AggregateError([error, ...cleanupErrors], 'render adapter initialization and cleanup failed');
    throw error;
  }

  async function render({ archiveIndex, destination, useList, restrictKey }) {
    if (closed || ![0, 1].includes(archiveIndex) || !['baseline.sql', 'managed-overlays.sql'].includes(destination)) throw new Error('locked render request invalid');
    const entry = archives[archiveIndex];
    let archiveBytes;
    let output;
    try {
      archiveBytes = await readPinnedFile(entry, `archive ${archiveIndex}`);
      const invocation = buildPg17RenderInvocation({ toolchain, useList, home, restrictKey });
      output = await runSuccessfulChild(runChild, invocation,
        { stdinBuffer: archiveBytes, maxBytes: MAX_ARCHIVE_BYTES, timeoutMs: CHILD_TIMEOUT_MS },
        `${destination} render`);
      await verifyPinnedFile(entry, `archive ${archiveIndex}`);
      return output;
    } catch (error) {
      output?.fill(0);
      throw error;
    } finally {
      archiveBytes?.fill(0);
    }
  }

  async function close() {
    if (closed) return;
    closed = true;
    const errors = [];
    for (const entry of archives) await entry.handle.close().catch((error) => errors.push(error));
    if (errors.length) throw new AggregateError(errors, 'render adapter close failed');
  }
  return Object.freeze({ render, close });
}

export function parseCaptureCli(args) {
  const usage = 'Usage: capture-production-catalog.mjs --project-ref <20 lowercase letters> --captures 2 --output-candidate-root .hermes/tmp --handoff .hermes/tmp/baseline-capture-handoff.json';
  if (!Array.isArray(args) || args.length !== 8
    || args[0] !== '--project-ref' || args[2] !== '--captures'
    || args[4] !== '--output-candidate-root' || args[6] !== '--handoff'
    || !/^[a-z]{20}$/u.test(args[1] ?? '') || args[3] !== '2'
    || args[5] !== '.hermes/tmp' || args[7] !== '.hermes/tmp/baseline-capture-handoff.json') {
    throw new Error(usage);
  }
  return {
    projectRef: args[1], captures: 2, candidateRoot: args[5], handoffPath: args[7],
  };
}

function fsIdentity(stat) {
  return { dev: String(stat.dev), ino: String(stat.ino) };
}

function matchesIdentity(stat, expected) {
  return String(stat.dev) === expected?.dev && String(stat.ino) === expected?.ino;
}

export async function ensureCandidateRoot(candidateRoot) {
  if (typeof candidateRoot !== 'string' || candidateRoot.includes('\0')) throw new Error('candidate root invalid');
  const rootPath = path.resolve(candidateRoot);
  const parentPath = path.dirname(rootPath);
  if (path.basename(parentPath) !== '.hermes' || path.basename(rootPath) !== 'tmp') throw new Error('candidate root namespace invalid');
  let parentHandle;
  let rootHandle;
  let parentCreated = false;
  let rootCreated = false;
  let parentIdentity;
  let rootIdentity;
  try {
    const parentUmask = process.umask(0o077);
    try {
      try { mkdirSync(parentPath, { mode: 0o700 }); parentCreated = true; }
      catch (error) { if (error?.code !== 'EEXIST') throw error; }
    } finally {
      process.umask(parentUmask);
    }
    parentHandle = await open(parentPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const parentFdStat = await parentHandle.stat({ bigint: true });
    parentIdentity = fsIdentity(parentFdStat);
    const parentPathStat = await lstat(parentPath, { bigint: true });
    if (!parentFdStat.isDirectory() || parentFdStat.uid !== BigInt(process.geteuid())
      || Number(parentFdStat.mode & 0o7777n) !== 0o700 || !matchesIdentity(parentPathStat, parentIdentity)) {
      throw new Error('candidate root parent identity or mode invalid');
    }
    const rootUmask = process.umask(0o077);
    try {
      try { mkdirSync(`/proc/self/fd/${parentHandle.fd}/${path.basename(rootPath)}`, { mode: 0o700 }); rootCreated = true; }
      catch (error) { if (error?.code !== 'EEXIST') throw error; }
    } finally {
      process.umask(rootUmask);
    }
    if (rootCreated) await parentHandle.sync();
    rootHandle = await open(rootPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const rootFdStat = await rootHandle.stat({ bigint: true });
    const rootPathStat = await lstat(rootPath, { bigint: true });
    if (!rootFdStat.isDirectory() || rootFdStat.uid !== BigInt(process.geteuid())
      || Number(rootFdStat.mode & 0o7777n) !== 0o700 || !matchesIdentity(rootPathStat, fsIdentity(rootFdStat))) {
      throw new Error('candidate root identity or mode invalid');
    }
    rootIdentity = fsIdentity(rootFdStat);
    return Object.freeze({ path: rootPath, identity: Object.freeze({ ...rootIdentity }) });
  } catch (error) {
    if (rootHandle) await rootHandle.close().catch(() => {});
    rootHandle = null;
    if (rootCreated && parentHandle && rootIdentity === undefined) {
      const stat = await lstat(rootPath, { bigint: true }).catch(() => null);
      if (stat?.isDirectory() && stat.uid === BigInt(process.geteuid())) {
        await rmdir(`/proc/self/fd/${parentHandle.fd}/${path.basename(rootPath)}`).catch(() => {});
      }
    }
    if (parentCreated && parentIdentity && parentHandle) {
      await parentHandle.close().catch(() => {});
      parentHandle = null;
      const stat = await lstat(parentPath, { bigint: true }).catch(() => null);
      if (stat && matchesIdentity(stat, parentIdentity)) await rmdir(parentPath).catch(() => {});
    }
    throw new Error('candidate root bootstrap failed', { cause: error });
  } finally {
    if (rootHandle) await rootHandle.close().catch(() => {});
    if (parentHandle) await parentHandle.close().catch(() => {});
  }
}

export async function initializeCandidateWorkspace({ candidateRoot, handoffPath, randomBytes = cryptoRandomBytes }) {
  if (typeof candidateRoot !== 'string' || typeof handoffPath !== 'string' || typeof randomBytes !== 'function') {
    throw new Error('candidate workspace arguments invalid');
  }
  const rootPath = path.resolve(candidateRoot);
  const resolvedHandoff = path.resolve(handoffPath);
  if (path.dirname(resolvedHandoff) !== rootPath) throw new Error('candidate handoff must be direct child of root');
  let rootHandle;
  let candidateIdentity;
  let candidateName;
  let handoffHandle;
  let handoffIdentity;
  try {
    if (await realpath(rootPath) !== rootPath) throw new Error('candidate root symlink refused');
    rootHandle = await open(rootPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const rootFdStat = await rootHandle.stat({ bigint: true });
    const rootPathStat = await lstat(rootPath, { bigint: true });
    if (!rootFdStat.isDirectory() || rootFdStat.uid !== BigInt(process.geteuid())
      || Number(rootFdStat.mode & 0o7777n) !== 0o700 || !matchesIdentity(rootPathStat, fsIdentity(rootFdStat))) {
      throw new Error('candidate root identity or mode invalid');
    }
    const random = randomBytes(16);
    if (!Buffer.isBuffer(random) || random.length !== 16 || random.every((byte) => byte === 0)) {
      random?.fill?.(0);
      throw new Error('candidate random source invalid');
    }
    candidateName = `candidate-${random.toString('hex')}`;
    random.fill(0);
    await mkdir(`/proc/self/fd/${rootHandle.fd}/${candidateName}`, { mode: 0o700 });
    await rootHandle.sync();
    const candidatePath = path.join(rootPath, candidateName);
    const candidateStat = await lstat(candidatePath, { bigint: true });
    if (!candidateStat.isDirectory() || candidateStat.uid !== BigInt(process.geteuid())
      || Number(candidateStat.mode & 0o7777n) !== 0o700) throw new Error('candidate directory mode invalid');
    candidateIdentity = fsIdentity(candidateStat);
    const handoff = {
      schemaVersion: 1,
      candidatePath,
      candidateIdentity: { ...candidateIdentity, uid: Number(candidateStat.uid), mode: '0700' },
    };
    handoffHandle = await open(`/proc/self/fd/${rootHandle.fd}/${path.basename(resolvedHandoff)}`,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await handoffHandle.writeFile(`${JSON.stringify(handoff)}\n`);
    await handoffHandle.sync();
    const handoffStat = await handoffHandle.stat({ bigint: true });
    if (!handoffStat.isFile() || handoffStat.uid !== BigInt(process.geteuid()) || handoffStat.nlink !== 1n
      || Number(handoffStat.mode & 0o7777n) !== 0o600) throw new Error('candidate handoff mode invalid');
    handoffIdentity = fsIdentity(handoffStat);
    await rootHandle.sync();
    const [rootAfter, candidateAfter, handoffAfter] = await Promise.all([
      lstat(rootPath, { bigint: true }), lstat(candidatePath, { bigint: true }), lstat(resolvedHandoff, { bigint: true }),
    ]);
    if (!matchesIdentity(rootAfter, fsIdentity(rootFdStat)) || !matchesIdentity(candidateAfter, candidateIdentity)
      || !matchesIdentity(handoffAfter, handoffIdentity)) throw new Error('candidate workspace identity changed');
    return Object.freeze({
      candidatePath,
      handoffPath: resolvedHandoff,
      candidateIdentity: Object.freeze({ ...candidateIdentity }),
      handoffIdentity: Object.freeze({ ...handoffIdentity }),
    });
  } catch (error) {
    if (handoffHandle) await handoffHandle.close().catch(() => {});
    handoffHandle = null;
    if (rootHandle && handoffIdentity) {
      const stat = await lstat(resolvedHandoff, { bigint: true }).catch(() => null);
      if (stat && matchesIdentity(stat, handoffIdentity)) {
        await unlink(`/proc/self/fd/${rootHandle.fd}/${path.basename(resolvedHandoff)}`).catch(() => {});
      }
    }
    if (rootHandle && candidateIdentity && candidateName) {
      const candidatePath = path.join(rootPath, candidateName);
      const stat = await lstat(candidatePath, { bigint: true }).catch(() => null);
      if (stat && matchesIdentity(stat, candidateIdentity)) {
        await rmdir(`/proc/self/fd/${rootHandle.fd}/${candidateName}`).catch(() => {});
      }
    }
    if (rootHandle) await rootHandle.sync().catch(() => {});
    throw new Error('candidate workspace or handoff creation failed', { cause: error });
  } finally {
    if (handoffHandle) await handoffHandle.close().catch(() => {});
    if (rootHandle) await rootHandle.close().catch(() => {});
  }
}

function validateChildInvocation(invocation) {
  if (!invocation || typeof invocation.executable !== 'string' || !path.isAbsolute(invocation.executable)
    || !Array.isArray(invocation.args) || invocation.args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))
    || !invocation.env || typeof invocation.env !== 'object' || Array.isArray(invocation.env)
    || Object.entries(invocation.env).some(([key, value]) => !/^[A-Z_][A-Z0-9_]*$/u.test(key) || typeof value !== 'string' || value.includes('\0'))
    || !['ignore', 'pipe'].includes(invocation.stdin) || invocation.stdout !== 'pipe' || invocation.stderr !== 'pipe') {
    throw new Error('bounded child invocation invalid');
  }
  if (invocation.containerName !== undefined) {
    assertContainerName(invocation.containerName);
    if (!invocation.args.includes(`--name=${invocation.containerName}`)) throw new Error('bounded child container identity missing');
  }
}

function signalGroup(child, signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

export async function runBoundedChild(invocation, {
  stdinBuffer = null,
  maxBytes = DRY_RUN_MAX_BYTES,
  timeoutMs = CHILD_TIMEOUT_MS,
  killAfterMs = 2_000,
  spawnImpl = spawn,
  cleanupContainer = ensureDockerContainerAbsent,
} = {}) {
  validateChildInvocation(invocation);
  if ((invocation.stdin === 'pipe') !== Buffer.isBuffer(stdinBuffer)) throw new Error('bounded child stdin contract invalid');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1
    || !Number.isSafeInteger(killAfterMs) || killAfterMs < 1 || typeof cleanupContainer !== 'function') {
    throw new Error('bounded child limits invalid');
  }
  const child = spawnImpl(invocation.executable, invocation.args, {
    env: invocation.env,
    stdio: [invocation.stdin, 'pipe', 'pipe'],
    shell: false,
    detached: true,
  });
  const stdoutChunks = [];
  const stderrChunks = [];
  let totalBytes = 0;
  let failure;
  let terminating = false;
  let killTimer;
  let timeoutTimer;
  let stdinAccepted = invocation.stdin === 'ignore';

  const wipe = () => {
    for (const chunk of [...stdoutChunks, ...stderrChunks]) chunk.fill(0);
    stdoutChunks.length = 0;
    stderrChunks.length = 0;
  };
  const terminate = (error) => {
    if (!failure) failure = error;
    if (terminating) return;
    terminating = true;
    try {
      signalGroup(child, 'SIGTERM');
    } catch {
      failure = failure ?? new Error('bounded child termination failed');
    }
    killTimer = setTimeout(() => {
      try { signalGroup(child, 'SIGKILL'); } catch { /* close path reports generic failure */ }
    }, killAfterMs);
    killTimer.unref?.();
  };
  const collect = (target) => (chunk) => {
    const copy = Buffer.from(chunk);
    if (failure || totalBytes + copy.length > maxBytes) {
      copy.fill(0);
      terminate(new Error('bounded child output limit exceeded'));
      return;
    }
    totalBytes += copy.length;
    target.push(copy);
  };
  child.stdout?.on('data', collect(stdoutChunks));
  child.stderr?.on('data', collect(stderrChunks));
  child.once('error', () => terminate(new Error('bounded child spawn failed')));
  const stdinError = () => terminate(new Error('bounded child stdin failed'));
  if (invocation.stdin === 'pipe') {
    if (!child.stdin || typeof child.stdin.end !== 'function') terminate(new Error('bounded child stdin unavailable'));
    else {
      child.stdin.once('error', stdinError);
      child.stdin.end(stdinBuffer, (error) => {
        if (error) terminate(new Error('bounded child stdin failed'));
        else stdinAccepted = true;
      });
    }
  }
  timeoutTimer = setTimeout(() => terminate(new Error('bounded child timeout')), timeoutMs);
  timeoutTimer.unref?.();

  const { code, signal } = await new Promise((resolve) => child.once('close', (childCode, childSignal) => resolve({ code: childCode, signal: childSignal })));
  clearTimeout(timeoutTimer);
  clearTimeout(killTimer);
  child.stdin?.removeListener?.('error', stdinError);
  let cleanupError;
  try { await cleanupContainer(invocation); }
  catch { cleanupError = new Error('bounded child docker orphan cleanup failed'); }
  if (!stdinAccepted && !failure) failure = new Error('bounded child stdin failed');
  if (!failure && (code !== 0 || signal !== null)) failure = new Error('bounded child exited unsuccessfully');
  if (cleanupError) {
    failure = failure
      ? new AggregateError([failure, cleanupError], 'bounded child and docker cleanup failed')
      : cleanupError;
  }
  if (failure) {
    wipe();
    throw failure;
  }
  const stdout = Buffer.concat(stdoutChunks);
  const stderr = Buffer.concat(stderrChunks);
  wipe();
  return Object.freeze({ code, signal, stdout, stderr });
}

function canonicalJson(value) {
  return Buffer.from(`${JSON.stringify(value)}\n`);
}

async function writeCandidateFile(workspace, name, bytes) {
  if (!Buffer.isBuffer(bytes) || !/^[a-z0-9][a-z0-9.-]+$/u.test(name) || path.basename(name) !== name) {
    throw new Error('candidate file arguments invalid');
  }
  let directory;
  let file;
  let createdIdentity;
  try {
    directory = await open(workspace.candidatePath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const directoryStat = await directory.stat({ bigint: true });
    const pathStat = await lstat(workspace.candidatePath, { bigint: true });
    if (!directoryStat.isDirectory() || directoryStat.uid !== BigInt(process.geteuid())
      || Number(directoryStat.mode & 0o7777n) !== 0o700
      || !matchesIdentity(pathStat, workspace.candidateIdentity)
      || !matchesIdentity(directoryStat, workspace.candidateIdentity)) throw new Error('candidate directory identity changed');
    const fdPath = `/proc/self/fd/${directory.fd}/${name}`;
    file = await open(fdPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await file.writeFile(bytes);
    await file.sync();
    const fileStat = await file.stat({ bigint: true });
    if (!fileStat.isFile() || fileStat.uid !== BigInt(process.geteuid()) || fileStat.nlink !== 1n
      || Number(fileStat.mode & 0o7777n) !== 0o600 || fileStat.size !== BigInt(bytes.length)) {
      throw new Error('candidate file identity or mode invalid');
    }
    createdIdentity = fsIdentity(fileStat);
    const filePathStat = await lstat(path.join(workspace.candidatePath, name), { bigint: true });
    if (!matchesIdentity(filePathStat, createdIdentity)) throw new Error('candidate file path identity changed');
    await directory.sync();
    return Object.freeze({ name, ...createdIdentity, sha256: createHash('sha256').update(bytes).digest('hex') });
  } catch (error) {
    if (directory && createdIdentity) {
      const current = await lstat(path.join(workspace.candidatePath, name), { bigint: true }).catch(() => null);
      if (current && matchesIdentity(current, createdIdentity)) {
        await unlink(`/proc/self/fd/${directory.fd}/${name}`).catch(() => {});
        await directory.sync().catch(() => {});
      }
    }
    throw error;
  } finally {
    await file?.close().catch(() => {});
    await directory?.close().catch(() => {});
  }
}

async function cleanupCandidateWorkspace(workspace) {
  const rootPath = path.dirname(workspace.handoffPath);
  let root;
  let candidate;
  try {
    root = await open(rootPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    candidate = await open(`/proc/self/fd/${root.fd}/${path.basename(workspace.candidatePath)}`,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const candidateStat = await candidate.stat({ bigint: true });
    if (!matchesIdentity(candidateStat, workspace.candidateIdentity)) throw new Error('candidate cleanup identity changed');
    const names = await readdir(`/proc/self/fd/${candidate.fd}`);
    for (const name of names) {
      if (path.basename(name) !== name || name === '.' || name === '..') throw new Error('candidate cleanup entry invalid');
      const stat = await lstat(`/proc/self/fd/${candidate.fd}/${name}`, { bigint: true });
      if (!stat.isFile() || stat.uid !== BigInt(process.geteuid()) || stat.nlink !== 1n) throw new Error('candidate cleanup foreign entry HOLD');
      await unlink(`/proc/self/fd/${candidate.fd}/${name}`);
    }
    await candidate.sync();
    await candidate.close();
    candidate = null;
    await rmdir(`/proc/self/fd/${root.fd}/${path.basename(workspace.candidatePath)}`);
    const handoffStat = await lstat(workspace.handoffPath, { bigint: true });
    if (!matchesIdentity(handoffStat, workspace.handoffIdentity)) throw new Error('candidate handoff cleanup identity changed');
    await unlink(`/proc/self/fd/${root.fd}/${path.basename(workspace.handoffPath)}`);
    await root.sync();
  } finally {
    await candidate?.close().catch(() => {});
    await root?.close().catch(() => {});
  }
}

export function buildExpectedSupabaseDryRunStderr(workdir) {
  if (typeof workdir !== 'string' || !path.isAbsolute(workdir) || /[\0\r\n]/u.test(workdir)) {
    throw new Error('Supabase dry-run workdir invalid');
  }
  return Buffer.from(
    `Using workdir ${workdir}\nDRY RUN: *only* printing the pg_dump script to console.\nDumping schemas from remote database...\n`,
    'utf8',
  );
}

function assertSuccessfulChild(result, label, expectedStderr = Buffer.alloc(0)) {
  if (!result || result.code !== 0 || result.signal !== null || !Buffer.isBuffer(result.stdout) || !Buffer.isBuffer(result.stderr)) {
    result?.stdout?.fill?.(0);
    result?.stderr?.fill?.(0);
    throw new Error(`${label} child failed`);
  }
  if (!Buffer.isBuffer(expectedStderr) || !result.stderr.equals(expectedStderr)) {
    result.stdout.fill(0);
    result.stderr.fill(0);
    throw new Error(`${label} child emitted unexpected stderr`);
  }
  result.stderr.fill(0);
  return result.stdout;
}

export async function runSuccessfulChild(runChild, invocation, options, label, expectedStderr = Buffer.alloc(0)) {
  try {
    return assertSuccessfulChild(await runChild(invocation, options), label, expectedStderr);
  } catch (error) {
    const fixedReasons = new Map([
      [`${label} child emitted unexpected stderr`, 'emitted unexpected stderr'],
      [`${label} child failed`, 'returned an invalid result'],
      ['bounded child exited unsuccessfully', 'exited unsuccessfully'],
      ['bounded child timeout', 'timed out'],
      ['bounded child output limit exceeded', 'exceeded output limit'],
      ['bounded child stdin failed', 'stdin failed'],
      ['bounded child spawn failed', 'spawn failed'],
    ]);
    const reason = fixedReasons.get(error?.message);
    throw new Error(reason ? `${label} ${reason}` : `${label} failed`);
  }
}

export async function runProductionCaptureCandidate({
  projectRef,
  captures,
  candidateRoot,
  handoffPath,
  verifyProjectRef = verifyLinkedProjectRef,
  verifyRuntime = verifyLockedPg17Runtime,
  prepareRuntime = preparePinnedCaptureRuntime,
  loadDbPassword = loadSupabaseDbPassword,
  loadAccessToken = loadSupabaseAccessToken,
  randomBytes = cryptoRandomBytes,
  runChild = runBoundedChild,
} = {}) {
  if (captures !== 2 || typeof verifyProjectRef !== 'function' || typeof verifyRuntime !== 'function'
    || typeof prepareRuntime !== 'function' || typeof loadDbPassword !== 'function'
    || typeof loadAccessToken !== 'function' || typeof runChild !== 'function') {
    throw new Error('capture workflow arguments invalid');
  }
  let workspace;
  let home;
  let dbPassword;
  let accessToken;
  let credential;
  try {
    await verifyProjectRef(projectRef);
    const loadedToolchain = await loadCaptureToolchain();
    await verifyRuntime(loadedToolchain.lock);
    const toolchain = loadedToolchain.trusted;
    workspace = await initializeCandidateWorkspace({ candidateRoot, handoffPath, randomBytes });
    home = await mkdtemp(path.join(tmpdir(), 'midao-production-capture-home-'));
    await chmod(home, 0o700);
    const captureRuntime = await prepareRuntime({ lock: loadedToolchain.lock, projectRef, home, runChild });
    if (!captureRuntime || typeof captureRuntime.cliPath !== 'string' || typeof captureRuntime.workdir !== 'string'
      || !captureRuntime.cliPath.startsWith(`${home}${path.sep}`) || !captureRuntime.workdir.startsWith(`${home}${path.sep}`)) {
      throw new Error('private capture runtime invalid');
    }

    dbPassword = loadDbPassword();
    if (dbPassword !== null && !Buffer.isBuffer(dbPassword)) throw new Error('Supabase DB password loader invalid');
    if (dbPassword === null) accessToken = await loadAccessToken();
    let dryRun;
    try {
      dryRun = await runSuccessfulChild(runChild,
        buildDryRunInvocation({ projectRef, home, accessToken, dbPassword, cliPath: captureRuntime.cliPath, workdir: captureRuntime.workdir }),
        { maxBytes: DRY_RUN_MAX_BYTES, timeoutMs: CHILD_TIMEOUT_MS },
        'Supabase dry-run',
        buildExpectedSupabaseDryRunStderr(captureRuntime.workdir));
    } finally {
      dbPassword?.fill(0);
      dbPassword = null;
      accessToken?.fill(0);
      accessToken = null;
    }
    credential = parseDumpDryRunEnvelope(dryRun);

    const runs = [];
    for (const label of ['a', 'b']) {
      let archive;
      try {
      archive = await runSuccessfulChild(runChild,
        buildPg17DumpInvocation({ toolchain, home, connectionEnv: credential }),
        { maxBytes: 64 * 1024 * 1024, timeoutMs: CHILD_TIMEOUT_MS },
        `capture ${label} archive`);
      await writeCandidateFile(workspace, `capture-${label}.dump`, archive);

      const catalogSql = await readIdentityBoundFile(FIXED_SQL, { expectedPath: FIXED_SQL, maxBytes: 1024 * 1024, label: 'catalog SQL', allowedModes: [0o644] });
      let catalogBytes;
      try {
        catalogBytes = await runSuccessfulChild(runChild,
          buildPg17CatalogInvocation({ toolchain, home, connectionEnv: credential }),
          { stdinBuffer: catalogSql, maxBytes: 16 * 1024 * 1024, timeoutMs: CHILD_TIMEOUT_MS },
          `capture ${label} catalog`);
      } finally {
        catalogSql.fill(0);
      }
      let catalog;
      try { catalog = parseCatalogChildResult({ code: 0, signal: null, stdout: catalogBytes, stderr: Buffer.alloc(0) }); }
      finally { catalogBytes.fill(0); }
      const rawCatalog = canonicalJson(catalog);
      const normalizedCatalog = Buffer.from(normalizeCatalog(catalog));
      try {
        await writeCandidateFile(workspace, `catalog-${label}.raw.json`, rawCatalog);
        await writeCandidateFile(workspace, `catalog-${label}.normalized.json`, normalizedCatalog);
      } finally {
        rawCatalog.fill(0);
      }

      const tocBytes = await runSuccessfulChild(runChild,
        buildPg17RestoreListInvocation({ toolchain, home }),
        { stdinBuffer: archive, maxBytes: 4 * 1024 * 1024, timeoutMs: CHILD_TIMEOUT_MS },
        `capture ${label} TOC`);
      const toc = parsePg17Toc(tocBytes);
      const normalizedToc = canonicalJson(toc);
      try {
        await writeCandidateFile(workspace, `toc-${label}.txt`, tocBytes);
        await writeCandidateFile(workspace, `toc-${label}.normalized.json`, normalizedToc);
      } finally {
        tocBytes.fill(0);
      }
      runs.push({ catalog, normalizedCatalog, normalizedToc });
      } finally {
        archive?.fill(0);
      }
    }

    if (!runs[0].normalizedCatalog.equals(runs[1].normalizedCatalog)) throw new Error('A/B normalized catalog mismatch');
    if (!runs[0].normalizedToc.equals(runs[1].normalizedToc)) throw new Error('A/B normalized TOC mismatch');
    const normalizedOwnershipCatalog = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(runs[0].normalizedCatalog));
    const ownershipInput = canonicalJson({
      catalog: normalizedOwnershipCatalog,
      templateOnly: true,
      ownershipBoundary: { schemaVersion: 1, status: 'template', assignments: [] },
      roleMap: { schemaVersion: 1, roles: [
        { name: 'application-owner', ownerDomain: 'application' },
        { name: 'application-overlay-owner', ownerDomain: 'application_overlay' },
        { name: 'platform-owner', ownerDomain: 'platform' },
        { name: 'extension-owner', ownerDomain: 'extension' },
        { name: 'excluded-environmental-owner', ownerDomain: 'excluded_environmental' },
      ] },
      exclusions: { schemaVersion: 1, entries: [] },
      platformPrerequisites: { schemaVersion: 1, objects: [] },
      tocOwnershipMap: { schemaVersion: 1, expectedTocIds: [], entries: [] },
    });
    try { await writeCandidateFile(workspace, 'ownership-validation-input.json', ownershipInput); }
    finally { ownershipInput.fill(0); }
    for (const run of runs) {
      run.normalizedCatalog.fill(0);
      run.normalizedToc.fill(0);
    }
    return Object.freeze({ candidatePath: workspace.candidatePath, handoffPath: workspace.handoffPath, captureCount: 2 });
  } catch (error) {
    const errors = [error];
    if (workspace) await cleanupCandidateWorkspace(workspace).catch((cleanupError) => errors.push(cleanupError));
    if (home) {
      await rm(home, { recursive: true, force: true }).catch((cleanupError) => errors.push(cleanupError));
      home = null;
    }
    if (errors.length > 1) throw new AggregateError(errors, 'capture failed and cleanup failed');
    throw error;
  } finally {
    dbPassword?.fill(0);
    dbPassword = null;
    accessToken?.fill(0);
    accessToken = null;
    credential = null;
    if (home) await rm(home, { recursive: true, force: true });
  }
}

async function main() {
  const cli = parseCaptureCli(process.argv.slice(2));
  const candidateRoot = path.resolve(cli.candidateRoot);
  await ensureCandidateRoot(candidateRoot);
  const result = await runProductionCaptureCandidate({
    projectRef: cli.projectRef,
    captures: cli.captures,
    candidateRoot,
    handoffPath: path.resolve(cli.handoffPath),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
