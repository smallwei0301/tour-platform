import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MODES = new Set(['lint', 'typecheck', 'build']);
const FIXED_SYSTEM_PATH = ['/usr/local/bin', '/usr/bin', '/bin'];
const SCHEMA_KEYS = ['schemaVersion', 'mode', 'wrapperArgv', 'childArgv', 'envNames', 'exitCode', 'head', 'tree', 'logPath', 'logSha256', 'epoch'];
const CREDENTIAL_PATTERN = /(?:authorization\s*:\s*[^\r\n]+|(?:set-)?cookie\s*:\s*[^\r\n]+|(?:(?:api[_-]?)?(?:token|key)|password|secret|database[_-]?url|db[_-]?url|connection[_-]?(?:url|string)|dsn)\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n]+)|[a-z][a-z0-9+.-]*:\/\/[^\s\/:@]+:[^@\s\/]+@)/giu;

function fail(message) {
  throw new Error(`midao CI command rejected: ${message}`);
}

function asError(value) {
  return value instanceof Error ? value : new Error(String(value));
}

function combineErrors(primary, secondary, label) {
  const first = asError(primary);
  const second = asError(secondary);
  return new AggregateError([first, second], first.message, { cause: first, errorsLabel: label });
}

export function parseCliArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 1 || !MODES.has(argv[0])) {
    fail('exactly one allowlisted mode argument is required');
  }
  return { mode: argv[0], childArgs: ['run', argv[0]] };
}

export function redactText(value, knownSecrets = []) {
  let output = String(value ?? '');
  const secrets = [...new Set(knownSecrets.filter((item) => typeof item === 'string' && item.length >= 4))]
    .sort((left, right) => right.length - left.length);
  for (const secret of secrets) output = output.split(secret).join('[REDACTED]');
  return output.replace(CREDENTIAL_PATTERN, '[REDACTED]');
}

function modeOf(stat) {
  return stat.mode & 0o777;
}

function verifyDirectoryIdentity(target, fsAdapter = fs, beforePathValidation = null) {
  let descriptor;
  let primaryError = null;
  try {
    descriptor = fsAdapter.openSync(target, 'r');
    fsAdapter.fchmodSync(descriptor, 0o700);
    const fdStat = fsAdapter.fstatSync(descriptor);
    beforePathValidation?.({ target, descriptor, fdStat, fsAdapter });
    const pathStat = fsAdapter.lstatSync(target);
    if (!fdStat.isDirectory() || !pathStat.isDirectory() || pathStat.isSymbolicLink?.()) fail('temp directory is not a regular directory');
    if (modeOf(fdStat) !== 0o700 || modeOf(pathStat) !== 0o700) fail('temp directory mode is not 0700');
    if (fdStat.dev !== pathStat.dev || fdStat.ino !== pathStat.ino) fail('temp directory path identity changed');
  } catch (error) {
    primaryError = asError(error);
  }
  if (descriptor !== undefined) {
    try {
      fsAdapter.closeSync(descriptor);
    } catch (closeError) {
      primaryError = primaryError
        ? combineErrors(primaryError, closeError, 'directory FD close')
        : asError(closeError);
    }
  }
  if (primaryError) throw primaryError;
}

function createAndVerifyEmptyFile(target, fsAdapter = fs, beforePathValidation = null) {
  let descriptor;
  let primaryError = null;
  try {
    descriptor = fsAdapter.openSync(target, 'wx', 0o600);
    fsAdapter.fchmodSync(descriptor, 0o600);
    const fdStat = fsAdapter.fstatSync(descriptor);
    beforePathValidation?.({ target, descriptor, fdStat, fsAdapter });
    const pathStat = fsAdapter.lstatSync(target);
    if (!fdStat.isFile() || !pathStat.isFile() || pathStat.isSymbolicLink?.()) fail('npm config is not a regular file');
    if (fdStat.size !== 0 || pathStat.size !== 0) fail('npm config is not empty');
    if (modeOf(fdStat) !== 0o600 || modeOf(pathStat) !== 0o600) fail('npm config mode is not 0600');
    if (fdStat.dev !== pathStat.dev || fdStat.ino !== pathStat.ino) fail('npm config path identity changed');
  } catch (error) {
    primaryError = asError(error);
  }
  if (descriptor !== undefined) {
    try {
      fsAdapter.closeSync(descriptor);
    } catch (closeError) {
      primaryError = primaryError
        ? combineErrors(primaryError, closeError, 'npmrc FD close')
        : asError(closeError);
    }
  }
  if (primaryError) throw primaryError;
}

