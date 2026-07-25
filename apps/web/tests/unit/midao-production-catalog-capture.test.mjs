import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const capturePath = path.join(root, 'scripts/database-baseline/capture-production-catalog.mjs');
const rendererPath = path.join(root, 'scripts/database-baseline/render-baseline-from-archive.mjs');
const PG17_DUMP_HEADER = Buffer.from('--\n-- PostgreSQL database dump\n--\n\n');
const fixturePath = path.join(here, '../fixtures/database-baseline/supabase-dump-dry-run-redacted.txt');
const tocFixturePath = path.join(here, '../fixtures/database-baseline/pg17-toc.txt');
const catalogFixturePath = path.join(here, '../fixtures/database-baseline/catalog-minimal.json');
const toolchainPath = path.join(root, 'supabase/baselines/v1/toolchain-lock.json');
const fixtureSha256 = '36fe7a60fd33c50d9e3d34cb9fe0bda7b5eef38b347492d8bd1c43638b251a1f';
const upstreamSourceSha256 = '5cd57189f6565ddf651ff149995398a4c9b1971ca34a0093a77c011a41f21d64';

async function subject() {
  assert.ok(existsSync(capturePath), 'capture-production-catalog.mjs missing');
  return import(`${pathToFileURL(capturePath).href}?t=${Date.now()}`);
}

async function fixture(secret = '__REDACTED__') {
  const bytes = await readFile(fixturePath);
  return Buffer.from(bytes.toString('utf8').replace('__REDACTED__', secret));
}

test('dry-run fixture is exact source-derived Supabase CLI v2.87.2 grammar with synthetic values only', async () => {
  const bytes = await readFile(fixturePath);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), fixtureSha256);
  assert.equal(upstreamSourceSha256, '5cd57189f6565ddf651ff149995398a4c9b1971ca34a0093a77c011a41f21d64');
  const text = bytes.toString('utf8');
  assert.match(text, /PGPASSWORD="__REDACTED__"/u);
  assert.match(text, /PGHOST="db\.synthetic\.invalid"/u);
  assert.equal(text.endsWith('\n\n'), true, 'Go noExec fmt.Fprintln framing must be preserved');
  assert.doesNotMatch(text, /pyoderxmpeyqjwkeliiu|postgres(?:ql)?:\/\//iu);
});

test('exact dry-run parser extracts only allowlisted connection fields and wipes raw bytes', async () => {
  const { parseDumpDryRunEnvelope } = await subject();
  const secret = 'fixture-only-password-9xQ';
  const bytes = await fixture(secret);
  const result = parseDumpDryRunEnvelope(bytes);
  assert.deepEqual(result, {
    PGHOST: 'db.synthetic.invalid',
    PGPORT: '5432',
    PGUSER: 'postgres',
    PGPASSWORD: secret,
    PGDATABASE: 'postgres',
    PGSSLMODE: 'require',
  });
  assert.equal(bytes.every((byte) => byte === 0), true, 'raw dry-run buffer must be wiped');
  assert.equal(Object.hasOwn(result, 'raw'), false);
  assert.equal(Object.hasOwn(result, 'argv'), false);
});

test('dry-run parser fails closed on framing and shape injection and still wipes bytes', async () => {
  const { parseDumpDryRunEnvelope } = await subject();
  const valid = await fixture('fixture-value');
  const mutations = [
    Buffer.concat([Buffer.from('x'), valid]),
    Buffer.from(valid.toString('utf8').replace('export PGPORT="5432"', 'export PGPORT="5432"\nexport PGPORT="6543"')),
    Buffer.from(valid.toString('utf8').replace('\n\n', '\r\n')),
    Buffer.concat([valid.subarray(0, 40), Buffer.from([0]), valid.subarray(40)]),
    Buffer.from(valid.toString('utf8').replace('export PGUSER="postgres"', 'export PGUSER="$(id)"')),
  ];
  for (const bytes of mutations) {
    assert.throws(() => parseDumpDryRunEnvelope(bytes), /dry-run|shape|framing|unsafe|credential/iu);
    assert.equal(bytes.every((byte) => byte === 0), true);
  }
});

