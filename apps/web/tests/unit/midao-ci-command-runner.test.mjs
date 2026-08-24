import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  buildChildEnvironment,
  createSecureTempEnvironment,
  parseCliArgs,
  redactText,
  resolveNodeExecutable,
  resolveNpmExecutable,
  runCiCommand,
  validateRepoConfig,
  writeAtomic0600,
} from '../../../../scripts/testing/run-midao-ci-command.mjs';

const NODE22 = '/root/.hermes/home/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node';
const SECRET = 'hostile-parent-secret-value-1234567890';

function state(overrides = {}) {
  return {
    status: '',
    head: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    headTree: 'b'.repeat(40),
    ...overrides,
  };
}

function baseAdapters(overrides = {}) {
  const calls = [];
  const temp = {
    home: '/tmp/midao-ci-test-home',
    cache: '/tmp/midao-ci-test-home/npm-cache',
    userConfig: '/tmp/midao-ci-test-home/user.npmrc',
    globalConfig: '/tmp/midao-ci-test-home/global.npmrc',
  };
  return {
    calls,
    runtimeVersion: () => { calls.push('runtime'); return '22.23.1'; },
    processExecPath: () => NODE22,
    parentEnvironment: () => ({
      PATH: SECRET,
      LANG: SECRET,
      DATABASE_URL: `postgres://user:${SECRET}@localhost/db`,
      SUPABASE_SERVICE_ROLE_KEY: SECRET,
      npm_config_registry: SECRET,
    }),
    repoRoot: () => '/repo',
    validateRepoConfig: () => calls.push('repo-config'),
    resolveNode: (execPath) => execPath,
    resolveNpm: () => '/usr/local/lib/node_modules/npm/bin/npm-cli.js',
    readState: () => state(),
    removeEvidence: () => calls.push('remove-evidence'),
    createTempEnvironment: () => {
      calls.push('setup');
      return temp;
    },
    cleanupTempEnvironment: () => calls.push('cleanup'),
    randomBytes: () => Buffer.from('r'.repeat(48)),
    probeNpmVersion: async ({ env }) => {
      calls.push(['npm-version', env]);
      return { status: 0, signal: null, error: null, stdout: '11.9.0\n' };
    },
    spawnChild: async ({ env, onOutput }) => {
      calls.push(['spawn', env]);
      const hostileLine = `Authorization: Basic ${SECRET}\n`;
      const split = hostileLine.indexOf(SECRET) + 9;
      onOutput('stdout', 'safe output\n' + hostileLine.slice(0, split));
      onOutput('stderr', 'independent safe line\n');
      onOutput('stdout', hostileLine.slice(split));
      return { status: 0, signal: null, error: null };
    },
    writeLog: (content) => {
      calls.push(['log', content]);
      return { path: '/git/midao-ci-lint.log', sha256: 'c'.repeat(64) };
    },
    publishEvidence: (value) => calls.push(['publish', value]),
    wrapperArgv: () => [NODE22, 'scripts/testing/run-midao-ci-command.mjs', 'lint'],
    now: () => 1_784_780_000,
    ...overrides,
  };
}

test('CLI accepts only one exact fixed mode', () => {
  for (const mode of ['lint', 'typecheck', 'build']) {
    assert.deepEqual(parseCliArgs([mode]), { mode, childArgs: ['run', mode] });
  }
  for (const argv of [[], ['test'], ['lint', '--fix'], ['build', SECRET]]) {
    assert.throws(() => parseCliArgs(argv), /mode|argument/i);
  }
});