export function createSecureTempEnvironment({
  parentDirectory = os.tmpdir(),
  fsAdapter = fs,
  processAdapter = process,
  hooks = {},
} = {}) {
  const originalUmask = processAdapter.umask(0o077);
  let home;
  let cache;
  let userConfig;
  let globalConfig;
  let primaryError = null;
  let restoreFailed = false;
  try {
    home = fsAdapter.mkdtempSync(path.join(parentDirectory, 'midao-ci-'));
    hooks.afterHomeCreated?.({ home, fsAdapter });
    verifyDirectoryIdentity(home, fsAdapter, hooks.beforeHomePathValidation);
    cache = path.join(home, 'npm-cache');
    fsAdapter.mkdirSync(cache, { recursive: false, mode: 0o700 });
    hooks.afterCacheCreated?.({ home, cache, fsAdapter });
    verifyDirectoryIdentity(cache, fsAdapter, hooks.beforeCachePathValidation);
    userConfig = path.join(home, 'user.npmrc');
    globalConfig = path.join(home, 'global.npmrc');
    if (userConfig === globalConfig || userConfig === '/dev/null' || globalConfig === '/dev/null') fail('npm config paths must be distinct runner files');
    createAndVerifyEmptyFile(userConfig, fsAdapter, hooks.beforeUserConfigPathValidation);
    hooks.afterUserConfigCreated?.({ home, cache, userConfig, globalConfig, fsAdapter });
    createAndVerifyEmptyFile(globalConfig, fsAdapter, hooks.beforeGlobalConfigPathValidation);
    hooks.afterGlobalConfigCreated?.({ home, cache, userConfig, globalConfig, fsAdapter });
  } catch (error) {
    primaryError = asError(error);
  }

  try {
    processAdapter.umask(originalUmask);
  } catch (restoreError) {
    restoreFailed = true;
    primaryError = primaryError ? combineErrors(primaryError, restoreError, 'umask restore') : asError(restoreError);
  }

  if (primaryError) {
    if (home) {
      try {
        fsAdapter.rmSync(home, { recursive: true, force: true });
      } catch (cleanupError) {
        primaryError = combineErrors(primaryError, cleanupError, 'temp cleanup');
      }
    }
    if (restoreFailed) {
      try {
        processAdapter.umask(originalUmask);
      } catch (retryError) {
        primaryError = combineErrors(primaryError, retryError, 'umask restore retry');
      }
    }
    throw primaryError;
  }

  let cleaned = false;
  return {
    home,
    cache,
    userConfig,
    globalConfig,
    cleanup() {
      if (cleaned) return;
      fsAdapter.rmSync(home, { recursive: true, force: true });
      cleaned = true;
    },
  };
}

function validateExecutableTarget(target, label, fsAdapter = fs) {
  const resolved = fsAdapter.realpathSync(target);
  const stat = fsAdapter.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink?.()) fail(`${label} target is not a regular file`);
  if ((stat.mode & 0o022) !== 0) fail(`${label} executable is group/world writable`);
  if ((stat.mode & 0o111) === 0) fail(`${label} target is not executable`);
  fsAdapter.accessSync(resolved, fsAdapter.constants.X_OK);
  return resolved;
}

