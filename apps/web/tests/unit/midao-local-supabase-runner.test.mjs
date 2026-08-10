import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer, connect } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  POST_CUTOFF_MIGRATIONS,
  SYNTHETIC_BASELINE_FILENAME,
} from '../../../../scripts/database-baseline/materialize-fresh-workdir.mjs';

const runner = await import('../../../../scripts/testing/with-midao-local-supabase.mjs');
const {
  LOCK_PATH,
  parseSupabasePin,
  canonicalProjectId,
  classifySupabaseStatus,
  validateSupabaseLifecycleStderr,
  validateCliWorkdirNotice,
  mapStatusEnvironment,
  buildMidaoPlaywrightEnvironment,
  resolveMidaoDatabaseHealthTimeoutSeconds,
  confirmProjectContainers,
  assertOwnershipUnchanged,
  redactSupabaseOutput,
  formatMidaoRunnerFailure,
  buildSupabaseCliInvocation,
  acquireKernelRunnerLock,
  releaseKernelRunnerLock,
  createActualAdapter,
  runCommand,
  parseDockerHostGateway,
  startLoopbackBridge,
  startSupabaseRestCompatProxy,
  resolvePinnedPostgrestRuntime,
  createLocalSupabaseApiCredentials,
  verifyMidaoE2ERuntimeFixtures,
  buildPinnedPostgrestRun,
  buildMidaoE2ELocalConfig,
  buildMidaoRealAuthE2ELocalConfig,
  prepareDatabaseOnlyWorkdir,
  prepareBaselineWorkdirWithAdapters,
  parseMidaoRunnerInvocation,
  runWithLocalSupabase,
} = runner;

const projectId = 'midao-backend-design';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
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

// #1759: canonical project id must mirror the pinned Supabase CLI 2.87.2 normalization.
// Expectations below are transcribed from the measured CLI probe table in
// docs/operations/session-handoffs/2026-08-08-issue1759-infra-40char-truncation-plan.md (§2.2).
const truncatedIssueProjectId = 'issue-1759-task42-inquiry-detail-ui-2026';

test('canonical project id mirrors the pinned Supabase CLI 2.87.2 normalization', () => {
  const { normalizeSupabaseProjectId } = runner;
  // R1 main case (measured against the pinned CLI): 44 chars -> exact 40-char prefix.
  assert.equal(canonicalProjectId('/tmp/issue-1759-task42-inquiry-detail-ui-20260808'), truncatedIssueProjectId);
  assert.equal(truncatedIssueProjectId.length, 40);
  // R2 boundary: exactly 40 stays untouched.
  const exactly40 = 'a'.repeat(40);
  assert.equal(canonicalProjectId(`/tmp/${exactly40}`), exactly40);
  // R3 boundary: 41 -> first 40 characters, pure prefix slice.
  const fortyOne = `${'b'.repeat(40)}c`;
  assert.equal(canonicalProjectId(`/tmp/${fortyOne}`), 'b'.repeat(40));
  // R4 truncation landing on a hyphen keeps the trailing hyphen verbatim (no beautification).
  assert.equal(
    canonicalProjectId('/tmp/abcdefghij-abcdefghij-abcdefghij-abcdef-ghij'),
    'abcdefghij-abcdefghij-abcdefghij-abcdef-',
  );
  // R5/R6 leading punctuation is stripped greedily.
  assert.equal(canonicalProjectId('/tmp/-leading-hyphen'), 'leading-hyphen');
  assert.equal(canonicalProjectId('/tmp/_leading-underscore'), 'leading-underscore');
  assert.equal(canonicalProjectId('/tmp/--double-hyphen'), 'double-hyphen');
  assert.equal(canonicalProjectId('/tmp/-_mixed-lead'), 'mixed-lead');
  // R7 stripping happens BEFORE truncation (CLI probe case 11).
  const leadingThenLong = `-${'a'.repeat(39)}zz`;
  const r7 = canonicalProjectId(`/tmp/${leadingThenLong}`);
  assert.equal(r7, `${'a'.repeat(39)}z`);
  assert.equal(r7.length, 40);
  // R8 all-punctuation names normalize to empty and must fail closed.
  for (const path of ['/tmp/____', '/tmp/---', '/tmp/-_-']) {
    assert.throws(() => canonicalProjectId(path), /INVALID_PROJECT_ID/u);
  }
  // R9 idempotency: normalize(normalize(x)) === normalize(x).
  assert.equal(typeof normalizeSupabaseProjectId, 'function');
  for (const value of [
    'issue-1759-task42-inquiry-detail-ui-20260808',
    'abcdefghij-abcdefghij-abcdefghij-abcdef-ghij',
    leadingThenLong,
    'midao-backend-design',
  ]) {
    const once = normalizeSupabaseProjectId(value);
    assert.equal(normalizeSupabaseProjectId(once), once);
    assert.ok(once.length <= 40);
  }
  // R10 existing negative contract must not regress.
  for (const path of ['/tmp/Bad Project', '/tmp/project.name', '/']) assert.throws(() => canonicalProjectId(path));
});

test('status classifier stays exact for a >40-character worktree basename', () => {
  // S1: with the truncated (CLI-real) id the pinned fixture still classifies.
  const truncatedMissingLine = `failed to inspect container health: Error response from daemon: No such container: supabase_db_${truncatedIssueProjectId}`;
  assert.equal(classifySupabaseStatus({
    exitCode: 1,
    stdout: '',
    stderr: `${truncatedMissingLine}\n${helpLine}\n`,
    expectedProjectId: truncatedIssueProjectId,
  }), 'not-running');
  // S2: an un-normalized (44-char) expectedProjectId is a caller defect and must surface as such.
  assert.throws(() => classifySupabaseStatus({
    exitCode: 1,
    stdout: '',
    stderr: `${truncatedMissingLine}\n${helpLine}\n`,
    expectedProjectId: 'issue-1759-task42-inquiry-detail-ui-20260808',
  }), /STATUS_PROJECT_ID_NOT_NORMALIZED/u);
  assert.throws(() => classifySupabaseStatus({
    exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n`, expectedProjectId: `-${projectId}`,
  }), /STATUS_PROJECT_ID_NOT_NORMALIZED/u);
  // S3: a genuinely unclassifiable stderr must carry expected/actual diagnostics.
  let thrown = null;
  try {
    classifySupabaseStatus({
      exitCode: 1,
      stdout: '',
      stderr: `${truncatedMissingLine}\nunexpected-extra-line\n${helpLine}\n`,
      expectedProjectId: truncatedIssueProjectId,
    });
  } catch (error) { thrown = error; }
  assert.ok(thrown instanceof Error);
  assert.match(thrown.message, /^STATUS_UNCLASSIFIED:/u);
  assert.match(thrown.message, /supabase_db_issue-1759-task42-inquiry-detail-ui-2026/u);
  assert.match(thrown.message, /unexpected-extra-line/u);
  // S4: secrets present in stderr must be redacted inside the diagnostic.
  let secretThrown = null;
  try {
    classifySupabaseStatus({
      exitCode: 1,
      stdout: '',
      stderr: `postgresql://postgres:sekret@127.0.0.1:54322/postgres\n${helpLine}\n`,
      expectedProjectId: truncatedIssueProjectId,
    });
  } catch (error) { secretThrown = error; }
  assert.ok(secretThrown instanceof Error);
  assert.match(secretThrown.message, /^STATUS_UNCLASSIFIED:/u);
  assert.doesNotMatch(secretThrown.message, /sekret/u);
  assert.match(secretThrown.message, /\[REDACTED\]/u);
});

test('runner failure formatter surfaces status diagnostics', () => {
  const message = `STATUS_UNCLASSIFIED: expected=${JSON.stringify(`supabase_db_${truncatedIssueProjectId}`)} actual=${JSON.stringify('unexpected-extra-line service-secret')}`;
  const formatted = formatMidaoRunnerFailure(new Error(message), ['service-secret']);
  assert.doesNotMatch(formatted, /\[REDACTED_ERROR\]/u);
  assert.match(formatted, /STATUS_UNCLASSIFIED/u);
  assert.match(formatted, /supabase_db_issue-1759-task42-inquiry-detail-ui-2026/u);
  assert.match(formatted, /unexpected-extra-line/u);
  assert.doesNotMatch(formatted, /service-secret/u);
  const guardFormatted = formatMidaoRunnerFailure(new Error('STATUS_PROJECT_ID_NOT_NORMALIZED: expected="x" actual="-x"'), []);
  assert.doesNotMatch(guardFormatted, /\[REDACTED_ERROR\]/u);
  assert.match(guardFormatted, /STATUS_PROJECT_ID_NOT_NORMALIZED/u);
});

