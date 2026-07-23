import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CODE_LIKE_UNTRACKED,
  HEAVY_PREFIXES,
  classifyChild,
  createVerifier,
  deriveExpectedEvidenceCmd,
  parseCli,
  parsePorcelainV1Z,
  redact,
  validateBundle,
  validateRun,
} from '../../../../scripts/testing/verify-staged-check-evidence.mjs';

const NOW = 2_000_000;
const TEST = 'apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs';
const CHILD = ['.claude/hooks/run-checks.sh', '--typecheck', TEST];
const CMD = `node --test ${TEST} && npm run typecheck`;
const HEAVY = [...HEAVY_PREFIXES[0]];

function snapshot(overrides = {}) {
  const untracked = overrides.untracked ?? [];
  return {
    tree: 'tree-a',
    staged: [{ status: 'A', path: TEST, blob: 'abc123' }],
    trackedUnstaged: [],
    untracked,
    untrackedMeta: overrides.untrackedMeta ?? untracked.map((path) => ({ path, kind: 'file', executable: false })),
    tracked: [TEST, ...HEAVY_PREFIXES.map((prefix) => prefix.at(-1))],
    ...overrides,
  };
}

function validRun(overrides = {}) {
  return {
    nodeVersion: 'v22.17.0',
    now: NOW,
    childStartedAt: NOW - 20,
    childArgv: CHILD,
    actualChildArgv: CHILD,
    childExitCode: 0,
    evidence: { cmd: CMD, exit_code: 0, epoch: NOW - 10 },
    before: snapshot(),
    after: snapshot(),
    stdout: 'ok',
    stderr: '',
    heavyAllowlist: [],
    ...overrides,
  };
}

function rejects(patch, pattern) {
  assert.throws(() => validateRun(validRun(patch)), pattern);
}

test('deriveExpectedEvidenceCmd mirrors frozen runner typecheck semantics', () => {
  assert.equal(deriveExpectedEvidenceCmd(CHILD), CMD);
  assert.equal(
    deriveExpectedEvidenceCmd(['.claude/hooks/run-checks.sh', TEST]),
    `node --test ${TEST}`,
  );
});

test('valid run returns a secret-free manifest entry', () => {
  const entry = validateRun(validRun());
  assert.equal(entry.tree, 'tree-a');
  assert.deepEqual(entry.childArgv, CHILD);
  assert.deepEqual(entry.coveredPaths, [TEST]);
  assert.equal(entry.evidence.cmd, CMD);
  assert.equal(JSON.stringify(entry).includes('stdout'), false);
});

test('rejects non-Node-22 runtime and nonzero child or evidence', () => {
  rejects({ nodeVersion: 'v20.19.0' }, /Node 22/);
  rejects({ childExitCode: 1 }, /child.*exit/i);
  rejects({ evidence: { cmd: CMD, exit_code: 1, epoch: NOW - 10 } }, /evidence.*exit/i);
});

test('rejects argv or semantic evidence command mismatch', () => {
  rejects({ actualChildArgv: CHILD.slice(0, -1) }, /actual.*argv/i);
  rejects({ evidence: { cmd: `node --test unrelated.test.mjs && npm run typecheck`, exit_code: 0, epoch: NOW - 10 } }, /evidence\.cmd/);
});

test('rejects glob metacharacters and unrelated or untracked test paths', () => {
  rejects({ childArgv: ['.claude/hooks/run-checks.sh', 'apps/web/tests/**/*.test.mjs'], actualChildArgv: ['.claude/hooks/run-checks.sh', 'apps/web/tests/**/*.test.mjs'] }, /literal/i);
  rejects({ childArgv: ['.claude/hooks/run-checks.sh', 'apps/web/tests/unit/unrelated.test.mjs'], actualChildArgv: ['.claude/hooks/run-checks.sh', 'apps/web/tests/unit/unrelated.test.mjs'] }, /tracked|staged/i);
});

test('rejects stale, future-relative, or pre-child evidence', () => {
  rejects({ evidence: { cmd: CMD, exit_code: 0, epoch: NOW - 21 } }, /child start/i);
  rejects({ now: NOW + 1_801 }, /30 minutes/i);
});