export function resolveNodeExecutable({ execPath = process.execPath, fsAdapter = fs } = {}) {
  try {
    return validateExecutableTarget(execPath, 'Node', fsAdapter);
  } catch (error) {
    if (/midao CI command rejected/u.test(error.message)) throw error;
    fail('Node executable could not be validated');
  }
}

export function resolveNpmExecutable({ execPath = process.execPath, fsAdapter = fs } = {}) {
  const candidates = [
    path.join(path.dirname(execPath), 'npm'),
    '/usr/local/bin/npm',
    '/usr/bin/npm',
  ];
  for (const candidate of candidates) {
    try {
      return validateExecutableTarget(candidate, 'npm', fsAdapter);
    } catch (error) {
      if (/group\/world writable|not executable/u.test(error.message)) throw error;
      if (!['ENOENT', 'EACCES'].includes(error.code) && !/could not be validated/u.test(error.message)) continue;
    }
  }
  fail('no validated npm executable found');
}

const MIDAO_REQUEST_CLAIM_PEPPER = 'Zbes8k78swTKyk7YI6DhFZv6A0WgHfFmEXwdXmK2zTw';

function derivedSecret(randomBytes, label) {
  const random = randomBytes(48);
  if (!Buffer.isBuffer(random) || random.length < 32) fail('random secret source is too short');
  return crypto.createHash('sha256').update(random).update(label).digest('hex');
}

export function buildChildEnvironment({ mode, nodePath, npmPath, temp, parent = {}, randomBytes = crypto.randomBytes }) {
  if (!MODES.has(mode)) fail('mode is not allowlisted');
  const pathParts = [...new Set([path.dirname(nodePath), ...FIXED_SYSTEM_PATH, path.dirname(npmPath)])];
  const env = {
    PATH: pathParts.join(':'),
    HOME: temp.home,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    TERM: 'dumb',
    NO_COLOR: '1',
    CI: '1',
    NODE_ENV: mode === 'build' ? 'production' : 'test',
    npm_config_userconfig: temp.userConfig,
    npm_config_globalconfig: temp.globalConfig,
    npm_config_cache: temp.cache,
    npm_config_update_notifier: 'false',
    npm_config_fund: 'false',
    npm_config_audit: 'false',
  };
  if (mode === 'build') {
    env.GUIDE_SESSION_SECRET = derivedSecret(randomBytes, 'guide');
    env.ADMIN_ACCESS_TOKEN = derivedSecret(randomBytes, 'admin');
    env.MIDAO_REQUEST_CLAIM_PEPPER = MIDAO_REQUEST_CLAIM_PEPPER;
  }
  void parent;
  return env;
}

function blockedConfigName(name) {
  if (name === '.npmrc') return true;
  if (name === '.env') return true;
  return name.startsWith('.env.') && !name.endsWith('.example');
}

export function validateRepoConfig(repoRoot, fsAdapter = fs) {
  for (const directory of [repoRoot, path.join(repoRoot, 'apps/web')]) {
    for (const name of fsAdapter.readdirSync(directory)) {
      if (!blockedConfigName(name)) continue;
      const target = path.join(directory, name);
      const stat = fsAdapter.lstatSync(target);
      if (stat.isSymbolicLink() || stat.isFile() || stat.isDirectory()) fail(`unsafe env/npmrc config exists: ${name}`);
    }
  }
}

function assertCleanState(current, expected = null) {
  if (!current || current.status !== '') fail('git state is not clean');
  if (!/^[0-9a-f]{40}$/u.test(current.head) || !/^[0-9a-f]{40}$/u.test(current.tree) || !/^[0-9a-f]{40}$/u.test(current.headTree)) fail('git state is malformed');
  if (current.tree !== current.headTree) fail('index tree does not equal HEAD tree');
  if (expected && (current.head !== expected.head || current.tree !== expected.tree || current.headTree !== expected.headTree)) fail('git HEAD/tree state changed');
}