test('strict child env never spreads hostile parent values', () => {
  const temp = {
    home: '/tmp/h', cache: '/tmp/h/cache', userConfig: '/tmp/h/user.npmrc', globalConfig: '/tmp/h/global.npmrc',
  };
  const parent = { PATH: SECRET, LANG: SECRET, DATABASE_URL: SECRET, API_TOKEN: SECRET, npm_config_registry: SECRET };
  const lint = buildChildEnvironment({ mode: 'lint', nodePath: NODE22, npmPath: '/usr/local/lib/node_modules/npm/bin/npm-cli.js', temp, parent, randomBytes: () => { throw new Error('must not generate'); } });
  assert.deepEqual(lint, {
    PATH: `${path.dirname(NODE22)}:/usr/local/bin:/usr/bin:/bin:/usr/local/lib/node_modules/npm/bin`,
    HOME: temp.home,
    LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TERM: 'dumb', NO_COLOR: '1', CI: '1', NODE_ENV: 'test',
    npm_config_userconfig: temp.userConfig,
    npm_config_globalconfig: temp.globalConfig,
    npm_config_cache: temp.cache,
    npm_config_update_notifier: 'false', npm_config_fund: 'false', npm_config_audit: 'false',
  });
  assert.doesNotMatch(JSON.stringify(lint), new RegExp(SECRET));

  const build = buildChildEnvironment({ mode: 'build', nodePath: NODE22, npmPath: '/usr/local/lib/node_modules/npm/bin/npm-cli.js', temp, parent, randomBytes: () => Buffer.from('z'.repeat(48)) });
  assert.equal(build.NODE_ENV, 'production');
  assert.ok(build.GUIDE_SESSION_SECRET.length >= 32);
  assert.ok(build.ADMIN_ACCESS_TOKEN.length >= 32);
  assert.equal(Buffer.from(build.MIDAO_REQUEST_CLAIM_PEPPER, 'base64url').length, 32);
  assert.equal(Buffer.from(build.MIDAO_REQUEST_CLAIM_PEPPER, 'base64url').toString('base64url'), build.MIDAO_REQUEST_CLAIM_PEPPER);
  assert.notEqual(build.GUIDE_SESSION_SECRET, build.ADMIN_ACCESS_TOKEN);
});

test('redaction removes credentials and exact known secrets', () => {
  const raw = `Authorization: Basic ${SECRET}\nCookie: sid=${SECRET}\npostgres://user:${SECRET}@localhost/db\nDATABASE_URL=${SECRET}`;
  const clean = redactText(raw, [SECRET]);
  assert.doesNotMatch(clean, new RegExp(SECRET));
  assert.match(clean, /\[REDACTED\]/);
});

test('npm resolver accepts only allowlisted executable real regular targets', () => {
  const files = new Map([
    ['/usr/local/bin/npm', { real: '/usr/local/lib/node_modules/npm/bin/npm-cli.js', mode: 0o100755 }],
  ]);
  const mockFs = {
    realpathSync: (candidate) => {
      const item = files.get(candidate);
      if (!item) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return item.real;
    },
    lstatSync: (target) => {
      const item = [...files.values()].find((value) => value.real === target);
      if (!item) throw new Error('missing');
      return { isFile: () => true, isSymbolicLink: () => false, mode: item.mode };
    },
    accessSync: () => {},
    constants: fs.constants,
  };
  assert.equal(resolveNpmExecutable({ execPath: NODE22, fsAdapter: mockFs }), '/usr/local/lib/node_modules/npm/bin/npm-cli.js');
  files.get('/usr/local/bin/npm').mode = 0o100775;
  assert.throws(() => resolveNpmExecutable({ execPath: NODE22, fsAdapter: mockFs }), /writable|npm/i);
});

test('Node executable is realpath-resolved, regular, executable, and non-writable', () => {
  const mockFs = {
    realpathSync: () => '/tool/node-real',
    lstatSync: () => ({ isFile: () => true, isSymbolicLink: () => false, mode: 0o100755 }),
    accessSync: () => {},
    constants: fs.constants,
  };
  assert.equal(resolveNodeExecutable({ execPath: '/tool/node-link', fsAdapter: mockFs }), '/tool/node-real');
  mockFs.lstatSync = () => ({ isFile: () => true, isSymbolicLink: () => false, mode: 0o100775 });
  assert.throws(() => resolveNodeExecutable({ execPath: '/tool/node', fsAdapter: mockFs }), /writable|Node/i);
});