test('rejects index changes, deletion, rename, and stale-tree reuse', () => {
  rejects({ after: snapshot({ tree: 'tree-b' }) }, /write-tree/i);
  rejects({ before: snapshot({ staged: [{ status: 'D', path: TEST, blob: null }] }), after: snapshot({ staged: [{ status: 'D', path: TEST, blob: null }] }) }, /deletion/i);
  rejects({ before: snapshot({ staged: [{ status: 'R100', path: TEST, oldPath: 'old.test.mjs', blob: 'blob-a' }] }), after: snapshot({ staged: [{ status: 'R100', path: TEST, oldPath: 'old.test.mjs', blob: 'blob-a' }] }) }, /rename/i);
  rejects({ existingBundle: { tree: 'tree-old', entries: [] } }, /old bundle|different tree/i);
});

test('rejects dirty tracked code and code-like untracked files but lists docs-only untracked', () => {
  rejects({ before: snapshot({ trackedUnstaged: ['scripts/testing/dirty.mjs'] }), after: snapshot({ trackedUnstaged: ['scripts/testing/dirty.mjs'] }) }, /tracked unstaged/i);
  for (const ext of CODE_LIKE_UNTRACKED) {
    const path = `scratch/file${ext}`;
    rejects({ before: snapshot({ untracked: [path] }), after: snapshot({ untracked: [path] }) }, /untracked.*(?:code|config|non-docs)/i);
  }
  const entry = validateRun(validRun({ before: snapshot({ untracked: ['notes/readme.md'] }), after: snapshot({ untracked: ['notes/readme.md'] }) }));
  assert.deepEqual(entry.docsOnlyUntracked, ['notes/readme.md']);
});

test('rejects test files added or modified after evidence', () => {
  rejects({ after: snapshot({ staged: [{ status: 'A', path: TEST, blob: 'blob-new' }] }) }, /staged state changed|blob/i);
  rejects({ after: snapshot({ untracked: ['apps/web/tests/unit/new.test.mjs'] }) }, /untracked code|test/i);
});

test('rejects arbitrary flags, command injection, and non-allowlisted heavy runners', () => {
  for (const childArgv of [
    ['.claude/hooks/run-checks.sh', '--all', TEST],
    ['.claude/hooks/run-checks.sh', '--all', '--typecheck'],
    ['.claude/hooks/run-checks.sh', '--all', '--all'],
    ['.claude/hooks/run-checks.sh', '--typecheck', '--typecheck', TEST],
    ['.claude/hooks/run-checks.sh', '--unknown', TEST],
  ]) rejects({ childArgv, actualChildArgv: childArgv }, /allow|--all|flag/i);
  rejects({ childArgv: ['sh', '-c', 'true'], actualChildArgv: ['sh', '-c', 'true'] }, /runner/i);
  rejects({ childArgv: ['scripts/heavy.sh', '--run-heavy'], actualChildArgv: ['scripts/heavy.sh', '--run-heavy'] }, /heavy|allowlist/i);
});

test('ordinary --all derives npm test and covers only tests selected by npm test', () => {
  const selected = 'apps/web/tests/api/other.test.mjs';
  const rootTest = 'apps/web/tests/slot-generator.test.mjs';
  const playwright = 'apps/web/e2e/t1-login.spec.ts';
  const hiddenDirectory = 'apps/web/tests/.hidden/ghost.test.mjs';
  const hiddenFile = 'apps/web/tests/unit/.ghost.test.mjs';
  const state = snapshot({
    staged: [
      ...snapshot().staged,
      { status: 'A', path: selected, blob: 'def456' },
      { status: 'A', path: rootTest, blob: 'abc789' },
      { status: 'A', path: playwright, blob: 'fed321' },
      { status: 'A', path: hiddenDirectory, blob: '123abc' },
      { status: 'A', path: hiddenFile, blob: '456def' },
    ],
    tracked: [...snapshot().tracked, selected, rootTest, playwright, hiddenDirectory, hiddenFile],
  });
  const childArgv = ['.claude/hooks/run-checks.sh', '--all'];
  const input = validRun({
    childArgv,
    actualChildArgv: childArgv,
    before: state,
    after: state,
    evidence: { cmd: 'npm test', exit_code: 0, epoch: NOW - 1 },
  });
  assert.equal(deriveExpectedEvidenceCmd(childArgv), 'npm test');
  assert.deepEqual(validateRun(input).coveredPaths, [TEST, selected]);
});