function containsKnownSecretFragment(value, knownSecrets) {
  for (const secret of knownSecrets) {
    const maximum = Math.min(secret.length - 1, 64);
    for (let length = 4; length <= maximum; length += 1) {
      if (value.includes(secret.slice(0, length)) || value.includes(secret.slice(secret.length - length))) return true;
    }
  }
  return false;
}

function safeOutputLine(value, knownSecrets) {
  const raw = String(value);
  if (containsKnownSecretFragment(raw, knownSecrets)) return '[REDACTED LINE]\n';
  return redactText(raw, knownSecrets);
}

function createOutputCollector(knownSecrets) {
  const carries = new Map([['stdout', ''], ['stderr', '']]);
  const lines = [];
  return {
    push(stream, chunk) {
      const key = stream === 'stderr' ? 'stderr' : 'stdout';
      let carry = carries.get(key) + String(chunk ?? '');
      while (true) {
        const newline = carry.indexOf('\n');
        if (newline < 0) break;
        const line = carry.slice(0, newline + 1);
        carry = carry.slice(newline + 1);
        if (Buffer.byteLength(line, 'utf8') > 65_536) lines.push(`[${key}] [REDACTED OVERSIZE LINE]\n`);
        else lines.push(`[${key}] ${safeOutputLine(line, knownSecrets)}`);
      }
      if (Buffer.byteLength(carry, 'utf8') > 65_536) {
        lines.push(`[${key}] [REDACTED OVERSIZE LINE]\n`);
        carry = '';
      }
      carries.set(key, carry);
    },
    finish() {
      for (const [stream, carry] of carries) {
        if (carry) lines.push(`[${stream}] ${safeOutputLine(carry, knownSecrets)}\n`);
      }
      return lines.join('');
    },
  };
}

function sensitiveParentValues(environment) {
  return Object.entries(environment)
    .filter(([key, value]) => typeof value === 'string' && value.length >= 4 && (/(?:SECRET|TOKEN|PASSWORD|KEY|DATABASE|DSN|AUTH|COOKIE|PRIVATE|SMTP|PATH|HOME|LANG|TERM)/iu.test(key)))
    .map(([, value]) => value);
}

function exactEvidence(value) {
  if (Object.keys(value).sort().join('\0') !== [...SCHEMA_KEYS].sort().join('\0')) fail('evidence schema mismatch');
  return value;
}

