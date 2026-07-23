#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const LOCK_PATH = '/tmp/tour-platform-local-supabase.lock';
const HELP_LINE = 'Try rerunning the command with --debug to troubleshoot the error.';

export function parseSupabasePin(lockText) {
  let lock;
  try { lock = JSON.parse(lockText); } catch { throw new Error('INVALID_PACKAGE_LOCK'); }
  const version = lock?.packages?.['node_modules/supabase']?.version;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/u.test(version)) throw new Error('INVALID_SUPABASE_PIN');
  return version;
}

export function canonicalProjectId(repoRoot) {
  const projectId = basename(resolve(repoRoot));
  if (!projectId || !/^[a-z0-9_-]+$/u.test(projectId)) throw new Error('INVALID_PROJECT_ID');
  return projectId;
}

function nonemptyLines(text) {
  return String(text || '').split(/\r?\n/u).filter((line) => line.length > 0);
}

export function classifySupabaseStatus({ exitCode, stdout, stderr, expectedProjectId }) {
  if (exitCode === 0) {
    if (String(stderr || '').trim()) throw new Error('STATUS_UNEXPECTED_STDERR');
    return 'running';
  }
  if (exitCode !== 1 || String(stdout || '').length !== 0) throw new Error('STATUS_UNCLASSIFIED');
  const exactLine = `failed to inspect container health: Error response from daemon: No such container: supabase_db_${expectedProjectId}`;
  const lf = `${exactLine}\n${HELP_LINE}\n`;
  const crlf = `${exactLine}\r\n${HELP_LINE}\r\n`;
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

export async function runWithLocalSupabase({ adapter, expectedProjectId, childArgs, signal }) {
  let owned = null;
  let ownedAssets = null;
  try {
    const status = await adapter.status();
    const classification = classifySupabaseStatus({ ...status, expectedProjectId });
    if (classification === 'running') throw new Error('ALREADY_RUNNING');
    await adapter.start();
    owned = confirmProjectContainers({ expectedProjectId, containers: await adapter.containers() });
    if (adapter.assets) ownedAssets = await adapter.assets();
    await adapter.reset();
    const localEnv = adapter.statusJson ? await adapter.statusJson() : {};
    if (adapter.ready) await adapter.ready(localEnv);
    if (adapter.child) {
      const child = await adapter.child(childArgs, localEnv);
      if (child.exitCode !== 0) throw new Error(`CHILD_FAILED_${child.exitCode}`);
    }
    return { exitCode: 0, localEnv };
  } finally {
    if (owned) {
      const current = confirmProjectContainers({ expectedProjectId, containers: await adapter.containers() });
      assertOwnershipUnchanged(owned, current);
      if (ownedAssets) {
        const currentAssets = await adapter.assets();
        if (JSON.stringify(ownedAssets) !== JSON.stringify(currentAssets)) throw new Error('OWNERSHIP_DRIFT');
      }
      await adapter.stop(owned, ownedAssets);
    }
    if (signal?.aborted) throw new Error('RUNNER_SIGNALLED');
  }
}

async function runCommand(command, args, { cwd, env = process.env, signal } = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd, env, signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (exitCode, signal) => resolveResult({ exitCode: exitCode ?? 1, signal, stdout, stderr }));
  });
}

function parseContainerRows(stdout, expectedProjectId) {
  return nonemptyLines(stdout).map((line) => {
    const [id, name, label] = line.split('\t');
    return { id, name, projectLabel: label || '' };
  });
}

function mapStatusEnvironment(raw) {
  let status;
  try { status = JSON.parse(raw); } catch { throw new Error('INVALID_STATUS_JSON'); }
  const required = ['API_URL', 'DB_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY'];
  for (const key of required) if (typeof status[key] !== 'string' || !status[key]) throw new Error(`STATUS_JSON_MISSING_${key}`);
  return {
    DATABASE_URL: status.DB_URL,
    SUPABASE_DB_URL: status.DB_URL,
    SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    SUPABASE_ANON_KEY: status.ANON_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  };
}

