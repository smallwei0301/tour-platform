import assert from 'node:assert/strict';
import test from 'node:test';

const runner = await import('../../../../scripts/testing/with-midao-local-supabase.mjs');
const {
  LOCK_PATH,
  parseSupabasePin,
  canonicalProjectId,
  classifySupabaseStatus,
  acquireRunnerLock,
  confirmProjectContainers,
  assertOwnershipUnchanged,
  redactSupabaseOutput,
  buildSupabaseCliInvocation,
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
    { exitCode: 1, stdout: '', stderr: `${missingLine}\n` },
    { exitCode: 1, stdout: '', stderr: `${helpLine}\n${missingLine}\n` },
    { exitCode: 1, stdout: '', stderr: `${missingLine}-suffix\n${helpLine}\n` },
    { exitCode: 1, stdout: '', stderr: `${missingLine.replace(projectId, 'wrong-project')}\n${helpLine}\n` },
    { exitCode: 2, stdout: '', stderr: `${missingLine}\n${helpLine}\n` },
  ]) assert.throws(() => classifySupabaseStatus({ ...candidate, expectedProjectId: projectId }));
  assert.equal(classifySupabaseStatus({ exitCode: 0, stdout: '{"DB_URL":"postgres://local"}', stderr: '', expectedProjectId: projectId }), 'running');
});

test('filesystem lock is globally fixed, atomic, and only reclaims stale PID/start-ticks identity', async () => {
  assert.equal(LOCK_PATH, '/tmp/tour-platform-local-supabase.lock');
  const state = { exists: false, metadata: null, removed: 0 };
  const fs = {
    async mkdir() { if (state.exists) { const error = new Error('exists'); error.code = 'EEXIST'; throw error; } state.exists = true; },
    async writeFile(_path, text) { state.metadata = JSON.parse(text); },
    async readFile() { return JSON.stringify(state.metadata); },
    async rm() { state.exists = false; state.removed += 1; },
  };
  const metadata = { pid: 10, processStartTicks: '100', repoRoot: '/repo' };
  await acquireRunnerLock({ fs, lockPath: LOCK_PATH, metadata, processInspector: { exists: () => false, startTicks: () => null } });
  await assert.rejects(
    acquireRunnerLock({ fs, lockPath: LOCK_PATH, metadata: { ...metadata, pid: 20 }, processInspector: { exists: () => true, startTicks: () => '100' } }),
    /LOCK_HELD/u,
  );
  assert.equal(state.removed, 0);
  await acquireRunnerLock({ fs, lockPath: LOCK_PATH, metadata: { ...metadata, pid: 30 }, processInspector: { exists: () => true, startTicks: () => 'different' } });
  assert.equal(state.removed, 1);
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