test('capture child invocations and environment are exact and ignore ambient secrets', async () => {
  const {
    buildDryRunInvocation, buildExpectedSupabaseDryRunStderr, buildStrictPgEnvironment, loadSupabaseDbPassword, validateLockedPg17, verifyLinkedProjectRef,
    FIXED_PROJECT_ROOT, FIXED_SUPABASE_CLI,
  } = await subject();
  const syntheticAccessToken = Buffer.from(`sbp_${'a'.repeat(40)}`);
  const invocation = buildDryRunInvocation({ projectRef: 'abcdefghijklmnopqrst', home: '/owned/empty-home', accessToken: syntheticAccessToken });
  assert.equal(FIXED_SUPABASE_CLI, '/root/.hermes/toolchains/supabase/2.87.2/supabase');
  assert.deepEqual(invocation, {
    executable: FIXED_SUPABASE_CLI,
    args: ['db', 'dump', '--linked', '--dry-run', '--workdir', FIXED_PROJECT_ROOT],
    env: { HOME: '/owned/empty-home', LANG: 'C', LC_ALL: 'C', SUPABASE_ACCESS_TOKEN: syntheticAccessToken.toString('utf8') },
    stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', projectRef: 'abcdefghijklmnopqrst',
  });
  assert.doesNotMatch(JSON.stringify(invocation.args), /sbp_/u);
  assert.equal(buildExpectedSupabaseDryRunStderr('/owned/empty-home/workdir').toString('utf8'),
    'Using workdir /owned/empty-home/workdir\nDRY RUN: *only* printing the pg_dump script to console.\nDumping schemas from remote database...\n');
  for (const invalidWorkdir of ['relative', '/owned/bad\npath', '/owned/bad\rpath', '/owned/bad\0path']) {
    assert.throws(() => buildExpectedSupabaseDryRunStderr(invalidWorkdir), /workdir invalid/iu);
  }
  assert.throws(() => buildDryRunInvocation({ projectRef: 'abcdefghijklmnopqrst', home: '/owned/empty-home', accessToken: Buffer.from('invalid') }), /credential invalid/iu);
  const syntheticPassword = loadSupabaseDbPassword({ SUPABASE_DB_PASSWORD: 'synthetic-db-password' });
  const passwordInvocation = buildDryRunInvocation({ projectRef: 'abcdefghijklmnopqrst', home: '/owned/empty-home', dbPassword: syntheticPassword });
  assert.equal(passwordInvocation.env.SUPABASE_DB_PASSWORD, 'synthetic-db-password');
  assert.equal('SUPABASE_ACCESS_TOKEN' in passwordInvocation.env, false);
  assert.doesNotMatch(JSON.stringify(passwordInvocation.args), /synthetic-db-password/u);
  assert.equal(loadSupabaseDbPassword({}), null);
  for (const invalid of ['', 'bad\0value', 'bad\rvalue', 'bad\nvalue', '界'.repeat(342)]) {
    assert.throws(() => loadSupabaseDbPassword({ SUPABASE_DB_PASSWORD: invalid }), /environment invalid/iu);
  }
  assert.throws(() => buildDryRunInvocation({ projectRef: 'abcdefghijklmnopqrst', home: '/owned/empty-home', accessToken: syntheticAccessToken, dbPassword: syntheticPassword }), /exactly one/iu);
  assert.throws(() => buildDryRunInvocation({ projectRef: 'abcdefghijklmnopqrst', home: '/owned/empty-home', accessToken: syntheticAccessToken, dbPassword: Buffer.from('bad\nvalue') }), /exactly one/iu);
  assert.throws(() => buildDryRunInvocation({ projectRef: 'abcdefghijklmnopqrst', home: '/owned/empty-home', dbPassword: Buffer.alloc(0) }), /credential invalid/iu);
  syntheticPassword.fill(0);
  assert.equal(await verifyLinkedProjectRef('pyoderxmpeyqjwkeliiu'), true);
  await assert.rejects(() => verifyLinkedProjectRef('abcdefghijklmnopqrst'), /mismatch/iu);
  const credential = { PGHOST: 'db.synthetic.invalid', PGPORT: '5432', PGUSER: 'postgres', PGPASSWORD: 'fixture-value', PGDATABASE: 'postgres', PGSSLMODE: 'require' };
  assert.deepEqual(buildStrictPgEnvironment({ credential, home: '/owned/empty-home' }), {
    HOME: '/owned/empty-home', LANG: 'C', LC_ALL: 'C', ...credential,
    PGOPTIONS: '-c default_transaction_read_only=on',
  });
  const lock = JSON.parse(await readFile(toolchainPath, 'utf8'));
  assert.equal(validateLockedPg17(lock).image, 'postgres@sha256:0027bef26712baaee437a4ea48fdf3d2d2e2bc5f0d81615374408ca320f3c7e3');
});

test('PG17 catalog invocation is digest-pinned read-only and never embeds credentials in argv', async () => {
  const {
    buildPg17CatalogInvocation, buildPg17DumpInvocation, buildPg17RestoreListInvocation, loadCaptureToolchain,
  } = await subject();
  const loadedToolchain = await loadCaptureToolchain(toolchainPath);
  assert.equal(loadedToolchain.lock.pg17.majorVersion, 17);
  const toolchain = loadedToolchain.trusted;
  const sqlPath = path.join(root, 'scripts/database-baseline/catalog-queries.sql');
  const connectionEnv = {
    PGHOST: 'db.synthetic.invalid', PGPORT: '5432', PGDATABASE: 'postgres',
    PGUSER: 'readonly', PGPASSWORD: 'fixture-password-never-in-argv', PGSSLMODE: 'require',
  };
  const invocation = buildPg17CatalogInvocation({
    toolchain, sqlPath, home: '/tmp/empty-capture-home', connectionEnv,
  });
  assert.equal(invocation.executable, '/usr/bin/docker');
  assert.ok(invocation.args.includes('postgres@sha256:0027bef26712baaee437a4ea48fdf3d2d2e2bc5f0d81615374408ca320f3c7e3'));
  assert.ok(invocation.args.includes('/usr/bin/psql'));
  assert.ok(invocation.args.includes('--read-only'));
  assert.ok(invocation.args.includes('--network=bridge'));
  assert.equal(invocation.args.filter((value) => value === '--pull=never').length, 1);
  assert.ok(invocation.args.includes('-i'));
  assert.equal(invocation.args.some((value) => value === '--mount' || value.startsWith('type=bind')), false);
  assert.equal(invocation.args.includes('--file'), false);
  assert.equal(invocation.stdin, 'pipe');
  assert.ok(invocation.args.includes('--env=PGPASSWORD'));
  assert.doesNotMatch(JSON.stringify(invocation.args), /fixture-password-never-in-argv/u);
  assert.equal(invocation.env.PGPASSWORD, connectionEnv.PGPASSWORD);
  assert.deepEqual(Object.keys(invocation.env).sort(), [
    'HOME', 'LANG', 'LC_ALL', 'PGDATABASE', 'PGHOST', 'PGOPTIONS', 'PGPASSWORD', 'PGPORT', 'PGSSLMODE', 'PGUSER',
  ]);
  const dump = buildPg17DumpInvocation({ toolchain, home: '/tmp/empty-capture-home', connectionEnv });
  assert.ok(dump.args.includes('/usr/bin/pg_dump'));
  assert.ok(dump.args.includes('--format=custom'));
  assert.ok(dump.args.includes('--schema-only'));
  assert.equal(dump.args.some((value) => value === '--file' || value === '-f' || value.startsWith('--file=')), false);
  assert.equal(dump.stdout, 'pipe');
  assert.equal(dump.args.filter((value) => value === '--pull=never').length, 1);
  assert.doesNotMatch(JSON.stringify(dump.args), /fixture-password-never-in-argv/u);
  const restoreList = buildPg17RestoreListInvocation({
    toolchain, archivePath: '/owned/capture-a.dump', home: '/tmp/empty-capture-home',
  });
  assert.ok(restoreList.args.includes('--list'));
  assert.equal(restoreList.args.at(-1), '--list');
  assert.equal(restoreList.args.includes('-'), false);
  assert.equal(restoreList.args.some((value) => value === '--mount' || value.startsWith('type=bind')), false);
  assert.equal(restoreList.stdin, 'pipe');
  assert.equal(restoreList.args.filter((value) => value === '--pull=never').length, 1);
  assert.ok(restoreList.args.includes('--list'));
  assert.equal(Object.hasOwn(restoreList.env, 'PGPASSWORD'), false);
  assert.throws(() => buildPg17CatalogInvocation({
    toolchain: structuredClone(toolchain), sqlPath, home: '/tmp/empty-capture-home', connectionEnv,
  }), /trusted toolchain/iu);
});

