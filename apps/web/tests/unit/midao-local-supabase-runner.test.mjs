import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
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

test('runner failure formatter exposes a safe overlay seed failure class without secrets', () => {
  const formatted = formatMidaoRunnerFailure(
    new Error('MIDAO_E2E_SEED_FAILED: psql failed with service-secret at postgresql://postgres:***@127.0.0.1:54322/postgres'),
    ['service-secret'],
  );
  assert.doesNotMatch(formatted, /\[REDACTED_ERROR\]/u);
  assert.match(formatted, /^MIDAO_E2E_SEED_FAILED:/u);
  assert.doesNotMatch(formatted, /service-secret|postgresql:\/\//u);
});

test('runner failure formatter exposes a safe baseline seed failure class without secrets', () => {
  const formatted = formatMidaoRunnerFailure(
    new Error('MIDAO_SEED_FAILED: psql failed with service-secret at postgresql://postgres:***@127.0.0.1:54322/postgres'),
    ['service-secret'],
  );
  assert.doesNotMatch(formatted, /\[REDACTED_ERROR\]/u);
  assert.match(formatted, /^MIDAO_SEED_FAILED:/u);
  assert.doesNotMatch(formatted, /service-secret|postgresql:\/\//u);
});

test('runner failure formatter exposes a redacted database-ready probe class', () => {
  const formatted = formatMidaoRunnerFailure(
    new Error('DATABASE_NOT_READY: exit=1 service-secret at postgresql://postgres:***@127.0.0.1:54322/postgres'),
    ['service-secret'],
  );
  assert.doesNotMatch(formatted, /\[REDACTED_ERROR\]/u);
  assert.match(formatted, /^DATABASE_NOT_READY: exit=1/u);
  assert.doesNotMatch(formatted, /service-secret|postgresql:\/\//u);
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
  assert.match(seed, /inquiry_enabled/u);
  assert.doesNotMatch(seed, /information_schema|EXECUTE \$real_auth_fixture\$/u);
  assert.doesNotMatch(seed, /encrypted_password/u, 'traveler auth user is created via GoTrue Admin API, not raw SQL');
  assert.match(source, /async function createOrUpdateMidaoTravelerAuthUser/u);
  assert.match(source, /\/auth\/v1\/admin\/users/u);
});

test('real-auth fixture provisions a second deterministic traveler through GoTrue before its FK-safe profile', async () => {
  const source = await readFile(new URL('../../../../scripts/testing/with-midao-local-supabase.mjs', import.meta.url), 'utf8');
  const seed = await readFile(new URL('../../../../scripts/testing/midao-api-real-auth-seed.sql', import.meta.url), 'utf8');
  assert.match(source, /MIDAO_E2E_SECOND_TRAVELER_ID/u);
  assert.match(source, /MIDAO_E2E_SECOND_TRAVELER_EMAIL/u);
  assert.match(source, /MIDAO_E2E_SECOND_TRAVELER_PASSWORD/u);
  const secondTravelerId = source.match(/const MIDAO_E2E_SECOND_TRAVELER_ID = '([^']+)'/u)?.[1];
  assert.equal(typeof secondTravelerId, 'string');
  assert.equal(seed.includes(secondTravelerId), false, 'second traveler auth ID must not collide with a baseline seed identity');
  assert.match(source, /async function createOrUpdateMidaoTravelerAuthUser/u);
  assert.match(source, /traveler, supabaseUrl, serviceRoleKey, signal/u);
  assert.match(source, /public\.users\.id has a FK onto auth\.users\(id\); insert it only after/u);
  assert.match(source, /for \(const traveler of MIDAO_E2E_TRAVELERS\)/u);
  assert.match(source, /MIDAO_E2E_SECOND_TRAVELER_EMAIL:/u);
  assert.match(source, /MIDAO_E2E_SECOND_TRAVELER_PASSWORD:/u);
  assert.match(source, /childSecrets = Object\.values\(e2eEnv\)/u);
  assert.match(source, /reportStage\('real-auth-overlay-ready'\)/u);
  assert.match(source, /reportStage\('real-auth-traveler-fixtures-ready'\)/u);
});

test('API real-auth runner keeps durable redacted output separate from the browser lane', async () => {
  const source = await readFile(new URL('../../../../scripts/testing/run-midao-e2e.sh', import.meta.url), 'utf8');
  assert.match(source, /apps\/web\/tests\/integration\/midao-inquiry-conversion-api-chain\.test\.mjs/u);
  assert.match(source, /MODE='--api-real-auth'/u);
  assert.match(source, /midao-inquiry-conversion-api-chain\.log/u);
  assert.doesNotMatch(source, /playwright.*api-chain|api-chain.*playwright/iu);
});

test('public standard-runner browser lane executes the real confirmation-chain spec', async () => {
  const workflow = await readFile(new URL('../../../../.github/workflows/midao-baseline-e2e.yml', import.meta.url), 'utf8');
  assert.match(workflow, /runs-on:\s*ubuntu-latest/u);
  assert.match(workflow, /Install Playwright Chromium[\s\S]*playwright install --with-deps chromium/u);
  const broadGate = workflow.match(/- name: Run baseline-backed Midao browser gate(?<body>[\s\S]*?)(?=\n      - name:)/u)?.groups?.body;
  assert.equal(typeof broadGate, 'string');
  assert.doesNotMatch(broadGate, /midao-inquiry-conversion-chain\.spec\.ts/u);
  assert.match(
    workflow,
    /- name: Run Phase 4 real-auth traveler confirmation browser gate[\s\S]*MIDAO_DB_HEALTH_TIMEOUT_SECONDS=600[\s\S]*run-midao-e2e\.sh[\s\S]*apps\/web\/e2e\/midao-inquiry-conversion-chain\.spec\.ts/u,
  );
  assert.match(
    workflow,
    /- name: Run Phase 5A manual LINE reply browser gate[\s\S]*MIDAO_DB_HEALTH_TIMEOUT_SECONDS=600[\s\S]*run-midao-e2e\.sh[\s\S]*apps\/web\/e2e\/midao2-request-conversion\.spec\.ts/u,
  );
});

test('real-auth guide login returns the CSRF token rotated by session creation', async () => {
  const spec = await readFile(new URL('../../e2e/midao-inquiry-conversion-chain.spec.ts', import.meta.url), 'utf8');
  assert.match(spec, /await page\.context\(\)\.cookies\(requireEnv\('NEXT_PUBLIC_BASE_URL'\)\)/u);
  assert.match(spec, /find\(\(cookie\) => cookie\.name === 'tp_csrf'\)/u);
  assert.match(spec, /MIDAO_E2E_GUIDE_CSRF_MISSING/u);
  assert.match(spec, /return sessionCsrf\.value/u);
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

const diagnosticDatabase = { id: 'a'.repeat(64), name: `supabase_db_${projectId}`, projectLabel: projectId };
const postgresLog = (message) => `2026-10-07T07:44:00.000000000Z 2026-10-07 07:44:00.000 UTC [123] LOG:  ${message}`;

test('owned DB diagnostic summarizes only fixed crash and recovery metadata, never log text', () => {
  const output = [
    postgresLog('server process (PID 987) was terminated by signal 11: Segmentation fault'),
    postgresLog('server process (PID 988) exited with exit code 1'),
    postgresLog('terminating any other active server processes'),
    postgresLog('all server processes terminated; reinitializing'),
    postgresLog('database system was interrupted; last known up at 2026-10-07 07:43:00 UTC'),
    postgresLog('database system was not properly shut down; automatic recovery in progress'),
    postgresLog('database system is ready to accept connections'),
    postgresLog('server process (PID 987) was terminated by signal 11: Segmentation fault SECRET_VALUE'),
    postgresLog('STATEMENT: SELECT secret_customer_value'),
    postgresLog('DETAIL: SERVICE_ROLE_KEY=secret-key'),
    postgresLog('CONTEXT: postgres://private-user:private-password@private-host/private-db'),
    'STATEMENT: database system is ready to accept connections',
    'untrusted plain text: all server processes terminated; reinitializing',
    postgresLog('PANIC: private customer data'),
    postgresLog('database system is ready to accept connections').replace('LOG:', 'STATEMENT:'),
  ].join('\n');
  assert.deepEqual(runner.summarizeOwnedDatabaseFailure(output, ['secret-key']), {
    backend_signal_6: 0, backend_signal_7: 0, backend_signal_9: 0, backend_signal_11: 1,
    backend_exit: 1, terminating_backends: 1, reinitializing: 1, interrupted: 1,
    automatic_recovery: 1, ready: 1, output_truncated: 0,
  });
  const summary = JSON.stringify(runner.summarizeOwnedDatabaseFailure(output, ['secret-key']));
  assert.doesNotMatch(summary, /SECRET_VALUE|secret_customer_value|secret-key|private-|STATEMENT|DETAIL|CONTEXT|SELECT|987|2026/u);
  assert.equal(runner.summarizeOwnedDatabaseFailure(Array.from({ length: 250 }, () => postgresLog('database system is ready to accept connections')).join('\n')).ready, 100);
});

test('owned DB diagnostic accepts pinned Supabase host and session prefixes without emitting their values', () => {
  // Official 17.6.1.104 postgresql.conf.j2 uses %h %m [%p] %q%u@%d, UTC.
  const timestamp = '2026-10-07 07:44:00.000 UTC [321] ';
  const dockerTimestamp = '2026-10-07T07:44:00.000000000Z ';
  for (const prefix of [
    timestamp, ` ${timestamp}`, `${dockerTimestamp} ${timestamp}`,
    `${dockerTimestamp}127.0.0.1 ${timestamp}fixture_user@fixture_db `,
    `${dockerTimestamp}[local] ${timestamp}fixture_user@fixture_db `,
    `${dockerTimestamp}::1 ${timestamp}fixture_user@fixture_db `,
    `${dockerTimestamp}fixture-host ${timestamp}fixture_user@fixture_db `,
  ]) {
    const summary = runner.summarizeOwnedDatabaseFailure(`${prefix}LOG:  all server processes terminated; reinitializing`);
    assert.equal(summary.reinitializing, 1);
    assert.doesNotMatch(JSON.stringify(summary), /fixture|321|127\.0\.0\.1|::1|2026/u);
  }
  for (const severity of ['STATEMENT', 'DETAIL', 'CONTEXT', 'ERROR', 'FATAL', 'PANIC']) {
    const summary = runner.summarizeOwnedDatabaseFailure(`${dockerTimestamp} ${timestamp}${severity}:  all server processes terminated; reinitializing`);
    assert.equal(summary.reinitializing, 0);
  }
});

test('owned DB diagnostic adapter reads only one validated immutable DB ID with fixed bounds', async () => {
  const calls = [];
  const adapter = createActualAdapter({
    repoRoot: `/tmp/${projectId}`, pin: '2.87.2', nodeBin: '/node22',
    commandRunner: async (command, args, options) => {
      calls.push({ command, args, options });
      return { exitCode: 0, signal: null, stdout: '', stderr: postgresLog('all server processes terminated; reinitializing'), outputTruncated: true };
    },
  });
  const summary = await adapter.captureDatabaseFailureDiagnostic([diagnosticDatabase], []);
  assert.equal(summary.reinitializing, 1);
  assert.equal(summary.output_truncated, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'docker');
  assert.deepEqual(calls[0].args, ['logs', '--since', '10m', '--tail', '100', '--timestamps', '--', diagnosticDatabase.id]);
  assert.equal(calls[0].options.cwd, `/tmp/${projectId}`);
  assert.equal(calls[0].options.timeoutMs, 5_000);
  assert.equal(calls[0].options.maxOutputBytes, 32_768);
  assert.equal(calls[0].options.signal, undefined);
  for (const invalid of [
    [], [diagnosticDatabase, { ...diagnosticDatabase, id: 'b'.repeat(64) }],
    [{ ...diagnosticDatabase, id: '--all' }], [{ ...diagnosticDatabase, projectLabel: 'foreign' }],
    [{ ...diagnosticDatabase, name: `supabase_rest_${projectId}` }],
  ]) await assert.rejects(adapter.captureDatabaseFailureDiagnostic(invalid, []));
  assert.equal(calls.length, 1);
});

test('owned DB diagnostic adapter suppresses command errors, timeout and signal output', async () => {
  for (const failure of [{ exitCode: 1, signal: null }, { exitCode: 0, signal: 'SIGTERM' }, { exitCode: 0, signal: null, timedOut: true }]) {
    const adapter = createActualAdapter({
      repoRoot: `/tmp/${projectId}`, pin: '2.87.2', nodeBin: '/node22',
      commandRunner: async () => ({ ...failure, stdout: 'private customer data', stderr: 'postgres://private-user:private-password@private-host/private-db' }),
    });
    await assert.rejects(adapter.captureDatabaseFailureDiagnostic([diagnosticDatabase], []), (error) => error.message === 'DATABASE_DIAGNOSTIC_UNAVAILABLE');
  }
});

function diagnosticLifecycle({ calls, current = [diagnosticDatabase], childFailure, diagnosticFailure, cleanupFailure, success = false }) {
  let reads = 0;
  return {
    async status() { return { exitCode: 1, stdout: '', stderr: `${missingLine}\n${helpLine}\n` }; },
    async assertNoPreexistingResources() {},
    async start() {},
    async containers() { reads += 1; calls.push(`identity-${reads}`); return structuredClone(reads === 1 ? [diagnosticDatabase] : current); },
    async child() { calls.push('child'); if (childFailure) throw childFailure; return { exitCode: success ? 0 : 9 }; },
    async captureDatabaseFailureDiagnostic(owned) {
      calls.push('diagnostic'); assert.deepEqual(owned, [diagnosticDatabase]);
      if (diagnosticFailure) throw diagnosticFailure;
      return { backend_signal_11: 1, ready: 0, SECRET_VALUE: 'postgres://private-user:private-password@private-host/private-db' };
    },
    async stop() { calls.push('cleanup'); if (cleanupFailure) throw cleanupFailure; },
  };
}

test('owned DB diagnostic occurs after fresh identity and before teardown on child failure', async () => {
  const calls = [];
  const stages = [];
  await assert.rejects(runWithLocalSupabase({
    adapter: diagnosticLifecycle({ calls }), expectedProjectId: projectId, initialize: 'start-only',
    childArgs: ['test.mjs'], reportStage: (stage) => stages.push(stage),
  }), /CHILD_FAILED_9/u);
  assert.deepEqual(calls, ['identity-1', 'child', 'identity-2', 'diagnostic', 'cleanup']);
  assert.deepEqual(stages.slice(-3), ['cleanup-identity', 'owned-db-diagnostic:backend_signal_11=1', 'cleanup']);
  assert.doesNotMatch(stages.join('\n'), /SECRET_VALUE|postgres:|private-/u);
});

test('owned DB diagnostic rejects identity drift, missing DB and ambiguous DB without reading logs', async () => {
  for (const current of [
    [{ ...diagnosticDatabase, id: 'b'.repeat(64) }],
    [{ ...diagnosticDatabase, name: `supabase_rest_${projectId}` }],
    [{ ...diagnosticDatabase, projectLabel: 'foreign' }], [],
    [diagnosticDatabase, { ...diagnosticDatabase, id: 'b'.repeat(64) }],
  ]) {
    const calls = [];
    await assert.rejects(runWithLocalSupabase({
      adapter: diagnosticLifecycle({ calls, current }), expectedProjectId: projectId, initialize: 'start-only', childArgs: ['test.mjs'],
    }));
    assert.equal(calls.includes('diagnostic'), false);
    assert.equal(calls.includes('cleanup'), false);
  }
});

test('owned DB diagnostic skips missing or ambiguous owned DB without weakening existing cleanup', async () => {
  for (const owned of [
    [{ ...diagnosticDatabase, name: `supabase_rest_${projectId}` }],
    [diagnosticDatabase, { ...diagnosticDatabase, id: 'b'.repeat(64) }],
  ]) {
    const calls = [];
    const adapter = diagnosticLifecycle({ calls });
    adapter.containers = async () => structuredClone(owned);
    adapter.stop = async (safe) => { calls.push('cleanup'); assert.deepEqual(safe, owned); };
    await assert.rejects(runWithLocalSupabase({ adapter, expectedProjectId: projectId, initialize: 'start-only', childArgs: ['test.mjs'] }), /CHILD_FAILED_9/u);
    assert.deepEqual(calls, ['child', 'cleanup']);
  }
});

test('owned DB diagnostic is absent on success and failures before the child runs', async () => {
  const calls = [];
  const adapter = diagnosticLifecycle({ calls, success: true });
  await runWithLocalSupabase({ adapter, expectedProjectId: projectId, initialize: 'start-only', childArgs: ['test.mjs'] });
  assert.deepEqual(calls, ['identity-1', 'child', 'identity-2', 'cleanup']);
  calls.length = 0;
  adapter.ready = async () => { throw new Error('READY_FAILED'); };
  await assert.rejects(runWithLocalSupabase({ adapter, expectedProjectId: projectId, initialize: 'start-only', childArgs: ['test.mjs'] }), /READY_FAILED/u);
  assert.equal(calls.includes('diagnostic'), false);
});

test('owned DB diagnostic failure preserves primary failure and still attempts cleanup', async () => {
  for (const cleanupFailure of [undefined, new Error('CLEANUP_FAILED')]) {
    const calls = [];
    const stages = [];
    const primary = new Error('CHILD_SOURCE_FAILED');
    await assert.rejects(runWithLocalSupabase({
      adapter: diagnosticLifecycle({ calls, childFailure: primary, diagnosticFailure: new Error('secret diagnostic failure'), cleanupFailure }),
      expectedProjectId: projectId, initialize: 'start-only', childArgs: ['test.mjs'], reportStage: (stage) => stages.push(stage),
    }), (error) => cleanupFailure ? error instanceof AggregateError && error.errors[0] === primary && error.errors[1] === cleanupFailure : error === primary);
    assert.deepEqual(calls, ['identity-1', 'child', 'identity-2', 'diagnostic', 'cleanup']);
    assert.ok(stages.includes('owned-db-diagnostic:unavailable'));
    assert.doesNotMatch(stages.join('\n'), /secret diagnostic failure/u);
  }
});

test('owned DB diagnostic rejects arbitrary count values and survives diagnostic reporting failure', async () => {
  const calls = [];
  const stages = [];
  const adapter = diagnosticLifecycle({ calls });
  adapter.captureDatabaseFailureDiagnostic = async () => ({ ready: 'private-value', backend_exit: 101, reinitializing: -1, backend_signal_11: NaN });
  await assert.rejects(runWithLocalSupabase({
    adapter, expectedProjectId: projectId, initialize: 'start-only', childArgs: ['test.mjs'],
    reportStage: (stage) => { stages.push(stage); if (stage.startsWith('owned-db-diagnostic:')) throw new Error('REPORT_FAILED'); },
  }), /CHILD_FAILED_9/u);
  assert.deepEqual(stages.slice(-3), ['owned-db-diagnostic:no-events', 'owned-db-diagnostic:unavailable', 'cleanup']);
  assert.deepEqual(calls, ['identity-1', 'child', 'identity-2', 'cleanup']);
  assert.doesNotMatch(stages.join('\n'), /private-value|101|NaN|REPORT_FAILED/u);
});

test('owned DB diagnostic captures the controlled onReady child failure used by the actual runner', async () => {
  const calls = [];
  const adapter = diagnosticLifecycle({ calls });
  await assert.rejects(runWithLocalSupabase({
    adapter, expectedProjectId: projectId, initialize: 'start-only',
    onReady: async () => { calls.push('child'); throw new Error('CHILD_FAILED_1'); },
  }), /CHILD_FAILED_1/u);
  assert.deepEqual(calls, ['identity-1', 'child', 'identity-2', 'diagnostic', 'cleanup']);
});

test('owned DB diagnostic command bounds cap combined output and force timeout using mock processes', async () => {
  const source = await readFile(join(repoRoot, 'scripts/testing/with-midao-local-supabase.mjs'), 'utf8');
  const commandSource = source.slice(source.indexOf('export function runCommand('), source.indexOf('export async function startMidaoApiServer('));
  const destroyed = [];
  const child = Object.assign(new EventEmitter(), {
    pid: 777, unref() { destroyed.push('unref'); },
    stdout: Object.assign(new EventEmitter(), { destroy() { destroyed.push('stdout'); } }),
    stderr: Object.assign(new EventEmitter(), { destroy() { destroyed.push('stderr'); } }),
  });
  const kills = [];
  const timers = [];
  const cleared = [];
  const mockedRunCommand = new Function('spawn', 'process', 'setTimeout', 'clearTimeout', `${commandSource.replace(/^export /u, '')}\nreturn runCommand;`)(
    () => child, { env: {}, kill: (...args) => kills.push(args) },
    (callback, delay) => { const timer = { callback, delay, unref() {} }; timers.push(timer); return timer; },
    (timer) => cleared.push(timer),
  );
  const pending = mockedRunCommand('mock-docker', ['logs'], { maxOutputBytes: 12, timeoutMs: 5_000 });
  child.stdout.emit('data', Buffer.from('12345678'));
  child.stderr.emit('data', Buffer.from('abcdefgh'));
  child.stdout.emit('data', Buffer.from('ignored'));
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 5_000);
  timers[0].callback();
  assert.deepEqual(kills, [[-777, 'SIGKILL']]);
  const result = await pending;
  assert.equal(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr), 12);
  assert.equal(result.stdout, '12345678');
  assert.equal(result.stderr, 'abcd');
  assert.equal(result.outputTruncated, true);
  assert.equal(result.timedOut, true);
  assert.deepEqual(destroyed, ['stdout', 'stderr', 'unref']);
  child.emit('close', null, 'SIGKILL');
  assert.deepEqual(cleared, [timers[0]]);
});

test('owned DB diagnostic timeout settles despite kill or pipe teardown exceptions', async () => {
  const source = await readFile(join(repoRoot, 'scripts/testing/with-midao-local-supabase.mjs'), 'utf8');
  const commandSource = source.slice(source.indexOf('export function runCommand('), source.indexOf('export async function startMidaoApiServer('));
  for (const failing of ['kill', 'stdout', 'stderr', 'unref', 'detach']) {
    const calls = [];
    const action = (name) => { calls.push(name); if (failing === name) throw new Error('private diagnostic teardown'); };
    const child = Object.assign(new EventEmitter(), {
      pid: 777, kill() { action('kill'); }, unref() { action('unref'); },
      stdout: Object.assign(new EventEmitter(), { destroy() { action('stdout'); } }),
      stderr: Object.assign(new EventEmitter(), { destroy() { action('stderr'); } }),
    });
    let timeout;
    const mocked = new Function('spawn', 'process', 'setTimeout', 'clearTimeout', `${commandSource.replace(/^export /u, '')}\nreturn runCommand;`)(
      () => child, { env: {}, kill() { throw Object.assign(new Error('private group failure'), { code: 'EPERM' }); } },
      callback => { timeout = callback; return { unref() {} }; }, () => {},
    );
    const signal = { addEventListener() {}, removeEventListener() { action('detach'); }, aborted: false };
    const pending = mocked('mock-docker', ['logs'], { timeoutMs: 5_000, maxOutputBytes: 32_768, signal });
    assert.doesNotThrow(() => timeout());
    const result = await pending;
    assert.equal(result.exitCode, 1);
    assert.equal(result.timedOut, true);
    assert.deepEqual(calls, ['kill', 'stdout', 'stderr', 'unref', 'detach']);
    assert.doesNotMatch(JSON.stringify(result), /private/u);
  }
});

const runtimeDbProfileName = 'issue1894-pg-supautils-3.2.2';
const runtimeDbTestPath = 'apps/web/tests/integration/midao-issue1814-checkout-idempotency-real-auth.test.mjs';
test('#1894 runtime override is opt-in for only the exact single real-auth admission lane', () => {
  assert.deepEqual(parseMidaoRunnerInvocation(['--api-real-auth', runtimeDbTestPath]), { mode: 'api-real-auth', childArgs: [runtimeDbTestPath] });
  assert.deepEqual(parseMidaoRunnerInvocation(['--runtime-db-override', runtimeDbProfileName, '--api-real-auth', runtimeDbTestPath]), {
    mode: 'api-real-auth', childArgs: [runtimeDbTestPath], runtimeDbOverrideProfile: runtimeDbProfileName,
  });
  for (const args of [
    ['--runtime-db-override', 'other', '--api-real-auth', runtimeDbTestPath],
    ['--runtime-db-override', runtimeDbProfileName, runtimeDbTestPath],
    ['--runtime-db-override', runtimeDbProfileName, '--postgrest', runtimeDbTestPath],
    ['--runtime-db-override', runtimeDbProfileName, '--api-real-auth', 'apps/web/tests/integration/midao-issue1813-points-atomicity-real-auth.test.mjs'],
    ['--runtime-db-override', runtimeDbProfileName, '--api-real-auth', runtimeDbTestPath, runtimeDbTestPath],
    ['--api-real-auth', runtimeDbTestPath, '--runtime-db-override', runtimeDbProfileName],
    ['--runtime-db-override'],
  ]) assert.throws(() => parseMidaoRunnerInvocation(args), /ARGS_INVALID|RUNTIME_DB_OVERRIDE/iu);
});

test('#1894 runtime override verifies both DB starts before any bootstrap write and preserves owned cleanup on wrong image', async () => {
  const { loadRuntimeDbOverride } = await import('../../../../scripts/database-baseline/verify-toolchain-lock.mjs');
  const runtime = await loadRuntimeDbOverride(runtimeDbProfileName);
  const dbId = '1'.repeat(64);
  const dbName = `supabase_db_${projectId}`;
  const image = { Id: runtime.image.imageId, Architecture: 'amd64', Os: 'linux', RepoDigests: [runtime.image.repoDigest] };
  for (const wrongPhase of [null, 'prestart', 'second-prestart', 'first', 'second']) {
    const calls = []; let dbChecks = 0; let metadataChecks = 0; let imageChecks = 0;
    const adapter = createActualAdapter({
      repoRoot: `/tmp/${projectId}`, pin: '2.87.2', nodeBin: '/node22', cliWorkdir: `/tmp/owned/${projectId}`,
      fullServices: true, runtimeDbOverrideProfile: runtimeDbProfileName,
      verifyRuntimeDbMetadata: async () => { metadataChecks += 1; },
      enableFullServices: async () => { calls.push('enable-full'); },
      commandRunner: async (command, args) => {
        calls.push([command, ...args]);
        const ok = (stdout = '') => ({ exitCode: 0, signal: null, stdout, stderr: '' });
        if (args[0] === 'image') {
          imageChecks += 1;
          const wrong = wrongPhase === 'prestart' || (wrongPhase === 'second-prestart' && imageChecks === 3);
          return ok(JSON.stringify([{ ...image, ...(wrong ? { Id: 'sha256:' + 'a'.repeat(64) } : {}) }]));
        }
        if (args[0] === 'ps') return ok(`${dbId}\t${dbName}\t${projectId}\n`);
        if (args[0] === 'inspect' && args[2] === '{{json .}}') {
          dbChecks += 1;
          const wrong = wrongPhase === (dbChecks === 1 ? 'first' : 'second');
          return ok(JSON.stringify({ Id: dbId, Name: `/${dbName}`, Image: wrong ? 'sha256:' + 'a'.repeat(64) : runtime.image.imageId,
            Config: { Image: `${runtime.image.repository}:${runtime.image.tag}`, Labels: { 'com.supabase.cli.project': projectId, 'com.docker.compose.project': projectId } },
            State: { Status: 'running' },
          }));
        }
        if (args[0] === 'inspect') return ok('healthy\n');
        if (args[0] === 'exec') return ok(args.at(-1).includes('to_regclass')
          ? 'supabase_migrations.schema_migrations\nversion|text|text|NO\nstatements|ARRAY|_text|YES\nname|text|text|YES'
          : 'version|text|text|NO\nstatements|ARRAY|_text|YES\nname|text|text|YES\n--history--\n00000000000000');
        return ok();
      },
    });
    if (wrongPhase) await assert.rejects(adapter.start(), /RUNTIME_DB_.*IDENTITY/iu);
    else { await adapter.start(); assert.equal(dbChecks, 2); assert.equal(metadataChecks, 3); assert.equal(imageChecks, 4); }
    if (wrongPhase === 'prestart') assert.equal(calls.some((call) => Array.isArray(call) && call[0].endsWith('/supabase')), false);
    if (wrongPhase === 'first') assert.equal(calls.some((call) => Array.isArray(call) && call[1] === 'exec'), false);
    if (wrongPhase === 'second') assert.equal(calls.filter((call) => Array.isArray(call) && call[1] === 'exec').length, 2);
    if (wrongPhase === 'second-prestart') assert.equal(calls.filter((call) => Array.isArray(call) && call[0].endsWith('/supabase') && call[1] === 'start').length, 1);
    if (wrongPhase !== 'prestart') {
      await adapter.stop([{ id: dbId, name: dbName, projectLabel: projectId }], { networks: [], volumes: [] });
      assert.deepEqual(calls.at(-1), ['/usr/bin/docker', 'rm', '--force', '--', dbId]);
    }
  }
  assert.throws(() => createActualAdapter({ repoRoot: `/tmp/${projectId}`, pin: '2.87.2', nodeBin: '/node22', runtimeDbOverrideProfile: runtimeDbProfileName }), /RUNTIME_DB_OVERRIDE/iu);
});

test('#1894 runtime override workflow preserves the original builder/default images and opts in one exact lane', async () => {
  const { load } = await import('js-yaml');
  const workflow = load(await readFile(join(repoRoot, '.github/workflows/midao-baseline-e2e.yml'), 'utf8'));
  const steps = workflow.jobs.browser.steps;
  const provision = steps.find((step) => step.name === 'Provision digest-bound database and API images');
  assert.match(provision.run.replace(/\\\n\s*/gu, ' '), /node scripts\/database-baseline\/verify-toolchain-lock\.mjs\s+--runtime-db-override issue1894-pg-supautils-3\.2\.2/u);
  assert.match(provision.run, /provision db "\$runtime_profile_file"/u);
  assert.ok(provision.run.split('\n').includes('provision db'));
  assert.ok(provision.run.split('\n').includes('provision api'));
  const optedIn = steps.filter((step) => step.run?.includes('with-midao-local-supabase.mjs --runtime-db-override'));
  assert.equal(optedIn.length, 1);
  assert.equal(optedIn[0].run.trim(), `timeout --signal=TERM --kill-after=30s 1200s node scripts/testing/with-midao-local-supabase.mjs --runtime-db-override ${runtimeDbProfileName} --api-real-auth ${runtimeDbTestPath}`);
  assert.equal(steps.filter((step) => step.run?.includes('build-expected-terminal.mjs')).length, 1);
  assert.doesNotMatch(steps.find((step) => step.run?.includes('build-expected-terminal.mjs')).run, /runtime-db-override/u);
  assert.equal(workflow.jobs.browser['timeout-minutes'], 60);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
});

test('#1894 runtime override catalog and history drift hold before fixtures while defaults do no new reads', async () => {
  const bytes = Buffer.from('trusted normalized terminal mock\n');
  const expectedManifest = {
    payloadDigests: { 'catalog.expected-terminal.normalized.json': createHash('sha256').update(bytes).digest('hex') },
    historyVersions: ['00000000000001', '20261006121148'],
  };
  let reads = 0;
  const good = async () => { reads += 1; return { terminalBytes: Buffer.from(bytes), historyVersions: [...expectedManifest.historyVersions] }; };
  await runner.verifyRuntimeDbCatalog({ extractTerminal: good });
  assert.equal(reads, 0);
  const options = { runtimeDbOverrideProfile: runtimeDbProfileName, databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres', expectedManifest };
  await runner.verifyRuntimeDbCatalog({ ...options, extractTerminal: good });
  assert.equal(reads, 1);
  let observed;
  await assert.rejects(runner.verifyRuntimeDbCatalog({ ...options, extractTerminal: async () => {
    observed = Buffer.from('wrong normalized terminal mock\n');
    return { terminalBytes: observed, historyVersions: [...expectedManifest.historyVersions] };
  } }), /RUNTIME_DB_CATALOG_HOLD/u);
  assert.ok(observed.every((byte) => byte === 0));
  await assert.rejects(runner.verifyRuntimeDbCatalog({ ...options, extractTerminal: async () => ({
    terminalBytes: Buffer.from(bytes), historyVersions: ['00000000000001'],
  }) }), /RUNTIME_DB_CATALOG_HOLD/u);
  await assert.rejects(runner.verifyRuntimeDbCatalog({ ...options, extractTerminal: async () => { throw new Error('read failed'); } }), /RUNTIME_DB_CATALOG_HOLD/u);
  await assert.rejects(runner.verifyRuntimeDbCatalog({ ...options, expectedManifest: { ...expectedManifest, payloadDigests: {} }, extractTerminal: good }), /RUNTIME_DB_CATALOG_HOLD/u);
  await assert.rejects(runner.verifyRuntimeDbCatalog({ ...options, databaseUrl: 'postgresql://postgres:postgres@shared-test.invalid:54322/postgres', extractTerminal: good }), /RUNTIME_DB_CATALOG_HOLD/u);
  assert.equal(reads, 1, 'invalid manifest/URL must hold before any new read');
});

function catalogDiagnosticFixture() {
  const bytes = Buffer.from('private catalog row and canonical name\n');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const historyVersions = ['00000000000001', '20261006121148'];
  return {
    bytes, digest, historyVersions,
    options: {
      runtimeDbOverrideProfile: runtimeDbProfileName,
      databaseUrl: 'postgresql://private-user:private-password@127.0.0.1:54322/postgres',
      expectedManifest: { payloadDigests: { 'catalog.expected-terminal.normalized.json': digest }, historyVersions },
    },
  };
}

function readCatalogDiagnostic(stages) {
  assert.equal(stages.length, 1, 'one bounded stage line per candidate check');
  assert.match(stages[0], /^runtime-db-catalog:phase=(?:expected-contract|local-connection|extract-terminal|compare-terminal|compatible),extraction_success=[01],expected_sha256=(?:[a-f0-9]{64}|unavailable),actual_sha256=(?:[a-f0-9]{64}|unavailable),history_equal=(?:[01]|unavailable),expected_history_count=(?:\d+|unavailable),actual_history_count=(?:\d+|unavailable),reason=[a-z-]+$/u);
  assert.ok(stages[0].length < 400);
  assert.doesNotMatch(stages[0], /private|postgresql:|canonical|STATEMENT|SELECT|secret/u);
  return Object.fromEntries(stages[0].slice('runtime-db-catalog:'.length).split(',').map((field) => field.split('=')));
}

test('#1894 catalog diagnostics report compatible hashes and exact history while defaults stay silent', async () => {
  const { bytes, digest, historyVersions, options } = catalogDiagnosticFixture();
  const stages = []; let reads = 0; let extracted;
  const extractTerminal = async () => { reads += 1; extracted = Buffer.from(bytes); return { terminalBytes: extracted, historyVersions }; };
  const reportStage = (stage) => stages.push(stage);
  await runner.verifyRuntimeDbCatalog({ extractTerminal, reportStage });
  assert.equal(reads, 0); assert.deepEqual(stages, []);
  await runner.verifyRuntimeDbCatalog({ ...options, extractTerminal, reportStage });
  assert.equal(reads, 1); assert.ok(extracted.every((byte) => byte === 0));
  assert.deepEqual(readCatalogDiagnostic(stages), {
    phase: 'compatible', extraction_success: '1', expected_sha256: digest, actual_sha256: digest,
    history_equal: '1', expected_history_count: '2', actual_history_count: '2', reason: 'none',
  });
});

test('#1894 catalog diagnostics distinguish expected contract and local connection failures before reads', async () => {
  const { options, digest } = catalogDiagnosticFixture();
  for (const [change, phase] of [
    [{ expectedManifest: { payloadDigests: { 'catalog.expected-terminal.normalized.json': 'private-secret' }, historyVersions: ['private-history'] } }, 'expected-contract'],
    [{ runtimeDbOverrideProfile: 'private-profile' }, 'expected-contract'],
    [{ expectedManifest: { ...options.expectedManifest, historyVersions: [] } }, 'expected-contract'],
    [{ databaseUrl: 'postgresql://private-user:private-password@private-host.invalid:54322/postgres' }, 'local-connection'],
  ]) {
    const stages = []; let reads = 0;
    await assert.rejects(runner.verifyRuntimeDbCatalog({ ...options, ...change, extractTerminal: async () => { reads += 1; }, reportStage: (stage) => stages.push(stage) }), (error) => error.message === 'RUNTIME_DB_CATALOG_HOLD');
    assert.equal(reads, 0);
    const diagnostic = readCatalogDiagnostic(stages);
    assert.equal(diagnostic.phase, phase); assert.equal(diagnostic.extraction_success, '0');
    assert.equal(diagnostic.actual_sha256, 'unavailable'); assert.equal(diagnostic.history_equal, 'unavailable');
    if (phase === 'local-connection') assert.equal(diagnostic.expected_sha256, digest);
    if (change.expectedManifest?.payloadDigests?.['catalog.expected-terminal.normalized.json'] === 'private-secret') assert.equal(diagnostic.expected_sha256, 'unavailable');
  }
});

test('#1894 catalog diagnostics map only exact known extractor failures to finite safe reasons', async () => {
  const { options, digest } = catalogDiagnosticFixture();
  for (const [message, reason] of [
    ['catalog psql child failed', 'psql-child-failed'],
    ['catalog psql emitted unexpected stderr', 'psql-stderr'],
    ['catalog extractor output exceeded limit', 'output-limit'],
    ['catalog must end with exactly one terminal LF', 'catalog-framing'],
    ['catalog must contain exactly one JSON document', 'catalog-framing'],
    ['actual migration history mismatch', 'extractor-history'],
    ['catalog psql child failed: private-password SELECT private-row', 'unavailable'],
  ]) {
    const stages = []; const primary = new Error(message);
    await assert.rejects(runner.verifyRuntimeDbCatalog({ ...options, extractTerminal: async () => { throw primary; }, reportStage: (stage) => stages.push(stage) }), (error) => error.message === 'RUNTIME_DB_CATALOG_HOLD' && error.cause === primary);
    assert.deepEqual(readCatalogDiagnostic(stages), {
      phase: 'extract-terminal', extraction_success: '0', expected_sha256: digest, actual_sha256: 'unavailable',
      history_equal: 'unavailable', expected_history_count: '2', actual_history_count: 'unavailable', reason,
    });
  }
});

async function assertCatalogExtractionReason(primary, reason) {
  const { options, digest } = catalogDiagnosticFixture();
  const stages = [];
  await assert.rejects(runner.verifyRuntimeDbCatalog({ ...options,
    extractTerminal: async () => { throw primary; }, reportStage: (stage) => stages.push(stage),
  }), (error) => error.message === 'RUNTIME_DB_CATALOG_HOLD' && error.cause === primary);
  assert.deepEqual(readCatalogDiagnostic(stages), {
    phase: 'extract-terminal', extraction_success: '0', expected_sha256: digest, actual_sha256: 'unavailable',
    history_equal: 'unavailable', expected_history_count: '2', actual_history_count: 'unavailable', reason,
  });
}

test('#1894 complete extractor reasons cover fixed extraction normalization and terminal contracts', async () => {
  for (const [reason, messages] of [
    ['extractor-contract', ['extractor options must be an object', 'psql path substitution refused', 'SQL path substitution refused',
      'runner HOME must be absolute', 'connection env invalid', 'PGPORT invalid']],
    ['local-connection', ['local database connection invalid', 'local loopback database connection refused',
      'local database connection encoding invalid', 'local database connection credential invalid']],
    ['catalog-keys', ['catalog must be an object']],
    ['catalog-state', ['catalog schema version mismatch', 'catalog extractor version mismatch', 'catalog requires PostgreSQL major 17',
      'catalog connection was not read-only', 'ownership overlay status must remain pending before reviewed ownership publication',
      'managed schema overlays must remain empty while ownership is pending']],
    ['catalog-sections', ['catalog sections invalid']],
    ['catalog-framing', ['catalog JSON string expected', 'catalog JSON string unterminated', 'catalog JSON colon expected',
      'catalog JSON object delimiter expected', 'catalog JSON object unterminated', 'catalog JSON array delimiter expected',
      'catalog JSON array unterminated', 'catalog JSON value invalid']],
    ['psql-encoding', ['catalog stdout must be valid UTF-8', 'catalog stderr must be valid UTF-8']],
    ['catalog-normalization', ['routine definition missing']],
    ['normalized-catalog', ['normalized catalog must be an object', 'normalized catalog version or state mismatch']],
    ['terminal-catalog', ['terminal catalog bytes invalid', 'terminal catalog JSON invalid', 'terminal catalog canonical framing invalid']],
    ['history-query-close', ['migration history query and close failed']],
  ]) for (const message of messages) await assertCatalogExtractionReason(new Error(message), reason);
});

test('#1894 complete extractor reasons classify actual dynamic source errors without their private values', async () => {
  const extractor = await import('../../../../scripts/database-baseline/extract-catalog.mjs');
  const normalizer = await import('../../../../scripts/database-baseline/normalize-catalog.mjs');
  const { validateNormalizedCatalog } = await import('../../../../scripts/database-baseline/validate-normalized-catalog.mjs');
  const raw = JSON.parse(await readFile(join(repoRoot, 'apps/web/tests/fixtures/database-baseline/catalog-unstable-a.json'), 'utf8'));
  const normalized = JSON.parse(normalizer.normalizeCatalog(raw));
  const invocation = { psqlPath: extractor.FIXED_PSQL, sqlPath: extractor.FIXED_SQL, home: '/tmp/mock-home',
    connectionEnv: { PGHOST: '127.0.0.1', PGPORT: '54322', PGDATABASE: 'postgres', PGUSER: 'private-user', PGPASSWORD: 'private-password', PGSSLMODE: 'disable' } };
  const capture = (operation) => { try { operation(); } catch (error) { return error; } assert.fail('source must reject'); };
  const cases = [
    [() => extractor.buildPsqlInvocation({ ...invocation, 'private-secret': 'SELECT private-row' }), 'extractor-contract'],
    [() => extractor.buildPsqlInvocation({ ...invocation, psqlPath: undefined }), 'extractor-contract'],
    [() => extractor.buildPsqlInvocation({ ...invocation, connectionEnv: { ...invocation.connectionEnv, 'private-secret': 'SELECT private-row' } }), 'extractor-contract'],
    [() => extractor.buildPsqlInvocation({ ...invocation, connectionEnv: { ...invocation.connectionEnv, PGUSER: '' } }), 'extractor-contract'],
    [() => extractor.buildPsqlInvocation({ ...invocation, connectionEnv: { PGHOST: '127.0.0.1' } }), 'extractor-contract'],
    [() => extractor.validateRawCatalog({ ...raw, 'private-secret': 'SELECT private-row' }), 'catalog-keys'],
    [() => extractor.validateRawCatalog({ ...raw, extractorVersion: undefined, sections: undefined, schemaVersion: undefined }), 'catalog-state'],
    [() => extractor.validateRawCatalog({ ...raw, sections: { ...raw.sections, 'private-secret': [] } }), 'catalog-sections'],
    [() => extractor.assertNoDuplicateJsonKeys('{"private-password":1,"private-password":2}'), 'catalog-json-key'],
    [() => validateNormalizedCatalog({ ...normalized, 'private-secret': 'SELECT private-row' }), 'normalized-catalog'],
    [() => validateNormalizedCatalog(Object.fromEntries(Object.entries(normalized).filter(([key]) => key !== 'sections'))), 'normalized-catalog'],
    [() => normalizer.normalizeRoutineBody(''), 'catalog-normalization'],
  ];
  for (const key of ['', 'private-password\nSELECT private-row', 'private-password\0SELECT private-row']) {
    cases.push([() => extractor.buildPsqlInvocation({ ...invocation, [key]: true }), 'extractor-contract']);
    cases.push([() => extractor.buildPsqlInvocation({ ...invocation, connectionEnv: { ...invocation.connectionEnv, [key]: true } }), 'extractor-contract']);
    cases.push([() => extractor.validateRawCatalog({ ...raw, [key]: true }), 'catalog-keys']);
    cases.push([() => extractor.validateRawCatalog({ ...raw, sections: { ...raw.sections, [key]: [] } }), 'catalog-sections']);
    cases.push([() => validateNormalizedCatalog({ ...normalized, [key]: true }), 'normalized-catalog']);
    cases.push([() => extractor.assertNoDuplicateJsonKeys(`{${JSON.stringify(key)}:1,${JSON.stringify(key)}:2}`), 'catalog-json-key']);
  }
  for (const section of extractor.CATALOG_SECTIONS) {
    const absent = { ...raw.sections }; delete absent[section];
    cases.push([() => extractor.validateRawCatalog({ ...raw, sections: absent }), 'catalog-sections']);
    for (const entries of [null, [null]]) cases.push([() => extractor.validateRawCatalog({ ...raw, sections: { ...raw.sections, [section]: entries } }), 'catalog-sections']);
    cases.push([() => extractor.validateRawCatalog({ ...raw, sections: { ...raw.sections, [section]: [{ canonicalKey: [] }] } }), 'catalog-key']);
    cases.push([() => extractor.validateRawCatalog({ ...raw, sections: { ...raw.sections, [section]: [
      { canonicalKey: ['private-password', 'SELECT private-row'] }, { canonicalKey: ['private-password', 'SELECT private-row'] },
    ] } }), 'catalog-key']);
  }
  const missingRawKey = structuredClone(raw); delete missingRawKey.sections;
  cases.push([() => extractor.validateRawCatalog(missingRawKey), 'catalog-keys']);
  const missingOption = { ...invocation }; delete missingOption.home;
  cases.push([() => extractor.buildPsqlInvocation(missingOption), 'extractor-contract']);
  for (const [operation, reason] of cases) await assertCatalogExtractionReason(capture(operation), reason);
});

test('#1894 complete extractor reasons use anchored bounded patterns with fixed safe output', async () => {
  for (const [message, reason] of [
    ['catalog extractor timeout after 60000ms', 'psql-timeout'],
    ['catalog extractor timeout after 1ms', 'psql-timeout'],
    ['catalog unexpected option or key: private-password SELECT private-row', 'catalog-keys'],
    ['unknown section: private-password\nSELECT private-row', 'catalog-sections'],
    ['duplicate JSON key: private-password\0SELECT private-row', 'catalog-json-key'],
    ['duplicate canonical key in routines: ["private-password","SELECT private-row"]', 'catalog-key'],
    ['normalized catalog unknown key: private-password', 'normalized-catalog'],
    ['private-password is not allowed in connection env', 'extractor-contract'],
    ['catalog schema version mismatch: private-password', 'unavailable'],
    ['catalog extractor timeout after private-passwordms', 'unavailable'],
    ['catalog extractor timeout after 60000ms\nSELECT private-row', 'unavailable'],
    ['catalog extractor timeout after 60000ms\n', 'unavailable'],
    ['duplicate canonical key in private-password: ["secret"]', 'unavailable'],
    ['section private-password must be an array', 'unavailable'],
    ['catalog missing key: ', 'unavailable'],
    ['prefix duplicate JSON key: private-password', 'unavailable'],
    [`duplicate JSON key: ${'private-password'.repeat(400)}`, 'unavailable'],
  ]) await assertCatalogExtractionReason(new Error(message), reason);
});

test('#1894 complete extractor reasons classify finite spawn filesystem and socket errors without raw messages', async () => {
  const systemError = (code, syscall) => Object.assign(new Error('private-password SELECT private-row /private-path'), { code, syscall });
  for (const code of ['ENOENT', 'EACCES', 'ENOEXEC', 'ENOMEM', 'EAGAIN', 'EPERM']) {
    await assertCatalogExtractionReason(systemError(code, 'spawn /usr/bin/psql'), 'psql-spawn');
  }
  for (const syscall of ['mkdtemp', 'chmod', 'lstat', 'stat', 'scandir', 'rmdir', 'unlink', 'rm']) {
    for (const code of ['ENOENT', 'EACCES', 'EPERM', 'ENOSPC', 'EMFILE', 'ENFILE', 'EROFS', 'ENOTDIR', 'EISDIR', 'ENOTEMPTY', 'EBUSY', 'EIO', 'ENOMEM']) {
      await assertCatalogExtractionReason(systemError(code, syscall), 'extractor-filesystem');
    }
  }
  for (const [code, syscall] of [['ECONNREFUSED', 'connect'], ['ECONNRESET', 'read'], ['EPIPE', 'write'], ['ETIMEDOUT', 'connect'], ['ENETUNREACH', 'connect'], ['EHOSTUNREACH', 'connect']]) {
    await assertCatalogExtractionReason(systemError(code, syscall), 'history-connection');
  }
  for (const [code, syscall] of [['private-password', 'mkdtemp'], ['ENOENT', 'spawn /private-path'], ['ENOENT', 'private-password'], ['ECONNREFUSED', 'private-password'], ['ERR_UNKNOWN', 'connect']]) {
    await assertCatalogExtractionReason(systemError(code, syscall), 'unavailable');
  }
});

test('#1894 complete extractor reasons cover fixed PG client failures and finite SQLSTATE categories', async () => {
  for (const [reason, messages] of [
    ['history-connection', ['Connection terminated', 'Connection terminated unexpectedly', 'Client has encountered a connection error and is not queryable', 'Client was closed and is not queryable']],
    ['history-timeout', ['timeout expired', 'Query read timeout']],
    ['history-client', ['Client has already been connected. You cannot reuse a client.', 'Client was passed a null or undefined query']],
    ['history-auth', ['Password must be a string', 'SASL: Only mechanism(s) SCRAM-SHA-256 are supported',
      'SASL: Only mechanism(s) SCRAM-SHA-256-PLUS and SCRAM-SHA-256 are supported', 'SASL: Mechanism SCRAM-SHA-256-PLUS requires a certificate',
      'SASL: Last message was not SASLInitialResponse', 'SASL: Last message was not SASLResponse', 'SASL: Invalid attribute pair entry']],
    ['history-protocol', ['Binary mode not supported yet', 'Unknown authenticationOk message type 99', 'Received unexpected rowDescription message from backend.',
      'The server does not support SSL connections', 'There was an error establishing an SSL connection']],
    ['history-client', ["Cannot find package 'pg' imported from /private-path"]],
  ]) for (const message of messages) await assertCatalogExtractionReason(new Error(message), reason);
  for (const [reason, codes] of [
    ['history-connection', ['08000', '08001', '08003', '08004', '08006', '08007', '08P01', '57P01', '57P02', '57P03']],
    ['history-auth', ['28000', '28P01']], ['history-permission', ['42501']],
    ['history-schema', ['3F000', '42P01', '42703']], ['history-timeout', ['57014']], ['history-resource', ['53300', '53400', '53200']],
  ]) for (const code of codes) await assertCatalogExtractionReason(Object.assign(new Error('private-password SELECT private-row'), { code }), reason);
  for (const message of ['SASL: private-password', 'Received unexpected private-password message from backend.',
    "Cannot find package 'private-password' imported from /private-path", 'Connection terminated unexpectedly\nSELECT private-row',
    'SASL: Only mechanism(s) SCRAM-SHA-256 and SCRAM-SHA-256-PLUS are supported']) {
    await assertCatalogExtractionReason(new Error(message), 'unavailable');
  }
  await assertCatalogExtractionReason(Object.assign(new Error('private-password'), { code: 'private-password' }), 'unavailable');
});

test('#1894 complete extractor reasons survive hostile error metadata without replacing the original HOLD', async () => {
  for (const primary of [undefined, null, 'private-password', Symbol('private-password'),
    { message: { toString() { throw new Error('private-password'); } } },
    { get message() { throw new Error('private-password'); } },
    { message: 'private-password', get code() { throw new Error('private-password'); } },
    { message: 'private-password', code: 'ENOENT', get syscall() { throw new Error('private-password'); } },
  ]) await assertCatalogExtractionReason(primary, 'unavailable');
});

test('#1894 complete extractor reasons preserve real mocked history-chain errors and dual failure identity', async () => {
  const builder = await import('../../../../scripts/database-baseline/build-expected-terminal.mjs');
  const raw = JSON.parse(await readFile(join(repoRoot, 'apps/web/tests/fixtures/database-baseline/catalog-unstable-a.json'), 'utf8'));
  const { options } = catalogDiagnosticFixture();
  for (const phase of ['connect', 'query', 'end', 'query-and-end']) {
    const primary = Object.assign(new Error('private-password SELECT private-row'), { code: '42501' });
    const close = new Error('Connection terminated unexpectedly');
    class FakeClient {
      async connect() { if (phase === 'connect') throw primary; }
      async query() { if (phase.startsWith('query')) throw primary; return { rows: builder.EXPECTED_HISTORY_VERSIONS.map((version) => ({ version })) }; }
      async end() { if (phase === 'end' || phase === 'query-and-end') throw close; }
    }
    let extractedError;
    try { await builder.extractLocalTerminalAndHistory({ databaseUrl: options.databaseUrl, extractCatalogAdapter: async () => raw, ClientClass: FakeClient }); }
    catch (error) { extractedError = error; }
    if (phase === 'query-and-end') {
      assert.ok(extractedError instanceof AggregateError); assert.deepEqual(extractedError.errors, [primary, close]);
    } else assert.equal(extractedError, phase === 'end' ? close : primary);
    await assertCatalogExtractionReason(extractedError, phase === 'query-and-end' ? 'history-query-close' : phase === 'end' ? 'history-connection' : 'history-permission');
  }
});

test('#1894 complete extractor reasons retain reporter isolation and identity-bound cleanup on new errors', async () => {
  const { options } = catalogDiagnosticFixture();
  for (const asynchronous of [false, true]) {
    const primary = new Error('catalog requires PostgreSQL major 17');
    const stages = []; const calls = [];
    const adapter = diagnosticLifecycle({ calls }); adapter.statusJson = async () => ({ DATABASE_URL: options.databaseUrl });
    const reportStage = (stage) => {
      stages.push(stage);
      if (stage.startsWith('runtime-db-catalog:')) {
        if (asynchronous) return Promise.reject(new Error('private reporter failure'));
        throw new Error('private reporter failure');
      }
    };
    await assert.rejects(runWithLocalSupabase({ adapter, expectedProjectId: projectId, initialize: 'start-only', childArgs: [], reportStage,
      onReady: async () => runner.verifyRuntimeDbCatalog({ ...options, reportStage, extractTerminal: async () => { throw primary; } }),
    }), (error) => error.message === 'RUNTIME_DB_CATALOG_HOLD' && error.cause === primary);
    assert.deepEqual(calls, ['identity-1', 'identity-2', 'cleanup']);
    assert.equal(readCatalogDiagnostic(stages.filter((stage) => stage.startsWith('runtime-db-catalog:'))).reason, 'catalog-state');
  }
});

test('#1894 catalog diagnostics retain wrong catalog HOLD and report matching history without rows', async () => {
  const { options, digest, historyVersions } = catalogDiagnosticFixture();
  const extracted = Buffer.from('different private catalog SELECT canonical-name\n');
  const actualDigest = createHash('sha256').update(extracted).digest('hex');
  const stages = [];
  await assert.rejects(runner.verifyRuntimeDbCatalog({ ...options, extractTerminal: async () => ({ terminalBytes: extracted, historyVersions }), reportStage: (stage) => stages.push(stage) }), (error) => error.message === 'RUNTIME_DB_CATALOG_HOLD');
  assert.ok(extracted.every((byte) => byte === 0));
  assert.deepEqual(readCatalogDiagnostic(stages), {
    phase: 'compare-terminal', extraction_success: '1', expected_sha256: digest, actual_sha256: actualDigest,
    history_equal: '1', expected_history_count: '2', actual_history_count: '2', reason: 'unavailable',
  });
});

test('#1894 catalog diagnostics retain exact ordered history comparison and count-only metadata', async () => {
  const { options, bytes, digest, historyVersions } = catalogDiagnosticFixture();
  for (const actualHistory of [[...historyVersions].reverse(), [historyVersions[0]], ['private-version', 'private-version']]) {
    const stages = []; const extracted = Buffer.from(bytes);
    await assert.rejects(runner.verifyRuntimeDbCatalog({ ...options, extractTerminal: async () => ({ terminalBytes: extracted, historyVersions: actualHistory }), reportStage: (stage) => stages.push(stage) }), (error) => error.message === 'RUNTIME_DB_CATALOG_HOLD');
    assert.ok(extracted.every((byte) => byte === 0));
    assert.deepEqual(readCatalogDiagnostic(stages), {
      phase: 'compare-terminal', extraction_success: '1', expected_sha256: digest, actual_sha256: digest,
      history_equal: '0', expected_history_count: '2', actual_history_count: String(actualHistory.length), reason: 'unavailable',
    });
  }
});

test('#1894 catalog diagnostics handle malformed extractor output without emitting values or raw errors', async () => {
  const { options, bytes, digest } = catalogDiagnosticFixture();
  for (const output of [undefined, { terminalBytes: 'private-secret', historyVersions: 'private-history' }, { terminalBytes: Buffer.from(bytes), historyVersions: { private: 'secret' } }]) {
    const stages = [];
    await assert.rejects(runner.verifyRuntimeDbCatalog({ ...options, extractTerminal: async () => output, reportStage: (stage) => stages.push(stage) }), (error) => error.message === 'RUNTIME_DB_CATALOG_HOLD');
    const diagnostic = readCatalogDiagnostic(stages);
    assert.equal(diagnostic.phase, 'compare-terminal'); assert.equal(diagnostic.extraction_success, '1');
    assert.equal(diagnostic.expected_sha256, digest); assert.equal(diagnostic.actual_history_count, 'unavailable');
    assert.equal(diagnostic.history_equal, 'unavailable');
    if (Buffer.isBuffer(output?.terminalBytes)) assert.ok(output.terminalBytes.every((byte) => byte === 0));
    else assert.equal(diagnostic.actual_sha256, 'unavailable');
  }
});

test('#1894 catalog diagnostic reporter failure preserves primary HOLD, buffer wiping and owned cleanup', async () => {
  const { options, bytes, historyVersions } = catalogDiagnosticFixture();
  for (const success of [false, true]) for (const asynchronous of [false, true]) {
    const stages = []; const calls = []; const extracted = Buffer.from(bytes);
    const adapter = diagnosticLifecycle({ calls });
    adapter.statusJson = async () => ({ DATABASE_URL: options.databaseUrl });
    const reporterFailure = new Error('private reporter failure');
    const reportStage = (stage) => {
      stages.push(stage);
      if (stage.startsWith('runtime-db-catalog:')) {
        if (asynchronous) return Promise.reject(reporterFailure);
        throw reporterFailure;
      }
    };
    const run = runWithLocalSupabase({ adapter, expectedProjectId: projectId, initialize: 'start-only', childArgs: [], reportStage,
      onReady: async ({ localEnv }) => runner.verifyRuntimeDbCatalog({ ...options, databaseUrl: localEnv.DATABASE_URL, reportStage,
        extractTerminal: async () => ({ terminalBytes: extracted, historyVersions: success ? historyVersions : ['private-history'] }),
      }),
    });
    if (success) await run;
    else await assert.rejects(run, (error) => error.message === 'RUNTIME_DB_CATALOG_HOLD');
    assert.ok(extracted.every((byte) => byte === 0));
    assert.deepEqual(calls, ['identity-1', 'identity-2', 'cleanup']);
    readCatalogDiagnostic(stages.filter((stage) => stage.startsWith('runtime-db-catalog:')));
  }
});

test('#1894 catalog diagnostics reject nonfinite or nonnumeric counts without exposing array proxy values', async () => {
  const { options } = catalogDiagnosticFixture();
  for (const count of ['private-secret', Infinity, -1, 2 ** 53]) for (const expected of [false, true]) {
    const history = new Proxy(['private-history'], { get: (target, key) => key === 'length' ? count : Reflect.get(target, key) });
    const stages = [];
    await assert.rejects(runner.verifyRuntimeDbCatalog({ ...options,
      expectedManifest: expected ? { ...options.expectedManifest, historyVersions: history } : options.expectedManifest,
      extractTerminal: async () => ({ terminalBytes: Buffer.from('wrong private catalog'), historyVersions: expected ? [] : history }),
      reportStage: (stage) => stages.push(stage),
    }), (error) => error.message === 'RUNTIME_DB_CATALOG_HOLD');
    const diagnostic = readCatalogDiagnostic(stages);
    assert.equal(diagnostic[expected ? 'expected_history_count' : 'actual_history_count'], 'unavailable');
    assert.equal(diagnostic.history_equal, 'unavailable');
  }
});

test('#1894 catalog diagnostics bound metadata history comparison and never invoke malformed toJSON', async () => {
  const { options, historyVersions } = catalogDiagnosticFixture();
  for (const history of [new Array(10_001), [...historyVersions]]) {
    let serializations = 0;
    history.toJSON = () => { serializations += 1; throw new Error('private history serialization'); };
    const stages = [];
    await assert.rejects(runner.verifyRuntimeDbCatalog({ ...options,
      extractTerminal: async () => ({ terminalBytes: Buffer.from('wrong private catalog'), historyVersions: history }),
      reportStage: (stage) => stages.push(stage),
    }), (error) => error.message === 'RUNTIME_DB_CATALOG_HOLD');
    const diagnostic = readCatalogDiagnostic(stages);
    assert.equal(diagnostic.actual_history_count, String(history.length));
    assert.equal(diagnostic.history_equal, 'unavailable');
    assert.equal(serializations, 0, 'metadata must not invoke a serialization hook skipped by the primary comparison');
  }
});

test('#1894 catalog diagnostics use the actual candidate runner stage reporter', async () => {
  const source = await readFile(join(repoRoot, 'scripts/testing/with-midao-local-supabase.mjs'), 'utf8');
  assert.match(source, /await verifyRuntimeDbCatalog\(\{\s*runtimeDbOverrideProfile: invocation\.runtimeDbOverrideProfile,\s*databaseUrl: localEnv\.DATABASE_URL,\s*expectedManifest: databaseWorkdir\.expectedManifest,\s*reportStage,\s*\}\)/u);
});

test('#1894 optional digest metadata preserves original getter reads and catalog HOLD', async () => {
  const { options, bytes, digest, historyVersions } = catalogDiagnosticFixture();
  const key = 'catalog.expected-terminal.normalized.json';
  const extracted = Buffer.from('different private catalog\n');
  const actualDigest = createHash('sha256').update(extracted).digest('hex');
  let reads = 0;
  const payloadDigests = { get [key]() { reads += 1; return reads <= 2 ? digest : actualDigest; } };
  const stages = [];
  await assert.rejects(runner.verifyRuntimeDbCatalog({ ...options,
    expectedManifest: { payloadDigests, historyVersions },
    extractTerminal: async () => ({ terminalBytes: extracted, historyVersions }),
    reportStage: (stage) => stages.push(stage),
  }), (error) => error.message === 'RUNTIME_DB_CATALOG_HOLD');
  assert.equal(reads, 2, 'diagnostics must reuse reads already performed by the original guard');
  assert.equal(readCatalogDiagnostic(stages).phase, 'compare-terminal');
  assert.ok(extracted.every((byte) => byte === 0));
  assert.ok(bytes.some((byte) => byte !== 0));
});

test('#1894 optional history metadata preserves original getter reads and history HOLD', async () => {
  const { options, bytes, historyVersions } = catalogDiagnosticFixture();
  let reads = 0;
  const badHistory = [historyVersions[0], 'private-version'];
  const expectedManifest = { payloadDigests: options.expectedManifest.payloadDigests,
    get historyVersions() { reads += 1; return reads <= 3 ? badHistory : historyVersions; },
  };
  const extracted = Buffer.from(bytes); const stages = [];
  await assert.rejects(runner.verifyRuntimeDbCatalog({ ...options, expectedManifest,
    extractTerminal: async () => ({ terminalBytes: extracted, historyVersions }),
    reportStage: (stage) => stages.push(stage),
  }), (error) => error.message === 'RUNTIME_DB_CATALOG_HOLD');
  assert.equal(reads, 3, 'diagnostics must not add expected history getter reads');
  assert.equal(readCatalogDiagnostic(stages).history_equal, '0');
  assert.ok(extracted.every((byte) => byte === 0));
});

test('#1894 never-settling diagnostic reporter cannot delay catalog HOLD or owned cleanup', async () => {
  const { options, bytes } = catalogDiagnosticFixture();
  const calls = []; const stages = []; const extracted = Buffer.from(bytes);
  const adapter = diagnosticLifecycle({ calls });
  adapter.statusJson = async () => ({ DATABASE_URL: options.databaseUrl });
  let release;
  const pending = new Promise((resolveReporter) => { release = resolveReporter; });
  const reportStage = (stage) => {
    stages.push(stage);
    if (stage.startsWith('runtime-db-catalog:')) return pending;
  };
  const run = runWithLocalSupabase({ adapter, expectedProjectId: projectId, initialize: 'start-only', childArgs: [], reportStage,
    onReady: async ({ localEnv }) => runner.verifyRuntimeDbCatalog({ ...options, databaseUrl: localEnv.DATABASE_URL, reportStage,
      extractTerminal: async () => ({ terminalBytes: extracted, historyVersions: ['private-version'] }),
    }),
  });
  const hold = assert.rejects(run, (error) => error.message === 'RUNTIME_DB_CATALOG_HOLD');
  let timeout;
  try {
    await Promise.race([hold, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('diagnostic reporter blocked owned cleanup')), 100);
    })]);
    assert.deepEqual(calls, ['identity-1', 'identity-2', 'cleanup']);
    assert.ok(extracted.every((byte) => byte === 0));
    readCatalogDiagnostic(stages.filter((stage) => stage.startsWith('runtime-db-catalog:')));
  } finally {
    clearTimeout(timeout);
    release();
    await hold;
  }
});

