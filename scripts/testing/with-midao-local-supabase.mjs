#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const LOCK_PATH = '/tmp/tour-platform-local-supabase.lock';
const LOCK_METADATA = 'owner.json';
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
  const escaped = expectedProjectId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const exact = new RegExp(`^failed to inspect container health: Error response from daemon: No such container: supabase_db_${escaped}$`, 'u');
  const lines = nonemptyLines(stderr);
  if (lines.length !== 2 || !exact.test(lines[0]) || lines[1] !== HELP_LINE) throw new Error('STATUS_UNCLASSIFIED');
  return 'not-running';
}

export async function acquireRunnerLock({ fs = fsPromises, lockPath = LOCK_PATH, metadata, processInspector }) {
  const create = async () => {
    await fs.mkdir(lockPath, { mode: 0o700 });
    try {
      await fs.writeFile(resolve(lockPath, LOCK_METADATA), `${JSON.stringify(metadata)}\n`, { mode: 0o600, flag: 'wx' });
    } catch (error) {
      await fs.rm(lockPath, { recursive: true, force: true });
      throw error;
    }
  };
  try {
    await create();
    return metadata;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }

  let owner;
  try { owner = JSON.parse(await fs.readFile(resolve(lockPath, LOCK_METADATA), 'utf8')); } catch { throw new Error('LOCK_HELD_UNREADABLE'); }
  const live = processInspector.exists(owner.pid);
  const sameProcess = live && String(processInspector.startTicks(owner.pid)) === String(owner.processStartTicks);
  if (sameProcess) throw new Error('LOCK_HELD');
  await fs.rm(lockPath, { recursive: true, force: true });
  await create();
  return metadata;
}

export async function releaseRunnerLock({ fs = fsPromises, lockPath = LOCK_PATH, metadata }) {
  let owner;
  try { owner = JSON.parse(await fs.readFile(resolve(lockPath, LOCK_METADATA), 'utf8')); } catch { throw new Error('LOCK_RELEASE_IDENTITY_MISSING'); }
  if (owner.pid !== metadata.pid || String(owner.processStartTicks) !== String(metadata.processStartTicks) || owner.repoRoot !== metadata.repoRoot) {
    throw new Error('LOCK_RELEASE_IDENTITY_DRIFT');
  }
  await fs.rm(lockPath, { recursive: true, force: true });
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

export async function runWithLocalSupabase({ adapter, expectedProjectId, childArgs }) {
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
      await adapter.stop(expectedProjectId);
    }
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
    stop: async (expectedProjectId) => {
      const result = await cli(['stop', '--project-id', expectedProjectId], { cleanup: true });
      if (result.exitCode !== 0) throw new Error('SUPABASE_STOP_FAILED');
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
  const inspector = {
    exists(pid) { try { process.kill(Number(pid), 0); return true; } catch { return false; } },
    startTicks(pid) {
      try {
        const value = readFileSync(`/proc/${Number(pid)}/stat`, 'utf8');
        const end = value.lastIndexOf(')');
        return value.slice(end + 2).split(/\s+/u)[19];
      } catch { return null; }
    },
  };

  const controller = new AbortController();
  const abort = () => controller.abort(new Error('RUNNER_SIGNALLED'));
  process.once('SIGTERM', abort);
  process.once('SIGINT', abort);

  let acquired = false;
  try {
    await acquireRunnerLock({ fs: fsPromises, lockPath: LOCK_PATH, metadata, processInspector: inspector });
    acquired = true;
    const childArgs = process.argv.slice(2);
    await runWithLocalSupabase({
      adapter: createActualAdapter({ repoRoot, pin, nodeBin, signal: controller.signal }),
      expectedProjectId: projectId,
      childArgs,
    });
  } finally {
    process.removeListener('SIGTERM', abort);
    process.removeListener('SIGINT', abort);
    if (acquired) await releaseRunnerLock({ fs: fsPromises, lockPath: LOCK_PATH, metadata });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${redactSupabaseOutput(error instanceof Error ? error.stack || error.message : String(error))}\n`);
    process.exitCode = 1;
  });
}
