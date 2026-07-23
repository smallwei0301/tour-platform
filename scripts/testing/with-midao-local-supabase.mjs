#!/usr/bin/env node
import { spawn } from 'node:child_process';
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

export async function acquireRunnerLock({ fs = fsPromises, lockPath = LOCK_PATH, metadata, kernelLockHeld = false }) {
  if (!kernelLockHeld) throw new Error('KERNEL_LOCK_REQUIRED');
  await fs.writeFile(lockPath, `${JSON.stringify(metadata)}\n`, { mode: 0o600 });
  return metadata;
}

export async function releaseRunnerLock({ fs = fsPromises, lockPath = LOCK_PATH, metadata, kernelLockHeld = false }) {
  if (!kernelLockHeld) throw new Error('KERNEL_LOCK_REQUIRED');
  let owner;
  try { owner = JSON.parse(await fs.readFile(lockPath, 'utf8')); } catch { throw new Error('LOCK_RELEASE_IDENTITY_MISSING'); }
  if (owner.pid !== metadata.pid || String(owner.processStartTicks) !== String(metadata.processStartTicks) || owner.repoRoot !== metadata.repoRoot) {
    throw new Error('LOCK_RELEASE_IDENTITY_DRIFT');
  }
  await fs.writeFile(lockPath, `${JSON.stringify({ ...metadata, released: true })}\n`, { mode: 0o600 });
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

export function buildFlockInvocation(nodeBin, scriptPath, args) {
  return {
    command: 'flock',
    args: ['--exclusive', '--nonblock', LOCK_PATH, nodeBin, scriptPath, ...args],
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
  try {
    const status = await adapter.status();
    const classification = classifySupabaseStatus({ ...status, expectedProjectId });
    if (classification === 'running') throw new Error('ALREADY_RUNNING');
    await adapter.start();
    owned = confirmProjectContainers({ expectedProjectId, containers: await adapter.containers() });
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
      await adapter.stop(owned);
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

export function createActualAdapter({ repoRoot, pin, nodeBin, signal }) {
  const cli = (args, { cleanup = false } = {}) => {
    const invocation = buildSupabaseCliInvocation(pin, args);
    return runCommand(invocation.command, invocation.args, { cwd: repoRoot, signal: cleanup ? undefined : signal });
  };
  const containers = async () => {
    const result = await runCommand('docker', [
      'ps', '--filter', `label=com.supabase.cli.project=${canonicalProjectId(repoRoot)}`,
      '--format', '{{.ID}}\t{{.Names}}\t{{.Label "com.supabase.cli.project"}}',
    ], { cwd: repoRoot });
    if (result.exitCode !== 0 || result.stderr.trim()) throw new Error('DOCKER_IDENTITY_FAILED');
    return parseContainerRows(result.stdout, canonicalProjectId(repoRoot));
  };
  return {
    status: () => cli(['status']),
    start: async () => {
      const result = await cli(['start', '--project-id', canonicalProjectId(repoRoot)]);
      if (result.exitCode !== 0) throw new Error('SUPABASE_START_FAILED');
    },
    containers,
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
        const result = await runCommand(nodeBin, ['-e', "import('pg').then(async({default:pg})=>{const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();await c.query('SELECT 1');await c.end()})"], {
          cwd: repoRoot, env: { ...process.env, ...env }, signal,
        });
        if (result.exitCode === 0) return;
        lastError = result;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
      }
      throw new Error(`DATABASE_NOT_READY_${lastError?.exitCode ?? 'unknown'}`);
    },
    child: async (paths, env) => {
      const result = await runCommand(nodeBin, ['--test', '--test-concurrency=1', ...paths], {
        cwd: repoRoot, env: { ...process.env, ...env, NODE_OPTIONS: '--experimental-strip-types' }, signal,
      });
      const secrets = Object.values(env);
      if (result.stdout) process.stdout.write(redactSupabaseOutput(result.stdout, secrets));
      if (result.stderr) process.stderr.write(redactSupabaseOutput(result.stderr, secrets));
      return result;
    },
    stop: async (owned) => {
      const ids = owned.map((container) => container.id);
      const result = await runCommand('docker', ['rm', '--force', '--', ...ids], { cwd: repoRoot });
      if (result.exitCode !== 0) throw new Error('OWNED_CONTAINER_CLEANUP_FAILED');
    },
  };
}

async function main() {
  const repoRoot = process.cwd();
  const scriptPath = fileURLToPath(import.meta.url);
  if (process.env.MIDAO_KERNEL_LOCK_HELD !== '1') {
    const invocation = buildFlockInvocation(process.execPath, scriptPath, process.argv.slice(2));
    const result = await runCommand(invocation.command, invocation.args, {
      cwd: repoRoot,
      env: { ...process.env, MIDAO_KERNEL_LOCK_HELD: '1' },
    });
    if (result.stdout) process.stdout.write(redactSupabaseOutput(result.stdout));
    if (result.stderr) process.stderr.write(redactSupabaseOutput(result.stderr));
    if (result.exitCode !== 0) throw new Error(result.exitCode === 1 ? 'LOCK_HELD' : `FLOCK_CHILD_FAILED_${result.exitCode}`);
    return;
  }

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

  let acquired = false;
  try {
    await acquireRunnerLock({ fs: fsPromises, lockPath: LOCK_PATH, metadata, kernelLockHeld: true });
    acquired = true;
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
    if (acquired) await releaseRunnerLock({ fs: fsPromises, lockPath: LOCK_PATH, metadata, kernelLockHeld: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${redactSupabaseOutput(error instanceof Error ? error.stack || error.message : String(error))}\n`);
    process.exitCode = 1;
  });
}