test('#1894 sparse history metadata stays unavailable without changing original comparison', async () => {
  const { options, bytes } = catalogDiagnosticFixture();
  for (const makeHistory of [() => new Array(2), () => ['private-version', ,]]) {
    const stages = []; const extracted = Buffer.from(bytes);
    await runner.verifyRuntimeDbCatalog({ ...options,
      expectedManifest: { ...options.expectedManifest, historyVersions: makeHistory() },
      extractTerminal: async () => ({ terminalBytes: extracted, historyVersions: makeHistory() }),
      reportStage: (stage) => stages.push(stage),
    });
    const diagnostic = readCatalogDiagnostic(stages);
    assert.equal(diagnostic.phase, 'compatible');
    assert.equal(diagnostic.history_equal, 'unavailable');
    assert.equal(diagnostic.expected_history_count, '2');
    assert.equal(diagnostic.actual_history_count, '2');
    assert.ok(extracted.every((byte) => byte === 0));
  }
});

test('#1894 runtime override startup failures retain automatic identity-bound resource cleanup', async () => {
  const { loadRuntimeDbOverride } = await import('../../../../scripts/database-baseline/verify-toolchain-lock.mjs');
  const runtime = await loadRuntimeDbOverride(runtimeDbProfileName);
  const dbId = '2'.repeat(64); const networkId = '3'.repeat(64);
  const workdir = `/tmp/owned/${projectId}`;
  for (const failure of ['first-image', 'second-image', 'metadata-drift']) {
    let started = false; let dbChecks = 0; let metadataChecks = 0; const calls = [];
    const adapter = createActualAdapter({
      repoRoot: `/tmp/${projectId}`, pin: '2.87.2', nodeBin: '/node22', cliWorkdir: workdir,
      fullServices: true, runtimeDbOverrideProfile: runtimeDbProfileName,
      verifyRuntimeDbMetadata: async () => { metadataChecks += 1; if (failure === 'metadata-drift' && metadataChecks === 3) throw new Error('owned inode drift'); },
      enableFullServices: async () => {},
      commandRunner: async (command, args) => {
        calls.push([command, ...args]);
        const ok = (stdout = '') => ({ exitCode: 0, signal: null, stdout, stderr: '' });
        if (command.endsWith('/supabase')) {
          if (args[0] === 'status') return { ...ok(), exitCode: 1, stderr: `Using workdir ${workdir}\n${missingLine}\n${helpLine}\n` };
          if (args[0] === 'start') started = true;
          if (args[0] === 'stop') started = false;
          return ok();
        }
        if (args[0] === 'image') return ok(JSON.stringify([{ Id: runtime.image.imageId, Architecture: 'amd64', Os: 'linux', RepoDigests: [runtime.image.repoDigest] }]));
        if (args[0] === 'ps') return ok(started ? `${dbId}\tsupabase_db_${projectId}\t${projectId}\n` : '');
        if (args[0] === 'network' && args[1] === 'ls') return ok(started ? `${networkId}\tsupabase_network_${projectId}\t${projectId}\n` : '');
        if (args[0] === 'volume' && args[1] === 'ls') return ok(started ? `supabase_db_${projectId}\t${projectId}\n` : '');
        if (args[0] === 'volume' && args[1] === 'inspect') return ok(`supabase_db_${projectId}\t2026-10-07T00:00:00Z\tlocal\tlocal\t${projectId}\n`);
        if (args[0] === 'inspect' && args[2] === '{{json .}}') {
          dbChecks += 1;
          const wrong = failure === (dbChecks === 1 ? 'first-image' : 'second-image');
          return ok(JSON.stringify({ Id: dbId, Name: `/supabase_db_${projectId}`,
            Image: wrong ? 'sha256:' + 'a'.repeat(64) : runtime.image.imageId,
            Config: { Image: `${runtime.image.repository}:${runtime.image.tag}`, Labels: { 'com.supabase.cli.project': projectId, 'com.docker.compose.project': projectId } },
            State: { Status: 'running' },
          }));
        }
        if (args[0] === 'inspect') return ok('healthy\n');
        if (args[0] === 'exec') return ok(args.at(-1).includes('to_regclass')
          ? 'supabase_migrations.schema_migrations\nversion|text|text|NO\nstatements|ARRAY|_text|YES\nname|text|text|YES'
          : 'version|text|text|NO\nstatements|ARRAY|_text|YES\nname|text|text|YES\n--history--\n00000000000000');
        return ok();
      },
    });
    await assert.rejects(runWithLocalSupabase({ adapter, expectedProjectId: projectId, initialize: 'start-only', childArgs: [] }), /RUNTIME_DB_.*IDENTITY_INVALID/u);
    assert.deepEqual(calls.slice(-3), [
      ['/usr/bin/docker', 'rm', '--force', '--', dbId],
      ['/usr/bin/docker', 'network', 'rm', networkId],
      ['/usr/bin/docker', 'volume', 'rm', `supabase_db_${projectId}`],
    ]);
    assert.equal(calls.some((call) => call[0] === '/node22'), false, 'child/ready cannot run after candidate failure');
  }
});


