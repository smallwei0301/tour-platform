import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const runner = await import('../../../../scripts/testing/with-midao-local-supabase.mjs');
const {
  LOCK_PATH,
  parseSupabasePin,
  canonicalProjectId,
  classifySupabaseStatus,
  validateCliWorkdirNotice,
  mapStatusEnvironment,
  confirmProjectContainers,
  assertOwnershipUnchanged,
  redactSupabaseOutput,
  buildSupabaseCliInvocation,
  acquireKernelRunnerLock,
  releaseKernelRunnerLock,
  createActualAdapter,
  runCommand,
  parseDockerHostGateway,
  startLoopbackBridge,
  prepareDatabaseOnlyWorkdir,
  runWithLocalSupabase,
} = runner;

const projectId = 'midao-backend-design';
const missingLine = `failed to inspect container health: Error response from daemon: No such container: supabase_db_${projectId}`;
const helpLine = 'Try rerunning the command with --debug to troubleshoot the error.';

test('package-lock pin and canonical repo basename are exact and fail closed', () => {
  assert.equal(parseSupabasePin(JSON.stringify({ packages: { 'node_modules/supabase': { version: '2.87.2' } } })), '2.87.2');
  for (const invalid of [
    '{}',
    JSON.stringify({ packages: { 'node_modules/supabase': { version: '^2.87.2' } } }),
    JSON.stringify({ packages: { 'node_modules/supabase': { version: 'latest' } } }),
  ]) assert.throws(() => parseSupabasePin(invalid));
  assert.equal(canonicalProjectId('/tmp/midao-backend-design'), projectId);
  for (const path of ['/tmp/Bad Project', '/tmp/project.name', '/']) assert.throws(() => canonicalProjectId(path));
});

test('status classifier accepts only pinned exact two-line CRLF-aware missing fixture', () => {
  for (const separator of ['\n', '\r\n']) {
    assert.equal(classifySupabaseStatus({
      exitCode: 1, stdout: '', stderr: `${missingLine}${separator}${helpLine}${separator}`, expectedProjectId: projectId,
    }), 'not-running');
  }
  const expectedWorkdir = `/tmp/lock/db-only-workdir/${projectId}`;
  assert.equal(classifySupabaseStatus({
    exitCode: 1, stdout: '', stderr: `Using workdir ${expectedWorkdir}\n${missingLine}\n${helpLine}\n`, expectedProjectId: projectId, expectedWorkdir,
  }), 'not-running');
  assert.throws(() => classifySupabaseStatus({
    exitCode: 1, stdout: '', stderr: `Using workdir /tmp/foreign/${projectId}\n${missingLine}\n${helpLine}\n`, expectedProjectId: projectId, expectedWorkdir,
  }), /STATUS_UNCLASSIFIED/u);
  for (const candidate of [
    { exitCode: 1, stdout: 'noise', stderr: `${missingLine}\n${helpLine}\n` },
    { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}` },
    { exitCode: 1, stdout: '', stderr: `\n${missingLine}\n${helpLine}\n` },
    { exitCode: 1, stdout: '', stderr: `${missingLine}\n\n${helpLine}\n` },
    { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n\n` },
    { exitCode: 1, stdout: '', stderr: `${missingLine}\n` },
    { exitCode: 1, stdout: '', stderr: `${helpLine}\n${missingLine}\n` },
    { exitCode: 1, stdout: '', stderr: `${missingLine}-suffix\n${helpLine}\n` },
    { exitCode: 1, stdout: '', stderr: `${missingLine.replace(projectId, 'wrong-project')}\n${helpLine}\n` },
    { exitCode: 2, stdout: '', stderr: `${missingLine}\n${helpLine}\n` },
  ]) assert.throws(() => classifySupabaseStatus({ ...candidate, expectedProjectId: projectId }));
  assert.equal(classifySupabaseStatus({ exitCode: 0, stdout: '{"DB_URL":"postgres://local"}', stderr: '', expectedProjectId: projectId }), 'running');
});