export async function runCiCommand({ argv, adapters }) {
  const { mode, childArgs } = parseCliArgs(argv);
  adapters.removeEvidence({ mode });
  if (adapters.runtimeVersion() !== '22.23.1') fail('Node 22.23.1 is required');
  const execPath = adapters.resolveNode(adapters.processExecPath());
  const parent = adapters.parentEnvironment();
  const repoRoot = adapters.repoRoot();
  adapters.validateRepoConfig(repoRoot);
  const npmPath = adapters.resolveNpm(execPath);
  const before = adapters.readState();
  assertCleanState(before);

  let temp;
  let pending;
  let primaryError;
  try {
    temp = adapters.createTempEnvironment();
    const probeEnvironment = buildChildEnvironment({
      mode: 'lint',
      npmPath,
      nodePath: execPath,
      temp,
      randomBytes: adapters.randomBytes,
    });
    const versionResult = await adapters.probeNpmVersion({
      command: npmPath,
      args: ['--version'],
      env: probeEnvironment,
      cwd: repoRoot,
    });
    if (versionResult.error || versionResult.signal || versionResult.status !== 0 || versionResult.stdout !== '11.9.0\n') {
      fail('npm 11.9.0 version probe failed');
    }
    const childEnvironment = mode === 'build'
      ? buildChildEnvironment({ mode, npmPath, nodePath: execPath, temp, randomBytes: adapters.randomBytes })
      : probeEnvironment;
    const generatedSecrets = mode === 'build' ? [childEnvironment.GUIDE_SESSION_SECRET, childEnvironment.ADMIN_ACCESS_TOKEN] : [];
    const knownSecrets = [...sensitiveParentValues(parent), ...generatedSecrets].filter(Boolean);
    const collector = createOutputCollector(knownSecrets);
    const childArgv = [npmPath, ...childArgs];
    const child = await adapters.spawnChild({ command: npmPath, args: childArgs, env: childEnvironment, cwd: repoRoot, shell: false, onOutput: (stream, chunk) => collector.push(stream, chunk) });
    if (child?.error) throw child.error;
    if (child?.signal) fail(`child terminated by signal ${child.signal}`);
    if (!Number.isInteger(child?.status)) fail('child exit status is missing');
    if (child.status !== 0) fail(`child exit ${child.status}`);
    const after = adapters.readState();
    assertCleanState(after, before);
    const log = adapters.writeLog(collector.finish(), { mode });
    pending = exactEvidence({
      schemaVersion: 1,
      mode,
      wrapperArgv: adapters.wrapperArgv(),
      childArgv,
      envNames: Object.keys(childEnvironment).sort(),
      exitCode: child.status,
      head: before.head,
      tree: before.tree,
      logPath: log.path,
      logSha256: log.sha256,
      epoch: adapters.now(),
    });
    const serialized = JSON.stringify(pending);
    for (const secret of knownSecrets) if (serialized.includes(secret)) fail('secret reached evidence');
  } catch (error) {
    primaryError = error;
  }

  if (temp) {
    try {
      adapters.cleanupTempEnvironment(temp);
    } catch (cleanupError) {
      primaryError = primaryError
        ? combineErrors(primaryError, cleanupError, 'run cleanup')
        : asError(cleanupError);
    }
  }
  if (primaryError) throw primaryError;
  adapters.publishEvidence(pending, { mode });
  return pending;
}

function gitOutput(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', shell: false, env: { PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args[0]} failed`);
  return result.stdout.trim();
}