test('hidden tests require literal targeted entries in the coverage union', () => {
  const hiddenDirectory = 'apps/web/tests/.hidden/ghost.test.mjs';
  const hiddenFile = 'apps/web/tests/unit/.ghost.test.mjs';
  const state = snapshot({
    staged: [
      ...snapshot().staged,
      { status: 'A', path: hiddenDirectory, blob: '123abc' },
      { status: 'A', path: hiddenFile, blob: '456def' },
    ],
    tracked: [...snapshot().tracked, hiddenDirectory, hiddenFile],
  });
  const allArgv = ['.claude/hooks/run-checks.sh', '--all'];
  const allEntry = validateRun(validRun({
    childArgv: allArgv, actualChildArgv: allArgv, before: state, after: state,
    evidence: { cmd: 'npm test', exit_code: 0, epoch: NOW - 2 },
  }));
  assert.throws(
    () => validateBundle({ bundle: { schemaVersion: 1, tree: 'tree-a', entries: [allEntry] }, current: state, evidence: allEntry.evidence, now: NOW }),
    /cover every staged test/i,
  );
  const targetedArgv = ['.claude/hooks/run-checks.sh', hiddenDirectory, hiddenFile];
  const targetedEvidence = { cmd: `node --test ${hiddenDirectory} ${hiddenFile}`, exit_code: 0, epoch: NOW - 1 };
  const targetedEntry = validateRun(validRun({
    childArgv: targetedArgv, actualChildArgv: targetedArgv, before: state, after: state, evidence: targetedEvidence,
  }));
  assert.doesNotThrow(() => validateBundle({
    bundle: { schemaVersion: 1, tree: 'tree-a', entries: [allEntry, targetedEntry] },
    current: state, evidence: targetedEvidence, now: NOW,
  }));
});

test('allows only explicitly bounded --run-heavy runners', () => {
  const heavy = [...HEAVY, TEST];
  const value = validRun({
    runMode: 'heavy',
    childArgv: heavy,
    actualChildArgv: heavy,
    evidence: undefined,
  });
  assert.equal(validateRun(value).kind, 'heavy');
});

test('rejects secret-bearing stdout and stderr and redacts common credentials', () => {
  for (const field of ['stdout', 'stderr']) rejects({ [field]: 'API_TOKEN=super-secret-value' }, /secret/i);
  const clean = redact('password=hunter2 Authorization: Bearer abcdefghijklmnop key=abcd1234');
  assert.doesNotMatch(clean, /hunter2|abcdefghijklmnop|abcd1234/);
});

test('parses NUL-safe porcelain including rename records', () => {
  assert.deepEqual(
    parsePorcelainV1Z(` M tracked.ts\0R  renamed.ts\0old.ts\0?? notes.md\0`),
    [
      { index: ' ', worktree: 'M', path: 'tracked.ts' },
      { index: 'R', worktree: ' ', path: 'renamed.ts', oldPath: 'old.ts' },
      { index: '?', worktree: '?', path: 'notes.md' },
    ],
  );
});

test('check-only requires current tree, fresh entries, and complete staged-test union', () => {
  const entry = validateRun(validRun());
  const bundle = { schemaVersion: 1, tree: 'tree-a', entries: [entry] };
  assert.equal(validateBundle({ bundle, current: snapshot(), evidence: validRun().evidence, now: NOW }).tree, 'tree-a');
  assert.throws(() => validateBundle({ bundle, current: snapshot({ tree: 'tree-b' }), evidence: validRun().evidence, now: NOW }), /current index tree/i);
  assert.throws(() => validateBundle({ bundle, current: snapshot(), evidence: validRun().evidence, now: NOW + 1_801 }), /30 minutes/i);
  const extraTest = 'apps/web/tests/unit/extra-staged.test.mjs';
  const partialState = snapshot({
    staged: [
      ...snapshot().staged,
      { status: 'A', path: extraTest, blob: 'def456' },
    ],
    tracked: [...snapshot().tracked, extraTest],
  });
  const partialEntry = validateRun(validRun({ before: partialState, after: partialState }));
  assert.throws(
    () => validateBundle({
      bundle: { schemaVersion: 1, tree: 'tree-a', entries: [partialEntry] },
      current: partialState,
      evidence: validRun().evidence,
      now: NOW,
    }),
    /cover.*staged test/i,
  );
});