test('secure temp setup survives hostile umask, verifies exact modes, restores umask, and cleans', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'midao-ci-parent-'));
  const original = process.umask(0o777);
  let isolated;
  try {
    isolated = createSecureTempEnvironment({ parentDirectory: parent });
    assert.equal(process.umask(), 0o777);
    assert.equal(fs.statSync(isolated.home).mode & 0o777, 0o700);
    assert.equal(fs.statSync(isolated.cache).mode & 0o777, 0o700);
    for (const file of [isolated.userConfig, isolated.globalConfig]) {
      const stat = fs.lstatSync(file);
      assert.ok(stat.isFile());
      assert.equal(stat.mode & 0o777, 0o600);
      assert.equal(stat.size, 0);
    }
    assert.notEqual(isolated.userConfig, isolated.globalConfig);
    assert.notEqual(isolated.userConfig, '/dev/null');
    isolated.cleanup();
    assert.equal(fs.existsSync(isolated.home), false);
  } finally {
    process.umask(original);
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('partial secure setup failures restore hostile umask and remove every created HOME', () => {
  for (const hookName of ['afterHomeCreated', 'afterCacheCreated', 'afterUserConfigCreated', 'afterGlobalConfigCreated']) {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'midao-ci-fault-'));
    const original = process.umask(0o777);
    try {
      assert.throws(() => createSecureTempEnvironment({
        parentDirectory: parent,
        hooks: { [hookName]: () => { throw new Error(`fault ${hookName}`); } },
      }), /fault/);
      assert.equal(process.umask(), 0o777);
      assert.deepEqual(fs.readdirSync(parent), []);
    } finally {
      process.umask(original);
      fs.rmSync(parent, { recursive: true, force: true });
    }
  }
});

test('FD/path identity check rejects npmrc replacement and still cleans', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'midao-ci-replace-'));
  const original = process.umask(0o777);
  try {
    assert.throws(() => createSecureTempEnvironment({
      parentDirectory: parent,
      hooks: {
        beforeUserConfigPathValidation: ({ target }) => {
          fs.rmSync(target);
          fs.symlinkSync('/dev/null', target);
        },
      },
    }), /regular|identity|config/i);
    assert.equal(process.umask(), 0o777);
    assert.deepEqual(fs.readdirSync(parent), []);
  } finally {
    process.umask(original);
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('mkdtemp failure restores original hostile umask', () => {
  const original = process.umask(0o777);
  const fsAdapter = new Proxy(fs, {
    get(target, property) {
      if (property === 'mkdtempSync') return () => { throw new Error('mkdtemp fault'); };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  try {
    assert.throws(() => createSecureTempEnvironment({ fsAdapter }), /mkdtemp fault/);
    assert.equal(process.umask(), 0o777);
  } finally {
    process.umask(original);
  }
});

test('each synchronous filesystem verification fault restores umask and cleans HOME', () => {
  for (const method of ['mkdirSync', 'openSync', 'fchmodSync', 'fstatSync', 'lstatSync']) {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'midao-ci-fs-fault-'));
    const original = process.umask(0o777);
    let injected = false;
    const fsAdapter = new Proxy(fs, {
      get(source, property) {
        const value = Reflect.get(source, property);
        if (property === method) {
          return (...args) => {
            if (!injected) { injected = true; throw new Error(`${method} fault`); }
            return value.apply(source, args);
          };
        }
        return typeof value === 'function' ? value.bind(source) : value;
      },
    });
    try {
      assert.throws(() => createSecureTempEnvironment({ parentDirectory: parent, fsAdapter }), new RegExp(`${method} fault`));
      assert.equal(process.umask(), 0o777);
      assert.deepEqual(fs.readdirSync(parent), []);
    } finally {
      process.umask(original);
      fs.rmSync(parent, { recursive: true, force: true });
    }
  }
});

test('directory and npmrc helpers preserve frozen primary errors when close also fails', () => {
  for (const targetCall of [1, 3]) {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'midao-ci-close-fault-'));
    const original = process.umask(0o777);
    const primary = Object.freeze(new Error(`PRIMARY fstat fault ${targetCall}`));
    let fstatCalls = 0;
    let closeCalls = 0;
    const fsAdapter = new Proxy(fs, {
      get(source, property) {
        const value = Reflect.get(source, property);
        if (property === 'fstatSync') {
          return (...args) => {
            fstatCalls += 1;
            if (fstatCalls === targetCall) throw primary;
            return value.apply(source, args);
          };
        }
        if (property === 'closeSync') {
          return (...args) => {
            closeCalls += 1;
            const result = value.apply(source, args);
            if (closeCalls === targetCall) throw new Error(`SECONDARY close fault ${targetCall}`);
            return result;
          };
        }
        return typeof value === 'function' ? value.bind(source) : value;
      },
    });
    try {
      assert.throws(
        () => createSecureTempEnvironment({ parentDirectory: parent, fsAdapter }),
        (error) => {
          assert.match(error.message, new RegExp(`PRIMARY fstat fault ${targetCall}`));
          if (error instanceof AggregateError) assert.match(error.errors[0].message, /PRIMARY fstat fault/);
          return true;
        },
      );
      assert.equal(process.umask(), 0o777);
      assert.deepEqual(fs.readdirSync(parent), []);
    } finally {
      process.umask(original);
      fs.rmSync(parent, { recursive: true, force: true });
    }
  }
});