test('runner failure formatter retains redacted Supabase full-service startup diagnostics', () => {
  const formatted = formatMidaoRunnerFailure(
    new Error('SUPABASE_SERVICE_START_FAILED: failed to start service with service-secret'),
    ['service-secret'],
  );
  assert.match(formatted, /^SUPABASE_SERVICE_START_FAILED: failed to start service with \[REDACTED\]$/u);
  assert.doesNotMatch(formatted, /service-secret/u);
});

test('DB health timeout is configurable in positive whole seconds and defaults to the existing three minutes', () => {
  assert.equal(resolveMidaoDatabaseHealthTimeoutSeconds(), 180);
  assert.equal(resolveMidaoDatabaseHealthTimeoutSeconds('600'), 600);
  for (const invalid of ['0', '-1', '60.5', 'abc', ' 600']) {
    assert.throws(() => resolveMidaoDatabaseHealthTimeoutSeconds(invalid), /MIDAO_DB_HEALTH_TIMEOUT_SECONDS_INVALID/u);
  }
});

test('real-auth chain runner captures diagnostics in a persistent ignored worktree log directory', async () => {
  const source = await readFile(new URL('../../../../scripts/testing/run-midao-e2e.sh', import.meta.url), 'utf8');
  assert.match(source, /LOG_DIR="\$\{MIDAO_E2E_LOG_DIR:-"\$ROOT\/\.e2e-run-logs"\}"/u);
  assert.match(source, /mkdir -p "\$LOG_DIR"/u);
  assert.match(source, /MIDAO_DB_HEALTH_TIMEOUT_SECONDS="\$\{MIDAO_DB_HEALTH_TIMEOUT_SECONDS:-600\}"/u);
  assert.match(source, /LOG_NAME='midao-inquiry-conversion-chain\.log'/u);
  assert.match(source, /tee "\$LOG_DIR\/\$LOG_NAME"/u);
});

test('runner invocation reserves an exact Node integration lane for the pinned PostgREST runtime', () => {
  const integration = 'apps/web/tests/integration/midao-requests-postgrest.test.mjs';
  const decisionIntegration = 'apps/web/tests/integration/midao-booking-decision-postgrest.test.mjs';
  assert.deepEqual(parseMidaoRunnerInvocation(['--postgrest', integration]), {
    mode: 'postgrest',
    childArgs: [integration],
  });
  assert.deepEqual(parseMidaoRunnerInvocation(['--postgrest', decisionIntegration]), {
    mode: 'postgrest',
    childArgs: [decisionIntegration],
  });
  assert.deepEqual(parseMidaoRunnerInvocation(['--playwright', 'apps/web/e2e/midao-navigation.spec.ts']), {
    mode: 'playwright',
    childArgs: ['apps/web/e2e/midao-navigation.spec.ts'],
  });
  assert.deepEqual(parseMidaoRunnerInvocation([integration]), {
    mode: 'postgres',
    childArgs: [integration],
  });
  for (const hostile of [
    ['--postgrest'],
    ['--postgrest', 'apps/web/e2e/midao-navigation.spec.ts'],
    ['--postgrest', '../escape.test.mjs'],
    ['--unknown', integration],
  ]) assert.throws(() => parseMidaoRunnerInvocation(hostile), /ARGS_INVALID/u);
});

test('real-auth Playwright lane is an explicit allowlist and retains GoTrue in its isolated local config', () => {
  const chainSpec = 'apps/web/e2e/midao-inquiry-conversion-chain.spec.ts';
  assert.deepEqual(parseMidaoRunnerInvocation(['--playwright-real-auth', chainSpec]), {
    mode: 'playwright-real-auth',
    childArgs: [chainSpec],
  });
  for (const rejected of [
    ['--playwright-real-auth'],
    ['--playwright-real-auth', 'apps/web/e2e/midao-navigation.spec.ts'],
    ['--playwright-real-auth', '../escape.spec.ts'],
  ]) assert.throws(() => parseMidaoRunnerInvocation(rejected), /ARGS_INVALID/u);

  const canonical = '[api]\nenabled = true\n[storage]\nenabled = true\n[auth]\nenabled = true\n';
  const rewritten = buildMidaoRealAuthE2ELocalConfig(canonical);
  assert.match(rewritten, /\[auth\]\nenabled = true/u);
  assert.match(rewritten, /\[storage\]\nenabled = false/u);
  assert.match(rewritten, /\[realtime\]\nenabled = false\n$/u);
  assert.doesNotMatch(rewritten, /\[auth\]\nenabled = false/u);
});

test('API real-auth lane is an explicit single-spec allowlist without a browser runtime', () => {
  const chainTest = 'apps/web/tests/integration/midao-inquiry-conversion-api-chain.test.mjs';
  assert.deepEqual(parseMidaoRunnerInvocation(['--api-real-auth', chainTest]), {
    mode: 'api-real-auth',
    childArgs: [chainTest],
  });
  for (const rejected of [
    ['--api-real-auth'],
    ['--api-real-auth', 'apps/web/tests/integration/midao-requests-postgrest.test.mjs'],
    ['--api-real-auth', '../escape.test.mjs'],
  ]) assert.throws(() => parseMidaoRunnerInvocation(rejected), /ARGS_INVALID/u);
});