test('check-only revalidates latest ordinary entry against current evidence only', () => {
  const entry = validateRun(validRun());
  const older = {
    ...entry,
    childStartedAt: NOW - 120,
    evidence: { cmd: CMD, exit_code: 0, epoch: NOW - 110 },
    verifiedAt: NOW - 100,
  };
  const bundle = { schemaVersion: 1, tree: 'tree-a', entries: [older, entry] };
  assert.doesNotThrow(() => validateBundle({ bundle, current: snapshot(), evidence: validRun().evidence, now: NOW }));
  assert.throws(() => validateBundle({ bundle, current: snapshot(), evidence: { ...validRun().evidence, epoch: NOW - 9 }, now: NOW }), /latest.*evidence/i);
});

test('parses real top-level --run-heavy mode and keeps mode out of child argv', () => {
  assert.deepEqual(parseCli(['--run-heavy', '--', ...HEAVY]), { mode: 'run-heavy', childArgv: HEAVY });
  assert.deepEqual(parseCli(['--run', '--', ...CHILD]), { mode: 'run', childArgv: CHILD });
  assert.equal(classifyChild(HEAVY, { runMode: 'heavy', tracked: snapshot().tracked }).kind, 'heavy');
  assert.throws(() => classifyChild([...HEAVY, '--run-heavy'], { runMode: 'heavy', tracked: snapshot().tracked }), /suffix|test|allow/i);
});

test('heavy allowlist requires each exact immutable prefix', () => {
  for (const prefix of HEAVY_PREFIXES) {
    assert.equal(classifyChild(prefix, { runMode: 'heavy', tracked: snapshot().tracked }).kind, 'heavy');
  }
  const mutations = [
    ['timeout', '--signal=KILL', '570s', 'bash', HEAVY.at(-1)],
    ['timeout', '--signal=TERM', '571s', 'bash', HEAVY.at(-1)],
    ['timeout', '--signal=TERM', '570s', 'sh', HEAVY.at(-1)],
    ['timeout', '--signal=TERM', '570s', 'bash', '--verbose', HEAVY.at(-1)],
    ['timeout', '--signal=TERM', '570s', 'bash', 'scripts/testing/not-heavy.sh'],
  ];
  for (const argv of mutations) assert.throws(() => classifyChild(argv, { runMode: 'heavy', tracked: snapshot().tracked }), /prefix|allow/i);
});

test('heavy suffixes are literal tracked tests but only staged suffixes are covered', () => {
  const reused = 'apps/web/tests/unit/reused.test.mjs';
  const state = snapshot({ tracked: [...snapshot().tracked, reused] });
  const entry = validateRun(validRun({
    runMode: 'heavy', childArgv: [...HEAVY, reused, TEST], actualChildArgv: [...HEAVY, reused, TEST],
    evidence: undefined, before: state, after: state,
  }));
  assert.deepEqual(entry.coveredPaths, [TEST]);
  for (const suffix of ['apps/web/tests/**/*.test.mjs', 'README.md', 'apps/web/tests/unit/untracked.test.mjs']) {
    assert.throws(() => classifyChild([...HEAVY, suffix], { runMode: 'heavy', tracked: state.tracked }), /literal|tracked|test/i);
  }
});