test('capture CLI is exact and secure candidate workspace publishes canonical identity handoff', async () => {
  const { initializeCandidateWorkspace, parseCaptureCli } = await subject();
  const args = [
    '--project-ref', 'abcdefghijklmnopqrst', '--captures', '2',
    '--output-candidate-root', '.hermes/tmp', '--handoff', '.hermes/tmp/baseline-capture-handoff.json',
  ];
  assert.deepEqual(parseCaptureCli(args), {
    projectRef: 'abcdefghijklmnopqrst', captures: 2,
    candidateRoot: '.hermes/tmp', handoffPath: '.hermes/tmp/baseline-capture-handoff.json',
  });
  for (const invalid of [
    [...args.slice(0, 3), '1', ...args.slice(4)],
    [...args, '--extra', 'x'],
    args.map((value) => value === 'abcdefghijklmnopqrst' ? 'unsafe/ref' : value),
  ]) assert.throws(() => parseCaptureCli(invalid), /Usage|capture|project/iu);

  const parent = await mkdtemp(path.join(os.tmpdir(), 'midao-candidate-root-'));
  const handoffPath = path.join(parent, 'baseline-capture-handoff.json');
  try {
    await chmod(parent, 0o700);
    const workspace = await initializeCandidateWorkspace({
      candidateRoot: parent,
      handoffPath,
      randomBytes: (size) => Buffer.alloc(size, 0xab),
    });
    assert.equal(workspace.candidatePath, path.join(parent, `candidate-${'ab'.repeat(16)}`));
    const directoryStat = await lstat(workspace.candidatePath, { bigint: true });
    const handoffStat = await lstat(handoffPath, { bigint: true });
    assert.equal(Number(directoryStat.mode & 0o777n), 0o700);
    assert.equal(Number(handoffStat.mode & 0o777n), 0o600);
    assert.equal(handoffStat.nlink, 1n);
    assert.deepEqual(JSON.parse(await readFile(handoffPath, 'utf8')), {
      schemaVersion: 1,
      candidatePath: workspace.candidatePath,
      candidateIdentity: { dev: String(directoryStat.dev), ino: String(directoryStat.ino), uid: Number(directoryStat.uid), mode: '0700' },
    });
    await assert.rejects(initializeCandidateWorkspace({
      candidateRoot: parent, handoffPath, randomBytes: (size) => Buffer.alloc(size, 0xcd),
    }), /handoff|exist|exclusive/iu);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('capture CLI securely bootstraps an absent candidate root and refuses symlink or permissive roots', async () => {
  const { ensureCandidateRoot } = await subject();
  const parent = await mkdtemp(path.join(os.tmpdir(), 'midao-candidate-bootstrap-'));
  try {
    await chmod(parent, 0o700);
    const candidateRoot = path.join(parent, '.hermes', 'tmp');
    const inheritedUmask = process.umask(0o777);
    let bootstrap;
    try {
      bootstrap = ensureCandidateRoot(candidateRoot);
      assert.equal(process.umask(inheritedUmask), 0o777);
    } catch (error) {
      process.umask(inheritedUmask);
      throw error;
    }
    const root = await bootstrap;
    assert.equal(root.path, candidateRoot);
    assert.equal(Number((await lstat(path.join(parent, '.hermes'), { bigint: true })).mode & 0o777n), 0o700);
    assert.equal(Number((await lstat(candidateRoot, { bigint: true })).mode & 0o777n), 0o700);
    await ensureCandidateRoot(candidateRoot);
    await chmod(candidateRoot, 0o755);
    await assert.rejects(ensureCandidateRoot(candidateRoot), /candidate root|mode|identity/iu);

    const hostile = path.join(parent, 'hostile');
    const outside = path.join(parent, 'outside');
    await mkdir(hostile, { mode: 0o700 });
    await mkdir(outside, { mode: 0o700 });
    await symlink(outside, path.join(hostile, '.hermes'));
    await assert.rejects(ensureCandidateRoot(path.join(hostile, '.hermes', 'tmp')), /symlink|candidate root|identity/iu);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('A/B capture workflow leaves reviewable raw candidates but no credential bytes and requires normalized equality', async () => {
  const { runProductionCaptureCandidate } = await subject();
  const parent = await mkdtemp(path.join(os.tmpdir(), 'midao-capture-workflow-'));
  const candidateRoot = path.join(parent, 'root');
  const handoffPath = path.join(candidateRoot, 'baseline-capture-handoff.json');
  await mkdir(candidateRoot, { mode: 0o700 });
  await chmod(candidateRoot, 0o700);
  const dryRun = await fixture('workflow-password-never-on-disk');
  let workflowDryRunStderr;
  const catalogFixture = JSON.parse(await readFile(catalogFixturePath, 'utf8'));
  catalogFixture.sections.routines[0].definition = 'CREATE FUNCTION public.example() RETURNS void LANGUAGE sql AS $$ SELECT $$;';
  const catalogText = JSON.stringify(catalogFixture);
  const tocBytes = await readFile(tocFixturePath);
  const fixedSqlBytes = await readFile(path.join(root, 'scripts/database-baseline/catalog-queries.sql'));
  let dumps = 0;
  const calls = [];
  const restoreInputs = [];
  let privateCli;
  let privateWorkdir;
  let loadedDbPassword;
  let preparedRuntime = false;
  try {
    const result = await runProductionCaptureCandidate({
      projectRef: 'pyoderxmpeyqjwkeliiu', captures: 2, candidateRoot, handoffPath,
      verifyProjectRef: async () => true,
      verifyRuntime: async (lock) => assert.equal(lock.pg17.majorVersion, 17),
      prepareRuntime: async ({ lock, projectRef, home }) => {
        assert.equal(lock.cli.version, '2.87.2');
        assert.equal(projectRef, 'pyoderxmpeyqjwkeliiu');
        assert.equal(path.isAbsolute(home), true);
        privateCli = path.join(home, 'supabase');
        privateWorkdir = path.join(home, 'workdir');
        preparedRuntime = true;
        return { cliPath: privateCli, workdir: privateWorkdir };
      },
      loadDbPassword: () => {
        loadedDbPassword = Buffer.from('synthetic-workflow-db-password');
        return loadedDbPassword;
      },
      loadAccessToken: async () => { throw new Error('token loader must not run when DB password exists'); },
      randomBytes: () => Buffer.alloc(16, 0x4c),
      runChild: async (invocation, options = {}) => {
        calls.push(invocation);
        if (invocation.executable === '/root/.hermes/toolchains/supabase/2.87.2/supabase') {
          throw new Error('fixed CLI pathname must not be spawned after verification');
        }
        if (invocation.executable === privateCli) {
          assert.deepEqual(invocation.args.slice(-2), ['--workdir', privateWorkdir]);
          assert.equal(invocation.env.SUPABASE_DB_PASSWORD, 'synthetic-workflow-db-password');
          assert.equal('SUPABASE_ACCESS_TOKEN' in invocation.env, false);
          assert.doesNotMatch(JSON.stringify(invocation.args), /synthetic-workflow-db-password/u);
          workflowDryRunStderr = Buffer.from(
            `Using workdir ${privateWorkdir}\nDRY RUN: *only* printing the pg_dump script to console.\nDumping schemas from remote database...\n`,
          );
          return { code: 0, signal: null, stdout: Buffer.from(dryRun), stderr: workflowDryRunStderr };
        }
        if (invocation.args.includes('/usr/bin/pg_dump')) {
          dumps += 1;
          return { code: 0, signal: null, stdout: Buffer.from(`PGDMP-fixture-${dumps}`), stderr: Buffer.alloc(0) };
        }
        if (invocation.args.includes('/usr/bin/psql')) {
          assert.deepEqual(options.stdinBuffer, fixedSqlBytes);
          return { code: 0, signal: null, stdout: Buffer.from(`${catalogText.trim()}\n`), stderr: Buffer.alloc(0) };
        }
        if (invocation.args.includes('/usr/bin/pg_restore') && invocation.args.includes('--list')) {
          restoreInputs.push(options.stdinBuffer.toString('utf8'));
          return { code: 0, signal: null, stdout: Buffer.from(tocBytes), stderr: Buffer.alloc(0) };
        }
        throw new Error('unexpected child invocation');
      },
    });
    assert.equal(result.captureCount, 2);
    assert.equal(preparedRuntime, true);
    assert.equal(loadedDbPassword.every((byte) => byte === 0), true);
    assert.equal(workflowDryRunStderr.every((byte) => byte === 0), true);
    const names = (await readdir(result.candidatePath)).sort();
    for (const name of [
      'capture-a.dump', 'capture-b.dump', 'catalog-a.raw.json', 'catalog-b.raw.json',
      'catalog-a.normalized.json', 'catalog-b.normalized.json', 'toc-a.txt', 'toc-b.txt',
      'toc-a.normalized.json', 'toc-b.normalized.json', 'ownership-validation-input.json',
    ]) assert.ok(names.includes(name), `candidate missing ${name}`);
    assert.deepEqual(await readFile(path.join(result.candidatePath, 'catalog-a.normalized.json')),
      await readFile(path.join(result.candidatePath, 'catalog-b.normalized.json')));
    assert.deepEqual(await readFile(path.join(result.candidatePath, 'toc-a.normalized.json')),
      await readFile(path.join(result.candidatePath, 'toc-b.normalized.json')));
    const ownershipInput = JSON.parse(await readFile(path.join(result.candidatePath, 'ownership-validation-input.json'), 'utf8'));
    assert.equal(ownershipInput.templateOnly, true);
    assert.equal(ownershipInput.ownershipBoundary.status, 'template');
    assert.deepEqual(ownershipInput.catalog.sections.schemas[0].canonicalKey, ['schema', 'public']);
    for (const name of names.filter((entry) => !entry.endsWith('.dump'))) {
      assert.doesNotMatch(await readFile(path.join(result.candidatePath, name), 'utf8'), /workflow-password-never-on-disk/u);
    }
    assert.equal(calls.length, 7, 'one dry-run plus dump/catalog/TOC for two captures');
    assert.deepEqual(restoreInputs, ['PGDMP-fixture-1', 'PGDMP-fixture-2']);
  } finally {
    dryRun.fill(0);
    await rm(parent, { recursive: true, force: true });
  }
});

test('dry-run stderr mismatch wipes DB password and child streams before workflow cleanup', async () => {
  const { runProductionCaptureCandidate } = await subject();
  const parent = await mkdtemp(path.join(os.tmpdir(), 'midao-capture-dryrun-failure-'));
  const candidateRoot = path.join(parent, 'root');
  const handoffPath = path.join(candidateRoot, 'baseline-capture-handoff.json');
  await mkdir(candidateRoot, { mode: 0o700 });
  await chmod(candidateRoot, 0o700);
  const password = Buffer.from('synthetic-failure-db-password');
  const stdout = Buffer.from(await fixture('synthetic-failure-db-password'));
  const stderr = Buffer.from('DRY RUN: *only* printing the pg_dump script to console.\nDumping schemas from remote database...\nextra\n');
  try {
    await assert.rejects(runProductionCaptureCandidate({
      projectRef: 'pyoderxmpeyqjwkeliiu', captures: 2, candidateRoot, handoffPath,
      verifyProjectRef: async () => true,
      verifyRuntime: async () => true,
      prepareRuntime: async ({ home }) => ({ cliPath: path.join(home, 'supabase'), workdir: path.join(home, 'workdir') }),
      loadDbPassword: () => password,
      loadAccessToken: async () => { throw new Error('token loader must not run'); },
      randomBytes: () => Buffer.alloc(16, 0x5d),
      runChild: async () => ({ code: 0, signal: null, stdout, stderr }),
    }), /Supabase dry-run emitted unexpected stderr/iu);
    assert.equal(password.every((byte) => byte === 0), true);
    assert.equal(stdout.every((byte) => byte === 0), true);
    assert.equal(stderr.every((byte) => byte === 0), true);
    assert.equal(existsSync(handoffPath), false);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('private pinned CLI update cache is generated from the lock version instead of mutable linked metadata', async () => {
  const { pinnedCliLatestBytes } = await subject();
  const locked = { cli: { version: '2.87.2' } };
  const first = pinnedCliLatestBytes(locked);
  assert.equal(first.toString('utf8'), 'v2.87.2');
  first.fill(0);
  assert.equal(pinnedCliLatestBytes(locked).toString('utf8'), 'v2.87.2');
  assert.throws(() => pinnedCliLatestBytes({ cli: { version: '9.9.9' } }), /locked Supabase CLI version mismatch/u);
  const source = await readFile(capturePath, 'utf8');
  assert.match(source, /writePrivateFile\(path\.join\(tempDir, 'cli-latest'\), cliLatest, 0o600\)/u);
  assert.match(source, /constants\.O_RDWR[\s\S]{0,900}matchesIdentity\(pathStat, fsIdentity\(stat\)\)[\s\S]{0,900}readback\.equals\(bytes\)/u);
  assert.doesNotMatch(source, /LINKED_METADATA_FILES[\s\S]{0,120}'cli-latest'/u);
});

test('child stage wrapper reports a fixed label without retaining hostile child error bytes', async () => {
  const { runSuccessfulChild } = await subject();
  const secretLike = 'postgresql://operator:credential@example.invalid/database';
  await assert.rejects(
    runSuccessfulChild(async () => { throw new Error(secretLike); }, {}, {}, 'Supabase dry-run'),
    (error) => {
      assert.equal(error.message, 'Supabase dry-run failed');
      assert.doesNotMatch(JSON.stringify(error), /credential|postgresql/iu);
      assert.equal(error.cause, undefined);
      return true;
    },
  );
  for (const [inner, outer] of [
    ['bounded child exited unsuccessfully', 'Supabase dry-run exited unsuccessfully'],
    ['bounded child timeout', 'Supabase dry-run timed out'],
    ['bounded child output limit exceeded', 'Supabase dry-run exceeded output limit'],
    ['Supabase dry-run child emitted unexpected stderr', 'Supabase dry-run emitted unexpected stderr'],
  ]) {
    await assert.rejects(runSuccessfulChild(async () => { throw new Error(inner); }, {}, {}, 'Supabase dry-run'),
      (error) => error.message === outer && error.cause === undefined);
  }
});

test('Supabase dry-run accepts only exact pinned stderr bytes and wipes accepted or rejected streams', async () => {
  const { runSuccessfulChild } = await subject();
  const workdir = '/owned/private/workdir';
  const expected = Buffer.from(`Using workdir ${workdir}\nDRY RUN: *only* printing the pg_dump script to console.\nDumping schemas from remote database...\n`);
  const successStderr = Buffer.from(expected);
  const successStdout = Buffer.from('dry-run-script');
  const returned = await runSuccessfulChild(
    async () => ({ code: 0, signal: null, stdout: successStdout, stderr: successStderr }), {}, {}, 'Supabase dry-run', expected,
  );
  assert.equal(returned, successStdout);
  assert.equal(successStderr.every((byte) => byte === 0), true);
  returned.fill(0);

  for (const mutation of [
    expected.subarray(0, expected.length - 1 - 'Dumping schemas from remote database...\n'.length),
    Buffer.concat([expected, Buffer.from('extra\n')]),
    Buffer.from(expected.toString('utf8').replace(workdir, '/owned/foreign/workdir')),
    Buffer.from(expected.toString('utf8').replaceAll('\n', '\r\n')),
  ]) {
    const stderr = Buffer.from(mutation);
    const stdout = Buffer.from('secret-output');
    await assert.rejects(
      runSuccessfulChild(async () => ({ code: 0, signal: null, stdout, stderr }), {}, {}, 'Supabase dry-run', expected),
      /emitted unexpected stderr/iu,
    );
    assert.equal(stderr.every((byte) => byte === 0), true);
    assert.equal(stdout.every((byte) => byte === 0), true);
  }
});

test('bounded child runner preserves exact streams but never leaks overflow output and escalates timeout TERM to KILL', async () => {
  const { runBoundedChild } = await subject();
  const base = { executable: process.execPath, env: { LANG: 'C', LC_ALL: 'C' }, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' };
  const success = await runBoundedChild({ ...base, args: ['-e', 'process.stdout.write("out"); process.stderr.write("notice")'] }, { maxBytes: 64, timeoutMs: 1_000, killAfterMs: 50 });
  assert.deepEqual({ code: success.code, signal: success.signal, stdout: success.stdout.toString(), stderr: success.stderr.toString() }, { code: 0, signal: null, stdout: 'out', stderr: 'notice' });

  const input = Buffer.from('stdin-transport-sentinel');
  const piped = await runBoundedChild({
    ...base,
    args: ['-e', 'const chunks=[];process.stdin.on("data",c=>chunks.push(c));process.stdin.on("end",()=>process.stdout.write(Buffer.concat(chunks)))'],
    stdin: 'pipe',
  }, { stdinBuffer: input, maxBytes: 128, timeoutMs: 1_000, killAfterMs: 50 });
  assert.deepEqual(piped.stdout, input);
  piped.stdout.fill(0);
  piped.stderr.fill(0);
  await assert.rejects(
    runBoundedChild({ ...base, args: ['-e', 'process.stdin.destroy();process.exit(0)'], stdin: 'pipe' }, {
      stdinBuffer: Buffer.alloc(1024 * 1024, 0x73), maxBytes: 64, timeoutMs: 1_000, killAfterMs: 50,
    }),
    (error) => /stdin|exited/iu.test(String(error?.message)) && !String(error?.message).includes('ssss'),
  );

  const secret = 'split-secret-value';
  await assert.rejects(
    runBoundedChild({ ...base, args: ['-e', `process.stdout.write(${JSON.stringify(secret)}); process.stdout.write("-overflow")`] }, { maxBytes: 8, timeoutMs: 1_000, killAfterMs: 50 }),
    (error) => !String(error?.message).includes(secret) && /bounded|limit/iu.test(String(error?.message)),
  );
  const started = Date.now();
  await assert.rejects(
    runBoundedChild({ ...base, args: ['-e', 'process.on("SIGTERM",()=>{}); setInterval(()=>{},1000)'] }, { maxBytes: 64, timeoutMs: 30, killAfterMs: 30 }),
    /timeout/iu,
  );
  assert.ok(Date.now() - started < 1_000, 'timeout escalation must be bounded');

  const containerName = `midao-baseline-${'ab'.repeat(16)}`;
  const owned = { ...base, containerName, args: ['-e', '', '--', `--name=${containerName}`] };
  const cleanupCalls = [];
  const ownedSuccess = await runBoundedChild(owned, {
    maxBytes: 64, timeoutMs: 1_000, killAfterMs: 50,
    cleanupContainer: async (invocation) => { cleanupCalls.push(invocation.containerName); },
  });
  assert.deepEqual(cleanupCalls, [containerName]);
  ownedSuccess.stdout.fill(0); ownedSuccess.stderr.fill(0);
  await assert.rejects(runBoundedChild(owned, {
    maxBytes: 64, timeoutMs: 1_000, killAfterMs: 50,
    cleanupContainer: async () => { throw new Error('simulated cleanup failure'); },
  }), /orphan cleanup/iu);
  cleanupCalls.length = 0;
  await assert.rejects(runBoundedChild({
    ...owned,
    args: ['-e', 'process.on("SIGTERM",()=>{}); setInterval(()=>{},1000)', '--', `--name=${containerName}`],
  }, {
    maxBytes: 64, timeoutMs: 30, killAfterMs: 30,
    cleanupContainer: async (invocation) => { cleanupCalls.push(invocation.containerName); },
  }), /timeout/iu);
  assert.deepEqual(cleanupCalls, [containerName]);
});

test('PG17 TOC parser produces exact structured entries and rejects data or malformed identities', async () => {
  assert.ok(existsSync(rendererPath), 'render-baseline-from-archive.mjs missing');
  const { parsePg17Toc } = await import(`${pathToFileURL(rendererPath).href}?t=${Date.now()}`);
  const bytes = await readFile(tocFixturePath);
  const entries = parsePg17Toc(bytes);
  assert.deepEqual(entries.map(({ tocId, descriptor, schema, identity, owner }) => ({ tocId, descriptor, schema, identity, owner })), [
    { tocId: 10, descriptor: 'SCHEMA', schema: '-', identity: 'public', owner: 'postgres' },
    { tocId: 11, descriptor: 'TABLE', schema: 'public', identity: 'widgets', owner: 'postgres' },
    { tocId: 12, descriptor: 'CONSTRAINT', schema: 'public', identity: 'widgets widgets_pkey', owner: 'postgres' },
    { tocId: 13, descriptor: 'TRIGGER', schema: 'public', identity: 'widgets widgets_touch', owner: 'postgres' },
    { tocId: 14, descriptor: 'POLICY', schema: 'public', identity: 'widgets widgets_select', owner: 'postgres' },
    { tocId: 15, descriptor: 'ACL', schema: 'public', identity: 'TABLE widgets', owner: 'postgres' },
  ]);
  const pg17MetadataShapes = parsePg17Toc(Buffer.from([
    '20; 3079 1 EXTENSION - pg_example ',
    '21; 0 0 COMMENT - EXTENSION pg_example ',
    '22; 2606 2 CHECK CONSTRAINT public widgets widgets_check postgres',
    '23; 2604 3 DEFAULT public widgets created_at postgres',
    '',
  ].join('\n')));
  assert.deepEqual(pg17MetadataShapes.map(({ descriptor, schema, identity, owner }) => ({ descriptor, schema, identity, owner })), [
    { descriptor: 'EXTENSION', schema: '-', identity: 'pg_example', owner: null },
    { descriptor: 'COMMENT', schema: '-', identity: 'EXTENSION pg_example', owner: null },
    { descriptor: 'CHECK CONSTRAINT', schema: 'public', identity: 'widgets widgets_check', owner: 'postgres' },
    { descriptor: 'DEFAULT', schema: 'public', identity: 'widgets created_at', owner: 'postgres' },
  ]);
  assert.throws(() => parsePg17Toc(Buffer.from('24; 1259 4 TABLE public widgets \n')), /identity (?:shape|missing)|owner/iu);
  for (const mutation of [
    bytes.toString('utf8').replace('11; 1259', '10; 1259'),
    `${bytes.toString('utf8')}16; 0 0 TABLE DATA public widgets postgres\n`,
    bytes.toString('utf8').replace('SCHEMA', 'UNKNOWN THING'),
    bytes.toString('utf8').replace('10;', '9007199254740992;'),
    bytes.toString('utf8').replace('\n', '\r\n'),
  ]) assert.throws(() => parsePg17Toc(Buffer.from(mutation)), /TOC|descriptor|data|duplicate|safe integer|LF/iu);
});

test('TOC use-list selection is exact and ownership domains derive one render destination', async () => {
  const { buildSelectedUseList, deriveTocDestinations } = await import(`${pathToFileURL(rendererPath).href}?t=${Date.now()}`);
  const bytes = await readFile(tocFixturePath);
  assert.equal(
    buildSelectedUseList(bytes, [14, 11]).toString('utf8'),
    '11; 1259 100 TABLE public widgets postgres\n14; 3256 103 POLICY public widgets widgets_select postgres\n',
  );
  assert.throws(() => buildSelectedUseList(bytes, [11, 11]), /duplicate.*TOC|TOC.*duplicate/iu);
  assert.throws(() => buildSelectedUseList(bytes, [999]), /unknown.*TOC|TOC.*unknown/iu);

  const map = {
    expectedTocIds: [11, 12, 14],
    entries: [
      { tocId: 11, objectKey: ['relation', 'public', 'widgets'], ownerDomain: 'application' },
      { tocId: 12, objectKey: ['constraint', 'public', 'widgets', 'widgets_pkey'], ownerDomain: 'extension' },
      { tocId: 14, objectKey: ['policy', 'public', 'widgets', 'widgets_select'], ownerDomain: 'application_overlay' },
    ],
  };
  assert.deepEqual(deriveTocDestinations(map), {
    11: 'baseline.sql', 12: 'baseline.sql', 14: 'managed-overlays.sql',
  });
  const forbidden = structuredClone(map);
  forbidden.entries[0].ownerDomain = 'platform';
  assert.throws(() => deriveTocDestinations(forbidden), /platform.*selected|selected.*platform/iu);
});

test('restrict-key renderer uses only the locked PG17 container and preserves arbitrary SQL bytes', async () => {
  assert.ok(existsSync(rendererPath), 'render-baseline-from-archive.mjs missing');
  const { generateRestrictKey, stripExactRestrictEnvelope } = await import(`${pathToFileURL(rendererPath).href}?t=${Date.now()}`);
  const { buildPg17RenderInvocation, loadCaptureToolchain } = await subject();
  const loadedToolchain = await loadCaptureToolchain(toolchainPath);
  let calls = 0;
  const key = generateRestrictKey({ randomBytes: (size) => { calls += 1; assert.equal(size, 32); return Buffer.alloc(32, 0xab); } });
  assert.equal(calls, 1);
  assert.equal(key, 'ab'.repeat(32));
  const shortEntropy = Buffer.alloc(31, 0x5a);
  assert.throws(() => generateRestrictKey({ randomBytes: () => shortEntropy }), /random bytes invalid/iu);
  assert.equal(shortEntropy.every((value) => value === 0), true);
  const invocation = buildPg17RenderInvocation({
    toolchain: loadedToolchain.trusted,
    useList: Buffer.from('11; synthetic\n'),
    home: '/tmp/empty-capture-home', restrictKey: key,
  });
  assert.equal(invocation.executable, '/usr/bin/docker');
  assert.ok(invocation.args.includes('--network=none'));
  assert.equal(invocation.args.filter((value) => value === '--pull=never').length, 1);
  assert.ok(invocation.args.includes('--read-only'));
  assert.ok(invocation.args.includes('--cap-drop=ALL'));
  assert.ok(invocation.args.includes('--security-opt=no-new-privileges'));
  assert.ok(invocation.args.includes('postgres@sha256:0027bef26712baaee437a4ea48fdf3d2d2e2bc5f0d81615374408ca320f3c7e3'));
  assert.ok(invocation.args.includes('/bin/sh'));
  assert.equal(invocation.args.some((value) => value === '--mount' || value.startsWith('type=bind')), false);
  assert.equal(invocation.stdin, 'pipe');
  assert.equal(invocation.env.MIDAO_USE_LIST_B64, Buffer.from('11; synthetic\n').toString('base64'));
  assert.deepEqual(Object.keys(invocation.env).sort(), ['HOME', 'LANG', 'LC_ALL', 'MIDAO_USE_LIST_B64']);
  assert.throws(() => buildPg17RenderInvocation({ toolchain: loadedToolchain.trusted, useList: Buffer.alloc(64 * 1024 + 1, 0x61), home: '/tmp/empty-capture-home', restrictKey: key }), /use-list invalid/iu);
  const payload = Buffer.concat([Buffer.from('SELECT 1;\n-- internal \\restrict sample must remain\n'), Buffer.from([0xff, 0x00, 0xfe]), Buffer.from('\n')]);
  const framed = Buffer.concat([
    PG17_DUMP_HEADER, Buffer.from(`\\restrict ${key}\n`), payload,
    Buffer.from(`\\unrestrict ${key}\n\n`),
  ]);
  assert.deepEqual(stripExactRestrictEnvelope(framed, key), Buffer.concat([PG17_DUMP_HEADER, payload]));
  for (const invalid of [
    Buffer.concat([Buffer.from('x'), framed]),
    Buffer.from(framed.toString('latin1').replace(`\\unrestrict ${key}`, '\\unrestrict deadbeef'), 'latin1'),
    Buffer.from(framed.toString('latin1').replace(`\\restrict ${key}\n`, `\\restrict ${key}\r\n`), 'latin1'),
  ]) assert.throws(() => stripExactRestrictEnvelope(invalid, key), /restrict|framing/iu);
});

test('A/B render core compares normalized TOC, destination use-lists, combined SQL and per-entry digests', async () => {
  const { renderArchivePair } = await import(`${pathToFileURL(rendererPath).href}?t=${Date.now()}`);
  const toc = await readFile(tocFixturePath);
  const relation = ['relation', 'public', 'widgets'];
  const policy = ['policy', 'public', 'widgets', 'widgets_select'];
  const input = {
    tocBuffers: [Buffer.from(toc), Buffer.from(toc)],
    assignments: [
      { objectKey: relation, dependsOn: [] },
      { objectKey: policy, dependsOn: [relation] },
    ],
    tocOwnershipMap: {
      expectedTocIds: [11, 14],
      entries: [
        { tocId: 11, objectKey: relation, ownerDomain: 'application' },
        { tocId: 14, objectKey: policy, ownerDomain: 'application_overlay' },
      ],
    },
  };
  let randomCalls = 0;
  const calls = [];
  let activeRenders = 0;
  let maxActiveRenders = 0;
  const render = async ({ archiveIndex, destination, useList, restrictKey }) => {
    activeRenders += 1;
    maxActiveRenders = Math.max(maxActiveRenders, activeRenders);
    try {
      await new Promise((resolve) => setTimeout(resolve, 5));
      calls.push({ archiveIndex, destination, useList: useList.toString('utf8'), restrictKey });
      const payload = Buffer.from(`SQL:${destination}\n${useList.toString('utf8')}`);
      return Buffer.concat([
        PG17_DUMP_HEADER, Buffer.from(`\\restrict ${restrictKey}\n`), payload,
        Buffer.from(`\\unrestrict ${restrictKey}\n\n`),
      ]);
    } finally {
      activeRenders -= 1;
    }
  };
  const result = await renderArchivePair({
    ...input,
    randomBytes: (size) => { randomCalls += 1; assert.equal(size, 32); return Buffer.alloc(32, 0xcd); },
    render,
  });
  assert.equal(randomCalls, 1);
  assert.equal(calls.length, 8, 'two archives x two destinations plus two archives x two entries');
  assert.equal(maxActiveRenders > 1, true, 'rendering must use bounded concurrency');
  assert.equal(maxActiveRenders <= 8, true, 'render concurrency must remain bounded');
  assert.match(result.baselineSql.toString('utf8'), /11; 1259 100 TABLE/);
  assert.match(result.managedOverlaysSql.toString('utf8'), /14; 3256 103 POLICY/);
  assert.equal(result.useList.toString('utf8'), [
    '11; 1259 100 TABLE public widgets postgres',
    '14; 3256 103 POLICY public widgets widgets_select postgres',
    '',
  ].join('\n'));
  assert.equal(result.dependencyClosure.length, 2);
  for (const entry of result.dependencyClosure) {
    assert.match(entry.captureASha256, /^[0-9a-f]{64}$/u);
    assert.equal(entry.captureASha256, entry.captureBSha256);
  }

  await assert.rejects(
    renderArchivePair({
      ...input,
      randomBytes: () => Buffer.alloc(32, 0xef),
      render: async (context) => {
        const framed = await render(context);
        if (context.archiveIndex === 1 && context.destination === 'baseline.sql') {
          const trailer = Buffer.from(`\\unrestrict ${context.restrictKey}\n\n`);
          return Buffer.concat([framed.subarray(0, framed.length - trailer.length), Buffer.from('DRIFT\n'), trailer]);
        }
        return framed;
      },
    }),
    /A\/B.*render|render.*mismatch/iu,
  );
});

test('locked render adapter positionally reads FD-pinned archives into stdin and rejects path replacement', async () => {
  const { createLockedRenderAdapter, loadCaptureToolchain } = await subject();
  const parent = await mkdtemp(path.join(os.tmpdir(), 'midao-render-adapter-'));
  const archivePaths = [path.join(parent, 'a.dump'), path.join(parent, 'b.dump')];
  await chmod(parent, 0o700);
  await Promise.all(archivePaths.map((file, index) => writeFile(file, `archive-${index}\n`, { mode: 0o600, flag: 'wx' })));
  const loaded = await loadCaptureToolchain(toolchainPath);
  const key = 'ab'.repeat(32);
  const calls = [];
  let adapter;
  try {
    adapter = await createLockedRenderAdapter({
      toolchain: loaded.trusted,
      archivePaths,
      home: '/tmp/empty-capture-home',
      runChild: async (invocation, options) => {
        calls.push(invocation);
        assert.equal(invocation.args.some((value) => value === '--mount' || value.startsWith('type=bind')), false);
        assert.equal(options.stdinBuffer.toString('utf8'), 'archive-0\n');
        assert.equal(Buffer.from(invocation.env.MIDAO_USE_LIST_B64, 'base64').toString('utf8'), '11; synthetic\n');
        return {
          code: 0, signal: null, stderr: Buffer.alloc(0),
          stdout: Buffer.from(`\\restrict ${key}\nSELECT 1;\n\\unrestrict ${key}\n`),
        };
      },
    });
    const framed = await adapter.render({
      archiveIndex: 0, destination: 'baseline.sql', useList: Buffer.from('11; synthetic\n'), restrictKey: key,
    });
    assert.match(framed.toString('utf8'), /SELECT 1;/u);
    framed.fill(0);
    assert.equal(calls.length, 1);

    await rename(archivePaths[0], `${archivePaths[0]}.original`);
    await writeFile(archivePaths[0], 'foreign replacement\n', { mode: 0o600, flag: 'wx' });
    await assert.rejects(
      adapter.render({ archiveIndex: 0, destination: 'baseline.sql', useList: Buffer.from('11; synthetic\n'), restrictKey: key }),
      /archive.*identity|identity.*archive/iu,
    );
  } finally {
    if (adapter) await adapter.close();
    await rm(parent, { recursive: true, force: true });
  }
});

test('dependency closure expands object dependencies to every selected TOC ID deterministically and rejects cycles', async () => {
  assert.ok(existsSync(rendererPath), 'render-baseline-from-archive.mjs missing');
  const { computeDependencyClosure } = await import(`${pathToFileURL(rendererPath).href}?t=${Date.now()}`);
  const a = ['relation', 'public', 'a'];
  const b = ['relation', 'public', 'b'];
  const c = ['relation', 'public', 'c'];
  const assignments = [
    { objectKey: a, dependsOn: [b, c] },
    { objectKey: b, dependsOn: [c] },
    { objectKey: c, dependsOn: [] },
  ];
  const tocOwnershipMap = {
    expectedTocIds: [4, 1, 3, 2],
    entries: [
      { tocId: 1, objectKey: a }, { tocId: 2, objectKey: a },
      { tocId: 3, objectKey: b }, { tocId: 4, objectKey: c },
    ],
  };
  const destinations = { 1: 'baseline.sql', 2: 'baseline.sql', 3: 'baseline.sql', 4: 'baseline.sql' };
  const closure = computeDependencyClosure({ assignments, tocOwnershipMap, destinations });
  assert.deepEqual(closure.map(({ tocId, directDependencies, transitiveDependencies }) => ({ tocId, directDependencies, transitiveDependencies })), [
    { tocId: 1, directDependencies: [3, 4], transitiveDependencies: [3, 4] },
    { tocId: 2, directDependencies: [3, 4], transitiveDependencies: [3, 4] },
    { tocId: 3, directDependencies: [4], transitiveDependencies: [4] },
    { tocId: 4, directDependencies: [], transitiveDependencies: [] },
  ]);
  const cyclic = structuredClone(assignments);
  cyclic[2].dependsOn = [a];
  assert.throws(() => computeDependencyClosure({ assignments: cyclic, tocOwnershipMap, destinations }), /cycle/iu);

  const incompatibleDestinations = { ...destinations, 3: 'managed-overlays.sql' };
  assert.throws(
    () => computeDependencyClosure({ assignments, tocOwnershipMap, destinations: incompatibleDestinations }),
    /destination|baseline.*overlay|topolog/iu,
  );
});
