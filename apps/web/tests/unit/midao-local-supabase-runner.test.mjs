import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const runner = await import('../../../../scripts/testing/with-midao-local-supabase.mjs');
const {
  LOCK_PATH,
  parseSupabasePin,
  canonicalProjectId,
  classifySupabaseStatus,
  confirmProjectContainers,
  assertOwnershipUnchanged,
  redactSupabaseOutput,
  buildSupabaseCliInvocation,
  acquireKernelRunnerLock,
  releaseKernelRunnerLock,
  createActualAdapter,
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
  const commandRunner = async (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === 'ps') return { exitCode: 0, stdout: `full-container-id\tsupabase_db_${projectId}\t${projectId}\n`, stderr: '' };
    if (args[0] === 'network' && args[1] === 'ls') return { exitCode: 0, stdout: `full-network-id\tsupabase_network_${projectId}\t${projectId}\n`, stderr: '' };
    if (args[0] === 'volume' && args[1] === 'ls') return { exitCode: 0, stdout: `supabase_db_${projectId}\t${projectId}\n`, stderr: '' };
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  const adapter = createActualAdapter({ repoRoot: `/tmp/${projectId}`, pin: '2.87.2', nodeBin: '/node22', commandRunner });
  const containers = await adapter.containers();
  const assets = await adapter.assets();
  await adapter.stop(containers, assets);
  assert.deepEqual(calls, [
    ['docker', 'ps', '--no-trunc', '--filter', `label=com.supabase.cli.project=${projectId}`, '--format', '{{.ID}}\t{{.Names}}\t{{.Label "com.supabase.cli.project"}}'],
    ['docker', 'network', 'ls', '--no-trunc', '--filter', `label=com.supabase.cli.project=${projectId}`, '--format', '{{.ID}}\t{{.Name}}\t{{.Label "com.supabase.cli.project"}}'],
    ['docker', 'volume', 'ls', '--filter', `label=com.supabase.cli.project=${projectId}`, '--format', '{{.Name}}\t{{.Label "com.supabase.cli.project"}}'],
    ['docker', 'rm', '--force', '--', 'full-container-id'],
    ['docker', 'network', 'rm', 'full-network-id'],
    ['docker', 'volume', 'rm', 'supabase_db_midao-backend-design'],
  ]);
});

test('redaction removes explicit and structured local credentials from all output', () => {
  const raw = '{"anon_key":"anon-secret","service_role_key":"service-secret","DB_URL":"postgresql://postgres:db-secret@127.0.0.1:54322/postgres"}\nANON_KEY=anon-secret\n';
  const redacted = redactSupabaseOutput(raw, ['anon-secret', 'service-secret', 'db-secret']);
  for (const secret of ['anon-secret', 'service-secret', 'db-secret']) assert.equal(redacted.includes(secret), false);
  assert.match(redacted, /\[REDACTED\]/u);
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
  assert.deepEqual(startCalls, ['start']);

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
  assert.deepEqual(childCalls, ['start', 'containers', 'reset', 'child', 'containers', 'stop']);
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
        return [{ id: reads === 1 ? 'owned-id' : 'replacement-id', name: `supabase_db_${projectId}`, projectLabel: projectId }];
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