test('repeated umask restore failure does not mask the primary setup error and HOME is cleaned', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'midao-ci-umask-fault-'));
  let calls = 0;
  const processAdapter = {
    umask() {
      calls += 1;
      if (calls === 1) return 0o777;
      throw new Error('restore fault');
    },
  };
  try {
    assert.throws(
      () => createSecureTempEnvironment({
        parentDirectory: parent,
        processAdapter,
        hooks: { afterHomeCreated: () => { throw new Error('primary setup fault'); } },
      }),
      /primary setup fault/,
    );
    assert.deepEqual(fs.readdirSync(parent), []);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('strict temp env runs pinned local npm without network under hostile umask', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'midao-ci-npm-'));
  const original = process.umask(0o777);
  let isolated;
  try {
    isolated = createSecureTempEnvironment({ parentDirectory: parent });
    const npm = resolveNpmExecutable({ execPath: NODE22 });
    const env = buildChildEnvironment({ mode: 'lint', nodePath: NODE22, npmPath: npm, temp: isolated, parent: {}, randomBytes: () => Buffer.alloc(48) });
    const result = spawnSync(npm, ['--version'], { env, encoding: 'utf8', shell: false });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), '11.9.0');
    assert.equal(process.umask(), 0o777);
  } finally {
    isolated?.cleanup();
    process.umask(original);
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('atomic writer aggregates post-rename cleanup errors and invalidates the target', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'midao-ci-atomic-'));
  const target = path.join(directory, 'evidence.json');
  let targetRemoveFailed = false;
  let targetStatFailed = false;
  let targetUnlinkCalls = 0;
  const fsAdapter = new Proxy(fs, {
    get(source, property) {
      if (property === 'renameSync') {
        return (from, to) => {
          fs.renameSync(from, to);
          throw new Error('PRIMARY post-rename fault');
        };
      }
      if (property === 'rmSync') {
        return (candidate, options) => {
          if (candidate === target && !targetRemoveFailed) {
            targetRemoveFailed = true;
            throw new Error('SECONDARY target remove fault');
          }
          return fs.rmSync(candidate, options);
        };
      }
      if (property === 'lstatSync') {
        return (candidate) => {
          if (candidate === target && !targetStatFailed) {
            targetStatFailed = true;
            const error = new Error('TERTIARY target lstat EIO');
            error.code = 'EIO';
            throw error;
          }
          return fs.lstatSync(candidate);
        };
      }
      if (property === 'unlinkSync') {
        return (candidate) => {
          if (candidate === target) targetUnlinkCalls += 1;
          return fs.unlinkSync(candidate);
        };
      }
      const value = Reflect.get(source, property);
      return typeof value === 'function' ? value.bind(source) : value;
    },
  });
  try {
    assert.throws(
      () => writeAtomic0600(target, '{}\n', { fsAdapter, randomBytes: () => Buffer.alloc(8, 1) }),
      (error) => {
        assert.match(error.message, /PRIMARY post-rename fault/);
        assert.equal(error instanceof AggregateError, true);
        const messages = [];
        const visit = (value) => {
          messages.push(value.message);
          if (value instanceof AggregateError) for (const nested of value.errors) visit(nested);
        };
        visit(error);
        assert.equal(messages.some((message) => /SECONDARY target remove fault/.test(message)), true);
        assert.equal(messages.some((message) => /TERTIARY target lstat EIO/.test(message)), true);
        return true;
      },
    );
    assert.equal(targetUnlinkCalls > 0, true);
    assert.equal(fs.existsSync(target), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('repo config guard rejects dotenv and npmrc files or symlinks, but allows examples', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'midao-ci-repo-'));
  fs.mkdirSync(path.join(repo, 'apps/web'), { recursive: true });
  try {
    fs.writeFileSync(path.join(repo, '.env.example'), 'SAFE=1');
    assert.doesNotThrow(() => validateRepoConfig(repo));
    for (const relative of ['.env.local', '.npmrc', 'apps/web/.env.production', 'apps/web/.npmrc']) {
      const target = path.join(repo, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, SECRET);
      assert.throws(() => validateRepoConfig(repo), /env|npmrc|config/i);
      fs.rmSync(target, { force: true });
    }
    fs.symlinkSync('/dev/null', path.join(repo, '.env.local'));
    assert.throws(() => validateRepoConfig(repo), /env|config/i);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('successful run cleans before publishing exact secret-free evidence', async () => {
  const adapters = baseAdapters();
  const result = await runCiCommand({ argv: ['lint'], adapters });
  assert.equal(result.mode, 'lint');
  const order = adapters.calls.map((call) => Array.isArray(call) ? call[0] : call);
  assert.ok(order.indexOf('cleanup') < order.indexOf('publish'));
  const spawn = adapters.calls.find((call) => Array.isArray(call) && call[0] === 'spawn');
  assert.deepEqual(Object.keys(spawn[1]).sort(), result.envNames);
  const log = adapters.calls.find((call) => Array.isArray(call) && call[0] === 'log')[1];
  const evidence = adapters.calls.find((call) => Array.isArray(call) && call[0] === 'publish')[1];
  assert.doesNotMatch(log + JSON.stringify(evidence), new RegExp(SECRET));
  assert.equal(log.includes(SECRET.slice(0, 9)), false);
  assert.equal(log.includes(SECRET.slice(9)), false);
  assert.deepEqual(evidence.childArgv, ['/usr/local/lib/node_modules/npm/bin/npm-cli.js', 'run', 'lint']);
  assert.equal(evidence.exitCode, 0);
});

test('build secrets exist only in child env, not wrapper argv, log, or evidence', async () => {
  let captured;
  const adapters = baseAdapters({
    wrapperArgv: () => [NODE22, 'scripts/testing/run-midao-ci-command.mjs', 'build'],
    spawnChild: async ({ env }) => { captured = env; return { status: 0, signal: null, error: null }; },
  });
  const result = await runCiCommand({ argv: ['build'], adapters });
  assert.ok(captured.GUIDE_SESSION_SECRET.length >= 32);
  assert.ok(captured.ADMIN_ACCESS_TOKEN.length >= 32);
  assert.equal(Buffer.from(captured.MIDAO_REQUEST_CLAIM_PEPPER, 'base64url').length, 32);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, new RegExp(captured.GUIDE_SESSION_SECRET));
  assert.doesNotMatch(serialized, new RegExp(captured.ADMIN_ACCESS_TOKEN));
  assert.doesNotMatch(serialized, new RegExp(captured.MIDAO_REQUEST_CLAIM_PEPPER));
  assert.deepEqual(result.wrapperArgv, [NODE22, 'scripts/testing/run-midao-ci-command.mjs', 'build']);
});

test('npm version probe requires exact 11.9.0 newline and fails closed on every outcome', async () => {
  const outcomes = [
    { status: 0, signal: null, error: null, stdout: '0.0.0\n' },
    { status: 0, signal: null, error: null, stdout: '11.9.0' },
    { status: 0, signal: null, error: null, stdout: '11.9.0 \n' },
    { status: 7, signal: null, error: null, stdout: '11.9.0\n' },
    { status: null, signal: 'SIGTERM', error: null, stdout: '' },
    { status: null, signal: null, error: null, stdout: '' },
    { status: null, signal: null, error: new Error('version spawn fault'), stdout: '' },
  ];
  for (const outcome of outcomes) {
    const adapters = baseAdapters({ probeNpmVersion: async () => outcome });
    await assert.rejects(() => runCiCommand({ argv: ['lint'], adapters }), /npm 11\.9\.0|version probe/i);
    assert.equal(adapters.calls.includes('cleanup'), true);
    assert.equal(adapters.calls.some((call) => Array.isArray(call) && call[0] === 'spawn'), false);
    assert.equal(adapters.calls.some((call) => Array.isArray(call) && call[0] === 'publish'), false);
  }
});

test('terminated and cross-chunk oversized lines are replaced by markers', async () => {
  for (const chunks of [
    ['X'.repeat(65_537) + '\n'],
    ['X'.repeat(40_000), 'X'.repeat(25_537) + '\n'],
  ]) {
    const adapters = baseAdapters({
      spawnChild: async ({ onOutput }) => {
        for (const chunk of chunks) onOutput('stdout', chunk);
        onOutput('stderr', 'safe\n');
        return { status: 0, signal: null, error: null };
      },
    });
    await runCiCommand({ argv: ['lint'], adapters });
    const log = adapters.calls.find((call) => Array.isArray(call) && call[0] === 'log')[1];
    assert.match(log, /REDACTED OVERSIZE LINE/);
    assert.equal(log.includes('X'.repeat(1024)), false);
  }
});

test('child throw, signal, nonzero, dirty postflight, and cleanup failure never publish', async () => {
  const cases = [
    { spawnChild: async () => { throw new Error('spawn exploded'); } },
    { spawnChild: async () => ({ status: null, signal: 'SIGTERM', error: null }) },
    { spawnChild: async () => ({ status: 9, signal: null, error: null }) },
    { readState: (() => { let n = 0; return () => (++n === 1 ? state() : state({ head: 'd'.repeat(40) })); })() },
    { cleanupTempEnvironment: () => { throw new Error('cleanup exploded'); } },
  ];
  for (const overrides of cases) {
    const adapters = baseAdapters(overrides);
    await assert.rejects(() => runCiCommand({ argv: ['lint'], adapters }), /spawn|signal|exit|state|head|cleanup/i);
    assert.equal(adapters.calls.some((call) => Array.isArray(call) && call[0] === 'publish'), false);
  }
});

test('frozen primary errors retain priority when cleanup also fails', async () => {
  const primary = Object.freeze(new Error('primary spawn failure'));
  const adapters = baseAdapters({
    spawnChild: async () => { throw primary; },
    cleanupTempEnvironment: () => { throw new Error('secondary cleanup failure'); },
  });
  await assert.rejects(
    () => runCiCommand({ argv: ['lint'], adapters }),
    (error) => {
      assert.match(error.message, /primary spawn failure/);
      if (error instanceof AggregateError) assert.match(error.errors[0].message, /primary spawn failure/);
      return true;
    },
  );
  assert.equal(adapters.calls.some((call) => Array.isArray(call) && call[0] === 'publish'), false);
});

test('old success evidence is removed before every fallible preflight', async () => {
  const failures = [
    { runtimeVersion: () => '24.14.0' },
    { validateRepoConfig: () => { throw new Error('dotenv blocked'); } },
    { resolveNode: () => { throw new Error('node invalid'); } },
    { resolveNpm: () => { throw new Error('npm invalid'); } },
    { readState: () => state({ status: '?? bad.ts' }) },
    { readState: () => state({ headTree: 'c'.repeat(40) }) },
  ];
  for (const overrides of failures) {
    const adapters = baseAdapters(overrides);
    await assert.rejects(() => runCiCommand({ argv: ['lint'], adapters }));
    assert.equal(adapters.calls[0], 'remove-evidence');
  }
});

test('runtime must be exact Node 22.23.1', async () => {
  const adapters = baseAdapters({ runtimeVersion: () => '24.14.0' });
  await assert.rejects(() => runCiCommand({ argv: ['lint'], adapters }), /Node 22\.23\.1/i);
  assert.deepEqual(adapters.calls, ['remove-evidence']);
});

test('dirty preflight or index tree not equal HEAD tree fails before child', async () => {
  for (const initial of [state({ status: '?? secret.ts' }), state({ headTree: 'c'.repeat(40) })]) {
    const adapters = baseAdapters({ readState: () => initial });
    await assert.rejects(() => runCiCommand({ argv: ['typecheck'], adapters }), /clean|tree|head/i);
    assert.equal(adapters.calls.some((call) => Array.isArray(call) && call[0] === 'spawn'), false);
  }
});

test('setup and log/evidence failures are fail-closed and do not preserve success evidence', async () => {
  const cases = [
    { createTempEnvironment: () => { throw new Error('partial setup'); } },
    { writeLog: () => { throw new Error('log write'); } },
    { publishEvidence: () => { throw new Error('evidence write'); } },
  ];
  for (const overrides of cases) {
    const adapters = baseAdapters(overrides);
    await assert.rejects(() => runCiCommand({ argv: ['lint'], adapters }), /setup|log|evidence/i);
    assert.ok(adapters.calls.includes('remove-evidence'));
  }
});