test('#1894 runtime binding fixes executable and daemon across CLI, identity, diagnostics and cleanup', async () => {
  const { loadRuntimeDbOverride } = await import('../../../../scripts/database-baseline/verify-toolchain-lock.mjs');
  const runtime = await loadRuntimeDbOverride(runtimeDbProfileName);
  const ambient = {
    PATH: '/unapproved/bin', DOCKER_HOST: 'tcp://unapproved.invalid:2375', DOCKER_CONTEXT: 'unapproved',
    DOCKER_TLS: '1', DOCKER_TLS_VERIFY: '1', DOCKER_CERT_PATH: '/unapproved/certs',
    DOCKER_CONFIG: '/unapproved/config', DOCKER_API_VERSION: '0.1', DOCKER_CUSTOM_HEADERS: 'unapproved=value',
  };
  const previous = Object.fromEntries(Object.keys(ambient).map((key) => [key, process.env[key]]));
  const dbId = '4'.repeat(64); const networkId = '5'.repeat(64);
  const workdir = `/tmp/owned/${projectId}`;
  const calls = [];
  try {
    Object.assign(process.env, ambient);
    const adapter = createActualAdapter({
      repoRoot: `/tmp/${projectId}`, pin: '2.87.2', nodeBin: '/node22', cliWorkdir: workdir,
      fullServices: true, runtimeDbOverrideProfile: runtimeDbProfileName,
      verifyRuntimeDbMetadata: async () => {}, enableFullServices: async () => {},
      commandRunner: async (command, args, options) => {
        calls.push({ command, args, options });
        const ok = (stdout = '', stderr = '') => ({ exitCode: 0, signal: null, stdout, stderr });
        if (command.endsWith('/supabase')) {
          if (args.includes('json')) return ok(JSON.stringify({ DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' }), `Using workdir ${workdir}\n`);
          return ok();
        }
        if (command === '/node22') return ok();
        if (args[0] === 'image') return ok(JSON.stringify([{ Id: runtime.image.imageId, Architecture: 'amd64', Os: 'linux', RepoDigests: [runtime.image.repoDigest] }]));
        if (args[0] === 'ps') return ok(`${dbId}\tsupabase_db_${projectId}\t${projectId}\n`);
        if (args[0] === 'network' && args[1] === 'ls') return ok(`${networkId}\tsupabase_network_${projectId}\t${projectId}\n`);
        if (args[0] === 'volume' && args[1] === 'ls') return ok(`supabase_db_${projectId}\t${projectId}\n`);
        if (args[0] === 'volume' && args[1] === 'inspect') return ok(`supabase_db_${projectId}\t2026-10-07T00:00:00Z\tlocal\tlocal\t${projectId}\n`);
        if (args[0] === 'inspect' && args[2] === '{{json .}}') return ok(JSON.stringify({
          Id: dbId, Name: `/supabase_db_${projectId}`, Image: runtime.image.imageId,
          Config: { Image: `${runtime.image.repository}:${runtime.image.tag}`, Labels: { 'com.supabase.cli.project': projectId, 'com.docker.compose.project': projectId } },
          State: { Status: 'running' },
        }));
        if (args[0] === 'inspect') return ok('healthy\n');
        if (args[0] === 'exec') return ok(args.at(-1).includes('to_regclass')
          ? 'supabase_migrations.schema_migrations\nversion|text|text|NO\nstatements|ARRAY|_text|YES\nname|text|text|YES'
          : 'version|text|text|NO\nstatements|ARRAY|_text|YES\nname|text|text|YES\n--history--\n00000000000000');
        return ok();
      },
    });
    await adapter.status(); await adapter.start();
    const owned = await adapter.containers(); const assets = await adapter.assets();
    const localEnv = await adapter.statusJson();
    await adapter.ready({ ...localEnv, ...ambient });
    await adapter.child([], { ...localEnv, ...ambient });
    await adapter.captureDatabaseFailureDiagnostic(owned);
    // Even selectors changed after ownership capture cannot redirect cleanup.
    process.env.DOCKER_HOST = 'tcp://late-unapproved.invalid:2375';
    await adapter.stop(owned, assets);
    const dockerCalls = calls.filter((call) => !call.command.endsWith('/supabase') && call.command !== '/node22');
    assert.ok(dockerCalls.length > 15);
    assert.ok(dockerCalls.every((call) => call.command === '/usr/bin/docker'), 'all candidate Docker operations must use the preflight binary');
    for (const { options } of calls) {
      assert.equal(options.env.PATH, '/usr/bin:/bin');
      assert.equal(options.env.DOCKER_HOST, 'unix:///var/run/docker.sock');
      assert.equal(options.env.DOCKER_API_VERSION, '1.43');
      assert.deepEqual(Object.keys(options.env).filter((key) => key.startsWith('DOCKER_')).sort(), ['DOCKER_API_VERSION', 'DOCKER_HOST']);
    }
    for (const verb of ['image', 'ps', 'network', 'volume', 'inspect', 'exec', 'logs', 'rm']) assert.ok(dockerCalls.some((call) => call.args[0] === verb), verb);
    assert.deepEqual(dockerCalls.slice(-3).map((call) => call.args.slice(0, 2)), [['rm', '--force'], ['network', 'rm'], ['volume', 'rm']]);
    const diagnostic = dockerCalls.find((call) => call.args[0] === 'logs');
    assert.equal(diagnostic.options.timeoutMs, 5_000); assert.equal(diagnostic.options.maxOutputBytes, 32_768);
    assert.equal(diagnostic.options.signal, undefined);
    assert.equal(process.env.PATH, ambient.PATH, 'binding must not mutate persistent parent settings');
    assert.equal(process.env.DOCKER_CONTEXT, ambient.DOCKER_CONTEXT);
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('#1894 runtime binding environment keeps default identity and binds the actual API/test child environment', async () => {
  const ambient = { PATH: '/other/bin', DOCKER_HOST: 'tcp://other.invalid:2375', DOCKER_CONTEXT: 'other', DOCKER_TLS_VERIFY: '1', KEEP: 'ordinary-env' };
  assert.equal(runner.buildRuntimeDbExecutionEnvironment(ambient), ambient);
  assert.deepEqual(runner.buildRuntimeDbExecutionEnvironment(ambient, runtimeDbProfileName), {
    PATH: '/usr/bin:/bin', DOCKER_HOST: 'unix:///var/run/docker.sock', DOCKER_API_VERSION: '1.43', KEEP: 'ordinary-env',
  });
  assert.throws(() => runner.buildRuntimeDbExecutionEnvironment(ambient, 'arbitrary-profile'), /RUNTIME_DB_OVERRIDE/u);
  assert.equal(ambient.DOCKER_CONTEXT, 'other');
  const source = await readFile(join(repoRoot, 'scripts/testing/with-midao-local-supabase.mjs'), 'utf8');
  assert.match(source, /const e2eEnv = buildRuntimeDbExecutionEnvironment\(\{[\s\S]*?\}, invocation\.runtimeDbOverrideProfile\);/u);
});

// Source seam keeps the real frozen builder/normalizer and replaces only external I/O.
async function catalogObservationHarness(raw, { observeNormalize, extractError } = {}) {
  const builder = await import('../../../../scripts/database-baseline/build-expected-terminal.mjs');
  const extractor = await import('../../../../scripts/database-baseline/extract-catalog.mjs');
  const normalizer = await import('../../../../scripts/database-baseline/normalize-catalog.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'catalog-observation-test-'));
  const slot = `catalog-observation-${directory}`;
  const calls = { extracts: 0, clients: 0, queries: 0, rawReturned: undefined, forwarded: undefined, primary: undefined };
  const extractCatalog = async (args) => {
    calls.extracts += 1;
    if (calls.forwarded) assert.equal(args, calls.forwarded, 'forward the exact helper connection options');
    assert.deepEqual(args.connectionEnv, builder.parseLocalConnectionEnv(catalogDiagnosticFixture().options.databaseUrl));
    if (extractError) throw extractError;
    return raw;
  };
  class Client {
    constructor() { calls.clients += 1; }
    async connect() {}
    async query(sql) {
      calls.queries += 1;
      assert.equal(sql, 'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version');
      return { rows: builder.EXPECTED_HISTORY_VERSIONS.map((version) => ({ version })) };
    }
    async end() {}
  }
  globalThis[slot] = {
    extractor: { ...extractor, extractCatalog }, normalizer: { ...normalizer, normalizeCatalog: observeNormalize ?? normalizer.normalizeCatalog },
    builder: { ...builder, extractLocalTerminalAndHistory: async (options) => {
      assert.equal(options.databaseUrl, catalogDiagnosticFixture().options.databaseUrl);
      try {
        return await builder.extractLocalTerminalAndHistory({ ...options, ClientClass: Client,
          extractCatalogAdapter: async (args) => {
            calls.forwarded = args;
            const returned = await (options.extractCatalogAdapter ?? extractCatalog)(args);
            calls.rawReturned = returned;
            assert.equal(returned, raw, 'the observational seam must return the original raw object');
            return returned;
          },
        });
      } catch (error) { calls.primary = error; throw error; }
    } },
  };
  const runnerUrl = new URL('../../../../scripts/testing/with-midao-local-supabase.mjs', import.meta.url);
  let source = await readFile(runnerUrl, 'utf8');
  source = source.replace(/(['"])(\.\.\/database-baseline\/[^'"]+)\1/gu, (_match, quote, relative) => `${quote}${new URL(relative, runnerUrl).href}${quote}`);
  for (const [filename, field] of [['build-expected-terminal.mjs', 'builder'], ['extract-catalog.mjs', 'extractor'], ['normalize-catalog.mjs', 'normalizer']]) {
    const url = new URL(`../database-baseline/${filename}`, runnerUrl).href;
    source = source.replaceAll(`await import('${url}')`, `globalThis[${JSON.stringify(slot)}].${field}`);
  }
  const path = join(directory, 'runner.mjs'); await writeFile(path, source);
  const loaded = await import(path);
  const options = { ...catalogDiagnosticFixture().options,
    expectedManifest: { payloadDigests: { 'catalog.expected-terminal.normalized.json': 'a'.repeat(64) }, historyVersions: builder.EXPECTED_HISTORY_VERSIONS },
  };
  return { loaded, calls, options, normalizer, sections: extractor.CATALOG_SECTIONS,
    close: async () => { delete globalThis[slot]; await rm(directory, { recursive: true, force: true }); },
  };
}

function readCatalogObservation(stages, sections) {
  const lines = stages.filter((stage) => stage.startsWith('runtime-db-catalog-observation:'));
  assert.equal(lines.length, 1, 'one complete informational pass per default extraction');
  assert.ok(lines[0].length < 2500);
  assert.doesNotMatch(lines[0], /private|postgresql:|canonicalKey|SELECT|secret|rowData/u);
  const fields = Object.fromEntries(lines[0].slice('runtime-db-catalog-observation:'.length).split(',').map((field) => field.split('=')));
  assert.deepEqual(Object.keys(fields), ['normalized_bytes', 'normalized_sha256', ...sections.flatMap((section) => [`${section}_count`, `${section}_sha256`])]);
  for (const [key, value] of Object.entries(fields)) assert.match(value, key.endsWith('sha256') ? /^(?:[a-f0-9]{64}|unavailable)$/u : /^(?:\d{1,10}|unavailable)$/u);
  return fields;
}

async function observationRawFixture() {
  return JSON.parse(await readFile(join(repoRoot, 'apps/web/tests/fixtures/database-baseline/catalog-unstable-a.json'), 'utf8'));
}

test('#1894 catalog observation preserves one real-helper extraction, raw identity and fixed normalized metadata', async () => {
  const raw = await observationRawFixture(); raw.sections.schemas[0].privateData = 'private-secret SELECT private-row';
  const harness = await catalogObservationHarness(raw);
  try {
    const normalized = harness.normalizer.normalizeCatalog(raw); const digest = createHash('sha256').update(normalized).digest('hex');
    harness.options.expectedManifest.payloadDigests['catalog.expected-terminal.normalized.json'] = digest;
    const stages = [];
    await harness.loaded.verifyRuntimeDbCatalog({ ...harness.options, runtimeDbOverrideProfile: undefined, reportStage: (stage) => stages.push(stage) });
    assert.deepEqual(stages, []); assert.equal(harness.calls.extracts, 0);
    await harness.loaded.verifyRuntimeDbCatalog({ ...harness.options, reportStage: (stage) => stages.push(stage) });
    assert.equal(harness.calls.extracts, 1); assert.equal(harness.calls.queries, 1); assert.equal(harness.calls.rawReturned, raw);
    const observation = readCatalogObservation(stages, harness.sections);
    assert.equal(observation.normalized_bytes, String(Buffer.byteLength(normalized)));
    assert.equal(observation.normalized_sha256, digest);
    const parsed = JSON.parse(normalized);
    for (const section of harness.sections) {
      assert.equal(observation[`${section}_count`], String(parsed.sections[section].length));
      assert.equal(observation[`${section}_sha256`], createHash('sha256').update(JSON.stringify(parsed.sections[section])).digest('hex'));
    }
    assert.equal(readCatalogDiagnostic(stages.filter((stage) => stage.startsWith('runtime-db-catalog:'))).phase, 'compatible');
  } finally { await harness.close(); }
});

test('#1894 catalog observation measures a real-helper over-4MiB HOLD without widening frozen terminal guard', async () => {
  const raw = await observationRawFixture(); raw.sections.schemas[0].privateData = 'x'.repeat(4 * 1024 * 1024);
  const harness = await catalogObservationHarness(raw);
  try {
    const stages = []; const normalized = harness.normalizer.normalizeCatalog(raw);
    await assert.rejects(harness.loaded.verifyRuntimeDbCatalog({ ...harness.options, reportStage: (stage) => stages.push(stage) }),
      (error) => error.message === 'RUNTIME_DB_CATALOG_HOLD' && error.cause === harness.calls.primary && error.cause.message === 'terminal catalog bytes invalid');
    assert.equal(harness.calls.extracts, 1); assert.equal(harness.calls.clients, 0); assert.equal(harness.calls.queries, 0);
    const observation = readCatalogObservation(stages, harness.sections);
    assert.equal(observation.normalized_bytes, String(Buffer.byteLength(normalized)));
    assert.equal(observation.normalized_sha256, createHash('sha256').update(normalized).digest('hex'));
    const diagnostic = readCatalogDiagnostic(stages.filter((stage) => stage.startsWith('runtime-db-catalog:')));
    assert.equal(diagnostic.reason, 'terminal-catalog'); assert.equal(diagnostic.actual_sha256, 'unavailable');
  } finally { await harness.close(); }
});

test('#1894 catalog observation failures and malformed raw keep original helper verdict and cause', async () => {
  const valid = await observationRawFixture(); const accessorError = new Error('private original raw accessor');
  let rawReads = 0;
  const accessorRaw = { ...valid, get sections() { rawReads += 1; throw accessorError; } };
  for (const [raw, configuration] of [[valid, { observeNormalize: () => { throw new Error('private observer error'); } }],
    [null, {}], [{ ...valid, 'private-secret': 'SELECT private-row' }, {}], [accessorRaw, {}],
    [valid, { extractError: new Error('private extractor error SELECT private-row') }]]) {
    const harness = await catalogObservationHarness(raw, configuration);
    try {
      const stages = [];
      if (raw === valid && !configuration.extractError) {
        harness.options.expectedManifest.payloadDigests['catalog.expected-terminal.normalized.json'] = createHash('sha256').update(harness.normalizer.normalizeCatalog(raw)).digest('hex');
        await harness.loaded.verifyRuntimeDbCatalog({ ...harness.options, reportStage: (stage) => stages.push(stage) });
      } else await assert.rejects(harness.loaded.verifyRuntimeDbCatalog({ ...harness.options, reportStage: (stage) => stages.push(stage) }),
        (error) => error.message === 'RUNTIME_DB_CATALOG_HOLD' && error.cause === harness.calls.primary);
      assert.equal(harness.calls.extracts, 1);
      if (raw === accessorRaw) { assert.equal(harness.calls.primary, accessorError); assert.equal(rawReads, 2); }
      assert.ok(Object.values(readCatalogObservation(stages, harness.sections)).every((value) => value === 'unavailable'));
    } finally { await harness.close(); }
  }
});

test('#1894 catalog observation bounds normalized hashing and all metadata names', async () => {
  const raw = await observationRawFixture();
  for (const normalized of ['x'.repeat(32 * 1024 * 1024 + 1), JSON.stringify({ sections: { 'private-secret': [{ rowData: 'SELECT private-row' }] } })]) {
    const harness = await catalogObservationHarness(raw, { observeNormalize: () => normalized });
    try {
      harness.options.expectedManifest.payloadDigests['catalog.expected-terminal.normalized.json'] = createHash('sha256').update(harness.normalizer.normalizeCatalog(raw)).digest('hex');
      const stages = []; await harness.loaded.verifyRuntimeDbCatalog({ ...harness.options, reportStage: (stage) => stages.push(stage) });
      const observation = readCatalogObservation(stages, harness.sections);
      assert.equal(observation.normalized_bytes, String(Buffer.byteLength(normalized)));
      assert.equal(observation.normalized_sha256, normalized.length > 32 * 1024 * 1024 ? 'unavailable' : createHash('sha256').update(normalized).digest('hex'));
      for (const section of harness.sections) assert.equal(observation[`${section}_count`], 'unavailable');
    } finally { await harness.close(); }
  }
});

test('#1894 catalog observation reporter throw, rejection and pending promise preserve owned cleanup', async () => {
  const raw = await observationRawFixture(); raw.sections.schemas[0].privateData = 'x'.repeat(4 * 1024 * 1024);
  for (const behavior of ['throw', 'reject', 'pending']) {
    const harness = await catalogObservationHarness(raw); const calls = []; const adapter = diagnosticLifecycle({ calls });
    adapter.statusJson = async () => ({ DATABASE_URL: harness.options.databaseUrl });
    let release; const pending = new Promise((resolveReporter) => { release = resolveReporter; });
    const stages = []; const reportStage = (stage) => {
      stages.push(stage);
      if (stage.startsWith('runtime-db-catalog-observation:')) {
        if (behavior === 'throw') throw new Error('private observer reporter');
        return behavior === 'reject' ? Promise.reject(new Error('private observer reporter')) : pending;
      }
    };
    let timeout;
    try {
      const run = runWithLocalSupabase({ adapter, expectedProjectId: projectId, initialize: 'start-only', childArgs: [], reportStage,
        onReady: async () => harness.loaded.verifyRuntimeDbCatalog({ ...harness.options, reportStage }),
      });
      await Promise.race([assert.rejects(run, (error) => error.message === 'RUNTIME_DB_CATALOG_HOLD' && error.cause === harness.calls.primary),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('observation reporter blocked cleanup')), 500); }),
      ]);
      assert.deepEqual(calls, ['identity-1', 'identity-2', 'cleanup']);
      readCatalogObservation(stages, harness.sections); assert.equal(harness.calls.extracts, 1);
    } finally { clearTimeout(timeout); release(); await harness.close(); }
  }
});

// Execute the actual candidate/main source with external I/O mocked; ownership and catalog guards stay real.
let catalogPhaseSequence = 0;
async function catalogPhaseHarness({ failure, secondaryFailure, candidate = true } = {}) {
  let source = await readFile(join(repoRoot, 'scripts/testing/with-midao-local-supabase.mjs'), 'utf8');
  assert.match(source, /export async function runRuntimeDbCatalogPreflight\(/u);
  const slot = `catalog-phase-${catalogPhaseSequence++}`;
  const events = []; const prepared = []; const adapters = []; const { options, bytes, historyVersions } = catalogDiagnosticFixture();
  const fail = (name) => { if (failure === name || secondaryFailure === name) throw new Error(name); };
  const localEnv = { DATABASE_URL: options.databaseUrl, SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_ANON_KEY: 'fake-anon', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fake-anon', SUPABASE_SERVICE_ROLE_KEY: 'fake-service' };
  const mocks = {
    process: { argv: ['node', 'mock', ...(candidate ? ['--runtime-db-override', runtimeDbProfileName] : []), '--api-real-auth', runtimeDbTestPath],
      cwd: () => `/tmp/${projectId}`, execPath: '/node22', pid: 1, env: {}, on() {}, removeListener() {}, stdout: { write() {} }, stderr: { write() {} } },
    fsPromises: { async readFile(path) { return path.startsWith('/proc/') ? '1 (mock) ' + Array(25).fill('0').join(' ') : readFile(join(repoRoot, path.endsWith('package-lock.json') ? 'package-lock.json' : 'supabase/baselines/v1/toolchain-lock.json'), 'utf8'); } },
    loadRuntimeDbOverride: async () => {}, verifyDockerIdentity: async () => ({ architecture: 'amd64' }), verifyPinnedSupabaseBinary: async () => {},
    acquireKernelRunnerLock: async () => { events.push('lock'); return {}; }, releaseKernelRunnerLock: async () => { events.push('unlock'); },
    parseDockerHostGateway: () => null,
    async prepareDatabaseOnlyWorkdir(args) {
      const phase = args.fullServices ? 'auth' : 'db'; events.push(`prepare-${phase}`); prepared.push(args); fail(`prepare-${phase}`);
      return { workdir: `/tmp/owned/${phase}/${projectId}`, history: ['original.sql'], seedPath: '/mock/original-seed.sql', expectedManifest: options.expectedManifest,
        async stageCliReplay() { events.push(`stage-${phase}`); return { bootstrapName: '00000000000000_midao_history_bootstrap.sql', pendingMigrationsDir: `/mock/${phase}/pending`,
          async restore() { events.push(`restore-${phase}`); fail(`restore-${phase}`); } }; },
        async verifyRuntimeDbMetadata() {}, async enableFullServices() { events.push(`enable-${phase}`); },
        async cleanupCliMetadata() { events.push(`metadata-${phase}`); fail(`metadata-${phase}`); },
        async cleanup() { events.push(`workdir-${phase}`); fail(`workdir-${phase}`); } };
    },
    createActualAdapter(args) {
      adapters.push(args); const phase = args.fullServices ? 'auth' : 'db'; let owned = false; let residueChecks = 0;
      const database = { ...diagnosticDatabase, id: (phase === 'db' ? '6' : '7').repeat(64) };
      const network = { id: (phase === 'db' ? '8' : '9').repeat(64), name: `supabase_network_${projectId}`, projectLabel: projectId };
      const volume = { id: phase, name: `supabase_db_${projectId}`, projectLabel: projectId };
      const adapter = diagnosticLifecycle({ calls: [], success: true });
      return { ...adapter, async assertNoPreexistingResources() { events.push(`${owned ? 'preexisting' : 'residue'}-${phase}`); residueChecks += 1; if (residueChecks > 1) fail(`residue-${phase}`); assert.equal(owned, false); },
        async containers() { return [database]; }, async networks() { return [network]; }, async volumes() { return [volume]; },
        async start() { events.push(`start-${phase}`); owned = true; fail(`start-${phase}`); }, async statusJson() { return localEnv; },
        async stop(containers, assets) { events.push(`stop-${phase}`); assert.deepEqual(containers, [database]); assert.deepEqual(assets, { networks: [network], volumes: [volume] }); fail(`container-${phase}`); fail(`network-${phase}`); fail(`volume-${phase}`); owned = false; } };
    },
    builder: { parseLocalConnectionEnv: () => ({}), async replayExactMigrations(args) { const phase = args.pendingMigrationsDir.includes('/db/') ? 'db' : 'auth'; events.push(`replay-${phase}`); fail(`replay-${phase}`); } },
    async verifyRuntimeDbCatalog(args) { events.push('catalog-db'); fail('extract-db'); return runner.verifyRuntimeDbCatalog({ ...args,
      extractTerminal: async () => ({ terminalBytes: Buffer.from(failure === 'catalog-db' ? 'mismatch' : bytes), historyVersions }) }); },
    async runCommand(command, args) { events.push(command === '/node22' ? 'child-auth' : 'seed-auth'); return { exitCode: 0, signal: null, stdout: '', stderr: '' }; },
    async createOrUpdateMidaoTravelerAuthUser() {}, buildMidaoPlaywrightEnvironment: () => localEnv,
    async startMidaoApiServer() { return { baseUrl: 'http://127.0.0.1:43127', async close() { events.push('api-close'); } }; },
  };
  globalThis[slot] = mocks;
  const base = new URL('../../../../scripts/testing/with-midao-local-supabase.mjs', import.meta.url);
  source = source.replace(/(from\s+|import\()(['"])(\.\.?\/[^'"]+)\2/gu, (_, prefix, quote, path) => `${prefix}${quote}${new URL(path, base).href}${quote}`);
  const start = source.indexOf('export async function runRuntimeDbCatalogPreflight(');
  let tail = source.slice(start, source.indexOf('\nif (process.argv[1]'));
  tail = tail.replace(/const \{[^\n]+\} = await import\([^\n]+build-expected-terminal\.mjs[^\n]+\);/gu, `const { parseLocalConnectionEnv, replayExactMigrations } = globalThis[${JSON.stringify(slot)}].builder;`);
  for (const name of Object.keys(mocks).filter((name) => !['process', 'fsPromises', 'builder'].includes(name))) {
    tail = tail.replace(new RegExp(`\\b${name}\\(`, 'gu'), `globalThis[${JSON.stringify(slot)}].${name}(`);
  }
  tail = tail.replace('async function main() {', `export async function main() {\n  const { process, fsPromises } = globalThis[${JSON.stringify(slot)}];`);
  try {
    const loaded = await import(`data:text/javascript;base64,${Buffer.from(source.slice(0, start) + tail).toString('base64')}`);
    return { loaded, events, prepared, adapters, close: () => { delete globalThis[slot]; } };
  } catch (error) { delete globalThis[slot]; throw error; }
}

test('#1894 catalog phase executes DB-only guard and terminal cleanup before fresh real-auth lifecycle', async () => {
  const h = await catalogPhaseHarness();
  try {
    await h.loaded.main();
    assert.deepEqual(h.events.filter((event) => !['seed-auth', 'api-close'].includes(event)), [
      'lock', 'prepare-db', 'stage-db', 'residue-db', 'start-db', 'replay-db', 'catalog-db', 'stop-db', 'residue-db',
      'restore-db', 'metadata-db', 'workdir-db', 'prepare-auth', 'stage-auth', 'residue-auth', 'start-auth', 'replay-auth', 'child-auth', 'stop-auth', 'restore-auth', 'metadata-auth', 'workdir-auth', 'unlock',
    ]);
    assert.deepEqual(h.prepared.map((args) => [args.fullServices, args.realAuth, args.runtimeDbOverrideProfile]), [[false, false, runtimeDbProfileName], [true, true, runtimeDbProfileName]]);
    assert.notEqual(h.adapters[0].cliWorkdir, h.adapters[1].cliWorkdir);
    assert.ok(h.adapters.every((args) => args.pin === '2.87.2' && args.runtimeDbOverrideProfile === runtimeDbProfileName));
    assert.equal(h.events.filter((event) => event === 'catalog-db').length, 1);
    const root = await mkdtemp(join(tmpdir(), 'catalog-phase-workdirs-')); const paths = [];
    const capture = { transactionId: 'a'.repeat(64), ledger: { captureManifestSha256: 'b'.repeat(64) }, dispose() {} };
    const expected = { transactionId: 'c'.repeat(64), manifest: { captureTransactionId: capture.transactionId, captureManifestSha256: capture.ledger.captureManifestSha256, historyVersions: ['00000000000001'] }, dispose() {} };
    try {
      for (const runtimeDbPhase of [h.prepared[0].runtimeDbPhase, undefined]) {
        const workdir = await h.loaded.prepareBaselineWorkdirWithAdapters({ repoRoot: `/tmp/${projectId}`, lockDir: root, runtimeDbPhase, runtimeDbOverrideProfile: runtimeDbProfileName,
          verifyCapture: async () => capture, verifyExpected: async () => expected,
          materialize: async ({ outputParent, projectId: id, runtimeDbOverrideProfile }) => {
            assert.equal(runtimeDbOverrideProfile, runtimeDbProfileName); const path = join(outputParent, id); await mkdir(path); paths.push(path);
            assert.deepEqual(await readdir(path), []);
            return { workdir: path, transactionId: capture.transactionId, history: ['00000000000001_baseline.sql'], async cleanup() { await rm(path, { recursive: true }); } };
          } });
        await workdir.cleanup(); assert.deepEqual(await readdir(root), []);
      }
      assert.notEqual(paths[0], paths[1]); assert.equal(paths[0].split('/').at(-1), projectId); assert.equal(paths[1].split('/').at(-1), projectId);
    } finally { await rm(root, { recursive: true, force: true }); }
  } finally { h.close(); }
});

test('#1894 catalog phase exact guard mismatch blocks second workdir and fixtures', async () => {
  const h = await catalogPhaseHarness({ failure: 'catalog-db' });
  try { await assert.rejects(h.loaded.main(), /RUNTIME_DB_CATALOG_HOLD/u); assert.deepEqual(h.events.slice(-4), ['restore-db', 'metadata-db', 'workdir-db', 'unlock']); assert.equal(h.prepared.length, 1); }
  finally { h.close(); }
});

test('#1894 catalog phase replay or extraction failure still cleans owned lifecycle and workdir', async () => {
  for (const failure of ['start-db', 'replay-db', 'extract-db']) {
    const h = await catalogPhaseHarness({ failure });
    try { await assert.rejects(h.loaded.main(), new RegExp(failure, 'u')); assert.ok(h.events.includes('stop-db')); assert.equal(h.prepared.length, 1); assert.equal(h.events.at(-2), 'workdir-db'); }
    finally { h.close(); }
  }
});

test('#1894 catalog phase every resource or workdir cleanup failure blocks real-auth', async () => {
  for (const failure of ['container-db', 'network-db', 'volume-db', 'restore-db', 'metadata-db', 'workdir-db', 'residue-db']) {
    const h = await catalogPhaseHarness({ failure });
    try { await assert.rejects(h.loaded.main()); assert.equal(h.prepared.length, 1); assert.ok(h.events.includes('workdir-db')); assert.equal(h.events.includes('child-auth'), false); }
    finally { h.close(); }
  }
});

test('#1894 catalog phase keeps replay failure primary and cleanup aggregate truth', async () => {
  const h = await catalogPhaseHarness({ failure: 'replay-db', secondaryFailure: 'container-db' });
  try { await assert.rejects(h.loaded.main(), (error) => error instanceof AggregateError && error.errors[0].message === 'replay-db' && error.errors[1].message === 'container-db'); assert.equal(h.prepared.length, 1); }
  finally { h.close(); }
});

test('#1894 catalog phase does no new preflight or catalog reads in the default real-auth lane', async () => {
  const h = await catalogPhaseHarness({ candidate: false });
  try { await h.loaded.main(); assert.equal(h.prepared.length, 1); assert.equal(h.prepared[0].fullServices, true); assert.equal(h.events.includes('catalog-db'), false); assert.ok(h.events.includes('child-auth')); }
  finally { h.close(); }
});

test('#1894 catalog phase private token cannot create arbitrary DB-only override lanes', async () => {
  const h = await catalogPhaseHarness();
  try {
    await h.loaded.main(); const args = h.adapters[0]; assert.equal(typeof args.runtimeDbPhase, 'symbol');
    assert.doesNotThrow(() => h.loaded.createActualAdapter(args));
    for (const change of [{ runtimeDbPhase: undefined }, { runtimeDbPhase: 'catalog-preflight' }, { runtimeDbPhase: Symbol('catalog-preflight') },
      { fullServices: true, enableFullServices: async () => {} }, { runtimeDbOverrideProfile: undefined }, { runtimeDbOverrideProfile: 'arbitrary' }, { verifyRuntimeDbMetadata: undefined }]) {
      assert.throws(() => h.loaded.createActualAdapter({ ...args, ...change }), /RUNTIME_DB_OVERRIDE/u);
    }
    await assert.rejects(h.loaded.prepareDatabaseOnlyWorkdir({ ...h.prepared[0], runtimeDbPhase: Symbol('catalog-preflight') }), /RUNTIME_DB_OVERRIDE/u);
  } finally { h.close(); }
});

test('#1894 catalog phase actual DB-only adapter keeps image, daemon, metadata and owned-container guards', async () => {
  const h = await catalogPhaseHarness();
  try {
    await h.loaded.main(); const args = h.adapters[0]; const runtime = await import('../../../../scripts/database-baseline/verify-toolchain-lock.mjs').then((module) => module.loadRuntimeDbOverride(runtimeDbProfileName));
    for (const failure of [undefined, 'image', 'metadata', 'container']) {
      const calls = []; let metadata = 0; const id = '6'.repeat(64);
      const adapter = h.loaded.createActualAdapter({ ...args, verifyRuntimeDbMetadata: async () => { metadata += 1; if (failure === 'metadata') throw new Error('drift'); },
        commandRunner: async (command, argv, opts) => {
          calls.push({ command, argv, opts }); const ok = (stdout = '', stderr = '') => ({ exitCode: 0, signal: null, stdout, stderr });
          if (command.endsWith('/supabase')) return ok('', `Using workdir ${args.cliWorkdir}\nStarting database...\nInitialising schema...\nSeeding globals from roles.sql...\nApplying migration ${args.lifecycleContract.migrationNames[0]}...\n`);
          if (argv[0] === 'image') return ok(JSON.stringify([{ Id: failure === 'image' ? 'sha256:' + 'a'.repeat(64) : runtime.image.imageId, Architecture: 'amd64', Os: 'linux', RepoDigests: [runtime.image.repoDigest] }]));
          if (argv[2] === '{{json .}}') return ok(JSON.stringify({ Id: id, Name: `/supabase_db_${projectId}`, Image: failure === 'container' ? 'sha256:' + 'a'.repeat(64) : runtime.image.imageId,
            Config: { Image: `${runtime.image.repository}:${runtime.image.tag}`, Labels: { 'com.supabase.cli.project': projectId, 'com.docker.compose.project': projectId } }, State: { Status: 'running' } }));
          return ok('healthy\n');
        } });
      if (failure === 'image' || failure === 'metadata') await assert.rejects(adapter.start(), /RUNTIME_DB_.*IDENTITY_INVALID/u);
      else { await adapter.start(); if (failure) await assert.rejects(adapter.waitForDatabase([{ id, name: `supabase_db_${projectId}`, projectLabel: projectId }]), /RUNTIME_DB_CONTAINER_IDENTITY_INVALID/u); else await adapter.waitForDatabase([{ id, name: `supabase_db_${projectId}`, projectLabel: projectId }]); }
      for (const { command, opts } of calls) { assert.ok(command.endsWith('/supabase') || command === '/usr/bin/docker'); assert.equal(opts.env.DOCKER_HOST, 'unix:///var/run/docker.sock'); assert.equal(opts.env.PATH, '/usr/bin:/bin'); }
      const cli = calls.filter((call) => call.command.endsWith('/supabase'));
      assert.equal(cli.length, failure === 'image' || failure === 'metadata' ? 0 : 1);
      if (cli.length) { assert.deepEqual(cli[0].argv.slice(0, 2), ['db', 'start']); assert.equal(metadata, 1); }
    }
  } finally { h.close(); }
});
