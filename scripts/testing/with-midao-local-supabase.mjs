#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const LOCK_PATH = '/tmp/tour-platform-local-supabase.lock';
const SUPABASE_TOOLCHAIN_DIR = '/root/.hermes/toolchains/supabase/2.87.2';
const SUPABASE_TOOLCHAIN_BIN = `${SUPABASE_TOOLCHAIN_DIR}/supabase`;
const SUPABASE_TOOLCHAIN_SHA256 = 'e325dd50b274e88fd1416f93b9e063902827ae326d356ab7f9dc604c3eba5c59';
const HELP_LINE = 'Try rerunning the command with --debug to troubleshoot the error.';
const FOUNDATION_MIGRATIONS = [
  '20260723000000_midao_backend_mode.sql',
  '20260723001000_midao_notification_outbox.sql',
  '20260723002000_midao_idempotency_records.sql',
  '20260723002500_midao_audit_events.sql',
  '20260723003000_midao_atomic_backend_mode_switch.sql',
  '20260723003500_midao_service_role_acl_hardening.sql',
];
const FOUNDATION_BOOTSTRAP_SQL = `CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE public.guide_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_status TEXT NOT NULL DEFAULT 'pending',
  guide_session_version INTEGER NOT NULL DEFAULT 1
);
`;
const STOPPED_SERVICE_NAMES = [
  'kong', 'auth', 'inbucket', 'realtime', 'rest', 'storage', 'imgproxy',
  'pg_meta', 'studio', 'edge_runtime', 'analytics', 'vector', 'pooler',
];

export function parseSupabasePin(lockText) {
  let lock;
  try { lock = JSON.parse(lockText); } catch { throw new Error('INVALID_PACKAGE_LOCK'); }
  const version = lock?.packages?.['node_modules/supabase']?.version;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/u.test(version)) throw new Error('INVALID_SUPABASE_PIN');
  return version;
}

export async function verifyPinnedSupabaseBinary() {
  const stat = await fsPromises.lstat(SUPABASE_TOOLCHAIN_BIN);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o111) === 0) throw new Error('UNSAFE_SUPABASE_TOOLCHAIN');
  const digest = createHash('sha256').update(await fsPromises.readFile(SUPABASE_TOOLCHAIN_BIN)).digest('hex');
  if (digest !== SUPABASE_TOOLCHAIN_SHA256) throw new Error('SUPABASE_TOOLCHAIN_DIGEST_MISMATCH');
}

export function parseDockerHostGateway(routeText, cgroupText) {
  if (!/(?:^|\/)docker\/[0-9a-f]+/imu.test(String(cgroupText))) return null;
  for (const line of String(routeText).split(/\r?\n/u).slice(1)) {
    const fields = line.trim().split(/\s+/u);
    if (fields.length < 4 || fields[1] !== '00000000' || (Number.parseInt(fields[3], 16) & 0x2) === 0) continue;
    const hex = fields[2];
    if (!/^[0-9A-Fa-f]{8}$/u.test(hex)) throw new Error('INVALID_DOCKER_GATEWAY');
    return [6, 4, 2, 0].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)).join('.');
  }
  throw new Error('DOCKER_GATEWAY_NOT_FOUND');
}