test('CLI workdir notice accepts only the exact controlled path', () => {
  const expectedWorkdir = `/tmp/lock/${projectId}`;
  assert.doesNotThrow(() => validateCliWorkdirNotice('', undefined));
  assert.doesNotThrow(() => validateCliWorkdirNotice(`Using workdir ${expectedWorkdir}\n`, expectedWorkdir));
  assert.doesNotThrow(() => validateCliWorkdirNotice(`Using workdir ${expectedWorkdir}\r\n`, expectedWorkdir));
  const stopped = `Stopped services: [${['kong', 'auth', 'inbucket', 'realtime', 'rest', 'storage', 'imgproxy', 'pg_meta', 'studio', 'edge_runtime', 'analytics', 'vector', 'pooler'].map((service) => `supabase_${service}_${projectId}`).join(' ')}]`;
  assert.doesNotThrow(() => validateCliWorkdirNotice(`Using workdir ${expectedWorkdir}\n${stopped}\n`, expectedWorkdir, projectId));
  assert.throws(() => validateCliWorkdirNotice(`Using workdir ${expectedWorkdir}\n${stopped.replace('supabase_kong', 'supabase_wrong')}\n`, expectedWorkdir, projectId), /CLI_UNEXPECTED_STDERR/u);
  assert.throws(() => validateCliWorkdirNotice(`Using workdir /tmp/foreign/${projectId}\n`, expectedWorkdir), /CLI_UNEXPECTED_STDERR/u);
});

test('status JSON requires DB URL and maps optional API credentials only when complete', () => {
  assert.deepEqual(mapStatusEnvironment(JSON.stringify({ DB_URL: 'postgres://local' })), {
    DATABASE_URL: 'postgres://local',
    SUPABASE_DB_URL: 'postgres://local',
  });
  assert.throws(() => mapStatusEnvironment('{}'), /STATUS_JSON_MISSING_DB_URL/u);
  assert.deepEqual(mapStatusEnvironment(JSON.stringify({
    DB_URL: 'postgres://local', API_URL: 'http://local', ANON_KEY: 'anon', SERVICE_ROLE_KEY: 'service',
  })), {
    DATABASE_URL: 'postgres://local', SUPABASE_DB_URL: 'postgres://local',
    SUPABASE_URL: 'http://local', NEXT_PUBLIC_SUPABASE_URL: 'http://local',
    SUPABASE_ANON_KEY: 'anon', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service',
  });
});

test('Docker-container gateway parsing and loopback-only TCP bridge are exact', async () => {
  const route = 'Iface\tDestination\tGateway\tFlags\neth0\t00000000\t010014AC\t0003\n';
  assert.equal(parseDockerHostGateway(route, '0::/docker/abc'), '172.20.0.1');
  assert.equal(parseDockerHostGateway(route, '0::/user.slice'), null);

  const upstream = createServer((socket) => socket.pipe(socket));
  await new Promise((resolveListen, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolveListen);
  });
  const upstreamPort = upstream.address().port;
  const bridge = await startLoopbackBridge({ listenPort: 0, targetHost: '127.0.0.1', targetPort: upstreamPort });
  try {
    const reply = await new Promise((resolveReply, reject) => {
      const socket = connect({ host: '127.0.0.1', port: bridge.port });
      socket.once('error', reject);
      socket.once('connect', () => socket.write('ping'));
      socket.once('data', (chunk) => { resolveReply(chunk.toString('utf8')); socket.end(); });
    });
    assert.equal(reply, 'ping');
    assert.equal(bridge.host, '127.0.0.1');
  } finally {
    await bridge.close();
    await new Promise((resolveClose) => upstream.close(resolveClose));
  }
});

