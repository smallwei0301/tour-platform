#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const CODE_LIKE_UNTRACKED = Object.freeze([
  '.js', '.jsx', '.cjs', '.mjs', '.ts', '.tsx', '.cts', '.mts',
  '.sql', '.sh', '.bash', '.json', '.toml', '.yaml', '.yml',
  '.css', '.scss', '.sass', '.less',
  '.html', '.vue', '.svelte', '.py', '.rb', '.go', '.rs', '.java', '.kt', '.kts', '.php',
]);

const MAX_AGE_SECONDS = 30 * 60;
const ORDINARY_RUNNER = '.claude/hooks/run-checks.sh';
export const HEAVY_PREFIXES = Object.freeze([
  Object.freeze(['timeout', '--signal=TERM', '570s', 'bash', 'scripts/testing/run-midao-foundation-postgres.sh']),
  Object.freeze(['timeout', '--signal=TERM', '570s', 'bash', 'scripts/testing/run-midao-e2e.sh']),
  Object.freeze(['timeout', '--signal=TERM', '570s', 'bash', 'scripts/testing/run-midao-legacy-e2e-compat.sh']),
  Object.freeze([
    'timeout', '--signal=TERM', '570s', 'node', 'scripts/database-baseline/run-fresh-install.mjs',
    '--test', 'apps/web/tests/integration/midao-baseline-fresh-postgres.test.mjs',
  ]),
  Object.freeze([
    'timeout', '--signal=TERM', '570s', 'node', 'scripts/database-baseline/run-existing-upgrade-rehearsal.mjs',
    '--test', 'apps/web/tests/integration/midao-baseline-existing-postgres.test.mjs',
  ]),
]);
const GLOB_META = /[*?\[\]{}]/u;
const TEST_PATH = /(?:^|\/)(?:test|tests|e2e)\/.*\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/u;
const NPM_TEST_PATH = /^apps\/web\/tests\/(?!\.)[^/]+\/(?!\.)[^/]+\.test\.mjs$/u;
const DOC_PATH = /\.(?:md|mdx|txt|rst|adoc)$/iu;
const SECRET_VALUE = /(?:authorization\s*:\s*[^\r\n]+|(?:set-)?cookie\s*:\s*[^\r\n]+|(?:(?:api[_-]?)?(?:token|key)|password|secret|database[_-]?url|db[_-]?url|connection[_-]?(?:url|string)|dsn)\s*[:=]\s*(?:"[\s\S]*?"|'[\s\S]*?'|[^\r\n]+)|[a-z][a-z0-9+.-]*:\/\/[^\s\/:@]+:[^@\s\/]+@)/giu;

function fail(message) {
  throw new Error(message);
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isCodeLike(file) {
  return CODE_LIKE_UNTRACKED.some((extension) => file.toLowerCase().endsWith(extension));
}

function isTestPath(file) {
  return TEST_PATH.test(file);
}

function isAllowedDocPath(file) {
  return DOC_PATH.test(file);
}

function docsOnlyPaths(state) {
  return [...(state.untracked ?? [])]
    .filter(isAllowedDocPath)
    .sort();
}

function snapshotPaths(state) {
  return [
    ...(state.staged ?? []).flatMap((item) => [item.path, item.oldPath].filter(Boolean)),
    ...(state.trackedUnstaged ?? []),
    ...(state.untracked ?? []),
    ...(state.tracked ?? []),
  ];
}

function assertFresh(epoch, now) {
  if (!Number.isInteger(epoch) || epoch > now || now - epoch > MAX_AGE_SECONDS) {
    fail('evidence must be within 30 minutes');
  }
}

function assertNoSecrets(value, label, knownSecrets = []) {
  const text = String(value ?? '');
  SECRET_VALUE.lastIndex = 0;
  if (SECRET_VALUE.test(text)) fail(`${label} contains a secret`);
  if (knownSecrets.some((secret) => secret.length >= 4 && text.includes(secret))) fail(`${label} contains a secret`);
}

export function redact(value, knownSecrets = []) {
  let sanitized = String(value).replace(SECRET_VALUE, '[REDACTED]');
  for (const secret of knownSecrets) {
    if (secret.length >= 4) sanitized = sanitized.split(secret).join('[REDACTED]');
  }
  return sanitized;
}

function sensitiveEnvironmentValues(environment) {
  const sensitiveName = /(?:secret|token|password|passphrase|credential|private|api[_-]?key|authorization|cookie|database[_-]?url|db[_-]?url|connection[_-]?(?:url|string)|dsn)/iu;
  return Object.entries(environment ?? {})
    .filter(([name, value]) => sensitiveName.test(name) && typeof value === 'string' && value.length >= 4)
    .map(([, value]) => value);
}

export function parsePorcelainV1Z(text) {
  const fields = String(text).split('\0');
  const records = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (!field) continue;
    if (field.length < 4 || field[2] !== ' ') fail('invalid NUL-safe porcelain record');
    const record = { index: field[0], worktree: field[1], path: field.slice(3) };
    if (record.index === 'R' || record.index === 'C' || record.worktree === 'R' || record.worktree === 'C') {
      record.oldPath = fields[index + 1];
      index += 1;
    }
    records.push(record);
  }
  return records;
}