export async function startLoopbackBridge({ listenPort, targetHost, targetPort }) {
  const sockets = new Set();
  const server = createServer((client) => {
    sockets.add(client);
    const upstream = createConnection({ host: targetHost, port: targetPort });
    sockets.add(upstream);
    const closeBoth = () => { client.destroy(); upstream.destroy(); };
    client.once('error', closeBoth);
    upstream.once('error', closeBoth);
    client.once('close', () => sockets.delete(client));
    upstream.once('close', () => sockets.delete(upstream));
    client.pipe(upstream).pipe(client);
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(listenPort, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  return {
    host: '127.0.0.1',
    port: address.port,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
    },
  };
}

export async function prepareDatabaseOnlyWorkdir({ repoRoot, lockDir }) {
  const projectId = canonicalProjectId(repoRoot);
  const parent = join(lockDir, 'db-only-workdir');
  const workdir = join(parent, projectId);
  await fsPromises.rm(parent, { recursive: true, force: true });
  await fsPromises.mkdir(workdir, { recursive: true, mode: 0o700 });
  await fsPromises.cp(resolve(repoRoot, 'supabase'), join(workdir, 'supabase'), { recursive: true, dereference: false });
  const migrationsPath = join(workdir, 'supabase', 'migrations');
  const migrationContents = [];
  for (const name of FOUNDATION_MIGRATIONS) {
    const path = join(migrationsPath, name);
    const stat = await fsPromises.lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('UNSAFE_FOUNDATION_MIGRATION');
    migrationContents.push([name, await fsPromises.readFile(path, 'utf8')]);
  }
  await fsPromises.rm(migrationsPath, { recursive: true, force: true });
  await fsPromises.mkdir(migrationsPath, { mode: 0o700 });
  await fsPromises.writeFile(join(migrationsPath, '00000000000001_midao_test_bootstrap.sql'), FOUNDATION_BOOTSTRAP_SQL, { mode: 0o600 });
  for (const [index, [name, content]] of migrationContents.entries()) {
    const version = String(index + 2).padStart(14, '0');
    await fsPromises.writeFile(join(migrationsPath, `${version}_${name}`), content, { mode: 0o600 });
  }
  const configPath = join(workdir, 'supabase', 'config.toml');
  const lines = (await fsPromises.readFile(configPath, 'utf8')).split('\n');
  for (const section of ['storage', 'auth', 'realtime', 'db.seed']) {
    let sectionIndex = lines.findIndex((line) => line.trim() === `[${section}]`);
    if (sectionIndex < 0) {
      if (lines.at(-1) !== '') lines.push('');
      lines.push(`[${section}]`, 'enabled = false');
      continue;
    }
    let end = lines.findIndex((line, index) => index > sectionIndex && /^\s*\[/u.test(line));
    if (end < 0) end = lines.length;
    const enabledIndex = lines.findIndex((line, index) => index > sectionIndex && index < end && /^\s*enabled\s*=/u.test(line));
    if (enabledIndex < 0) lines.splice(sectionIndex + 1, 0, 'enabled = false');
    else lines[enabledIndex] = 'enabled = false';
  }
  await fsPromises.writeFile(configPath, lines.join('\n'), { mode: 0o600 });
  const tempPath = join(workdir, 'supabase', '.temp');
  await fsPromises.rm(tempPath, { recursive: true, force: true });
  await fsPromises.mkdir(tempPath, { mode: 0o700 });
  await fsPromises.writeFile(join(tempPath, 'cli-latest'), 'v2.87.2', { mode: 0o600 });
  return workdir;
}

export function canonicalProjectId(repoRoot) {
  const projectId = basename(resolve(repoRoot));
  if (!projectId || !/^[a-z0-9_-]+$/u.test(projectId)) throw new Error('INVALID_PROJECT_ID');
  return projectId;
}

function nonemptyLines(text) {
  return String(text || '').split(/\r?\n/u).filter((line) => line.length > 0);
}

export function validateCliWorkdirNotice(stderr, expectedWorkdir, expectedProjectId) {
  const value = String(stderr ?? '');
  if (!expectedWorkdir) {
    if (value !== '') throw new Error('CLI_UNEXPECTED_STDERR');
    return;
  }
  const accepted = [
    `Using workdir ${expectedWorkdir}\n`,
    `Using workdir ${expectedWorkdir}\r\n`,
  ];
  if (expectedProjectId) {
    const stopped = `Stopped services: [${STOPPED_SERVICE_NAMES.map((service) => `supabase_${service}_${expectedProjectId}`).join(' ')}]`;
    accepted.push(
      `Using workdir ${expectedWorkdir}\n${stopped}\n`,
      `Using workdir ${expectedWorkdir}\r\n${stopped}\r\n`,
    );
  }
  if (!accepted.includes(value)) throw new Error(`CLI_UNEXPECTED_STDERR: ${redactSupabaseOutput(value).trim()}`);
}

export function classifySupabaseStatus({ exitCode, stdout, stderr, expectedProjectId, expectedWorkdir }) {
  if (exitCode === 0) {
    if (String(stderr || '').trim()) throw new Error('STATUS_UNEXPECTED_STDERR');
    return 'running';
  }
  if (exitCode !== 1 || String(stdout || '').length !== 0) throw new Error('STATUS_UNCLASSIFIED');
  const exactLine = `failed to inspect container health: Error response from daemon: No such container: supabase_db_${expectedProjectId}`;
  const prefixLf = expectedWorkdir ? `Using workdir ${expectedWorkdir}\n` : '';
  const prefixCrlf = expectedWorkdir ? `Using workdir ${expectedWorkdir}\r\n` : '';
  const lf = `${prefixLf}${exactLine}\n${HELP_LINE}\n`;
  const crlf = `${prefixCrlf}${exactLine}\r\n${HELP_LINE}\r\n`;
  if (stderr !== lf && stderr !== crlf) throw new Error('STATUS_UNCLASSIFIED');
  return 'not-running';
}

async function flockFileDescriptor(fd) {
  return new Promise((resolveResult, reject) => {
    const child = spawn('flock', ['--exclusive', '--nonblock', '3'], {
      stdio: ['ignore', 'ignore', 'pipe', fd],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (exitCode) => resolveResult({ exitCode: exitCode ?? 1, stderr }));
  });
}

function safeMode(stat) {
  return stat.mode & 0o777;
}

async function writeJsonAtStart(handle, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
  await handle.truncate(0);
  let offset = 0;
  while (offset < bytes.length) {
    const result = await handle.write(bytes, offset, bytes.length - offset, offset);
    if (!result || result.bytesWritten <= 0) throw new Error('LOCK_METADATA_SHORT_WRITE');
    offset += result.bytesWritten;
  }
  await handle.sync();
}

export async function acquireKernelRunnerLock({ lockDir = LOCK_PATH, metadata = {} } = {}) {
  const ownerUid = typeof process.getuid === 'function' ? process.getuid() : null;
  try {
    await fsPromises.mkdir(lockDir, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  const directory = await fsPromises.lstat(lockDir);
  if (!directory.isDirectory() || directory.isSymbolicLink() || safeMode(directory) !== 0o700 || (ownerUid !== null && directory.uid !== ownerUid)) {
    throw new Error('UNSAFE_LOCK_DIRECTORY');
  }

  const lockFile = resolve(lockDir, 'runner.lock');
  let handle;
  try {
    handle = await fsPromises.open(lockFile, fsConstants.O_CREAT | fsConstants.O_RDWR | fsConstants.O_NOFOLLOW, 0o600);
    const identity = await handle.stat();
    if (!identity.isFile() || identity.nlink !== 1 || safeMode(identity) !== 0o600 || (ownerUid !== null && identity.uid !== ownerUid)) {
      throw new Error('UNSAFE_LOCK_FILE');
    }
    const locked = await flockFileDescriptor(handle.fd);
    if (locked.exitCode !== 0) throw new Error('LOCK_HELD');
    const record = { pid: process.pid, ...metadata };
    await writeJsonAtStart(handle, record);
    return { handle, lockFile, record };
  } catch (error) {
    await handle?.close().catch(() => {});
    if (String(error?.message || '').startsWith('UNSAFE_LOCK') || error?.code === 'ELOOP' || error?.code === 'EISDIR') {
      throw new Error('UNSAFE_LOCK');
    }
    throw error;
  }
}

export async function releaseKernelRunnerLock(lock) {
  if (!lock?.handle) throw new Error('LOCK_RELEASE_IDENTITY_MISSING');
  let failure;
  try {
    await writeJsonAtStart(lock.handle, { ...lock.record, released: true });
  } catch (error) {
    failure = error;
  }
  try {
    await lock.handle.close();
  } catch (error) {
    if (!failure) failure = error;
  }
  if (failure) throw failure;
}

export function confirmProjectContainers({ expectedProjectId, containers }) {
  if (!Array.isArray(containers) || containers.length === 0) throw new Error('OWNERSHIP_EMPTY');
  const suffix = `_${expectedProjectId}`;
  const seen = new Set();
  const normalized = containers.map((container) => {
    const row = {
      id: String(container?.id || ''),
      name: String(container?.name || ''),
      projectLabel: String(container?.projectLabel || ''),
    };
    if (!row.id || seen.has(row.id) || row.projectLabel !== expectedProjectId || !row.name.endsWith(suffix)) {
      throw new Error('OWNERSHIP_INVALID');
    }
    seen.add(row.id);
    return row;
  });
  return normalized.sort((a, b) => a.name.localeCompare(b.name));
}

export function assertOwnershipUnchanged(owned, current) {
  const left = JSON.stringify([...owned].sort((a, b) => a.name.localeCompare(b.name)));
  const right = JSON.stringify([...current].sort((a, b) => a.name.localeCompare(b.name)));
  if (left !== right) throw new Error('OWNERSHIP_DRIFT');
}

export function buildSupabaseCliInvocation(pin, args) {
  if (!/^\d+\.\d+\.\d+$/u.test(pin)) throw new Error('INVALID_SUPABASE_PIN');
  return {
    command: 'npm',
    args: ['exec', '--offline', '--yes', `--package=supabase@${pin}`, '--', 'supabase', ...args],
  };
}

export function redactSupabaseOutput(text, secrets = []) {
  let redacted = String(text ?? '');
  for (const secret of secrets.filter((item) => typeof item === 'string' && item.length > 0).sort((a, b) => b.length - a.length)) {
    redacted = redacted.split(secret).join('[REDACTED]');
  }
  redacted = redacted
    .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s/]+(@)/giu, '$1[REDACTED]$2')
    .replace(/("?(?:anon_key|service_role_key|jwt_secret)"?\s*[:=]\s*"?)[^",\s]+/giu, '$1[REDACTED]');
  return redacted;
}

export async function runWithLocalSupabase({ adapter, expectedProjectId, childArgs, signal, reportStage = () => {} }) {
  let owned = null;
  let ownedAssets = null;
  try {
    reportStage('status');
    const status = await adapter.status();
    const classification = classifySupabaseStatus({ ...status, expectedProjectId });
    if (classification === 'running') throw new Error('ALREADY_RUNNING');
    try {
      reportStage('start');
      await adapter.start();
    } catch (startError) {
      reportStage('start-failed-identity');
      const partialContainers = await adapter.containers();
      if (partialContainers.length > 0) {
        owned = confirmProjectContainers({ expectedProjectId, containers: partialContainers });
        ownedAssets = adapter.assets ? await adapter.assets({ allowEmpty: true }) : null;
      }
      throw startError;
    }
    reportStage('pre-reset-identity');
    owned = confirmProjectContainers({ expectedProjectId, containers: await adapter.containers() });
    if (adapter.assets) ownedAssets = await adapter.assets();
    reportStage('pre-reset-health');
    if (adapter.waitForDatabase) await adapter.waitForDatabase(owned);
    reportStage('reset');
    await adapter.reset();
    reportStage('post-reset-identity');
    owned = confirmProjectContainers({ expectedProjectId, containers: await adapter.containers() });
    if (adapter.assets) ownedAssets = await adapter.assets();
    reportStage('post-reset-health');
    if (adapter.waitForDatabase) await adapter.waitForDatabase(owned);
    reportStage('status-json');
    const localEnv = adapter.statusJson ? await adapter.statusJson() : {};
    reportStage('ready');
    if (adapter.ready) await adapter.ready(localEnv);
    if (adapter.child) {
      reportStage('child');
      const child = await adapter.child(childArgs, localEnv);
      if (child.exitCode !== 0) throw new Error(`CHILD_FAILED_${child.exitCode}`);
    }
    reportStage('complete');
    return { exitCode: 0, localEnv };
  } finally {
    if (owned) {
      reportStage('cleanup-identity');
      const current = confirmProjectContainers({ expectedProjectId, containers: await adapter.containers() });
      assertOwnershipUnchanged(owned, current);
      if (ownedAssets) {
        const currentAssets = await adapter.assets({ allowEmpty: true });
        if (JSON.stringify(ownedAssets) !== JSON.stringify(currentAssets)) throw new Error('OWNERSHIP_DRIFT');
      }
      reportStage('cleanup');
      await adapter.stop(owned, ownedAssets);
    }
    if (signal?.aborted) throw new Error('RUNNER_SIGNALLED');
  }
}

export function runCommand(command, args, { cwd, env = process.env, signal } = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const onAbort = () => {
      try { process.kill(-child.pid, 'SIGTERM'); } catch (error) {
        if (error?.code !== 'ESRCH') child.kill('SIGTERM');
      }
    };
    const detachAbort = () => signal?.removeEventListener('abort', onAbort);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => { detachAbort(); reject(error); });
    child.once('close', (exitCode, childSignal) => {
      detachAbort();
      resolveResult({ exitCode: exitCode ?? 1, signal: childSignal, stdout, stderr });
    });
  });
}

function parseContainerRows(stdout, expectedProjectId) {
  return nonemptyLines(stdout).map((line) => {
    const [id, name, label] = line.split('\t');
    return { id, name, projectLabel: label || '' };
  });
}

export function mapStatusEnvironment(raw) {
  let status;
  try { status = JSON.parse(raw); } catch { throw new Error('INVALID_STATUS_JSON'); }
  if (typeof status.DB_URL !== 'string' || !status.DB_URL) throw new Error('STATUS_JSON_MISSING_DB_URL');
  const environment = {
    DATABASE_URL: status.DB_URL,
    SUPABASE_DB_URL: status.DB_URL,
  };
  const optional = ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY'];
  const present = optional.filter((key) => typeof status[key] === 'string' && status[key]);
  if (present.length !== 0 && present.length !== optional.length) throw new Error('STATUS_JSON_INCOMPLETE_API_ENV');
  if (present.length === optional.length) Object.assign(environment, {
    SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    SUPABASE_ANON_KEY: status.ANON_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  });
  return environment;
}

export function createActualAdapter({ repoRoot, pin, nodeBin, signal, cliWorkdir, commandRunner = runCommand }) {
  const cli = (args, { cleanup = false } = {}) => {
    const effectiveArgs = cliWorkdir ? [...args, '--workdir', cliWorkdir] : args;
    const invocation = buildSupabaseCliInvocation(pin, effectiveArgs);
    return commandRunner(invocation.command, invocation.args, {
      cwd: repoRoot,
      signal: cleanup ? undefined : signal,
      env: { ...process.env, PATH: `${SUPABASE_TOOLCHAIN_DIR}:${process.env.PATH ?? ''}`, DOCKER_API_VERSION: '1.43' },
    });
  };
  const containers = async () => {
    const result = await commandRunner('docker', [
      'ps', '--no-trunc', '--filter', `label=com.supabase.cli.project=${canonicalProjectId(repoRoot)}`,
      '--format', '{{.ID}}\t{{.Names}}\t{{.Label "com.supabase.cli.project"}}',
    ], { cwd: repoRoot });
    if (result.exitCode !== 0 || result.stderr.trim()) throw new Error('DOCKER_IDENTITY_FAILED');
    return parseContainerRows(result.stdout, canonicalProjectId(repoRoot));
  };
  const assets = async ({ allowEmpty = false } = {}) => {
    const label = `label=com.supabase.cli.project=${canonicalProjectId(repoRoot)}`;
    const networkResult = await commandRunner('docker', [
      'network', 'ls', '--no-trunc', '--filter', label,
      '--format', '{{.ID}}\t{{.Name}}\t{{.Label "com.supabase.cli.project"}}',
    ], { cwd: repoRoot });
    const volumeResult = await commandRunner('docker', [
      'volume', 'ls', '--filter', label,
      '--format', '{{.Name}}\t{{.Label "com.supabase.cli.project"}}',
    ], { cwd: repoRoot });
    if (networkResult.exitCode !== 0 || networkResult.stderr.trim() || volumeResult.exitCode !== 0 || volumeResult.stderr.trim()) {
      throw new Error('DOCKER_ASSET_IDENTITY_FAILED');
    }
    const projectId = canonicalProjectId(repoRoot);
    const networks = parseContainerRows(networkResult.stdout, projectId);
    const volumes = nonemptyLines(volumeResult.stdout).map((line) => {
      const [name, projectLabel] = line.split('\t');
      return { id: name, name, projectLabel };
    });
    return {
      networks: allowEmpty && networks.length === 0 ? [] : confirmProjectContainers({ expectedProjectId: projectId, containers: networks }),
      volumes: allowEmpty && volumes.length === 0 ? [] : confirmProjectContainers({ expectedProjectId: projectId, containers: volumes }),
    };
  };
  const waitForDatabase = async (owned) => {
    const expectedName = `supabase_db_${canonicalProjectId(repoRoot)}`;
    const database = owned.filter((container) => container.name === expectedName);
    if (database.length !== 1) throw new Error('DATABASE_CONTAINER_IDENTITY_INVALID');
    for (let attempt = 0; attempt < 180; attempt += 1) {
      if (signal?.aborted) throw new Error('RUNNER_SIGNALLED');
      const result = await commandRunner('docker', ['inspect', '--format', '{{.State.Health.Status}}', database[0].id], { cwd: repoRoot });
      if (result.exitCode !== 0 || result.stderr.trim()) throw new Error('DATABASE_HEALTH_INSPECT_FAILED');
      if (result.stdout.trim() === 'healthy') return;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
    }
    throw new Error('DATABASE_HEALTH_TIMEOUT');
  };
  return {
    status: async () => ({ ...(await cli(['status'])), expectedWorkdir: cliWorkdir }),
    start: async () => {
      const result = await cli(['db', 'start']);
      if (result.exitCode !== 0) {
        const diagnostic = redactSupabaseOutput(result.stderr).trim();
        throw new Error(diagnostic ? `SUPABASE_START_FAILED: ${diagnostic}` : 'SUPABASE_START_FAILED');
      }
    },
    containers,
    assets,
    waitForDatabase,
    reset: async () => {
      const result = await cli(['db', 'reset', '--local']);
      if (result.exitCode !== 0) throw new Error('SUPABASE_RESET_FAILED');
    },
    statusJson: async () => {
      const result = await cli(['status', '-o', 'json']);
      if (result.exitCode !== 0) throw new Error('SUPABASE_STATUS_JSON_FAILED');
      validateCliWorkdirNotice(result.stderr, cliWorkdir, canonicalProjectId(repoRoot));
      return mapStatusEnvironment(result.stdout);
    },
    ready: async (env) => {
      let lastError;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const result = await commandRunner(nodeBin, ['-e', "import('pg').then(async({default:pg})=>{const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();await c.query('SELECT 1');await c.end()})"], {
          cwd: repoRoot, env: { ...process.env, ...env }, signal,
        });
        if (result.exitCode === 0) return;
        lastError = result;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
      }
      throw new Error(`DATABASE_NOT_READY_${lastError?.exitCode ?? 'unknown'}`);
    },
    child: async (paths, env) => {
      const result = await commandRunner(nodeBin, ['--test', '--test-concurrency=1', ...paths], {
        cwd: repoRoot, env: { ...process.env, ...env, NODE_OPTIONS: '--experimental-strip-types' }, signal,
      });
      const secrets = Object.values(env);
      if (result.stdout) process.stdout.write(redactSupabaseOutput(result.stdout, secrets));
      if (result.stderr) process.stderr.write(redactSupabaseOutput(result.stderr, secrets));
      return result;
    },
    stop: async (owned, ownedAssets) => {
      const containerIds = owned.map((container) => container.id);
      const containerResult = await commandRunner('docker', ['rm', '--force', '--', ...containerIds], { cwd: repoRoot });
      if (containerResult.exitCode !== 0) throw new Error('OWNED_CONTAINER_CLEANUP_FAILED');
      if (ownedAssets.networks.length > 0) {
        const networkResult = await commandRunner('docker', ['network', 'rm', ...ownedAssets.networks.map((network) => network.id)], { cwd: repoRoot });
        if (networkResult.exitCode !== 0) throw new Error('OWNED_NETWORK_CLEANUP_FAILED');
      }
      if (ownedAssets.volumes.length > 0) {
        const volumeResult = await commandRunner('docker', ['volume', 'rm', ...ownedAssets.volumes.map((volume) => volume.id)], { cwd: repoRoot });
        if (volumeResult.exitCode !== 0) throw new Error('OWNED_VOLUME_CLEANUP_FAILED');
      }
    },
  };
}