export function writeAtomic0600(target, content, { fsAdapter = fs, randomBytes = crypto.randomBytes } = {}) {
  fsAdapter.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`;
  let descriptor;
  let renameAttempted = false;
  try {
    descriptor = fsAdapter.openSync(temporary, 'wx', 0o600);
    fsAdapter.writeFileSync(descriptor, content, { encoding: 'utf8' });
    fsAdapter.fsyncSync(descriptor);
    fsAdapter.fchmodSync(descriptor, 0o600);
    fsAdapter.closeSync(descriptor);
    descriptor = undefined;
    renameAttempted = true;
    fsAdapter.renameSync(temporary, target);
  } catch (error) {
    let primaryError = asError(error);
    if (descriptor !== undefined) {
      try {
        fsAdapter.closeSync(descriptor);
      } catch (closeError) {
        primaryError = combineErrors(primaryError, closeError, 'atomic FD close');
      }
    }
    try {
      fsAdapter.rmSync(temporary, { force: true });
    } catch (removeError) {
      primaryError = combineErrors(primaryError, removeError, 'atomic temp remove');
      try {
        fsAdapter.unlinkSync(temporary);
      } catch (unlinkError) {
        if (unlinkError.code !== 'ENOENT') primaryError = combineErrors(primaryError, unlinkError, 'atomic temp unlink fallback');
      }
    }
    if (renameAttempted) {
      try {
        fsAdapter.rmSync(target, { force: true });
      } catch (removeError) {
        primaryError = combineErrors(primaryError, removeError, 'atomic target remove');
        try {
          fsAdapter.unlinkSync(target);
        } catch (unlinkError) {
          if (unlinkError.code !== 'ENOENT') primaryError = combineErrors(primaryError, unlinkError, 'atomic target unlink fallback');
        }
      }
      let targetRemains = false;
      try {
        fsAdapter.lstatSync(target);
        targetRemains = true;
      } catch (statError) {
        if (statError.code !== 'ENOENT') primaryError = combineErrors(primaryError, statError, 'atomic target verification');
      }
      if (targetRemains) {
        try {
          fsAdapter.unlinkSync(target);
          targetRemains = false;
        } catch (unlinkError) {
          primaryError = combineErrors(primaryError, unlinkError, 'atomic target unlink fallback');
        }
      }
      if (targetRemains) primaryError = combineErrors(primaryError, new Error('success evidence artifact remains'), 'atomic fail-closed verification');
    }
    throw primaryError;
  }
}

function defaultProbeNpmVersion({ command, args, env, cwd }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (error) {
      resolve({ status: null, signal: null, error, stdout: '' });
      return;
    }
    let output = '';
    let oversized = false;
    let spawnError = null;
    child.stdout.on('data', (chunk) => {
      if (oversized) return;
      output += String(chunk);
      if (Buffer.byteLength(output, 'utf8') > 64) {
        output = '';
        oversized = true;
      }
    });
    child.on('error', (error) => { spawnError = error; });
    child.on('close', (status, signal) => resolve({
      status,
      signal,
      error: spawnError,
      stdout: oversized ? '' : output,
    }));
  });
}

function defaultSpawnChild({ command, args, env, cwd, onOutput }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let spawnError = null;
    child.stdout.on('data', (chunk) => onOutput('stdout', chunk));
    child.stderr.on('data', (chunk) => onOutput('stderr', chunk));
    child.on('error', (error) => { spawnError = error; });
    child.on('close', (status, signal) => resolve({ status, signal, error: spawnError }));
  });
}

function defaultAdapters() {
  const repoRoot = process.cwd();
  const gitPath = (name) => gitOutput(['rev-parse', '--git-path', name], repoRoot);
  return {
    runtimeVersion: () => process.versions.node,
    processExecPath: () => process.execPath,
    parentEnvironment: () => ({ ...process.env }),
    repoRoot: () => repoRoot,
    validateRepoConfig,
    resolveNode: (execPath) => resolveNodeExecutable({ execPath }),
    resolveNpm: (execPath) => resolveNpmExecutable({ execPath }),
    readState: () => ({
      status: gitOutput(['status', '--porcelain=v1'], repoRoot),
      head: gitOutput(['rev-parse', 'HEAD'], repoRoot),
      tree: gitOutput(['write-tree'], repoRoot),
      headTree: gitOutput(['rev-parse', 'HEAD^{tree}'], repoRoot),
    }),
    removeEvidence: ({ mode }) => fs.rmSync(gitPath(`midao-ci-${mode}-evidence.json`), { force: true }),
    createTempEnvironment: () => createSecureTempEnvironment(),
    cleanupTempEnvironment: (temp) => temp.cleanup(),
    randomBytes: crypto.randomBytes,
    probeNpmVersion: defaultProbeNpmVersion,
    spawnChild: defaultSpawnChild,
    writeLog: (content, { mode }) => {
      const target = gitPath(`midao-ci-${mode}.log`);
      writeAtomic0600(target, content);
      return { path: target, sha256: crypto.createHash('sha256').update(content).digest('hex') };
    },
    publishEvidence: (value, { mode }) => writeAtomic0600(gitPath(`midao-ci-${mode}-evidence.json`), `${JSON.stringify(value, null, 2)}\n`),
    wrapperArgv: () => [...process.argv],
    now: () => Math.floor(Date.now() / 1000),
  };
}

export async function main(argv = process.argv.slice(2), adapters = defaultAdapters()) {
  return runCiCommand({ argv, adapters });
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main().then((evidence) => {
    console.log(`midao CI ${evidence.mode} evidence recorded: ${evidence.tree}`);
  }).catch((error) => {
    const known = sensitiveParentValues(process.env);
    console.error(`midao CI command failed: ${redactText(error?.message ?? error, known)}`);
    process.exitCode = 1;
  });
}