export function classifyChild(childArgv, options = {}) {
  if (!Array.isArray(childArgv) || childArgv.length === 0 || childArgv.some((part) => typeof part !== 'string' || part.length === 0)) {
    fail('child argv is invalid');
  }
  const runMode = options.runMode ?? 'ordinary';
  if (runMode === 'ordinary') {
    if (childArgv[0] !== ORDINARY_RUNNER || childArgv.length < 2) fail('child runner is not allowlisted');
    const args = childArgv.slice(1);
    if (args.length === 1 && args[0] === '--all') return { kind: 'ordinary', paths: [], prefix: [ORDINARY_RUNNER], all: true };
    if (args.includes('--all')) fail('--all must be the only runner argument');
    const flags = args.filter((arg) => arg.startsWith('--'));
    if (flags.some((flag) => flag !== '--typecheck') || flags.filter((flag) => flag === '--typecheck').length > 1) fail('runner flag is not allowlisted');
    const paths = args.filter((arg) => !arg.startsWith('--'));
    if (paths.length === 0) fail('runner requires a tracked staged test path');
    return { kind: 'ordinary', paths, prefix: [ORDINARY_RUNNER], all: false };
  }
  if (runMode !== 'heavy') fail('run mode is invalid');
  const prefix = HEAVY_PREFIXES.find((candidate) => candidate.every((part, index) => childArgv[index] === part));
  if (!prefix) fail('heavy child argv does not match an exact allowlisted prefix');
  const suffix = childArgv.slice(prefix.length);
  const isDatabaseRunner = prefix[4] === 'scripts/database-baseline/run-fresh-install.mjs'
    || prefix[4] === 'scripts/database-baseline/run-existing-upgrade-rehearsal.mjs';
  if (isDatabaseRunner && suffix.length !== 0) fail('database heavy command must match the exact complete prefix');
  const paths = isDatabaseRunner ? [prefix.at(-1)] : suffix;
  const tracked = new Set(options.tracked ?? []);
  for (const file of paths) {
    if (GLOB_META.test(file)) fail(`heavy test suffix must be literal: ${file}`);
    if (!isTestPath(file)) fail(`heavy suffix is not a test path: ${file}`);
    if (!tracked.has(file)) fail(`heavy test suffix is not tracked: ${file}`);
  }
  return { kind: 'heavy', paths, prefix };
}

export function deriveExpectedEvidenceCmd(childArgv, options = {}) {
  const child = classifyChild(childArgv, options);
  if (child.kind === 'heavy') return childArgv.join(' ');
  if (child.all) return 'npm test';
  const doTypecheck = childArgv.includes('--typecheck');
  return `node --test ${child.paths.join(' ')}${doTypecheck ? ' && npm run typecheck' : ''}`;
}