export function createActualAdapter({ repoRoot, pin, nodeBin, signal, commandRunner = runCommand }) {
  const cli = (args, { cleanup = false } = {}) => {
    const invocation = buildSupabaseCliInvocation(pin, args);
    return commandRunner(invocation.command, invocation.args, { cwd: repoRoot, signal: cleanup ? undefined : signal });
  };
  const containers = async () => {
    const result = await commandRunner('docker', [
      'ps', '--no-trunc', '--filter', `label=com.supabase.cli.project=${canonicalProjectId(repoRoot)}`,
      '--format', '{{.ID}}\t{{.Names}}\t{{.Label "com.supabase.cli.project"}}',
    ], { cwd: repoRoot });
    if (result.exitCode !== 0 || result.stderr.trim()) throw new Error('DOCKER_IDENTITY_FAILED');
    return parseContainerRows(result.stdout, canonicalProjectId(repoRoot));
  };
  const assets = async () => {
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
      networks: confirmProjectContainers({ expectedProjectId: projectId, containers: networks }),
      volumes: confirmProjectContainers({ expectedProjectId: projectId, containers: volumes }),
    };
  };
  return {
    status: () => cli(['status']),
    start: async () => {
      const result = await cli(['start', '--project-id', canonicalProjectId(repoRoot)]);
      if (result.exitCode !== 0) throw new Error('SUPABASE_START_FAILED');
    },
    containers,
    assets,
    reset: async () => {
      const result = await cli(['db', 'reset', '--local']);
      if (result.exitCode !== 0) throw new Error('SUPABASE_RESET_FAILED');
    },
    statusJson: async () => {
      const result = await cli(['status', '-o', 'json']);
      if (result.exitCode !== 0 || result.stderr.trim()) throw new Error('SUPABASE_STATUS_JSON_FAILED');
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
      const networkResult = await commandRunner('docker', ['network', 'rm', ...ownedAssets.networks.map((network) => network.id)], { cwd: repoRoot });
      if (networkResult.exitCode !== 0) throw new Error('OWNED_NETWORK_CLEANUP_FAILED');
      const volumeResult = await commandRunner('docker', ['volume', 'rm', ...ownedAssets.volumes.map((volume) => volume.id)], { cwd: repoRoot });
      if (volumeResult.exitCode !== 0) throw new Error('OWNED_VOLUME_CLEANUP_FAILED');
    },
  };
}

async function main() {
  const repoRoot = process.cwd();
  const projectId = canonicalProjectId(repoRoot);
  const packageLock = await fsPromises.readFile(resolve(repoRoot, 'package-lock.json'), 'utf8');
  const pin = parseSupabasePin(packageLock);
  const nodeBin = process.execPath;
  const stat = await fsPromises.readFile(`/proc/${process.pid}/stat`, 'utf8');
  const close = stat.lastIndexOf(')');
  const metadata = { pid: process.pid, processStartTicks: stat.slice(close + 2).split(/\s+/u)[19], repoRoot };
  const controller = new AbortController();
  const abort = () => controller.abort(new Error('RUNNER_SIGNALLED'));
  process.on('SIGTERM', abort);
  process.on('SIGINT', abort);

  let lock;
  try {
    lock = await acquireKernelRunnerLock({ lockDir: LOCK_PATH, metadata });
    const childArgs = process.argv.slice(2);
    if (childArgs.length === 0) childArgs.push(
      'apps/web/tests/integration/midao-foundation-schema-postgres.test.mjs',
      'apps/web/tests/integration/midao-mode-switch-postgres.test.mjs',
      'apps/web/tests/integration/midao-mode-switch-concurrency-postgres.test.mjs',
    );
    await runWithLocalSupabase({
      adapter: createActualAdapter({ repoRoot, pin, nodeBin, signal: controller.signal }),
      expectedProjectId: projectId,
      childArgs,
      signal: controller.signal,
    });
  } finally {
    process.removeListener('SIGTERM', abort);
    process.removeListener('SIGINT', abort);
    if (lock) await releaseKernelRunnerLock(lock);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${redactSupabaseOutput(error instanceof Error ? error.stack || error.message : String(error))}\n`);
    process.exitCode = 1;
  });
}