test('database-only workdir preserves project identity and disables service jobs only in the copy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'midao-db-only-'));
  const repoRoot = join(root, projectId);
  const lockDir = join(root, 'lock');
  const sourceConfig = '[db]\nport = 54322\n[storage]\nenabled = true\n[auth]\nenabled = true\n';
  try {
    await mkdir(join(repoRoot, 'supabase', 'migrations'), { recursive: true });
    await mkdir(lockDir, { mode: 0o700 });
    await writeFile(join(repoRoot, 'supabase', 'config.toml'), sourceConfig);
    await writeFile(join(repoRoot, 'supabase', 'migrations', '001.sql'), 'select 1;\n');
    await writeFile(join(repoRoot, 'supabase', 'migrations', '001_v2.sql'), 'select 2;\n');
    await writeFile(join(repoRoot, 'supabase', 'migrations', '001.rollback.sql'), 'select 0;\n');
    const midaoMigrations = [
      '20260723000000_midao_backend_mode.sql',
      '20260723001000_midao_notification_outbox.sql',
      '20260723002000_midao_idempotency_records.sql',
      '20260723002500_midao_audit_events.sql',
      '20260723003000_midao_atomic_backend_mode_switch.sql',
      '20260723003500_midao_service_role_acl_hardening.sql',
    ];
    for (const [index, name] of midaoMigrations.entries()) {
      await writeFile(join(repoRoot, 'supabase', 'migrations', name), `select ${index + 10};\n`);
    }
    const workdir = await prepareDatabaseOnlyWorkdir({ repoRoot, lockDir });
    assert.equal(workdir.split('/').at(-1), projectId);
    assert.equal(await readFile(join(repoRoot, 'supabase', 'config.toml'), 'utf8'), sourceConfig);
    const copied = await readFile(join(workdir, 'supabase', 'config.toml'), 'utf8');
    for (const section of ['storage', 'auth', 'realtime', 'db.seed']) {
      assert.match(copied, new RegExp(`\\[${section}\\]\\nenabled = false`, 'u'));
    }
    assert.equal(await readFile(join(workdir, 'supabase', '.temp', 'cli-latest'), 'utf8'), 'v2.87.2');
    const migrationNames = await readdir(join(workdir, 'supabase', 'migrations'));
    assert.deepEqual(migrationNames.sort(), [
      '00000000000001_midao_test_bootstrap.sql',
      ...midaoMigrations.map((name, index) => `${String(index + 2).padStart(14, '0')}_${name}`),
    ]);
    assert.match(await readFile(join(workdir, 'supabase', 'migrations', migrationNames[0]), 'utf8'), /CREATE TABLE public\.guide_profiles/u);
    assert.equal(await readFile(join(workdir, 'supabase', 'migrations', migrationNames[1]), 'utf8'), 'select 10;\n');
    assert.equal(await readFile(join(repoRoot, 'supabase', 'migrations', '001.sql'), 'utf8'), 'select 1;\n');
    assert.equal(await readFile(join(repoRoot, 'supabase', 'migrations', '001.rollback.sql'), 'utf8'), 'select 0;\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('same-process secure FD lock rejects contention and unsafe filesystem identities', async () => {
  assert.equal(LOCK_PATH, '/tmp/tour-platform-local-supabase.lock');
  const root = await mkdtemp(join(tmpdir(), 'midao-lock-test-'));
  try {
    const lockDir = join(root, 'lock');
    const first = await acquireKernelRunnerLock({ lockDir });
    await assert.rejects(acquireKernelRunnerLock({ lockDir }), /LOCK_HELD/u);
    await releaseKernelRunnerLock(first);
    const released = JSON.parse(await readFile(join(lockDir, 'runner.lock'), 'utf8'));
    assert.equal(released.released, true);
    const afterRelease = await acquireKernelRunnerLock({ lockDir });
    await releaseKernelRunnerLock(afterRelease);

    const symlinkTarget = join(root, 'target');
    await mkdir(symlinkTarget, { mode: 0o700 });
    await symlink(symlinkTarget, join(root, 'symlink-lock'));
    await assert.rejects(acquireKernelRunnerLock({ lockDir: join(root, 'symlink-lock') }), /UNSAFE_LOCK/u);

    const wrongMode = join(root, 'wrong-mode');
    await mkdir(wrongMode, { mode: 0o755 });
    await assert.rejects(acquireKernelRunnerLock({ lockDir: wrongMode }), /UNSAFE_LOCK/u);

    const hardlinkDir = join(root, 'hardlink-lock');
    await mkdir(hardlinkDir, { mode: 0o700 });
    const victim = join(root, 'victim');
    await writeFile(victim, 'unchanged', { mode: 0o600 });
    await link(victim, join(hardlinkDir, 'runner.lock'));
    await assert.rejects(acquireKernelRunnerLock({ lockDir: hardlinkDir }), /UNSAFE_LOCK/u);
    assert.equal(await readFile(victim, 'utf8'), 'unchanged');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('lock release always closes the FD and preserves the primary write error', async () => {
  const calls = [];
  const primary = new Error('metadata write failed');
  await assert.rejects(releaseKernelRunnerLock({
    record: { pid: 1 },
    handle: {
      async truncate() { calls.push('truncate'); },
      async write() { calls.push('write'); throw primary; },
      async sync() { calls.push('sync'); },
      async close() { calls.push('close'); },
    },
  }), (error) => error === primary);
  assert.deepEqual(calls, ['truncate', 'write', 'close']);
});

test('project-scoped docker identity requires exact label and name suffix and captures IDs', () => {
  const snapshot = confirmProjectContainers({
    expectedProjectId: projectId,
    containers: [
      { id: 'id-db', name: `supabase_db_${projectId}`, projectLabel: projectId },
      { id: 'id-api', name: `supabase_kong_${projectId}`, projectLabel: projectId },
    ],
  });
  assert.deepEqual(snapshot, [
    { id: 'id-db', name: `supabase_db_${projectId}`, projectLabel: projectId },
    { id: 'id-api', name: `supabase_kong_${projectId}`, projectLabel: projectId },
  ]);
  for (const containers of [
    [],
    [{ id: 'x', name: `supabase_db_${projectId}-evil`, projectLabel: projectId }],
    [{ id: 'x', name: `supabase_db_${projectId}`, projectLabel: 'other' }],
    [{ id: '', name: `supabase_db_${projectId}`, projectLabel: projectId }],
  ]) assert.throws(() => confirmProjectContainers({ expectedProjectId: projectId, containers }));
});

test('cleanup ownership rejects any ID/name/label drift', () => {
  const owned = [{ id: '1', name: `supabase_db_${projectId}`, projectLabel: projectId }];
  assert.doesNotThrow(() => assertOwnershipUnchanged(owned, structuredClone(owned)));
  for (const current of [
    [{ ...owned[0], id: '2' }],
    [{ ...owned[0], name: `supabase_db_other` }],
    [{ ...owned[0], projectLabel: 'other' }],
    [],
  ]) assert.throws(() => assertOwnershipUnchanged(owned, current), /OWNERSHIP_DRIFT/u);
});

test('CLI invocation is pinned offline npm exec and never PATH supabase', () => {
  assert.deepEqual(buildSupabaseCliInvocation('2.87.2', ['status', '-o', 'json']), {
    command: 'npm',
    args: ['exec', '--offline', '--yes', '--package=supabase@2.87.2', '--', 'supabase', 'status', '-o', 'json'],
  });
});

test('actual adapter captures full immutable IDs and cleans containers, networks, volumes in order', async () => {
  const calls = [];
  const paths = [];
  const dockerApiVersions = [];
  const commandRunner = async (command, args, options = {}) => {
    calls.push([command, ...args]);
    paths.push(options.env?.PATH);
    dockerApiVersions.push(options.env?.DOCKER_API_VERSION);
    if (args[0] === 'ps') return { exitCode: 0, stdout: `full-container-id\tsupabase_db_${projectId}\t${projectId}\n`, stderr: '' };
    if (args[0] === 'network' && args[1] === 'ls') return { exitCode: 0, stdout: `full-network-id\tsupabase_network_${projectId}\t${projectId}\n`, stderr: '' };
    if (args[0] === 'volume' && args[1] === 'ls') return { exitCode: 0, stdout: `supabase_db_${projectId}\t${projectId}\n`, stderr: '' };
    if (args[0] === 'inspect') return { exitCode: 0, stdout: 'healthy\n', stderr: '' };
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  const adapter = createActualAdapter({ repoRoot: `/tmp/${projectId}`, pin: '2.87.2', nodeBin: '/node22', commandRunner });
  await adapter.status();
  await adapter.start();
  const containers = await adapter.containers();
  const assets = await adapter.assets();
  await adapter.waitForDatabase(containers);
  await adapter.stop(containers, assets);
  assert.deepEqual(calls, [
    ['npm', 'exec', '--offline', '--yes', '--package=supabase@2.87.2', '--', 'supabase', 'status'],
    ['npm', 'exec', '--offline', '--yes', '--package=supabase@2.87.2', '--', 'supabase', 'db', 'start'],
    ['docker', 'ps', '--no-trunc', '--filter', `label=com.supabase.cli.project=${projectId}`, '--format', '{{.ID}}\t{{.Names}}\t{{.Label "com.supabase.cli.project"}}'],
    ['docker', 'network', 'ls', '--no-trunc', '--filter', `label=com.supabase.cli.project=${projectId}`, '--format', '{{.ID}}\t{{.Name}}\t{{.Label "com.supabase.cli.project"}}'],
    ['docker', 'volume', 'ls', '--filter', `label=com.supabase.cli.project=${projectId}`, '--format', '{{.Name}}\t{{.Label "com.supabase.cli.project"}}'],
    ['docker', 'inspect', '--format', '{{.State.Health.Status}}', 'full-container-id'],
    ['docker', 'rm', '--force', '--', 'full-container-id'],
    ['docker', 'network', 'rm', 'full-network-id'],
    ['docker', 'volume', 'rm', 'supabase_db_midao-backend-design'],
  ]);
  assert.match(paths[0], /^\/root\/\.hermes\/toolchains\/supabase\/2\.87\.2:/u);
  assert.equal(dockerApiVersions[0], '1.43');
  assert.equal(dockerApiVersions[1], '1.43');
});

test('redaction removes explicit and structured local credentials from all output', () => {
  const raw = '{"anon_key":"anon-secret","service_role_key":"service-secret","DB_URL":"postgresql://postgres:db-secret@127.0.0.1:54322/postgres"}\nANON_KEY=anon-secret\n';
  const redacted = redactSupabaseOutput(raw, ['anon-secret', 'service-secret', 'db-secret']);
  for (const secret of ['anon-secret', 'service-secret', 'db-secret']) assert.equal(redacted.includes(secret), false);
  assert.match(redacted, /\[REDACTED\]/u);
});

test('abort terminates the complete spawned CLI process group without orphan descendants', async () => {
  const controller = new AbortController();
  const pending = runCommand('sh', ['-c', 'sleep 30 & child=$!; printf "%s\\n" "$child"; wait'], { signal: controller.signal });
  setTimeout(() => controller.abort(new Error('test abort')), 100);
  const result = await pending;
  const descendantPid = Number(result.stdout.trim());
  assert.notEqual(result.exitCode, 0);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  try {
    process.kill(descendantPid, 0);
    process.kill(descendantPid, 'SIGKILL');
    assert.fail(`orphan descendant still alive: ${descendantPid}`);
  } catch (error) {
    assert.equal(error.code, 'ESRCH');
  }
});

test('lifecycle never stops foreign/reused stacks and cleans only confirmed owned stack on failures', async () => {
  const calls = [];
  const adapter = {
    async status() { calls.push('status'); return { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n` }; },
    async start() { calls.push('start'); },
    async containers() { calls.push('containers'); return [{ id: '1', name: `supabase_db_${projectId}`, projectLabel: projectId }]; },
    async reset() { calls.push('reset'); throw new Error('reset failed'); },
    async stop() { calls.push('stop'); },
  };
  await assert.rejects(runWithLocalSupabase({ adapter, expectedProjectId: projectId, childArgs: ['test.mjs'] }), /reset failed/u);
  assert.deepEqual(calls, ['status', 'start', 'containers', 'reset', 'containers', 'stop']);

  calls.length = 0;
  adapter.status = async () => ({ exitCode: 0, stdout: '{}', stderr: '' });
  await assert.rejects(runWithLocalSupabase({ adapter, expectedProjectId: projectId, childArgs: [] }), /ALREADY_RUNNING/u);
  assert.equal(calls.includes('stop'), false);
});

test('start failure before identity confirmation never stops and child failure cleans owned stack', async () => {
  const startCalls = [];
  await assert.rejects(runWithLocalSupabase({
    expectedProjectId: projectId,
    childArgs: [],
    adapter: {
      async status() { return { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n` }; },
      async start() { startCalls.push('start'); throw new Error('start failed'); },
      async containers() { startCalls.push('containers'); return []; },
      async reset() {},
      async stop() { startCalls.push('stop'); },
    },
  }), /start failed/u);
  assert.deepEqual(startCalls, ['start', 'containers']);

  const partialCalls = [];
  const partialOwned = [{ id: 'partial-id', name: `supabase_db_${projectId}`, projectLabel: projectId }];
  await assert.rejects(runWithLocalSupabase({
    expectedProjectId: projectId,
    childArgs: [],
    adapter: {
      async status() { return { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n` }; },
      async start() { partialCalls.push('start'); throw new Error('start interrupted'); },
      async containers() { partialCalls.push('containers'); return structuredClone(partialOwned); },
      async assets() { partialCalls.push('assets'); return { networks: [], volumes: [] }; },
      async stop(identity, assets) { partialCalls.push(['stop', identity, assets]); },
    },
  }), /start interrupted/u);
  assert.deepEqual(partialCalls, [
    'start', 'containers', 'assets', 'containers', 'assets',
    ['stop', partialOwned, { networks: [], volumes: [] }],
  ]);

  const childCalls = [];
  const owned = [{ id: '1', name: `supabase_db_${projectId}`, projectLabel: projectId }];
  await assert.rejects(runWithLocalSupabase({
    expectedProjectId: projectId,
    childArgs: ['test.mjs'],
    adapter: {
      async status() { return { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n` }; },
      async start() { childCalls.push('start'); },
      async containers() { childCalls.push('containers'); return structuredClone(owned); },
      async reset() { childCalls.push('reset'); },
      async child() { childCalls.push('child'); return { exitCode: 9 }; },
      async stop() { childCalls.push('stop'); },
    },
  }), /CHILD_FAILED_9/u);
  assert.deepEqual(childCalls, ['start', 'containers', 'reset', 'containers', 'child', 'containers', 'stop']);
});

test('cleanup identity drift holds foreign stack and never calls stop', async () => {
  let reads = 0;
  const calls = [];
  await assert.rejects(runWithLocalSupabase({
    expectedProjectId: projectId,
    childArgs: [],
    adapter: {
      async status() { return { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n` }; },
      async start() {},
      async containers() {
        reads += 1;
        const ids = ['pre-reset-id', 'post-reset-id', 'replacement-id'];
        return [{ id: ids[Math.min(reads - 1, ids.length - 1)], name: `supabase_db_${projectId}`, projectLabel: projectId }];
      },
      async reset() {},
      async stop() { calls.push('stop'); },
    },
  }), /OWNERSHIP_DRIFT/u);
  assert.deepEqual(calls, []);
});

test('cleanup passes exact captured IDs to destructive stop, never project rediscovery', async () => {
  const owned = [
    { id: 'owned-a', name: `supabase_db_${projectId}`, projectLabel: projectId },
    { id: 'owned-b', name: `supabase_kong_${projectId}`, projectLabel: projectId },
  ];
  let stopped;
  await runWithLocalSupabase({
    expectedProjectId: projectId,
    childArgs: [],
    adapter: {
      async status() { return { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n` }; },
      async start() {},
      async containers() { return structuredClone(owned); },
      async reset() {},
      async stop(identity) { stopped = identity; },
    },
  });
  assert.deepEqual(stopped, owned);
});

test('signal received during cleanup completes stop but runner rejects', async () => {
  const controller = new AbortController();
  const calls = [];
  const owned = [{ id: '1', name: `supabase_db_${projectId}`, projectLabel: projectId }];
  await assert.rejects(runWithLocalSupabase({
    expectedProjectId: projectId,
    childArgs: [],
    signal: controller.signal,
    adapter: {
      async status() { return { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n` }; },
      async start() {},
      async containers() { return structuredClone(owned); },
      async reset() {},
      async stop() { calls.push('stop'); controller.abort(new Error('signal')); },
    },
  }), /RUNNER_SIGNALLED/u);
  assert.deepEqual(calls, ['stop']);
});