function assertSafeState(state, label) {
  if (!state || typeof state.tree !== 'string' || !Array.isArray(state.staged)) fail(`${label} state is invalid`);
  assertNoSecrets(snapshotPaths(state).join('\n'), `${label} snapshot paths`);
  for (const item of state.staged) {
    if (String(item.status).startsWith('D')) fail('staged deletion is forbidden');
    if (String(item.status).startsWith('R')) fail('staged rename is forbidden');
  }
  const dirty = (state.trackedUnstaged ?? []).filter((file) => !isAllowedDocPath(file));
  if (dirty.length) fail(`tracked unstaged code/config is forbidden: ${dirty.join(', ')}`);
  const untrackedUnsafe = (state.untracked ?? []).filter((file) => !isAllowedDocPath(file));
  if (untrackedUnsafe.length) fail(`untracked non-docs/config is forbidden: ${untrackedUnsafe.join(', ')}`);
  if (!Array.isArray(state.untrackedMeta) || !same(state.untrackedMeta.map((item) => item.path), state.untracked ?? [])) {
    fail(`${label} untracked metadata is invalid`);
  }
  for (const item of state.untrackedMeta) {
    assertExactKeys(item, ['path', 'kind', 'executable'], `${label} untracked metadata item`);
    if (item.kind !== 'file' || item.executable !== false) fail(`${label} untracked docs must be regular non-executable files`);
  }
}

function assertOrdinaryChildPaths(paths, staged) {
  const stagedTests = new Set(staged.filter((item) => isTestPath(item.path)).map((item) => item.path));
  for (const file of paths) {
    if (GLOB_META.test(file)) fail(`test paths must be literal: ${file}`);
    if (!isTestPath(file) || !stagedTests.has(file)) fail(`child test is not a tracked staged test: ${file}`);
  }
}

