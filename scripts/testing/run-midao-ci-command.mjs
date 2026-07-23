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
  try {
    descriptor = fsAdapter.openSync(target, 'r');
    fsAdapter.fchmodSync(descriptor, 0o700);
    const fdStat = fsAdapter.fstatSync(descriptor);
    beforePathValidation?.({ target, descriptor, fdStat, fsAdapter });
    const pathStat = fsAdapter.lstatSync(target);
    if (!fdStat.isDirectory() || !pathStat.isDirectory() || pathStat.isSymbolicLink?.()) fail('temp directory is not a regular directory');
    if (modeOf(fdStat) !== 0o700 || modeOf(pathStat) !== 0o700) fail('temp directory mode is not 0700');
    if (fdStat.dev !== pathStat.dev || fdStat.ino !== pathStat.ino) fail('temp directory path identity changed');
  } finally {
    if (descriptor !== undefined) fsAdapter.closeSync(descriptor);
  }
}

function createAndVerifyEmptyFile(target, fsAdapter = fs, beforePathValidation = null) {
  let descriptor;
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
  } finally {
    if (descriptor !== undefined) fsAdapter.closeSync(descriptor);
  }
}

export function createSecureTempEnvironment({
  parentDirectory = os.tmpdir(),
  fsAdapter = fs,
  processAdapter = process,
  hooks = {},
} = {}) {
  const originalUmask = processAdapter.umask(0o077);
  let home;
  let restored = false;
  try {
    home = fsAdapter.mkdtempSync(path.join(parentDirectory, 'midao-ci-'));
    hooks.afterHomeCreated?.({ home, fsAdapter });
    verifyDirectoryIdentity(home, fsAdapter, hooks.beforeHomePathValidation);
    const cache = path.join(home, 'npm-cache');
    fsAdapter.mkdirSync(cache, { recursive: false, mode: 0o700 });
    hooks.afterCacheCreated?.({ home, cache, fsAdapter });
    verifyDirectoryIdentity(cache, fsAdapter, hooks.beforeCachePathValidation);
    const userConfig = path.join(home, 'user.npmrc');
    const globalConfig = path.join(home, 'global.npmrc');
    if (userConfig === globalConfig || userConfig === '/dev/null' || globalConfig === '/dev/null') fail('npm config paths must be distinct runner files');
    createAndVerifyEmptyFile(userConfig, fsAdapter, hooks.beforeUserConfigPathValidation);
    hooks.afterUserConfigCreated?.({ home, cache, userConfig, globalConfig, fsAdapter });
    createAndVerifyEmptyFile(globalConfig, fsAdapter, hooks.beforeGlobalConfigPathValidation);
    hooks.afterGlobalConfigCreated?.({ home, cache, userConfig, globalConfig, fsAdapter });
    processAdapter.umask(originalUmask);
    restored = true;
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
  } catch (error) {
    let cleanupError;
    if (!restored) {
      try {
        processAdapter.umask(originalUmask);
        restored = true;
      } catch (restoreError) {
        cleanupError = restoreError;
      }
    }
    if (home) {
      try {
        fsAdapter.rmSync(home, { recursive: true, force: true });
      } catch (removeError) {
        cleanupError ??= removeError;
      }
    }
    if (cleanupError) error.cleanupError = cleanupError;
    throw error;
  } finally {
    if (!restored) processAdapter.umask(originalUmask);
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
      const resolved = fsAdapter.realpathSync(candidate);
      const stat = fsAdapter.lstatSync(resolved);
      if (!stat.isFile() || stat.isSymbolicLink?.()) continue;
      if ((stat.mode & 0o022) !== 0) fail('npm executable is group/world writable');
      if ((stat.mode & 0o111) === 0) fail('npm target is not executable');
      fsAdapter.accessSync(resolved, fsAdapter.constants.X_OK);
      return resolved;
    } catch (error) {
      if (/writable|not executable/u.test(error.message)) throw error;
      if (!['ENOENT', 'EACCES'].includes(error.code)) continue;
    }
  }
  fail('no validated npm executable found');
}

function derivedSecret(randomBytes, label) {
  const random = randomBytes(48);
  if (!Buffer.isBuffer(random) || random.length < 32) fail('random secret source is too short');
  return crypto.createHash('sha256').update(random).update(label).digest('hex');
}

export function buildChildEnvironment({ mode, nodePath, npmPath, temp, parent = {}, randomBytes = crypto.randomBytes }) {
  if (!MODES.has(mode)) fail('mode is not allowlisted');
  const pathParts = [...new Set([path.dirname(nodePath), path.dirname(npmPath), ...FIXED_SYSTEM_PATH])];
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

function createOutputCollector(knownSecrets) {
  let carry = '';
  const lines = [];
  return {
    push(stream, chunk) {
      carry += String(chunk ?? '');
      while (true) {
        const newline = carry.indexOf('\n');
        if (newline < 0) break;
        const line = carry.slice(0, newline + 1);
        carry = carry.slice(newline + 1);
        lines.push(`[${stream}] ${redactText(line, knownSecrets)}`);
      }
      if (carry.length > 65_536) {
        lines.push(`[${stream}] [REDACTED OVERSIZE LINE]\n`);
        carry = '';
      }
    },
    finish() {
      if (carry) lines.push(`[output] ${redactText(carry, knownSecrets)}\n`);
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
  if (adapters.runtimeVersion() !== '22.23.1') fail('Node 22.23.1 is required');
  const execPath = adapters.processExecPath();
  const parent = adapters.parentEnvironment();
  const repoRoot = adapters.repoRoot();
  adapters.validateRepoConfig(repoRoot);
  const npmPath = adapters.resolveNpm(execPath);
  const before = adapters.readState();
  assertCleanState(before);
  adapters.removeEvidence({ mode });

  let temp;
  let pending;
  let primaryError;
  try {
    temp = adapters.createTempEnvironment();
    const env = buildChildEnvironment({ mode, nodePath: execPath, npmPath, temp, parent, randomBytes: adapters.randomBytes });
    const knownSecrets = [...sensitiveParentValues(parent), env.GUIDE_SESSION_SECRET, env.ADMIN_ACCESS_TOKEN].filter(Boolean);
    const collector = createOutputCollector(knownSecrets);
    const childArgv = [npmPath, ...childArgs];
    const child = await adapters.spawnChild({ command: npmPath, args: childArgs, env, cwd: repoRoot, shell: false, onOutput: (stream, chunk) => collector.push(stream, chunk) });
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
      envNames: Object.keys(env).sort(),
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
      if (primaryError) primaryError.cleanupError = cleanupError;
      else primaryError = cleanupError;
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

function writeAtomic0600(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, content, { encoding: 'utf8' });
    fs.fsyncSync(descriptor);
    fs.fchmodSync(descriptor, 0o600);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, target);
    fs.chmodSync(target, 0o600);
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
    throw error;
  }
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