test('real-auth lanes use an isolated full-service seed with direct GoTrue-only fixture columns', async () => {
  const source = await readFile(new URL('../../../../scripts/testing/with-midao-local-supabase.mjs', import.meta.url), 'utf8');
  const seed = await readFile(new URL('../../../../scripts/testing/midao-api-real-auth-seed.sql', import.meta.url), 'utf8');
  assert.match(source, /if \(realAuthMode\) \{\s+const overlayPath = join\(repoRoot, 'scripts\/testing\/midao-api-real-auth-seed\.sql'\);/u);
  assert.match(source, /else if \(playwrightMode \|\| postgrestMode\) \{\s+const overlayPath = join\(repoRoot, 'scripts\/testing\/midao-e2e-seed\.sql'\);/u);
  assert.match(seed, /encrypted_password, email_confirmed_at/u);
  assert.match(seed, /inquiry_enabled/u);
  assert.doesNotMatch(seed, /information_schema|EXECUTE \$real_auth_fixture\$/u);
});

test('API real-auth runner keeps durable redacted output separate from the browser lane', async () => {
  const source = await readFile(new URL('../../../../scripts/testing/run-midao-e2e.sh', import.meta.url), 'utf8');
  assert.match(source, /apps\/web\/tests\/integration\/midao-inquiry-conversion-api-chain\.test\.mjs/u);
  assert.match(source, /MODE='--api-real-auth'/u);
  assert.match(source, /midao-inquiry-conversion-api-chain\.log/u);
  assert.doesNotMatch(source, /playwright.*api-chain|api-chain.*playwright/iu);
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

test('CLI workdir notice accepts only the exact controlled path', async () => {
  const expectedWorkdir = `/tmp/lock/${projectId}`;
  assert.throws(() => createActualAdapter({
    repoRoot: `/tmp/${projectId}`, pin: '2.87.2', nodeBin: '/node22', cliWorkdir: '/tmp/lock/foreign-project', commandRunner: async () => ({}),
  }), /CLI_WORKDIR_PROJECT_IDENTITY_MISMATCH/u);
  assert.doesNotThrow(() => validateCliWorkdirNotice('', undefined));
  assert.doesNotThrow(() => validateCliWorkdirNotice(`Using workdir ${expectedWorkdir}\n`, expectedWorkdir));
  assert.doesNotThrow(() => validateCliWorkdirNotice(`Using workdir ${expectedWorkdir}\r\n`, expectedWorkdir));
  const stopped = `Stopped services: [${['kong', 'auth', 'inbucket', 'realtime', 'rest', 'storage', 'imgproxy', 'pg_meta', 'studio', 'edge_runtime', 'analytics', 'vector', 'pooler'].map((service) => `supabase_${service}_${projectId}`).join(' ')}]`;
  assert.doesNotThrow(() => validateCliWorkdirNotice(`Using workdir ${expectedWorkdir}\n${stopped}\n`, expectedWorkdir, projectId));
  const fullServiceStopped = `Stopped services: [${['inbucket', 'realtime', 'storage', 'imgproxy', 'pg_meta', 'studio', 'edge_runtime', 'analytics', 'vector', 'pooler'].map((service) => `supabase_${service}_${projectId}`).join(' ')}]`;
  assert.doesNotThrow(() => validateCliWorkdirNotice(
    `Using workdir ${expectedWorkdir}\n${fullServiceStopped}\n`, expectedWorkdir, projectId, true,
  ));
  assert.throws(() => validateCliWorkdirNotice(
    `Using workdir ${expectedWorkdir}\n${stopped}\n`, expectedWorkdir, projectId, true,
  ), /CLI_UNEXPECTED_STDERR/u);
  const fullServiceAdapter = createActualAdapter({
    repoRoot: `/tmp/${projectId}`,
    pin: '2.87.2',
    nodeBin: '/node22',
    cliWorkdir: expectedWorkdir,
    fullServices: true,
    enableFullServices: async () => {},
    commandRunner: async () => ({
      exitCode: 0,
      stdout: JSON.stringify({ DB_URL: 'postgres://local' }),
      stderr: `Using workdir ${expectedWorkdir}\n${fullServiceStopped}\n`,
    }),
  });
  await assert.doesNotReject(fullServiceAdapter.statusJson());
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

test('Playwright child env binds cookies and web server to one exact loopback origin with canonical flags', () => {
  const env = buildMidaoPlaywrightEnvironment({
    parentEnv: { PLAYWRIGHT_NO_WEBSERVER: '1' },
    localEnv: { SUPABASE_URL: 'http://127.0.0.1:54321' },
    port: '43127',
  });
  assert.equal(env.MIDAO_E2E_PORT, '43127');
  assert.equal(env.NEXT_PUBLIC_BASE_URL, 'http://127.0.0.1:43127');
  assert.equal(env.NEXT_PUBLIC_APP_URL, 'http://127.0.0.1:43127');
  assert.equal(env.MIDAO_BACKEND_ENABLED, '1');
  assert.equal(env.MIDAO_BACKEND_MUTATIONS_ENABLED, '1');
  assert.equal(env.MIDAO_BACKEND_MODE_SWITCH_ENABLED, '1');
  assert.equal('MIDAO_MUTATIONS_ENABLED' in env, false);
  assert.equal('MIDAO_MODE_SWITCH_ENABLED' in env, false);
  assert.equal('PLAYWRIGHT_NO_WEBSERVER' in env, false);
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

test('Supabase REST compatibility proxy strips only the fixed /rest/v1 prefix on loopback', async () => {
  const calls = [];
  const upstream = createHttpServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      calls.push({ method: request.method, url: request.url, body: Buffer.concat(chunks).toString('utf8') });
      response.writeHead(201, { 'content-type': 'application/json', 'x-upstream': 'yes' });
      response.end('{"ok":true}');
    });
  });
  await new Promise((resolveListen, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolveListen);
  });
  const targetUrl = `http://127.0.0.1:${upstream.address().port}`;
  let proxy;
  try {
    proxy = await startSupabaseRestCompatProxy({ listenPort: 0, targetUrl });
    const response = await fetch(`${proxy.url}/rest/v1/guide_profiles?id=eq.fixture`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', apikey: 'local-test-key' },
      body: '{"backend_mode":"midao"}',
    });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('x-upstream'), 'yes');
    assert.equal(await response.text(), '{"ok":true}');
    assert.deepEqual(calls, [{
      method: 'PATCH',
      url: '/guide_profiles?id=eq.fixture',
      body: '{"backend_mode":"midao"}',
    }]);

    const doubleSlash = await fetch(`${proxy.url}/rest/v1//example.com/steal`);
    assert.equal(doubleSlash.status, 201);
    assert.equal(calls.at(-1).url, '//example.com/steal');

    const rejected = await fetch(`${proxy.url}/auth/v1/user`);
    assert.equal(rejected.status, 404);
    assert.equal(calls.length, 2);
  } finally {
    await proxy?.close();
    await new Promise((resolveClose) => upstream.close(resolveClose));
  }
  for (const invalidTarget of [
    'http://example.com:54321',
    'http://127.0.0.1:99999',
    'http://127.0.0.1:54321/rest/v1',
    'https://127.0.0.1:54321',
  ]) {
    await assert.rejects(
      startSupabaseRestCompatProxy({ listenPort: 0, targetUrl: invalidTarget }),
      /SUPABASE_REST_PROXY_CONTRACT_INVALID/u,
    );
  }
});

test('browser lifecycle separates direct PostgREST probes from Supabase client compatibility URL and closes the proxy', async () => {
  const source = await readFile(new URL('../../../../scripts/testing/with-midao-local-supabase.mjs', import.meta.url), 'utf8');
  assert.match(source, /const directApiUrl = 'http:\/\/127\.0\.0\.1:54321';/u);
  assert.match(source, /startSupabaseRestCompatProxy\(\{ listenPort: 0, targetUrl: directApiUrl \}\)/u);
  assert.match(source, /createLocalSupabaseApiCredentials\(apiCompatProxy\.url\)/u);
  assert.equal((source.match(/apiUrl: directApiUrl,/gu) || []).length, 2);
  assert.match(source, /if \(apiCompatProxy\) \{\s*try \{ await apiCompatProxy\.close\(\); \}\s*catch \(error\) \{ cleanupErrors\.push\(new Error\('API_COMPAT_PROXY_CLOSE_FAILED'/u);
});

test('baseline workdir verifies both transactions before materializer or full-service config consumers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'midao-baseline-gate-'));
  const repoRoot = join(root, projectId); const lockDir = join(root, 'lock');
  await mkdir(repoRoot); await mkdir(lockDir, { mode: 0o700 });
  const capture = () => ({
    transactionId: 'a'.repeat(64), ledger: { captureManifestSha256: 'b'.repeat(64) }, dispose() {},
  });
  const expected = () => ({
    transactionId: 'c'.repeat(64),
    manifest: { captureTransactionId: 'a'.repeat(64), captureManifestSha256: 'b'.repeat(64) }, dispose() {},
  });
  try {
    for (const failing of ['capture', 'expected']) {
      let materializerReads = 0; let configReads = 0;
      await assert.rejects(prepareBaselineWorkdirWithAdapters({
        repoRoot, lockDir, fullServices: true,
        verifyCapture: async () => { if (failing === 'capture') throw new Error('CAPTURE_HOLD'); return capture(); },
        verifyExpected: async () => { if (failing === 'expected') throw new Error('EXPECTED_HOLD'); return expected(); },
        materialize: async () => { materializerReads += 1; },
        readFullConfig: async () => { configReads += 1; },
        rewriteFullConfig: async () => {},
      }), /HOLD/u);
      assert.equal(materializerReads, 0); assert.equal(configReads, 0);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Midao E2E config disables unused Supabase service jobs while app-level auth stays in the real Next runtime', () => {
  const canonical = '[api]\nenabled = true\n[storage]\nenabled = true\nfile_size_limit = "50MiB"\n[auth]\nenabled = true\n';
  const rewritten = buildMidaoE2ELocalConfig(canonical);
  assert.match(rewritten, /\[storage\]\nenabled = false\nfile_size_limit = "50MiB"/u);
  assert.match(rewritten, /\[auth\]\nenabled = false/u);
  assert.match(rewritten, /\[realtime\]\nenabled = false\n$/u);
  assert.doesNotMatch(rewritten, /\[storage\]\nenabled = true/u);
  assert.equal(canonical.includes('[storage]\nenabled = true'), true);
  for (const hostile of [
    '[storage]\nenabled = true\n[storage]\nenabled = true\n',
    '[storage]\nenabled = true\n[realtime]\nenabled = true\n',
    '[storage]\nfile_size_limit = "50MiB"\n',
  ]) assert.throws(() => buildMidaoE2ELocalConfig(hostile), /MIDAO_E2E_LOCAL_CONFIG_AMBIGUOUS/u);
});

test('baseline workdir binds materializer capture, rewrites full config after verification, and cleans owned paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'midao-baseline-workdir-'));
  const repoRoot = join(root, projectId); const lockDir = join(root, 'lock'); const calls = [];
  await mkdir(repoRoot); await mkdir(lockDir, { mode: 0o700 });
  const configBytes = Buffer.from('[api]\nenabled = true\n');
  const capture = {
    transactionId: 'a'.repeat(64), ledger: { captureManifestSha256: 'b'.repeat(64) }, dispose() { calls.push('capture-dispose'); },
  };
  const expected = {
    transactionId: 'c'.repeat(64),
    manifest: { captureTransactionId: capture.transactionId, captureManifestSha256: capture.ledger.captureManifestSha256 },
    dispose() { calls.push('expected-dispose'); },
  };
  const migrationHistory = [
    '00000000000001_baseline_v1.sql',
    '20260723000000_midao_backend_mode.sql',
    '20260723001000_midao_notification_outbox.sql',
    '20260723002000_midao_idempotency_records.sql',
    '20260723002500_midao_audit_events.sql',
    '20260723003000_midao_atomic_backend_mode_switch.sql',
    '20260723003500_midao_service_role_acl_hardening.sql',
    '20260723004000_midao_request_read_projection.sql',
  ];
  expected.manifest.historyVersions = migrationHistory.map((name) => name.slice(0, 14));
  try {
    const capability = await prepareBaselineWorkdirWithAdapters({
      repoRoot, lockDir, fullServices: true,
      verifyCapture: async () => { calls.push('capture'); return capture; },
      verifyExpected: async () => { calls.push('expected'); return expected; },
      materialize: async ({ outputParent, projectId: id, postCutoffManifest }) => {
        assert.strictEqual(postCutoffManifest, expected.manifest);
        calls.push('materialize'); const workdir = join(outputParent, id); await mkdir(join(workdir, 'supabase'), { recursive: true });
        return {
          workdir, transactionId: capture.transactionId, captureManifestSha256: capture.ledger.captureManifestSha256,
          history: migrationHistory, seedPath: join(workdir, 'supabase/seed.sql'),
          async stageCliReplay() {}, async cleanupCliMetadata() {},
          async cleanup() { calls.push('materialized-cleanup'); await rm(workdir, { recursive: true }); },
        };
      },
      readFullConfig: async () => { calls.push('config-read'); return configBytes; },
      rewriteFullConfig: async () => { calls.push('config-write'); },
    });
    assert.deepEqual(calls, ['capture', 'expected', 'materialize', 'expected-dispose', 'capture-dispose']);
    await capability.enableFullServices();
    assert.deepEqual(calls.slice(-2), ['config-read', 'config-write']);
    assert.equal(capability.captureTransactionId, capture.transactionId);
    assert.equal(capability.expectedTransactionId, expected.transactionId);
    assert.equal(configBytes.every((byte) => byte === 0), true);
    assert.deepEqual(capability.migrationNames, migrationHistory);
    await capability.cleanup();
    await assert.rejects(readFile(join(lockDir, 'db-only-workdir')), /ENOENT/u);
    assert.deepEqual(calls, [
      'capture', 'expected', 'materialize', 'expected-dispose', 'capture-dispose',
      'config-read', 'config-write', 'materialized-cleanup',
    ]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('real default database workdir adapter consumes the complete trusted post-cutoff manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'midao-default-materializer-'));
  const lockDir = join(root, 'lock');
  const migrationName = POST_CUTOFF_MIGRATIONS.at(-1).filename;
  let capability;
  await mkdir(lockDir, { mode: 0o700 });
  try {
    capability = await prepareDatabaseOnlyWorkdir({ repoRoot, lockDir });
    assert.equal(capability.migrationNames.at(-1), migrationName);
    assert.equal(capability.migrationNames.filter((name) => name === migrationName).length, 1);
    const [source, materialized] = await Promise.all([
      readFile(join(repoRoot, 'supabase/migrations', migrationName)),
      readFile(join(capability.workdir, 'supabase/migrations', migrationName)),
    ]);
    assert.equal(
      createHash('sha256').update(materialized).digest('hex'),
      createHash('sha256').update(source).digest('hex'),
    );
  } finally {
    await capability?.cleanup();
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
    [{ id: 'x', name: `foreign_${projectId}`, projectLabel: projectId }],
    [{ id: 'x', name: `supabase_db_${projectId}-evil`, projectLabel: projectId }],
    [{ id: 'x', name: `supabase_db_${projectId}`, projectLabel: 'other' }],
    [{ id: '', name: `supabase_db_${projectId}`, projectLabel: projectId }],
  ]) assert.throws(() => confirmProjectContainers({ expectedProjectId: projectId, containers }));
});

test('pre-existing project resources block before start and are never adopted or cleaned', async () => {
  const calls = [];
  await assert.rejects(runWithLocalSupabase({
    expectedProjectId: projectId,
    childArgs: [],
    adapter: {
      async status() { calls.push('status'); return { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n` }; },
      async assertNoPreexistingResources() { calls.push('preflight'); throw new Error('PREEXISTING_PROJECT_RESOURCES'); },
      async start() { calls.push('start'); },
      async containers() { calls.push('containers'); return []; },
      async stop() { calls.push('stop'); },
    },
  }), /PREEXISTING_PROJECT_RESOURCES/u);
  assert.deepEqual(calls, ['status', 'preflight']);
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

test('CLI invocation directly executes the pinned verified toolchain binary', () => {
  assert.deepEqual(buildSupabaseCliInvocation('2.87.2', ['status', '-o', 'json']), {
    command: '/root/.hermes/toolchains/supabase/2.87.2/supabase',
    args: ['status', '-o', 'json'],
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
    if (args[0] === 'volume' && args[1] === 'inspect') return { exitCode: 0, stdout: `supabase_db_${projectId}\t2026-07-23T00:00:00Z\tlocal\tlocal\t${projectId}\n`, stderr: '' };
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
    ['/root/.hermes/toolchains/supabase/2.87.2/supabase', 'status'],
    ['/root/.hermes/toolchains/supabase/2.87.2/supabase', 'db', 'start'],
    ['docker', 'ps', '-a', '--no-trunc', '--filter', `label=com.supabase.cli.project=${projectId}`, '--format', '{{.ID}}\t{{.Names}}\t{{.Label "com.supabase.cli.project"}}'],
    ['docker', 'network', 'ls', '--no-trunc', '--filter', `label=com.supabase.cli.project=${projectId}`, '--format', '{{.ID}}\t{{.Name}}\t{{.Label "com.supabase.cli.project"}}'],
    ['docker', 'volume', 'ls', '--filter', `label=com.supabase.cli.project=${projectId}`, '--format', '{{.Name}}\t{{.Label "com.supabase.cli.project"}}'],
    ['docker', 'volume', 'inspect', '--format', '{{.Name}}\t{{.CreatedAt}}\t{{.Driver}}\t{{.Scope}}\t{{index .Labels "com.supabase.cli.project"}}', '--', `supabase_db_${projectId}`],
    ['docker', 'inspect', '--format', '{{.State.Health.Status}}', 'full-container-id'],
    ['docker', 'rm', '--force', '--', 'full-container-id'],
    ['docker', 'network', 'rm', 'full-network-id'],
    ['docker', 'volume', 'rm', 'supabase_db_midao-backend-design'],
  ]);
  assert.match(paths[0], /^\/root\/\.hermes\/toolchains\/supabase\/2\.87\.2:/u);
  assert.equal(dockerApiVersions[0], '1.43');
  assert.equal(dockerApiVersions[1], '1.43');
});

test('browser adapter starts database-only, waits for health, then enables only REST and gateway services', async () => {
  const calls = [];
  let dockerPsCalls = 0;
  const adapter = createActualAdapter({
    repoRoot: `/tmp/${projectId}`,
    pin: '2.87.2',
    nodeBin: '/node22',
    fullServices: true,
    enableFullServices: async () => { calls.push(['enable-full-services']); },
    commandRunner: async (command, args) => {
      calls.push([command, ...args]);
      if (command === 'docker' && args[0] === 'ps') {
        dockerPsCalls += 1;
        return { exitCode: 0, stdout: `db-id-${dockerPsCalls}\tsupabase_db_${projectId}\t${projectId}\n`, stderr: '' };
      }
      if (command === 'docker' && args[0] === 'inspect') {
        return { exitCode: 0, stdout: 'healthy\n', stderr: '' };
      }
      if (command === 'docker' && args[0] === 'exec') {
        if (args.at(-1).includes('to_regclass')) {
          return { exitCode: 0, stdout: '--absent--\n', stderr: '' };
        }
        if (args.at(-1).startsWith('CREATE SCHEMA')) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        return {
          exitCode: 0,
          stdout: 'version|text|text|NO\nstatements|ARRAY|_text|YES\nname|text|text|YES\n--history--\n00000000000000\n',
          stderr: '',
        };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  });

  await adapter.start();

  const bootstrapProbe = "SELECT COALESCE(to_regclass('supabase_migrations.schema_migrations')::text, '--absent--'); SELECT column_name || '|' || data_type || '|' || udt_name || '|' || is_nullable FROM information_schema.columns WHERE table_schema='supabase_migrations' AND table_name='schema_migrations' ORDER BY ordinal_position;";
  const bootstrapCreate = "CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations (version text NOT NULL PRIMARY KEY, statements text[], name text); INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('00000000000000', ARRAY[]::text[], 'midao_history_bootstrap');";
  const bootstrapVerify = "SELECT column_name || '|' || data_type || '|' || udt_name || '|' || is_nullable FROM information_schema.columns WHERE table_schema='supabase_migrations' AND table_name='schema_migrations' ORDER BY ordinal_position; SELECT '--history--'; SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;";
  const psql = (id) => ['docker', 'exec', '--env', 'PGPASSWORD=postgres', id, 'psql', '--username', 'supabase_admin', '--dbname', 'postgres', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--command'];
  assert.deepEqual(calls, [
    [
      '/root/.hermes/toolchains/supabase/2.87.2/supabase',
      'start',
      '--ignore-health-check',
      '--exclude',
      'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor',
    ],
    ['docker', 'ps', '-a', '--no-trunc', '--filter', `label=com.supabase.cli.project=${projectId}`, '--format', '{{.ID}}\t{{.Names}}\t{{.Label "com.supabase.cli.project"}}'],
    ['docker', 'inspect', '--format', '{{.State.Health.Status}}', 'db-id-1'],
    [...psql('db-id-1'), bootstrapProbe],
    [...psql('db-id-1'), bootstrapCreate],
    [...psql('db-id-1'), bootstrapVerify],
    ['enable-full-services'],
    ['/root/.hermes/toolchains/supabase/2.87.2/supabase', 'stop'],
    [
      '/root/.hermes/toolchains/supabase/2.87.2/supabase',
      'start',
      '--exclude',
      'realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor',
    ],
    ['docker', 'ps', '-a', '--no-trunc', '--filter', `label=com.supabase.cli.project=${projectId}`, '--format', '{{.ID}}\t{{.Names}}\t{{.Label "com.supabase.cli.project"}}'],
    ['docker', 'inspect', '--format', '{{.State.Health.Status}}', 'db-id-2'],
    [...psql('db-id-2'), bootstrapVerify],
  ]);
});

test('actual adapter preflight rejects pre-existing exact project containers, networks, and volumes before start', async () => {
  for (const occupied of ['container', 'network', 'volume']) {
    const calls = [];
    const adapter = createActualAdapter({
      repoRoot: `/tmp/${projectId}`,
      pin: '2.87.2',
      nodeBin: '/node22',
      commandRunner: async (command, args) => {
        calls.push([command, ...args]);
        if (command !== 'docker') return { exitCode: 0, stdout: '', stderr: '' };
        if (args[0] === 'ps') return {
          exitCode: 0,
          stdout: occupied === 'container' ? `container-id\tsupabase_db_${projectId}\t${projectId}\n` : '',
          stderr: '',
        };
        if (args[0] === 'network' && args[1] === 'ls') return {
          exitCode: 0,
          stdout: occupied === 'network' ? `network-id\tsupabase_network_${projectId}\t${projectId}\n` : '',
          stderr: '',
        };
        if (args[0] === 'volume' && args[1] === 'ls') return {
          exitCode: 0,
          stdout: occupied === 'volume' ? `supabase_db_${projectId}\t${projectId}\n` : '',
          stderr: '',
        };
        if (args[0] === 'volume' && args[1] === 'inspect') return {
          exitCode: 0,
          stdout: `supabase_db_${projectId}\t2026-07-27T00:00:00Z\tlocal\tlocal\t${projectId}\n`,
          stderr: '',
        };
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    await assert.rejects(adapter.assertNoPreexistingResources(), /PREEXISTING_PROJECT_RESOURCES/u);
    assert.equal(calls.some((args) => args.includes('start')), false);
  }
});

test('manual browser API uses the pinned PostgREST digest and local-only JWT credentials without CLI service start', () => {
  const runtime = resolvePinnedPostgrestRuntime(JSON.stringify({
    images: [{
      role: 'api',
      repository: 'public.ecr.aws/supabase/postgrest',
      tag: 'v14.8',
      repoDigest: 'public.ecr.aws/supabase/postgrest@sha256:' + 'a'.repeat(64),
      imageId: 'sha256:' + 'b'.repeat(64),
      platform: 'linux/amd64',
      architecture: 'amd64',
    }],
  }));
  assert.deepEqual(runtime, {
    repoDigest: 'public.ecr.aws/supabase/postgrest@sha256:' + 'a'.repeat(64),
    imageId: 'sha256:' + 'b'.repeat(64),
  });
  for (const hostile of [
    '{}',
    JSON.stringify({ images: [] }),
    JSON.stringify({ images: [{ role: 'api', repoDigest: 'latest', imageId: 'sha256:' + 'b'.repeat(64) }] }),
  ]) assert.throws(() => resolvePinnedPostgrestRuntime(hostile), /POSTGREST_RUNTIME_LOCK_INVALID/u);

  const credentials = createLocalSupabaseApiCredentials('http://127.0.0.1:54321');
  assert.equal(credentials.publicEnv.SUPABASE_URL, 'http://127.0.0.1:54321');
  assert.equal(credentials.publicEnv.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321');
  assert.equal(credentials.publicEnv.SUPABASE_ANON_KEY.split('.').length, 3);
  assert.equal(credentials.publicEnv.SUPABASE_SERVICE_ROLE_KEY.split('.').length, 3);
  assert.equal(credentials.containerEnv.PGRST_JWT_SECRET.length >= 32, true);
  assert.equal(JSON.stringify(credentials.publicEnv).includes(credentials.containerEnv.PGRST_JWT_SECRET), false);
  const invocation = buildPinnedPostgrestRun({ expectedProjectId: projectId, runtime, credentials });
  assert.equal(invocation.command, 'docker');
  assert.deepEqual(invocation.args.slice(0, 12), [
    'run', '--detach', '--pull', 'never', '--name', `supabase_rest_${projectId}`,
    '--label', `com.supabase.cli.project=${projectId}`,
    '--label', `com.docker.compose.project=${projectId}`,
    '--network', `supabase_network_${projectId}`,
  ]);
  assert.equal(invocation.args.at(-1), runtime.repoDigest);
  assert.equal(invocation.args.includes(credentials.containerEnv.PGRST_JWT_SECRET), false);
  assert.equal(invocation.args.filter((value) => value === '--env').length, Object.keys(credentials.containerEnv).length);
  assert.deepEqual(invocation.env, credentials.containerEnv);
  const bridged = buildPinnedPostgrestRun({
    expectedProjectId: projectId, runtime, credentials, publishHost: '172.20.0.1',
  });
  assert.equal(bridged.args.includes('172.20.0.1:54321:3000'), true);
  for (const publishHost of ['0.0.0.0', '8.8.8.8', '172.32.0.1', 'invalid']) {
    assert.throws(() => buildPinnedPostgrestRun({
      expectedProjectId: projectId, runtime, credentials, publishHost,
    }), /POSTGREST_RUN_CONTRACT_INVALID/u);
  }
});

test('browser runtime fixture probe validates exact Midao and legacy login rows and fails closed without leaking credentials', async () => {
  const serviceRoleKey = `header.payload.${'a'.repeat(43)}`;
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      status: 200,
      async json() {
        return [
          {
            id: '00000000-0000-4000-8000-000000000001',
            display_name: 'Legacy E2E Guide',
            guide_email: 'legacy-e2e@example.invalid',
            guide_password_hash: 'legacy-e2e-local-salt-20260727:d896145fe6dc47d2f618e7c086d5178bbdfbea29a7caa89a561a184f0c722029',
            backend_mode: 'legacy',
            guide_session_version: 1,
            verification_status: 'approved',
          },
          {
            id: '99999999-9999-4999-8999-999999999999',
            display_name: 'Midao E2E Guide',
            guide_email: 'midao-e2e@example.invalid',
            guide_password_hash: 'midao-e2e-local-salt-20260724:d00368494263d0f8b0e57243c336ecc5d8420c1454bf4887b1b7e8d53b2dba35',
            backend_mode: 'midao',
            guide_session_version: 1,
            verification_status: 'approved',
          },
        ];
      },
    };
  };
  await assert.doesNotReject(verifyMidaoE2ERuntimeFixtures({
    apiUrl: 'http://127.0.0.1:54321', serviceRoleKey, fetchImpl,
  }));
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^http:\/\/127\.0\.0\.1:54321\/guide_profiles\?/u);
  assert.equal(calls[0].options.headers.apikey, serviceRoleKey);
  assert.equal(calls[0].options.headers.authorization, `Bearer ${serviceRoleKey}`);

  for (const [response, expected] of [
    [{ status: 401, json: async () => ({}) }, /MIDAO_E2E_RUNTIME_FIXTURE_HTTP_401/u],
    [{ status: 200, json: async () => [] }, /MIDAO_E2E_RUNTIME_FIXTURE_COUNT_0/u],
    [{ status: 200, json: async () => [{ id: 'wrong' }] }, /MIDAO_E2E_RUNTIME_FIXTURE_COUNT_1/u],
  ]) {
    await assert.rejects(verifyMidaoE2ERuntimeFixtures({
      apiUrl: 'http://127.0.0.1:54321', serviceRoleKey,
      fetchImpl: async () => response,
    }), expected);
  }
});

test('actual adapter asset-only cleanup attempts network and volume and aggregates both failures', async () => {
  const calls = [];
  const adapter = createActualAdapter({
    repoRoot: `/tmp/${projectId}`, pin: '2.87.2', nodeBin: '/node22',
    commandRunner: async (command, args) => { calls.push([command, ...args]); return { exitCode: 1, stdout: '', stderr: 'failed' }; },
  });
  let observed;
  await assert.rejects(adapter.stop([], {
    networks: [{ id: 'owned-network', name: `supabase_network_${projectId}`, projectLabel: projectId }],
    volumes: [{ name: `supabase_db_${projectId}`, projectLabel: projectId }],
  }), (error) => { observed = error; return true; });
  assert.deepEqual(calls, [
    ['docker', 'network', 'rm', 'owned-network'],
    ['docker', 'volume', 'rm', `supabase_db_${projectId}`],
  ]);
  assert.match(observed.errors.map(String).join('\n'), /OWNED_NETWORK_CLEANUP_FAILED/u);
  assert.match(observed.errors.map(String).join('\n'), /OWNED_VOLUME_CLEANUP_FAILED/u);
});

test('successful start and reset reject any stderr beyond the exact controlled workdir notices', async () => {
  const expectedWorkdir = `/tmp/lock/db-only-workdir/${projectId}`;
  const migrationNames = [
    '00000000000001_midao_test_bootstrap.sql',
    '00000000000002_20260723000000_midao_backend_mode.sql',
    '00000000000003_20260723001000_midao_notification_outbox.sql',
    '00000000000004_20260723002000_midao_idempotency_records.sql',
    '00000000000005_20260723002500_midao_audit_events.sql',
    '00000000000006_20260723003000_midao_atomic_backend_mode_switch.sql',
    '00000000000007_20260723003500_midao_service_role_acl_hardening.sql',
  ];
  const startLines = [`Using workdir ${expectedWorkdir}`, 'Starting database...', 'Initialising schema...', 'Seeding globals from roles.sql...'];
  for (const [index, name] of migrationNames.entries()) {
    startLines.push(`Applying migration ${name}...`);
    if (index === 0) startLines.push('NOTICE (42710): extension "pgcrypto" already exists, skipping');
  }
  const startExact = `${startLines.join('\n')}\n`;
  const resetLines = [`Using workdir ${expectedWorkdir}`, 'Resetting local database...', 'Recreating database...', 'Initialising schema...', 'Seeding globals from roles.sql...'];
  for (const [index, name] of migrationNames.entries()) {
    resetLines.push(`Applying migration ${name}...`);
    if (index === 0) resetLines.push('NOTICE (42710): extension "pgcrypto" already exists, skipping');
  }
  resetLines.push('Restarting containers...', 'Finished supabase db reset on branch main.');
  const resetExact = `${resetLines.join('\n')}\n`;
  const commandRunner = async (_command, args) => {
    if (args.includes('start')) return { exitCode: 0, stdout: '', stderr: startExact };
    if (args.includes('reset')) return { exitCode: 0, stdout: '', stderr: resetExact };
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  const adapter = createActualAdapter({
    repoRoot: `/tmp/${projectId}`, pin: '2.87.2', nodeBin: '/node22', cliWorkdir: expectedWorkdir, commandRunner,
  });
  await assert.doesNotReject(adapter.start());
  await assert.doesNotReject(adapter.reset());

  const hostile = createActualAdapter({
    repoRoot: `/tmp/${projectId}`, pin: '2.87.2', nodeBin: '/node22', cliWorkdir: expectedWorkdir,
    commandRunner: async () => ({ exitCode: 0, stdout: '', stderr: `${startExact}unexpected warning\n` }),
  });
  await assert.rejects(hostile.start(), /CLI_UNEXPECTED_STDERR/u);
  await assert.rejects(hostile.reset(), /CLI_UNEXPECTED_STDERR/u);
});

test('redaction removes explicit and structured local credentials from all output', () => {
  const raw = '{"anon_key":"anon-secret","service_role_key":"service-secret","DB_URL":"postgresql://postgres:db-secret@127.0.0.1:54322/postgres"}\nANON_KEY=anon-secret\n';
  const redacted = redactSupabaseOutput(raw, ['anon-secret', 'service-secret', 'db-secret']);
  for (const secret of ['anon-secret', 'service-secret', 'db-secret']) assert.equal(redacted.includes(secret), false);
  assert.match(redacted, /\[REDACTED\]/u);
});

test('runner failure formatter expands nested safe codes while suppressing arbitrary secret-bearing messages', () => {
  const failure = new AggregateError([
    new AggregateError([
      new Error('OWNED_VOLUME_CLEANUP_FAILED'),
      new Error('postgresql://postgres:db-secret@127.0.0.1:54322/postgres'),
    ], 'owned Supabase asset cleanup failed'),
    new Error('DATABASE_WORKDIR_CLEANUP_FAILED'),
    new Error('SUPABASE_SERVICE_START_FAILED: service-secret postgresql://postgres:db-secret@127.0.0.1:54322/postgres'),
    new Error('service-secret'),
    new Error('SERVICESECRET'),
  ], 'Midao baseline runner and cleanup failed');
  const formatted = formatMidaoRunnerFailure(failure, ['db-secret', 'service-secret']);
  assert.match(formatted, /Midao baseline runner and cleanup failed/u);
  assert.match(formatted, /owned Supabase asset cleanup failed/u);
  assert.match(formatted, /OWNED_VOLUME_CLEANUP_FAILED/u);
  assert.match(formatted, /DATABASE_WORKDIR_CLEANUP_FAILED/u);
  assert.match(formatted, /SUPABASE_SERVICE_START_FAILED/u);
  assert.match(formatted, /\[REDACTED_ERROR\]/u);
  assert.doesNotMatch(formatted, /db-secret|service-secret|SERVICESECRET|postgresql:\/\//u);
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
    async assertNoPreexistingResources() {},
    async start() { calls.push('start'); },
    async containers() { calls.push('containers'); return [{ id: '1', name: `supabase_db_${projectId}`, projectLabel: projectId }]; },
    async reset() { calls.push('reset'); throw new Error('reset failed'); },
    async stop() { calls.push('stop'); },
  };
  await assert.rejects(runWithLocalSupabase({ adapter, expectedProjectId: projectId, childArgs: ['test.mjs'] }), /reset failed/u);
  assert.deepEqual(calls, ['status', 'start', 'containers', 'reset', 'containers', 'containers', 'stop']);

  calls.length = 0;
  adapter.status = async () => ({ exitCode: 0, stdout: '{}', stderr: '' });
  await assert.rejects(runWithLocalSupabase({ adapter, expectedProjectId: projectId, childArgs: [] }), /ALREADY_RUNNING/u);
  assert.equal(calls.includes('stop'), false);
});

test('lifecycle preserves start/reset primary with identity probe failures and cleans asset-only partial start', async () => {
  const flatten = (error, seen = new Set()) => {
    if (!error || seen.has(error)) return [];
    seen.add(error);
    return [String(error), ...flatten(error.cause, seen), ...(Array.isArray(error.errors) ? error.errors.flatMap((entry) => flatten(entry, seen)) : [])];
  };
  for (const phase of ['start', 'reset']) {
    let containerReads = 0;
    let observed;
    await assert.rejects(runWithLocalSupabase({
      expectedProjectId: projectId,
      childArgs: [],
      adapter: {
        async status() { return { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n` }; },
        async assertNoPreexistingResources() {},
        async start() { if (phase === 'start') throw new Error('START_PRIMARY'); },
        async containers() {
          containerReads += 1;
          if (phase === 'start' || containerReads > 1) throw new Error('IDENTITY_SECONDARY');
          return [{ id: 'owned', name: `supabase_db_${projectId}`, projectLabel: projectId }];
        },
        async reset() { throw new Error('RESET_PRIMARY'); },
        async stop() {},
      },
    }), (error) => { observed = error; return true; });
    const messages = flatten(observed).join('\n');
    assert.match(messages, new RegExp(phase === 'start' ? 'START_PRIMARY' : 'RESET_PRIMARY', 'u'));
    assert.match(messages, /IDENTITY_SECONDARY/u);
  }

  const calls = [];
  const assets = { networks: [{ id: 'network-id', name: `supabase_network_${projectId}`, projectLabel: projectId }], volumes: [{ name: `supabase_db_${projectId}`, projectLabel: projectId }] };
  let assetObserved;
  await assert.rejects(runWithLocalSupabase({
    expectedProjectId: projectId,
    childArgs: [],
    adapter: {
      async status() { return { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n` }; },
        async assertNoPreexistingResources() {},
      async start() { calls.push('start'); throw new Error('ASSET_ONLY_PRIMARY'); },
      async containers() { calls.push('containers'); return []; },
      async assets() { calls.push('assets'); return structuredClone(assets); },
      async stop(identity, stoppedAssets) { calls.push(['stop', identity, stoppedAssets]); },
    },
  }), (error) => { assetObserved = error; return true; });
  assert.match(flatten(assetObserved).join('\n'), /ASSET_ONLY_PRIMARY/u);
  const safeAssets = { networks: assets.networks, volumes: [] };
  assert.deepEqual(calls, ['start', 'containers', 'assets', 'containers', 'assets', ['stop', [], safeAssets]]);
});

test('pre-reset and post-reset probes preserve independently confirmed resource classes through cleanup', async () => {
  const flattenError = (error, seen = new Set()) => {
    if (!error || seen.has(error)) return [];
    seen.add(error);
    return [String(error), ...flattenError(error.cause, seen), ...(Array.isArray(error.errors) ? error.errors.flatMap((entry) => flattenError(entry, seen)) : [])];
  };
  const resource = (kind, phase) => ({
    id: `${kind}-${phase}-identity`,
    name: `supabase_${kind === 'volume' ? 'db' : kind}_${projectId}`,
    projectLabel: projectId,
  });

  {
    const calls = []; let networkReads = 0; let observed;
    const container = resource('db', 'pre'); const volume = resource('volume', 'pre');
    await assert.rejects(runWithLocalSupabase({
      expectedProjectId: projectId, childArgs: [], initialize: 'start-then-reset',
      adapter: {
        async status() { return { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n` }; },
        async assertNoPreexistingResources() {},
        async start() { calls.push('start'); },
        async reset() { calls.push('reset'); },
        async containers() { calls.push('containers'); return [container]; },
        async networks() { networkReads += 1; calls.push(`networks-${networkReads}`); throw new Error(networkReads === 1 ? 'PRE_RESET_NETWORK_PROBE' : 'PRE_RESET_NETWORK_CLEANUP_PROBE'); },
        async volumes() { calls.push('volumes'); return [volume]; },
        async stop(containers, assets) { calls.push(['stop', containers, assets]); throw new Error('PRE_RESET_STOP_FAILURE'); },
      },
    }), (error) => { observed = error; return true; });
    assert.deepEqual(calls, [
      'start', 'containers', 'networks-1', 'volumes',
      'containers', 'networks-2', 'volumes',
      ['stop', [container], { networks: [], volumes: [volume] }],
    ]);
    const messages = flattenError(observed).join('\n');
    for (const marker of ['PRE_RESET_NETWORK_PROBE', 'PRE_RESET_NETWORK_CLEANUP_PROBE', 'PRE_RESET_STOP_FAILURE']) assert.match(messages, new RegExp(marker, 'u'));
    assert.equal(calls.includes('reset'), false);
  }

  {
    const calls = []; let containerReads = 0; let networkReads = 0; let volumeReads = 0; let observed;
    const containerPre = resource('db', 'before-reset'); const containerPost = resource('db', 'after-reset');
    const networkPre = resource('network', 'before-reset'); const networkPost = resource('network', 'after-reset');
    const volumePre = resource('volume', 'before-reset'); const volumePost = resource('volume', 'after-reset');
    await assert.rejects(runWithLocalSupabase({
      expectedProjectId: projectId, childArgs: [], initialize: 'start-then-reset',
      adapter: {
        async status() { return { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n` }; },
        async assertNoPreexistingResources() {},
        async start() { calls.push('start'); },
        async reset() { calls.push('reset'); },
        async containers() { containerReads += 1; calls.push(`containers-${containerReads}`); return [containerReads === 1 ? containerPre : containerPost]; },
        async networks() { networkReads += 1; calls.push(`networks-${networkReads}`); return [networkReads === 1 ? networkPre : networkPost]; },
        async volumes() { volumeReads += 1; calls.push(`volumes-${volumeReads}`); if (volumeReads === 2) throw new Error('POST_RESET_VOLUME_PROBE'); return [volumeReads === 1 ? volumePre : volumePost]; },
        async stop(containers, assets) { calls.push(['stop', containers, assets]); throw new Error('POST_RESET_STOP_FAILURE'); },
      },
    }), (error) => { observed = error; return true; });
    assert.deepEqual(calls, [
      'start', 'containers-1', 'networks-1', 'volumes-1', 'reset',
      'containers-2', 'networks-2', 'volumes-2',
      'containers-3', 'networks-3', 'volumes-3',
      ['stop', [containerPost], { networks: [networkPost], volumes: [] }],
    ]);
    const messages = flattenError(observed).join('\n');
    for (const marker of ['POST_RESET_VOLUME_PROBE', 'OWNERSHIP_DRIFT', 'POST_RESET_STOP_FAILURE']) assert.match(messages, new RegExp(marker, 'u'));
  }
});

test('partial ownership probes clean each confirmed resource class and preserve every failure', async () => {
  const flattenError = (error, seen = new Set()) => {
    if (!error || seen.has(error)) return [];
    seen.add(error);
    return [String(error), ...flattenError(error.cause, seen), ...(Array.isArray(error.errors) ? error.errors.flatMap((entry) => flattenError(entry, seen)) : [])];
  };
  const calls = []; let networkReads = 0; let observed;
  const container = { id: 'owned-container', name: `supabase_db_${projectId}`, projectLabel: projectId };
  const volume = { id: 'created-at', name: `supabase_db_${projectId}`, projectLabel: projectId, driver: 'local', scope: 'local' };
  await assert.rejects(runWithLocalSupabase({
    expectedProjectId: projectId,
    childArgs: [],
    adapter: {
      async status() { return { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n` }; },
        async assertNoPreexistingResources() {},
      async start() { calls.push('start'); throw new Error('PARTIAL_START_PRIMARY'); },
      async containers() { calls.push('containers'); return [container]; },
      async networks() { networkReads += 1; calls.push(`networks-${networkReads}`); throw new Error(`NETWORK_PROBE_${networkReads}`); },
      async volumes() { calls.push('volumes'); return [volume]; },
      async stop(stoppedContainers, stoppedAssets) {
        calls.push(['stop', stoppedContainers, stoppedAssets]);
        throw new AggregateError([new Error('CONTAINER_CLEANUP_FAILED'), new Error('VOLUME_CLEANUP_FAILED')], 'partial cleanup failed');
      },
    },
  }), (error) => { observed = error; return true; });
  const confirmedVolume = { id: volume.id, name: volume.name, projectLabel: volume.projectLabel };
  assert.deepEqual(calls, [
    'start', 'containers', 'networks-1', 'volumes',
    'containers', 'networks-2', 'volumes',
    ['stop', [container], { networks: [], volumes: [confirmedVolume] }],
  ]);
  const messages = flattenError(observed).join('\n');
  for (const marker of ['PARTIAL_START_PRIMARY', 'NETWORK_PROBE_1', 'NETWORK_PROBE_2', 'CONTAINER_CLEANUP_FAILED', 'VOLUME_CLEANUP_FAILED']) {
    assert.match(messages, new RegExp(marker, 'u'));
  }
});

test('post-start partial probe failure still cleans every independently confirmed resource class', async () => {
  const flattenError = (error, seen = new Set()) => {
    if (!error || seen.has(error)) return [];
    seen.add(error);
    return [String(error), ...flattenError(error.cause, seen), ...(Array.isArray(error.errors) ? error.errors.flatMap((entry) => flattenError(entry, seen)) : [])];
  };
  const calls = []; let networkReads = 0; let observed;
  const container = { id: 'post-start-container', name: `supabase_db_${projectId}`, projectLabel: projectId };
  const volume = { id: 'post-start-created-at', name: `supabase_db_${projectId}`, projectLabel: projectId };
  await assert.rejects(runWithLocalSupabase({
    expectedProjectId: projectId, childArgs: [], initialize: 'start-only',
    adapter: {
      async status() { return { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n` }; },
        async assertNoPreexistingResources() {},
      async start() { calls.push('start'); },
      async containers() { calls.push('containers'); return [container]; },
      async networks() { networkReads += 1; calls.push(`networks-${networkReads}`); throw new Error(`POST_START_NETWORK_PROBE_${networkReads}`); },
      async volumes() { calls.push('volumes'); return [volume]; },
      async stop(stoppedContainers, stoppedAssets) { calls.push(['stop', stoppedContainers, stoppedAssets]); },
    },
  }), (error) => { observed = error; return true; });
  assert.deepEqual(calls, [
    'start', 'containers', 'networks-1', 'volumes',
    'containers', 'networks-2', 'volumes',
    ['stop', [container], { networks: [], volumes: [volume] }],
  ]);
  const messages = flattenError(observed).join('\n');
  assert.match(messages, /POST_START_NETWORK_PROBE_1/u);
  assert.match(messages, /POST_START_NETWORK_PROBE_2/u);
});

test('start failure before identity confirmation never stops and child failure cleans owned stack', async () => {
  const startCalls = [];
  await assert.rejects(runWithLocalSupabase({
    expectedProjectId: projectId,
    childArgs: [],
    adapter: {
      async status() { return { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n` }; },
        async assertNoPreexistingResources() {},
      async start() { startCalls.push('start'); throw new Error('start failed'); },
      async containers() { startCalls.push('containers'); return []; },
      async reset() {},
      async stop() { startCalls.push('stop'); },
    },
  }), /start failed/u);
  assert.deepEqual(startCalls, ['start', 'containers', 'containers']);

  const partialCalls = [];
  const partialOwned = [{ id: 'partial-id', name: `supabase_db_${projectId}`, projectLabel: projectId }];
  await assert.rejects(runWithLocalSupabase({
    expectedProjectId: projectId,
    childArgs: [],
    adapter: {
      async status() { return { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n` }; },
        async assertNoPreexistingResources() {},
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
        async assertNoPreexistingResources() {},
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
        async assertNoPreexistingResources() {},
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
        async assertNoPreexistingResources() {},
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
        async assertNoPreexistingResources() {},
      async start() {},
      async containers() { return structuredClone(owned); },
      async reset() {},
      async stop() { calls.push('stop'); controller.abort(new Error('signal')); },
    },
  }), /RUNNER_SIGNALLED/u);
  assert.deepEqual(calls, ['stop']);
});

test('custom lifecycle contract accepts the current exact baseline migration history', async () => {
  const expectedWorkdir = `/tmp/lock/${projectId}`;
  const migrationNames = [
    SYNTHETIC_BASELINE_FILENAME,
    ...POST_CUTOFF_MIGRATIONS.map(({ filename }) => filename),
  ];
  const stderr = `${[
    `Using workdir ${expectedWorkdir}`,
    'Starting database...',
    'Initialising schema...',
    'Seeding globals from roles.sql...',
    ...migrationNames.map((name) => `Applying migration ${name}...`),
  ].join('\n')}\n`;
  assert.doesNotThrow(() => validateSupabaseLifecycleStderr(stderr, {
    expectedWorkdir, stage: 'start', migrationNames, noticesByMigration: {},
  }));
  const updateNotice = 'A new version of Supabase CLI is available: v2.109.1 (currently installed v2.87.2)\nWe recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli\n';
  assert.doesNotThrow(() => validateSupabaseLifecycleStderr(`${stderr}${updateNotice}`, {
    expectedWorkdir, stage: 'start', migrationNames, noticesByMigration: {},
  }));
  for (const hostileNotice of [
    updateNotice.replace('v2.87.2', 'v2.87.3'),
    updateNotice.replace('v2.109.1', 'latest'),
    `${updateNotice}foreign\n`,
  ]) assert.throws(() => validateSupabaseLifecycleStderr(`${stderr}${hostileNotice}`, {
    expectedWorkdir, stage: 'start', migrationNames, noticesByMigration: {},
  }), /CLI_UNEXPECTED_STDERR/u);
  assert.doesNotThrow(() => validateCliWorkdirNotice(`Using workdir ${expectedWorkdir}\n${updateNotice}`, expectedWorkdir));
  assert.throws(() => validateCliWorkdirNotice(`Using workdir ${expectedWorkdir}\n${updateNotice}foreign\n`, expectedWorkdir), /CLI_UNEXPECTED_STDERR/u);
  const adapter = createActualAdapter({
    repoRoot: `/tmp/${projectId}`, pin: '2.87.2', nodeBin: '/node22', cliWorkdir: expectedWorkdir,
    lifecycleContract: { migrationNames, noticesByMigration: {} },
    commandRunner: async (_command, args) => ({ exitCode: 0, stdout: '', stderr: args.includes('start') ? stderr : '' }),
  });
  await assert.doesNotReject(adapter.start());
  assert.throws(() => validateSupabaseLifecycleStderr(stderr.replace('baseline_v1', 'midao_test_bootstrap'), {
    expectedWorkdir, stage: 'start', migrationNames, noticesByMigration: {},
  }), /CLI_UNEXPECTED_STDERR/u);
  assert.throws(() => validateSupabaseLifecycleStderr(stderr.replace(`Applying migration ${migrationNames[2]}...\n`, ''), {
    expectedWorkdir, stage: 'start', migrationNames, noticesByMigration: {},
  }), /CLI_UNEXPECTED_STDERR/u);
});

test('start-only onReady skips reset, returns callback value and still cleans exact owned IDs', async () => {
  const calls = [];
  const owned = [{ id: 'owned', name: `supabase_db_${projectId}`, projectLabel: projectId }];
  const result = await runWithLocalSupabase({
    expectedProjectId: projectId,
    initialize: 'start-only',
    onReady: async ({ localEnv }) => { calls.push('ready-callback'); return localEnv.DATABASE_URL; },
    adapter: {
      async status() { return { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n` }; },
        async assertNoPreexistingResources() {},
      async start() { calls.push('start'); },
      async containers() { calls.push('containers'); return structuredClone(owned); },
      async waitForDatabase() { calls.push('health'); },
      async reset() { calls.push('reset'); },
      async statusJson() { calls.push('status-json'); return { DATABASE_URL: 'postgres://local' }; },
      async ready() { calls.push('ready'); },
      async stop(identity) { calls.push(`stop:${identity[0].id}`); },
    },
  });
  assert.equal(result.value, 'postgres://local');
  assert.equal(calls.includes('reset'), false);
  assert.deepEqual(calls, ['start', 'containers', 'health', 'status-json', 'ready', 'ready-callback', 'containers', 'stop:owned']);
});

test('onReady can adopt an exact auxiliary API container before child execution and cleanup', async () => {
  const calls = [];
  let apiStarted = false;
  const db = { id: 'db-id', name: `supabase_db_${projectId}`, projectLabel: projectId };
  const rest = { id: 'rest-id', name: `supabase_rest_${projectId}`, projectLabel: projectId };
  await runWithLocalSupabase({
    expectedProjectId: projectId,
    initialize: 'start-only',
    onReady: async ({ refreshOwnership }) => {
      apiStarted = true;
      calls.push('api-start');
      await refreshOwnership();
      calls.push('api-adopted');
    },
    adapter: {
      async status() { return { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n` }; },
        async assertNoPreexistingResources() {},
      async start() { calls.push('start'); },
      async containers() { calls.push('containers'); return apiStarted ? [db, rest] : [db]; },
      async statusJson() { calls.push('status-json'); return { DATABASE_URL: 'postgres://local' }; },
      async stop(identity) { calls.push(['stop', identity]); },
    },
  });
  assert.deepEqual(calls, [
    'start', 'containers', 'status-json', 'api-start', 'containers', 'api-adopted',
    'containers', ['stop', [db, rest]],
  ]);
});

test('onReady primary failure and cleanup failure are both retained', async () => {
  const owned = [{ id: 'owned', name: `supabase_db_${projectId}`, projectLabel: projectId }];
  await assert.rejects(runWithLocalSupabase({
    expectedProjectId: projectId,
    initialize: 'start-only',
    onReady: async () => { throw new Error('READY_PRIMARY'); },
    adapter: {
      async status() { return { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n` }; },
        async assertNoPreexistingResources() {},
      async start() {},
      async containers() { return structuredClone(owned); },
      async statusJson() { return { DATABASE_URL: 'postgres://local' }; },
      async stop() { throw new Error('CLEANUP_SECONDARY'); },
    },
  }), (error) => error instanceof AggregateError
    && error.errors.some((entry) => /READY_PRIMARY/u.test(entry.message))
    && error.errors.some((entry) => /CLEANUP_SECONDARY/u.test(entry.message)));
});