export function validateRun(input) {
  const {
    nodeVersion, now, childStartedAt, childArgv, actualChildArgv, childExitCode,
    evidence, before, after, stdout = '', stderr = '', existingBundle = null,
    runMode = 'ordinary', knownSecrets = [],
  } = input;
  if (!/^v?22(?:\.|$)/u.test(String(nodeVersion))) fail('Node 22 is required');
  if (!same(childArgv, actualChildArgv)) fail('manifest childArgv does not equal actual spawned argv');
  const classifyOptions = { runMode, tracked: before?.tracked ?? [] };
  const child = classifyChild(childArgv, classifyOptions);
  assertSafeState(before, 'before');
  assertSafeState(after, 'after');
  if (child.kind === 'ordinary') assertOrdinaryChildPaths(child.paths, before.staged);
  if (childExitCode !== 0) fail(`child exit must be zero (got ${childExitCode})`);
  if (!Number.isInteger(childStartedAt) || childStartedAt > now) fail('child start epoch is invalid');
  assertFresh(childStartedAt, now);
  const expectedEvidenceCmd = deriveExpectedEvidenceCmd(childArgv, classifyOptions);
  if (before.tree !== after.tree) fail('git write-tree changed while child ran');
  if (!same(before.staged, after.staged)) fail('staged state changed (status/path/blob mismatch)');
  if (!same([...(before.trackedUnstaged ?? [])].sort(), [...(after.trackedUnstaged ?? [])].sort())) fail('tracked unstaged state changed while child ran');
  if (!same([...(before.tracked ?? [])].sort(), [...(after.tracked ?? [])].sort())) fail('tracked file state changed while child ran');
  if (!same([...(before.untracked ?? [])].sort(), [...(after.untracked ?? [])].sort())) fail('untracked state changed while child ran');
  if (!same(before.untrackedMeta, after.untrackedMeta)) fail('untracked metadata changed while child ran');
  if (existingBundle && existingBundle.tree !== before.tree) fail('old bundle from a different tree was not cleared');
  assertNoSecrets(stdout, 'stdout', knownSecrets);
  assertNoSecrets(stderr, 'stderr', knownSecrets);

  const stagedTests = new Set(before.staged.filter((item) => isTestPath(item.path)).map((item) => item.path));
  const entry = {
    schemaVersion: 1,
    kind: child.kind,
    tree: before.tree,
    verifiedAt: now,
    childStartedAt,
    childArgv: [...childArgv],
    expectedEvidenceCmd,
    stagedManifest: before.staged.map((item) => ({ ...item })),
    coveredPaths: child.all ? [...stagedTests].filter((file) => NPM_TEST_PATH.test(file)) : child.paths.filter((file) => stagedTests.has(file)),
    docsOnlyUntracked: docsOnlyPaths(before),
  };
  if (child.kind === 'heavy') {
    entry.childExitCode = childExitCode;
    entry.epoch = now;
  } else {
    if (!evidence || evidence.exit_code !== 0) fail('evidence exit must be zero');
    if (evidence.cmd !== expectedEvidenceCmd) fail('evidence.cmd does not equal derived expectedEvidenceCmd');
    if (!Number.isInteger(evidence.epoch) || evidence.epoch < childStartedAt) fail('evidence predates child start');
    assertFresh(evidence.epoch, now);
    entry.evidence = { cmd: evidence.cmd, exit_code: evidence.exit_code, epoch: evidence.epoch };
  }
  assertNoSecrets(JSON.stringify(entry), 'manifest');
  return entry;
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} schema is invalid`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (!same(actual, wanted)) fail(`${label} has unknown or missing fields`);
}

function validateStagedManifest(items) {
  if (!Array.isArray(items)) fail('bundle staged manifest schema is invalid');
  for (const item of items) {
    const keys = ['status', 'path', 'blob', ...(Object.hasOwn(item ?? {}, 'oldPath') ? ['oldPath'] : [])];
    assertExactKeys(item, keys, 'bundle staged manifest item');
    if (typeof item.status !== 'string' || typeof item.path !== 'string' || typeof item.blob !== 'string') {
      fail('bundle staged manifest item values are invalid');
    }
    if (Object.hasOwn(item, 'oldPath') && typeof item.oldPath !== 'string') fail('bundle staged oldPath is invalid');
  }
}

function validateEntryShape(entry, current, now) {
  assertNoSecrets(JSON.stringify(entry), 'bundle entry');
  const commonKeys = [
    'schemaVersion', 'kind', 'tree', 'verifiedAt', 'childStartedAt', 'childArgv',
    'expectedEvidenceCmd', 'stagedManifest', 'coveredPaths', 'docsOnlyUntracked',
  ];
  if (entry?.kind === 'ordinary') assertExactKeys(entry, [...commonKeys, 'evidence'], 'ordinary bundle entry');
  else if (entry?.kind === 'heavy') assertExactKeys(entry, [...commonKeys, 'childExitCode', 'epoch'], 'heavy bundle entry');
  else fail('bundle entry kind is invalid');
  if (entry.schemaVersion !== 1 || entry.tree !== current.tree) fail('bundle entry schema/tree is invalid');
  if (!Array.isArray(entry.childArgv) || entry.childArgv.some((item) => typeof item !== 'string')) fail('bundle entry argv schema is invalid');
  validateStagedManifest(entry.stagedManifest);
  if (!Array.isArray(entry.coveredPaths) || entry.coveredPaths.some((item) => typeof item !== 'string')) fail('bundle covered paths schema is invalid');
  if (!Array.isArray(entry.docsOnlyUntracked) || entry.docsOnlyUntracked.some((item) => typeof item !== 'string')) fail('bundle docs-only paths schema is invalid');
  if (!same(entry.docsOnlyUntracked, docsOnlyPaths(current))) fail('bundle docs-only untracked snapshot does not match current state');
  if (typeof entry.expectedEvidenceCmd !== 'string') fail('bundle expected command schema is invalid');
  if (!same(entry.stagedManifest, current.staged)) fail('bundle entry staged manifest does not match current state');
  assertFresh(entry.verifiedAt, now);
  if (!Number.isInteger(entry.childStartedAt) || entry.childStartedAt > entry.verifiedAt) fail('bundle child start epoch is invalid');
  assertFresh(entry.childStartedAt, now);
  const runMode = entry.kind === 'heavy' ? 'heavy' : 'ordinary';
  const options = { runMode, tracked: current.tracked ?? [] };
  const child = classifyChild(entry.childArgv, options);
  const expected = deriveExpectedEvidenceCmd(entry.childArgv, options);
  if (entry.expectedEvidenceCmd !== expected) fail('bundle expected command is invalid');
  const stagedTests = new Set(current.staged.filter((item) => isTestPath(item.path)).map((item) => item.path));
  const expectedCovered = child.all ? [...stagedTests].filter((file) => NPM_TEST_PATH.test(file)) : child.paths.filter((file) => stagedTests.has(file));
  if (!same(entry.coveredPaths, expectedCovered)) fail('bundle covered paths do not match staged child paths');
  if (runMode === 'heavy') {
    if (Object.hasOwn(entry, 'evidence')) fail('heavy entry must not contain harness evidence');
    if (entry.childExitCode !== 0) fail('heavy child exit must be zero');
    if (!Number.isInteger(entry.epoch) || entry.epoch < entry.childStartedAt) fail('heavy epoch predates child start');
    assertFresh(entry.epoch, now);
  } else {
    assertExactKeys(entry.evidence, ['cmd', 'exit_code', 'epoch'], 'bundle evidence');
    if (typeof entry.evidence.cmd !== 'string' || !Number.isInteger(entry.evidence.exit_code)) fail('bundle evidence values are invalid');
    if (entry.evidence.exit_code !== 0) fail('bundle evidence exit must be zero');
    if (entry.evidence.cmd !== expected) fail('bundle evidence cmd is invalid');
    if (!Number.isInteger(entry.evidence.epoch) || entry.evidence.epoch < entry.childStartedAt) fail('bundle evidence epoch is invalid');
    assertFresh(entry.evidence.epoch, now);
  }
}

function validateExistingBundle(bundle, current, now) {
  assertNoSecrets(JSON.stringify(bundle), 'bundle');
  assertExactKeys(bundle, ['schemaVersion', 'tree', 'entries'], 'bundle');
  if (bundle.schemaVersion !== 1 || bundle.tree !== current.tree || !Array.isArray(bundle.entries)) fail('bundle does not match current index tree');
  for (const entry of bundle.entries) validateEntryShape(entry, current, now);
  return bundle;
}

export function validateBundle({ bundle, current, evidence, now }) {
  assertSafeState(current, 'current');
  validateExistingBundle(bundle, current, now);
  if (bundle.entries.length === 0) fail('bundle has no entries');
  const stagedTests = current.staged.filter((item) => isTestPath(item.path)).map((item) => item.path);
  const covered = new Set(bundle.entries.flatMap((entry) => entry.coveredPaths));
  const missing = stagedTests.filter((file) => !covered.has(file));
  if (missing.length) fail(`bundle does not cover every staged test: ${missing.join(', ')}`);
  const latestOrdinary = bundle.entries.filter((entry) => entry.kind === 'ordinary').at(-1);
  if (!latestOrdinary) fail('bundle lacks an ordinary evidence entry');
  const expected = deriveExpectedEvidenceCmd(latestOrdinary.childArgv, { runMode: 'ordinary', tracked: current.tracked ?? [] });
  if (latestOrdinary.expectedEvidenceCmd !== expected || latestOrdinary.evidence.cmd !== expected) fail('latest ordinary semantic command is invalid');
  if (!same(latestOrdinary.evidence, { cmd: evidence?.cmd, exit_code: evidence?.exit_code, epoch: evidence?.epoch })) {
    fail('latest ordinary entry does not match current evidence');
  }
  if (evidence.exit_code !== 0) fail('current evidence exit must be zero');
  assertFresh(evidence.epoch, now);
  return bundle;
}

function defaultAdapters() {
  const git = (args, options = {}) => execFileSync('git', args, {
    cwd: options.cwd,
    encoding: options.encoding ?? 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  });
  return {
    now: () => Math.floor(Date.now() / 1000),
    nodeVersion: () => process.version,
    environment: () => ({ ...process.env }),
    git,
    readFile: (file) => fs.readFileSync(file, 'utf8'),
    writeFile: (file, data) => fs.writeFileSync(file, data, { mode: 0o600 }),
    chmod: (file, mode) => fs.chmodSync(file, mode),
    mode: (file) => fs.statSync(file).mode & 0o777,
    exists: (file) => fs.existsSync(file),
    remove: (file) => fs.rmSync(file, { force: true }),
    pathInfo: (file, relativePath) => {
      const stat = fs.lstatSync(file);
      const kind = stat.isSymbolicLink() ? 'symlink' : stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other';
      return { path: relativePath, kind, executable: Boolean(stat.mode & 0o111) };
    },
    spawn: (command, args, options) => spawnSync(command, args, options),
    stdout: (message) => process.stdout.write(redact(message)),
    stderr: (message) => process.stderr.write(redact(message)),
    log: (message) => console.log(redact(message)),
    error: (message) => console.error(redact(message)),
  };
}

function readJson(adapters, file) {
  return JSON.parse(adapters.readFile(file));
}

function stagedBlob(adapters, root, file) {
  const output = adapters.git(['ls-files', '--stage', '-z', '--', file], { cwd: root });
  const record = String(output).split('\0')[0];
  const match = record.match(/^\d+ ([0-9a-f]+) \d+\t/u);
  return match?.[1] ?? null;
}

function getSnapshot(adapters, root) {
  const tree = String(adapters.git(['write-tree'], { cwd: root })).trim();
  const porcelain = parsePorcelainV1Z(adapters.git(['status', '--porcelain=v1', '-z', '--untracked-files=no'], { cwd: root }));
  const staged = [];
  const trackedUnstaged = [];
  for (const record of porcelain) {
    if (record.index !== ' ' && record.index !== '?') {
      const status = record.index === 'R' ? 'R100' : record.index;
      staged.push({ status, path: record.path, ...(record.oldPath ? { oldPath: record.oldPath } : {}), blob: record.index === 'D' ? null : stagedBlob(adapters, root, record.path) });
    }
    if (record.worktree !== ' ' && record.worktree !== '?') trackedUnstaged.push(record.path);
  }
  staged.sort((a, b) => a.path.localeCompare(b.path));
  trackedUnstaged.sort();
  const untracked = String(adapters.git(['ls-files', '--others', '--exclude-standard', '-z'], { cwd: root })).split('\0').filter(Boolean).sort();
  const untrackedMeta = untracked.map((file) => adapters.pathInfo(path.join(root, file), file));
  const tracked = String(adapters.git(['ls-files', '-z'], { cwd: root })).split('\0').filter(Boolean).sort();
  return { tree, staged, trackedUnstaged, untracked, untrackedMeta, tracked };
}

export function parseCli(argv) {
  if (argv.length === 1 && argv[0] === '--check-only') return { mode: 'check-only' };
  if (argv[0] === '--run' && argv[1] === '--' && argv.length > 2) return { mode: 'run', childArgv: argv.slice(2) };
  if (argv[0] === '--run-heavy' && argv[1] === '--' && argv.length > 2) return { mode: 'run-heavy', childArgv: argv.slice(2) };
  fail('usage: verify-staged-check-evidence.mjs --run -- <child argv...> | --run-heavy -- <child argv...> | --check-only');
}

export function createVerifier(overrides = {}) {
  const adapters = { ...defaultAdapters(), ...overrides };
  return {
    run(argv, options = {}) {
      const parsed = parseCli(argv);
      const root = String(adapters.git(['rev-parse', '--show-toplevel'], {})).trim();
      const manifestPath = String(adapters.git(['rev-parse', '--git-path', 'midao-last-verified.json'], { cwd: root })).trim();
      const absoluteManifestPath = path.isAbsolute(manifestPath) ? manifestPath : path.join(root, manifestPath);
      const evidencePath = path.join(root, '.claude/state/last-checks.json');
      const now = adapters.now();
      const current = getSnapshot(adapters, root);

      if (parsed.mode === 'check-only') {
        if (adapters.mode(absoluteManifestPath) !== 0o600) fail('evidence manifest mode must be 0600');
        const bundle = readJson(adapters, absoluteManifestPath);
        const evidence = readJson(adapters, evidencePath);
        validateBundle({ bundle, current, evidence, now });
        adapters.log(`staged evidence valid: ${current.tree}`);
        return bundle;
      }

      if (!/^v?22(?:\.|$)/u.test(String(adapters.nodeVersion()))) fail('Node 22 is required');
      assertSafeState(current, 'before');
      const runMode = parsed.mode === 'run-heavy' ? 'heavy' : 'ordinary';
      const classifyOptions = { runMode, tracked: current.tracked };
      const child = classifyChild(parsed.childArgv, classifyOptions);
      if (child.kind === 'ordinary') assertOrdinaryChildPaths(child.paths, current.staged);

      let existingBundle = adapters.exists(absoluteManifestPath) ? readJson(adapters, absoluteManifestPath) : null;
      if (existingBundle && existingBundle.tree !== current.tree) {
        adapters.remove(absoluteManifestPath);
        existingBundle = null;
      } else if (existingBundle) {
        validateExistingBundle(existingBundle, current, now);
      }
      const childStartedAt = adapters.now();
      const [command, ...args] = parsed.childArgv;
      const actualChildArgv = [command, ...args];
      const environment = adapters.environment();
      const knownSecrets = sensitiveEnvironmentValues(environment);
      const result = adapters.spawn(command, args, {
        cwd: root, env: environment, shell: false, stdio: ['ignore', 'ignore', 'ignore'],
      });
      if (result?.error) fail('child process failed to execute');
      if (result?.signal) fail(`child process terminated by signal ${result.signal}`);
      if (!Number.isInteger(result?.status)) fail('child process did not return an exit status');
      const evidence = runMode === 'ordinary' ? readJson(adapters, evidencePath) : undefined;
      const after = getSnapshot(adapters, root);
      const entry = validateRun({
        nodeVersion: adapters.nodeVersion(), now: adapters.now(), childStartedAt,
        childArgv: parsed.childArgv, actualChildArgv,
        childExitCode: result.status, evidence, before: current, after,
        stdout: result.stdout ?? '', stderr: result.stderr ?? '',
        existingBundle, runMode, knownSecrets,
      });
      const bundle = existingBundle ?? { schemaVersion: 1, tree: current.tree, entries: [] };
      bundle.entries.push(entry);
      adapters.writeFile(absoluteManifestPath, `${JSON.stringify(bundle, null, 2)}\n`);
      adapters.chmod(absoluteManifestPath, 0o600);
      if (adapters.mode(absoluteManifestPath) !== 0o600) fail('evidence manifest mode must be 0600');
      adapters.log(`staged evidence recorded: ${current.tree}`);
      return bundle;
    },
  };
}

export function runCli(argv = process.argv.slice(2), overrides = {}) {
  try {
    createVerifier(overrides).run(argv);
    return 0;
  } catch (error) {
    const environment = overrides.environment?.() ?? process.env;
    const knownSecrets = sensitiveEnvironmentValues(environment);
    const message = `staged evidence rejected: ${redact(error instanceof Error ? error.message : String(error), knownSecrets)}`;
    (overrides.error ?? ((text) => console.error(text)))(message);
    return 1;
  }
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirect) process.exitCode = runCli();