test('heavy entries store direct child result and never carry harness evidence', () => {
  const entry = validateRun(validRun({ runMode: 'heavy', childArgv: HEAVY, actualChildArgv: HEAVY, evidence: undefined }));
  assert.equal(entry.childExitCode, 0);
  assert.equal(entry.epoch, NOW);
  assert.equal(Object.hasOwn(entry, 'evidence'), false);
  assert.match(entry.expectedEvidenceCmd, /^timeout --signal=TERM 570s bash scripts\/testing\//);
});

test('check-only structurally rejects tampering in every entry', () => {
  const ordinary = validateRun(validRun());
  const heavy = validateRun(validRun({ runMode: 'heavy', childArgv: HEAVY, actualChildArgv: HEAVY, evidence: undefined }));
  const bundle = { schemaVersion: 1, tree: 'tree-a', entries: [heavy, ordinary] };
  const args = { current: snapshot(), evidence: validRun().evidence, now: NOW };
  assert.doesNotThrow(() => validateBundle({ bundle, ...args }));
  const corruptions = [
    { ...ordinary, childArgv: [...CHILD, 'extra.test.mjs'] },
    { ...ordinary, expectedEvidenceCmd: 'tampered' },
    { ...ordinary, evidence: { ...ordinary.evidence, cmd: 'tampered' } },
    { ...ordinary, evidence: { ...ordinary.evidence, exit_code: 7 } },
    { ...ordinary, evidence: { ...ordinary.evidence, epoch: NOW + 1 } },
  ];
  for (const bad of corruptions) {
    assert.throws(() => validateBundle({ bundle: { ...bundle, entries: [heavy, bad] }, ...args }), /argv|command|cmd|exit|epoch|future|30 minutes/i);
  }
  assert.throws(() => validateBundle({ bundle: { ...bundle, entries: [{ ...heavy, childArgv: ['timeout', '1s', 'true'] }, ordinary] }, ...args }), /heavy|prefix|allow/i);
  assert.throws(() => validateBundle({ bundle: { ...bundle, entries: [{ ...heavy, evidence: validRun().evidence }, ordinary] }, ...args }), /harness evidence|heavy/i);
  assert.throws(() => validateBundle({ bundle: { ...bundle, entries: [{ ...heavy, epoch: heavy.childStartedAt - 1 }, ordinary] }, ...args }), /heavy.*epoch|child start/i);
});

function verifierAdapters({ existingBundle = null, spawnResult = { status: 0, stdout: '', stderr: '' }, manifestMode = 0o600 } = {}) {
  const manifestPath = '/repo/.git/midao-last-verified.json';
  const files = new Map([
    [manifestPath, JSON.stringify(existingBundle)],
    ['/repo/.claude/state/last-checks.json', JSON.stringify(validRun().evidence)],
  ]);
  const modes = new Map([[manifestPath, manifestMode]]);
  const output = [];
  const spawnCalls = [];
  const git = (args) => {
    const key = args.join(' ');
    if (key === 'rev-parse --show-toplevel') return '/repo\n';
    if (key === 'rev-parse --git-path midao-last-verified.json') return '/repo/.git/midao-last-verified.json\n';
    if (key === 'write-tree') return 'tree-a\n';
    if (key.startsWith('status --porcelain=v1')) return `A  ${TEST}\0`;
    if (key === 'ls-files --others --exclude-standard -z') return '';
    if (key === 'ls-files -z') return `${snapshot().tracked.join('\0')}\0`;
    if (key.startsWith('ls-files --stage -z -- ')) return `100644 abc123 0\t${TEST}\0`;
    throw new Error(`unexpected git call: ${key}`);
  };
  return {
    output, files, modes, manifestPath, spawnCalls,
    overrides: {
      git, now: () => NOW, nodeVersion: () => 'v22.17.0',
      exists: (file) => existingBundle !== null && files.has(file),
      readFile: (file) => files.get(file),
      writeFile: (file, data) => files.set(file, data),
      chmod: (file, mode) => modes.set(file, mode),
      mode: (file) => modes.get(file),
      remove: (file) => files.delete(file),
      pathInfo: (file) => ({ path: file.replace('/repo/', ''), kind: 'file', executable: false }),
      spawn: (command, args, options) => {
        spawnCalls.push({ command, args, options });
        return spawnResult;
      },
      stdout: (text) => output.push(['stdout', text]), stderr: (text) => output.push(['stderr', text]),
      log: (text) => output.push(['log', text]), error: (text) => output.push(['error', text]),
    },
  };
}

test('CLI suppresses child output before console adapters receive it', () => {
  const mocks = verifierAdapters({ spawnResult: { status: 0, stdout: 'hello token=raw-token-value', stderr: 'password=raw-password-value' } });
  assert.throws(() => createVerifier(mocks.overrides).run(['--run', '--', ...CHILD]), /secret/i);
  const consoleText = JSON.stringify(mocks.output);
  assert.doesNotMatch(consoleText, /hello|raw-token-value|raw-password-value/);
});

test('heavy CLI uses tracked NUL snapshot and does not read harness evidence', () => {
  const mocks = verifierAdapters();
  const reads = [];
  mocks.overrides.readFile = (file) => { reads.push(file); return mocks.files.get(file); };
  const bundle = createVerifier(mocks.overrides).run(['--run-heavy', '--', ...HEAVY, TEST]);
  assert.equal(bundle.entries[0].kind, 'heavy');
  assert.equal(reads.some((file) => file.endsWith('last-checks.json')), false);
});

test('same-tree existing bundle is revalidated before append', () => {
  const entry = validateRun(validRun());
  const tampered = { schemaVersion: 1, tree: 'tree-a', entries: [{ ...entry, expectedEvidenceCmd: 'tampered' }] };
  const mocks = verifierAdapters({ existingBundle: tampered });
  assert.throws(() => createVerifier(mocks.overrides).run(['--run', '--', ...CHILD]), /command|cmd|tamper/i);
  assert.equal(JSON.parse(mocks.files.get('/repo/.git/midao-last-verified.json')).entries.length, 1);
});

test('rejects broad tracked code drift and post-evidence test/spec drift', () => {
  rejects({ before: snapshot({ trackedUnstaged: ['src/dirty.js'] }), after: snapshot({ trackedUnstaged: ['src/dirty.js'] }) }, /tracked unstaged/i);
  rejects({ before: snapshot({ untracked: ['apps/web/tests/unit/new.test.js'] }), after: snapshot({ untracked: ['apps/web/tests/unit/new.test.js'] }) }, /untracked|test.*drift/i);
});

test('heavy suffix must be a strict tracked .test/.spec path', () => {
  const helper = 'apps/web/tests/unit/helper.mjs';
  assert.throws(
    () => classifyChild([...HEAVY, helper], { runMode: 'heavy', tracked: [...snapshot().tracked, helper] }),
    /test|spec|suffix/i,
  );
});

test('rejects secret-bearing docs filenames and exact-schema unknown fields', () => {
  rejects({
    before: snapshot({ untracked: ['notes/password=hunter2.md'] }),
    after: snapshot({ untracked: ['notes/password=hunter2.md'] }),
  }, /secret/i);
  const entry = validateRun(validRun());
  const args = { current: snapshot(), evidence: validRun().evidence, now: NOW };
  assert.throws(
    () => validateBundle({ bundle: { schemaVersion: 1, tree: 'tree-a', entries: [{ ...entry, stdout: 'clean' }] }, ...args }),
    /schema|unknown|field/i,
  );
  assert.throws(
    () => validateBundle({ bundle: { schemaVersion: 1, tree: 'tree-a', entries: [{ ...entry, stdout: 'password=hunter2' }] }, ...args }),
    /secret/i,
  );
});

test('writes manifest as 0600 and check-only rejects mode tampering', () => {
  const writeMocks = verifierAdapters({ manifestMode: 0o644 });
  createVerifier(writeMocks.overrides).run(['--run-heavy', '--', ...HEAVY, TEST]);
  assert.equal(writeMocks.modes.get(writeMocks.manifestPath), 0o600);

  const entry = validateRun(validRun());
  const bundle = { schemaVersion: 1, tree: 'tree-a', entries: [entry] };
  const checkMocks = verifierAdapters({ existingBundle: bundle, manifestMode: 0o644 });
  assert.throws(() => createVerifier(checkMocks.overrides).run(['--check-only']), /0600|mode|permission/i);
});

test('rejects tracked and untracked YAML configuration drift', () => {
  for (const file of ['config/ci.yaml', '.github/workflows/ci.yml']) {
    rejects({ before: snapshot({ trackedUnstaged: [file] }), after: snapshot({ trackedUnstaged: [file] }) }, /tracked unstaged/i);
    rejects({ before: snapshot({ untracked: [file] }), after: snapshot({ untracked: [file] }) }, /untracked.*(?:code|config|non-docs)/i);
  }
});

test('rejects docs-only untracked changes while child runs', () => {
  rejects({ after: snapshot({ untracked: ['notes/new.md'] }) }, /untracked.*changed|state changed/i);
  rejects({ after: snapshot({ untracked: ['notes/password=hunter2.md'] }) }, /secret|untracked.*changed/i);
});

test('check-only binds docs-only snapshot to current untracked files', () => {
  const entry = validateRun(validRun());
  const bundle = { schemaVersion: 1, tree: 'tree-a', entries: [entry] };
  assert.throws(
    () => validateBundle({ bundle, current: snapshot({ untracked: ['notes/new.md'] }), evidence: validRun().evidence, now: NOW }),
    /docs-only|untracked|snapshot/i,
  );
  assert.throws(
    () => validateBundle({ bundle, current: snapshot({ untracked: ['notes/password=hunter2.md'] }), evidence: validRun().evidence, now: NOW }),
    /secret/i,
  );
});

test('explicit docs allowlist rejects dotfiles, extensionless config, and tracked config drift', () => {
  for (const file of ['.env.local', 'scripts/bootstrap', 'Dockerfile', 'Makefile']) {
    rejects({ before: snapshot({ untracked: [file] }), after: snapshot({ untracked: [file] }) }, /untracked|docs-only|config/i);
  }
  rejects({ before: snapshot({ trackedUnstaged: ['.npmrc'] }), after: snapshot({ trackedUnstaged: ['.npmrc'] }) }, /tracked unstaged/i);
  rejects({ before: snapshot({ trackedUnstaged: ['README.md'] }), after: snapshot() }, /tracked.*changed|state changed/i);
});

test('docs-only untracked files must be regular and non-executable', () => {
  for (const meta of [
    { path: 'notes/readme.md', kind: 'symlink', executable: false },
    { path: 'notes/readme.md', kind: 'file', executable: true },
  ]) {
    const state = snapshot({ untracked: [meta.path], untrackedMeta: [meta] });
    rejects({ before: state, after: state }, /symlink|executable|unsafe|regular/i);
  }
});

test('rejects database URLs, all authorization schemes, cookies, and known ambient values', () => {
  for (const stdout of [
    'DATABASE_URL=postgres://user:pass@db.example/app',
    'Authorization: Basic dXNlcjpwYXNz',
    'Cookie: session=abc123',
    'postgres://user:pass@db.example/app',
  ]) rejects({ stdout }, /secret/i);
  assert.throws(() => validateRun(validRun({ stdout: 'prefix AMBIENT_SENTINEL suffix', knownSecrets: ['AMBIENT_SENTINEL'] })), /secret/i);
});

test('CLI never captures child streams and handles spawn errors or signals explicitly', () => {
  const ignoredMocks = verifierAdapters({ spawnResult: { status: 0, stdout: null, stderr: null } });
  createVerifier(ignoredMocks.overrides).run(['--run-heavy', '--', ...HEAVY, TEST]);
  assert.deepEqual(ignoredMocks.spawnCalls[0].options.stdio, ['ignore', 'ignore', 'ignore']);
  assert.equal(Object.hasOwn(ignoredMocks.spawnCalls[0].options, 'maxBuffer'), false);
  assert.equal(ignoredMocks.output.some(([kind]) => kind === 'stdout' || kind === 'stderr'), false);

  const signalMocks = verifierAdapters({ spawnResult: { status: null, signal: 'SIGTERM', stdout: null, stderr: null } });
  assert.throws(() => createVerifier(signalMocks.overrides).run(['--run-heavy', '--', ...HEAVY, TEST]), /signal|terminated/i);
  const errorMocks = verifierAdapters({ spawnResult: { status: null, error: new Error('DATABASE_URL=postgres://user:pass@db'), stdout: '', stderr: '' } });
  assert.throws(() => createVerifier(errorMocks.overrides).run(['--run-heavy', '--', ...HEAVY, TEST]), /execute|spawn|child/i);
  assert.doesNotMatch(JSON.stringify(errorMocks.output), /postgres:\/\/user:pass/);
});