async function main() {
  const repoRoot = process.cwd();
  const projectId = canonicalProjectId(repoRoot);
  const packageLock = await fsPromises.readFile(resolve(repoRoot, 'package-lock.json'), 'utf8');
  const pin = parseSupabasePin(packageLock);
  if (pin !== '2.87.2') throw new Error('SUPABASE_PIN_MISMATCH');
  await verifyPinnedSupabaseBinary();
  const nodeBin = process.execPath;
  const stat = await fsPromises.readFile(`/proc/${process.pid}/stat`, 'utf8');
  const close = stat.lastIndexOf(')');
  const metadata = { pid: process.pid, processStartTicks: stat.slice(close + 2).split(/\s+/u)[19], repoRoot };
  const controller = new AbortController();
  const abort = () => controller.abort(new Error('RUNNER_SIGNALLED'));
  process.on('SIGTERM', abort);
  process.on('SIGINT', abort);

  let lock;
  let bridge;
  let databaseWorkdir;
  try {
    lock = await acquireKernelRunnerLock({ lockDir: LOCK_PATH, metadata });
    const gateway = parseDockerHostGateway(
      await fsPromises.readFile('/proc/net/route', 'utf8'),
      await fsPromises.readFile('/proc/1/cgroup', 'utf8'),
    );
    if (gateway) bridge = await startLoopbackBridge({ listenPort: 54322, targetHost: gateway, targetPort: 54322 });
    databaseWorkdir = await prepareDatabaseOnlyWorkdir({ repoRoot, lockDir: LOCK_PATH });
    const childArgs = process.argv.slice(2);
    if (childArgs.length === 0) childArgs.push(
      'apps/web/tests/integration/midao-foundation-schema-postgres.test.mjs',
      'apps/web/tests/integration/midao-mode-switch-postgres.test.mjs',
      'apps/web/tests/integration/midao-mode-switch-concurrency-postgres.test.mjs',
    );
    await runWithLocalSupabase({
      adapter: createActualAdapter({ repoRoot, pin, nodeBin, signal: controller.signal, cliWorkdir: databaseWorkdir }),
      expectedProjectId: projectId,
      childArgs,
      signal: controller.signal,
      reportStage: (stage) => process.stderr.write(`MIDAO_STAGE=${stage}\n`),
    });
  } finally {
    process.removeListener('SIGTERM', abort);
    process.removeListener('SIGINT', abort);
    try {
      try {
        if (databaseWorkdir) await fsPromises.rm(join(LOCK_PATH, 'db-only-workdir'), { recursive: true, force: true });
      } finally {
        if (bridge) await bridge.close();
      }
    } finally {
      if (lock) await releaseKernelRunnerLock(lock);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${redactSupabaseOutput(error instanceof Error ? error.stack || error.message : String(error))}\n`);
    process.exitCode = 1;
  });
}
