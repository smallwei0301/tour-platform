import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test, { after } from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const publisherPath = path.join(root, 'scripts/database-baseline/publish-baseline.mjs');
const verifierPath = path.join(root, 'scripts/database-baseline/verify-manifest.mjs');
const preparerPath = path.join(root, 'scripts/database-baseline/prepare-capture-publication.mjs');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) => `${JSON.stringify(value)}\n`;
const originalCwd = process.cwd();
const isolatedGitRoot = await mkdtemp(path.join(os.tmpdir(), 'midao-publisher-git-'));
const isolatedPrimary = path.join(isolatedGitRoot, 'primary');
const isolatedSecondary = path.join(isolatedGitRoot, 'secondary');
for (const args of [
  ['init', isolatedPrimary],
  ['-C', isolatedPrimary, '-c', 'user.name=Midao Test', '-c', 'user.email=midao-test@invalid.example', 'commit', '--allow-empty', '-m', 'test root'],
  ['-C', isolatedPrimary, 'worktree', 'add', isolatedSecondary, 'HEAD'],
]) {
  const result = spawnSync('/usr/bin/git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`isolated git setup failed: ${result.stderr}`);
}
process.chdir(isolatedPrimary);

let instrumentedModulePromise;
let instrumentedDirectory;

async function modules() {
  assert.ok(existsSync(publisherPath), 'publish-baseline.mjs missing');
  if (!instrumentedModulePromise) {
    instrumentedModulePromise = (async () => {
      instrumentedDirectory = await mkdtemp(path.join(os.tmpdir(), 'midao-publisher-test-module-'));
      let source = await readFile(publisherPath, 'utf8');
      source = source.replace(
        'async function publishPreparedCaptureTransaction(input, repositoryLockScope)',
        'export async function publishPreparedCaptureTransaction(input, repositoryLockScope)',
      );
      source = source.replace(
        'async function withRepositoryPublicationLock(callback)',
        'export async function withRepositoryPublicationLock(callback)',
      );
      source = source.replace(
        'async function recoverCapturePublication(input, repositoryLockScope)',
        'export async function recoverCapturePublication(input, repositoryLockScope)',
      );
      source = source.replace(/from '(\.\/[^']+)'/gu, (_match, relative) => {
        return `from '${pathToFileURL(path.resolve(path.dirname(publisherPath), relative)).href}'`;
      });
      if (!source.includes('export async function publishPreparedCaptureTransaction')
        || !source.includes('export async function withRepositoryPublicationLock')) {
        throw new Error('test instrumentation could not expose publisher internals');
      }
      const instrumentedPath = path.join(instrumentedDirectory, 'publish-baseline.instrumented.mjs');
      await writeFile(instrumentedPath, source, { mode: 0o600, flag: 'wx' });
      return import(pathToFileURL(instrumentedPath).href);
    })();
  }
  return Promise.all([instrumentedModulePromise, import(pathToFileURL(verifierPath).href)]);
}

after(async () => {
  process.chdir(originalCwd);
  if (instrumentedDirectory) await rm(instrumentedDirectory, { recursive: true, force: true });
  await rm(isolatedGitRoot, { recursive: true, force: true });
});

function buildKnownDriftCatalogFixture() {
  const acl = [];
  const rls = [];
  for (let index = 0; index < 59; index += 1) {
    const table = `table_${String(index).padStart(2, '0')}`;
    acl.push({
      canonicalKey: ['acl', 'relation', 'public', table, 'postgres', 'authenticated', 'UPDATE', false],
      objectType: 'relation', schema: 'public', object: table, grantor: 'postgres', grantee: 'authenticated',
      privilege: 'UPDATE', grantable: false, usesDefaultAcl: false,
    });
    rls.push({ canonicalKey: ['rls', 'public', table], schema: 'public', relation: table, enabled: true, forced: false });
  }
  const sectionNames = [
    'schemas', 'relations', 'sequences', 'columns', 'types', 'constraints', 'indexes', 'routines', 'triggers',
    'rls', 'policies', 'acl', 'owners', 'defaultPrivileges', 'extensions', 'extensionMemberships',
    'publicationMembership', 'managedSchemaInventory', 'managedSchemaOverlays',
  ];
  const sections = Object.fromEntries(sectionNames.map((name) => [name, []]));
  sections.acl = acl;
  sections.rls = rls;
  return Buffer.from(`${JSON.stringify({
    schemaVersion: 1, normalizerVersion: 1, extractorVersion: 1, serverMajorVersion: 17,
    ownershipOverlayStatus: 'pending', sections,
  }, null, 2)}\n`);
}

function buildReviewedPublicationFixture(catalog) {
  const catalogValue = JSON.parse(catalog.toString('utf8'));
  const assignments = [];
  const tocEntries = [];
  const tocLines = [];
  let tocId = 1;
  for (const [section, rows] of Object.entries(catalogValue.sections)) {
    for (const row of rows) {
      assignments.push({ objectKey: row.canonicalKey, section, ownerDomain: 'application', role: 'application-owner', dependsOn: [], rationale: 'publisher fixture assignment' });
      if (section === 'acl') {
        tocEntries.push({ tocId, objectKey: row.canonicalKey, ownerDomain: 'application' });
        tocLines.push(`${tocId}; 0 0 ACL public TABLE ${row.object} postgres`);
        tocId += 1;
      }
    }
  }
  const tocNormalized = tocLines.map((line) => {
    const match = /^(\d+); (\d+) (\d+) ACL public (.+) postgres$/u.exec(line);
    return { tocId: Number(match[1]), catalogOid: Number(match[2]), objectOid: Number(match[3]), descriptor: 'ACL', schema: 'public', identity: match[4], owner: 'postgres' };
  });
  const digest = '1'.repeat(64);
  return {
    reviewedOwnership: {
      templateOnly: false,
      ownershipBoundary: { schemaVersion: 1, status: 'reviewed', assignments },
      roleMap: { schemaVersion: 1, roles: [{ name: 'application-owner', ownerDomain: 'application' }] },
      exclusions: { schemaVersion: 1, entries: [] },
      platformPrerequisites: { schemaVersion: 1, objects: [] },
      tocOwnershipMap: { schemaVersion: 1, expectedTocIds: tocEntries.map((entry) => entry.tocId), entries: tocEntries },
    },
    renderResult: {
      baselineSql: Buffer.from('CREATE SCHEMA IF NOT EXISTS public;\n'),
      managedOverlaysSql: Buffer.alloc(0),
      tocNormalized: Buffer.from(canonical(tocNormalized)),
      useList: Buffer.from(`${tocLines.join('\n')}\n`),
      dependencyClosure: tocEntries.map((entry) => ({ tocId: entry.tocId, objectKey: entry.objectKey, destination: 'baseline.sql', directDependencies: [], transitiveDependencies: [], captureASha256: digest, captureBSha256: digest })),
    },
  };
}

async function setup() {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'midao-publish-'));
  await chmod(parent, 0o700);
  const candidateDir = path.join(parent, 'candidate');
  const baselineDir = path.join(parent, 'baseline');
  const docsDir = path.join(parent, 'docs');
  const stateDir = path.join(parent, 'state');
  for (const directory of [candidateDir, baselineDir, docsDir, stateDir]) await mkdir(directory, { mode: 0o700 });
  const { CAPTURE_PAYLOAD_PATHS } = await import(`${pathToFileURL(verifierPath).href}?t=${Date.now()}`);
  const { composeCapturePublicationPayloads } = await import(`${pathToFileURL(preparerPath).href}?t=${Date.now()}`);
  const catalog = buildKnownDriftCatalogFixture();
  const prepared = composeCapturePublicationPayloads({
    catalogBuffers: [catalog, Buffer.from(catalog)],
    ...buildReviewedPublicationFixture(catalog),
    randomBytes: (size) => Buffer.alloc(size, 0x99),
  });
  for (const relative of CAPTURE_PAYLOAD_PATHS) {
    await writeFile(path.join(candidateDir, relative), prepared.payloads.get(relative), { mode: 0o600, flag: 'wx' });
  }
  const manifest = structuredClone(prepared.manifest);
  prepared.wipe();
  catalog.fill(0);
  return {
    parent, candidateDir, baselineDir,
    ledgerPath: path.join(docsDir, 'baseline-ledger.json'),
    journalPath: path.join(stateDir, 'publication.journal.json'),
    lockPath: path.join(stateDir, 'publication.lock'),
    manifest,
  };
}

test('normalized TOC verifier permits null owner only for PG17 ownerless descriptors', async () => {
  const { validateNormalizedToc } = await import(`${pathToFileURL(verifierPath).href}?ownerless=${Date.now()}`);
  const base = { catalogOid: 3079, objectOid: 16393, schema: '-', identity: 'pg_stat_statements' };
  assert.deepEqual([...validateNormalizedToc([
    { ...base, tocId: 2, descriptor: 'EXTENSION', owner: null },
    { ...base, tocId: 3, catalogOid: 0, objectOid: 0, descriptor: 'COMMENT', identity: 'EXTENSION pg_stat_statements', owner: null },
  ])], [2, 3]);
  for (const entry of [
    { ...base, tocId: 4, descriptor: 'SCHEMA', owner: null },
    { ...base, tocId: 5, descriptor: 'TABLE', schema: 'public', owner: null },
    { ...base, tocId: 6, descriptor: 'EXTENSION', owner: '' },
  ]) assert.throws(() => validateNormalizedToc([entry]), /normalized TOC entry invalid/iu);
});

test('publication SQL scanner permits CR only inside dollar-quoted routine bodies', async () => {
  const { validatePublicationSqlPayloads } = await import(`${pathToFileURL(preparerPath).href}?cr=${Date.now()}`);
  const overlay = Buffer.alloc(0);
  const valid = Buffer.from('CREATE FUNCTION public.synthetic() RETURNS void AS $$\r\nBEGIN\r\n  RETURN;\r\nEND\r\n$$ LANGUAGE plpgsql;\n');
  assert.equal(validatePublicationSqlPayloads(new Map([['baseline.sql', valid], ['managed-overlays.sql', overlay]])), true);
  for (const hostile of [
    'SELECT 1;\r\n',
    '-- comment\r\nSELECT 1;\n',
    "SELECT 'literal\rvalue';\n",
    'CREATE TABLE "bad\rname" (id integer);\n',
  ]) {
    assert.throws(
      () => validatePublicationSqlPayloads(new Map([['baseline.sql', Buffer.from(hostile)], ['managed-overlays.sql', overlay]])),
      /framing/iu,
    );
  }
});

test('production publisher module does not export prepared engine, recovery, or callback lock scope', async () => {
  const source = await readFile(publisherPath, 'utf8');
  assert.doesNotMatch(source, /export\s+async\s+function\s+(?:publishPreparedCaptureTransaction|recoverCapturePublication|withRepositoryPublicationLock)/u);
  const production = await import(`${pathToFileURL(publisherPath).href}?surface=${Date.now()}`);
  assert.equal(production.publishPreparedCaptureTransaction, undefined);
  assert.equal(production.recoverCapturePublication, undefined);
  assert.equal(production.withRepositoryPublicationLock, undefined);
});

test('publisher CLI accepts only the fixed handoff, baseline output and immutable capture ledger paths', async () => {
  const [{ parsePublishCli, resolveRepositoryPublicationPaths }] = await modules();
  const args = [
    '--candidate-handoff', '.hermes/tmp/baseline-capture-handoff.json',
    '--output', 'supabase/baselines/v1',
    '--ledger', 'docs/operations/baseline-ledger.json',
  ];
  assert.deepEqual(parsePublishCli(args), {
    handoffPath: '.hermes/tmp/baseline-capture-handoff.json',
    outputDir: 'supabase/baselines/v1',
    ledgerPath: 'docs/operations/baseline-ledger.json',
  });
  assert.throws(() => parsePublishCli([...args, '--extra', 'x']), /Usage/iu);
  assert.throws(() => parsePublishCli(args.map((value) => value === 'supabase/baselines/v1' ? '/tmp/elsewhere' : value)), /Usage/iu);
  const statePaths = resolveRepositoryPublicationPaths();
  assert.equal(path.dirname(statePaths.lockPath), path.dirname(statePaths.journalPath));
  assert.doesNotMatch(statePaths.lockPath, /\/worktrees\//u);
  assert.match(statePaths.lockPath, /\/\.git\/midao-baseline-publication\.lock$/u);
});

test('repo-common directory inode lock excludes concurrent worktree publishers despite lock-path replacement', async () => {
  const [{ resolveRepositoryPublicationPaths, withRepositoryPublicationLock }] = await modules();
  const paths = resolveRepositoryPublicationPaths();
  assert.equal(existsSync(path.join(isolatedPrimary, '3')), false, 'test requires no pre-existing cwd path "3"');
  let enteredResolve;
  let releaseResolve;
  const entered = new Promise((resolve) => { enteredResolve = resolve; });
  const release = new Promise((resolve) => { releaseResolve = resolve; });
  const first = withRepositoryPublicationLock(async (scope) => {
    assert.deepEqual(scope, paths);
    enteredResolve();
    await release;
    return 'locked-result';
  });
  await entered;
  await writeFile(paths.lockPath, 'foreign lock path one\n', { mode: 0o600, flag: 'wx' });
  await rm(paths.lockPath);
  await writeFile(paths.lockPath, 'foreign lock path two\n', { mode: 0o600, flag: 'wx' });
  assert.equal(existsSync(path.join(isolatedPrimary, '3')), false, 'acquire must not create cwd path "3"');
  const externalProbe = spawnSync('/usr/bin/flock', ['--exclusive', '--nonblock', path.dirname(paths.lockPath), '/bin/true'], {
    cwd: isolatedSecondary, stdio: 'ignore', timeout: 5000,
  });
  assert.equal(externalProbe.status, 1, 'external process must observe the repo-common directory inode as locked');
  await assert.rejects(withRepositoryPublicationLock(async () => 'should-not-run'), /lock is active/iu);
  releaseResolve();
  assert.equal(await first, 'locked-result');
  assert.equal(await readFile(paths.lockPath, 'utf8'), 'foreign lock path two\n', 'non-authority lock pathname must remain untouched');
  await rm(paths.lockPath);
  assert.equal(existsSync(path.join(isolatedPrimary, '3')), false, 'flock must use inherited FD, not create cwd path "3"');
});

test('two simultaneous reclaimers cannot both enter after observing retained stale lock metadata', async () => {
  const [{ resolveRepositoryPublicationPaths, withRepositoryPublicationLock }] = await modules();
  const paths = resolveRepositoryPublicationPaths();
  await writeFile(paths.lockPath, 'stale metadata that is not authority\n', { mode: 0o600 });
  let entered = 0;
  let enteredResolve;
  const firstEntered = new Promise((resolve) => { enteredResolve = resolve; });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = withRepositoryPublicationLock(async () => {
    entered += 1;
    enteredResolve();
    await gate;
    return 'winner';
  });
  await firstEntered;
  const second = withRepositoryPublicationLock(async () => {
    entered += 1;
    return 'loser';
  });
  await assert.rejects(second, /lock is active/iu);
  assert.equal(entered, 1);
  release();
  assert.equal(await first, 'winner');
  assert.equal(existsSync(paths.lockPath), true);
  await rm(paths.lockPath);
});

test('prepared transaction reuses the opaque repo-common lock through every promotion and outer scope releases it last', async () => {
  const [{ publishPreparedCaptureTransaction, withRepositoryPublicationLock }] = await modules();
  const fx = await setup();
  try {
    const result = await withRepositoryPublicationLock(async (scope) => publishPreparedCaptureTransaction({
      ...fx,
      journalPath: scope.journalPath,
      lockPath: scope.lockPath,
      onOperation: () => assert.equal(existsSync(scope.lockPath), false),
    }, scope));
    assert.equal(result.transactionId, fx.manifest.transactionId);
    const [{ resolveRepositoryPublicationPaths }] = await modules();
    const paths = resolveRepositoryPublicationPaths();
    assert.equal(existsSync(paths.lockPath), false);
    assert.equal(existsSync(paths.journalPath), false);
  } finally {
    await rm(fx.parent, { recursive: true, force: true });
  }
});

test('public publisher rejects caller-prepared payload, manifest and fault injection inputs at the API boundary', async () => {
  const [{ publishCaptureTransaction, resolveRepositoryPublicationPaths }] = await modules();
  const fx = await setup();
  try {
    await assert.rejects(publishCaptureTransaction(fx), /public publisher input.*shape/iu);
    const paths = resolveRepositoryPublicationPaths();
    await assert.rejects(publishCaptureTransaction({
      handoffPath: path.join(fx.parent, 'missing-handoff.json'),
      baselineDir: fx.baselineDir,
      ledgerPath: path.join(path.dirname(fx.ledgerPath), 'custom-ledger.json'),
    }), /ledger basename must be baseline-ledger\.json/iu);
    assert.equal(existsSync(paths.lockPath), false);
    assert.equal(existsSync(paths.journalPath), false);
    assert.equal(existsSync(fx.lockPath), false);
    assert.equal(existsSync(fx.journalPath), false);
  } finally {
    await rm(fx.parent, { recursive: true, force: true });
  }
});

test('prepared engine rejects semantically invalid payloads even when caller updates matching digests', async () => {
  const [{ publishPreparedCaptureTransaction }] = await modules();
  for (const [name, mutate] of [
    ['catalog-cutoff.sha256', () => Buffer.from(`${'f'.repeat(64)}  catalog.cutoff.normalized.json\n`)],
    ['security-drift.json', (current) => {
      const value = JSON.parse(current.toString('utf8'));
      value.tableCount = 58;
      return Buffer.from(canonical(value));
    }],
  ]) {
    const fx = await setup();
    try {
      const filePath = path.join(fx.candidateDir, name);
      const next = mutate(await readFile(filePath));
      await writeFile(filePath, next, { mode: 0o600 });
      fx.manifest.payloadDigests[name] = sha256(next);
      await assert.rejects(
        publishPreparedCaptureTransaction(fx),
        (error) => /before transaction preparation/iu.test(String(error?.message))
          && /semantic|binding|drift|digest/iu.test(String(error?.cause?.message)),
      );
      assert.equal(existsSync(fx.lockPath), false);
      assert.equal(existsSync(fx.journalPath), false);
      assert.deepEqual(await readdir(fx.baselineDir), []);
    } finally {
      await rm(fx.parent, { recursive: true, force: true });
    }
  }
});

test('prepared transaction engine rejects stale candidate handoff identity before lock or payload publication', async () => {
  const [{ publishPreparedCaptureTransaction }] = await modules();
  const fx = await setup();
  const stat = await lstat(fx.candidateDir, { bigint: true });
  try {
    await assert.rejects(
      publishPreparedCaptureTransaction({
        ...fx,
        expectedCandidateIdentity: {
          dev: String(stat.dev), ino: String(stat.ino + 1n), uid: Number(stat.uid), mode: '0700',
        },
      }),
      (error) => /before transaction preparation/iu.test(String(error?.message))
        && /candidate.*identity|handoff.*identity/iu.test(String(error?.cause?.message)),
    );
    assert.equal(existsSync(fx.lockPath), false);
    assert.equal(existsSync(fx.journalPath), false);
  } finally {
    await rm(fx.parent, { recursive: true, force: true });
  }
});

test('publisher promotes all payloads, manifest penultimate and ledger last into a verifiable transaction', async () => {
  const [{ publishPreparedCaptureTransaction }, { CAPTURE_PAYLOAD_PATHS, verifyCaptureTransaction }] = await modules();
  const fx = await setup();
  const operations = [];
  try {
    const result = await publishPreparedCaptureTransaction({ ...fx, onOperation: (name) => operations.push(name) });
    assert.equal(result.transactionId, fx.manifest.transactionId);
    assert.equal(operations.at(-2), 'rename:capture-manifest.json');
    assert.equal(operations.at(-1), 'rename:baseline-ledger.json');
    assert.equal(existsSync(fx.journalPath), false);
    assert.equal(existsSync(fx.lockPath), false);
    const verified = await verifyCaptureTransaction({ baselineDir: fx.baselineDir, ledgerPath: fx.ledgerPath, journalPath: fx.journalPath });
    assert.deepEqual([...verified.payloads.keys()], CAPTURE_PAYLOAD_PATHS);
  } finally {
    await rm(fx.parent, { recursive: true, force: true });
  }
});

test('publisher rolls every promoted target back to exact pre-existing bytes on an injected second rename failure', async () => {
  const [{ publishPreparedCaptureTransaction }, { CAPTURE_PAYLOAD_PATHS }] = await modules();
  const fx = await setup();
  const original = new Map();
  try {
    for (const relative of [...CAPTURE_PAYLOAD_PATHS, 'capture-manifest.json']) {
      const bytes = Buffer.from(`original:${relative}\n`);
      original.set(path.join(fx.baselineDir, relative), bytes);
      await writeFile(path.join(fx.baselineDir, relative), bytes, { mode: 0o600, flag: 'wx' });
    }
    const ledgerBytes = Buffer.from('original:baseline-ledger.json\n');
    original.set(fx.ledgerPath, ledgerBytes);
    await writeFile(fx.ledgerPath, ledgerBytes, { mode: 0o600, flag: 'wx' });
    await assert.rejects(
      publishPreparedCaptureTransaction({
        ...fx,
        fault: (name) => {
          if (name === 'after-rename:managed-overlays.sql') throw new Error('injected rename failure');
        },
      }),
      /publication|injected|rollback/iu,
    );
    for (const [target, bytes] of original) assert.deepEqual(await readFile(target), bytes, `rollback mismatch: ${target}`);
    assert.equal(existsSync(fx.journalPath), false);
    assert.equal(existsSync(fx.lockPath), false);
  } finally {
    await rm(fx.parent, { recursive: true, force: true });
  }
});

test('stable-inode journal preserves a foreign replacement in the post-check pre-append window', async () => {
  const [{ publishPreparedCaptureTransaction }] = await modules();
  const fx = await setup();
  const foreign = 'foreign journal replacement\n';
  let appends = 0;
  try {
    await assert.rejects(publishPreparedCaptureTransaction({
      ...fx,
      fault: async (name) => {
        if (name === 'before-journal-append' && ++appends === 2) {
          await rm(fx.journalPath);
          await writeFile(fx.journalPath, foreign, { mode: 0o600, flag: 'wx' });
        }
      },
    }), /foreign journal replacement|publication and rollback|HOLD/iu);
    assert.equal(await readFile(fx.journalPath, 'utf8'), foreign);
  } finally {
    await rm(fx.parent, { recursive: true, force: true });
  }
});

test('RENAME_NOREPLACE preserves a foreign target created after the final promotion check', async () => {
  const [{ publishPreparedCaptureTransaction }] = await modules();
  const fx = await setup();
  const target = path.join(fx.baselineDir, 'baseline.sql');
  const foreign = Buffer.from('foreign atomic occupant\n');
  try {
    await assert.rejects(publishPreparedCaptureTransaction({
      ...fx,
      fault: async (name) => {
        if (name === 'before-promotion-atomic:baseline.sql') await writeFile(target, foreign, { mode: 0o600, flag: 'wx' });
      },
    }), /noreplace|foreign replacement|rollback failed|HOLD/iu);
    assert.deepEqual(await readFile(target), foreign);
    assert.equal(existsSync(fx.journalPath), true, 'journal must remain when atomic destination is occupied');
  } finally {
    foreign.fill(0);
    await rm(fx.parent, { recursive: true, force: true });
  }
});

test('atomic existing-target detach detects and preserves a foreign inode inserted at the boundary', async () => {
  const [{ publishPreparedCaptureTransaction }] = await modules();
  const fx = await setup();
  const target = path.join(fx.baselineDir, 'baseline.sql');
  const original = Buffer.from('original baseline\n');
  const foreign = Buffer.from('foreign detach occupant\n');
  try {
    await writeFile(target, original, { mode: 0o600, flag: 'wx' });
    await assert.rejects(publishPreparedCaptureTransaction({
      ...fx,
      fault: async (name) => {
        if (name === 'before-backup-detach:baseline.sql') {
          await rm(target);
          await writeFile(target, foreign, { mode: 0o600, flag: 'wx' });
        }
      },
    }), /atomic detach|foreign replacement|rollback failed|HOLD/iu);
    assert.deepEqual(await readFile(target), foreign);
    assert.equal(existsSync(fx.journalPath), true, 'journal must remain when detached inode is foreign');
  } finally {
    original.fill(0); foreign.fill(0);
    await rm(fx.parent, { recursive: true, force: true });
  }
});

test('publisher holds journal and preserves a foreign target replacement instead of destructive rollback', async () => {
  const [{ publishPreparedCaptureTransaction }] = await modules();
  const fx = await setup();
  const target = path.join(fx.baselineDir, 'baseline.sql');
  try {
    await assert.rejects(
      publishPreparedCaptureTransaction({
        ...fx,
        fault: async (name) => {
          if (name === 'after-rename:baseline.sql') {
            await rm(target);
            await writeFile(target, 'foreign replacement\n', { mode: 0o600, flag: 'wx' });
            throw new Error('injected foreign replacement');
          }
        },
      }),
      /rollback failed|publication and rollback/iu,
    );
    assert.equal(await readFile(target, 'utf8'), 'foreign replacement\n');
    assert.equal(existsSync(fx.journalPath), true, 'journal must remain for operator HOLD');
    assert.equal(existsSync(fx.lockPath), false, 'owned lock may be released');
  } finally {
    await rm(fx.parent, { recursive: true, force: true });
  }
});

test('same-content target inode replacement is held after rename and before commit read-back', async () => {
  const [{ publishPreparedCaptureTransaction }] = await modules();
  for (const stage of ['after-target-rename-before-identity-check:baseline.sql', 'before-commit-readback']) {
    const fx = await setup();
    const target = path.join(fx.baselineDir, 'baseline.sql');
    try {
      await assert.rejects(publishPreparedCaptureTransaction({
        ...fx,
        fault: async (name) => {
          if (name !== stage) return;
          const sameBytes = await readFile(target);
          await rm(target);
          await writeFile(target, sameBytes, { mode: 0o600, flag: 'wx' });
          sameBytes.fill(0);
        },
      }), /identity mismatch|foreign replacement|ambiguous promoted|rollback failed|HOLD/iu);
      assert.deepEqual(await readFile(target), await readFile(path.join(fx.candidateDir, 'baseline.sql')));
      assert.equal(existsSync(fx.journalPath), true, 'journal must remain for same-content foreign inode HOLD');
    } finally {
      await rm(fx.parent, { recursive: true, force: true });
    }
  }
});

test('held repo-common lock recovers an interrupted transaction without releasing between recovery and callback completion', async () => {
  const [{
    publishPreparedCaptureTransaction, recoverCapturePublication, resolveRepositoryPublicationPaths,
    withRepositoryPublicationLock, SIMULATED_PROCESS_CRASH,
  }] = await modules();
  const fx = await setup();
  const paths = resolveRepositoryPublicationPaths();
  const scoped = { ...fx, journalPath: paths.journalPath, lockPath: paths.lockPath };
  try {
    const crash = new Error('simulated held recovery crash');
    crash[SIMULATED_PROCESS_CRASH] = true;
    await assert.rejects(publishPreparedCaptureTransaction({
      ...scoped,
      fault: (name) => { if (name === 'after-rename:managed-overlays.sql') throw crash; },
    }), /simulated held recovery crash/iu);
    const recovered = await withRepositoryPublicationLock(async (scope) => {
      const value = await recoverCapturePublication(scoped, scope);
      assert.equal(existsSync(paths.lockPath), false);
      assert.equal(existsSync(paths.journalPath), false);
      return value;
    });
    assert.equal(recovered.transactionId, fx.manifest.transactionId);
    assert.equal(existsSync(paths.lockPath), false);
  } finally {
    await rm(paths.journalPath, { force: true });
    await rm(fx.parent, { recursive: true, force: true });
  }
});

test('opaque recovery adopts journal-intended backup and temp inodes across durable-write crash windows', async () => {
  const [{
    publishPreparedCaptureTransaction, recoverCapturePublication, resolveRepositoryPublicationPaths,
    withRepositoryPublicationLock, SIMULATED_PROCESS_CRASH,
  }] = await modules();
  const paths = resolveRepositoryPublicationPaths();
  for (const scenario of ['after-backup-write:baseline.sql', 'after-temp-write:baseline.sql']) {
    const fx = await setup();
    const scoped = { ...fx, journalPath: paths.journalPath, lockPath: paths.lockPath };
    const original = Buffer.from('pre-existing baseline\n');
    try {
      if (scenario.startsWith('after-backup')) {
        await writeFile(path.join(fx.baselineDir, 'baseline.sql'), original, { mode: 0o600, flag: 'wx' });
      }
      const crash = new Error(`simulated ${scenario}`);
      crash[SIMULATED_PROCESS_CRASH] = true;
      await assert.rejects(publishPreparedCaptureTransaction({
        ...scoped,
        fault: (name) => { if (name === scenario) throw crash; },
      }), /simulated/iu);
      assert.equal(existsSync(paths.journalPath), true);
      await withRepositoryPublicationLock((scope) => recoverCapturePublication(scoped, scope));
      assert.equal(existsSync(paths.journalPath), false);
      const names = await readdir(fx.baselineDir);
      assert.equal(names.some((name) => name.includes('.midao-temp-') || name.includes('.midao-backup-')), false);
      if (scenario.startsWith('after-backup')) assert.deepEqual(await readFile(path.join(fx.baselineDir, 'baseline.sql')), original);
      else assert.equal(existsSync(path.join(fx.baselineDir, 'baseline.sql')), false);
    } finally {
      await rm(paths.journalPath, { force: true });
      await rm(fx.parent, { recursive: true, force: true });
    }
  }
});

test('recovery clears an empty journal left by a crash before the first append and permits retry', async () => {
  const [{
    publishPreparedCaptureTransaction, recoverCapturePublication, resolveRepositoryPublicationPaths,
    withRepositoryPublicationLock, SIMULATED_PROCESS_CRASH,
  }] = await modules();
  const paths = resolveRepositoryPublicationPaths();
  const fx = await setup();
  const scoped = { ...fx, journalPath: paths.journalPath, lockPath: paths.lockPath };
  try {
    const crash = new Error('simulated initial journal append crash');
    crash[SIMULATED_PROCESS_CRASH] = true;
    await assert.rejects(publishPreparedCaptureTransaction({
      ...scoped,
      fault: (name) => { if (name === 'before-journal-append') throw crash; },
    }), /simulated initial journal append crash/iu);
    assert.equal((await lstat(paths.journalPath)).size, 0);
    await withRepositoryPublicationLock((scope) => recoverCapturePublication(scoped, scope));
    assert.equal(existsSync(paths.journalPath), false);
    await publishPreparedCaptureTransaction(scoped);
    assert.equal(existsSync(paths.journalPath), false);
  } finally {
    await rm(paths.journalPath, { force: true });
    await rm(fx.parent, { recursive: true, force: true });
  }
});

test('stable-inode journal recovers every durable state boundary with a truncated tail record', async () => {
  const [{
    publishPreparedCaptureTransaction, recoverCapturePublication, resolveRepositoryPublicationPaths,
    withRepositoryPublicationLock, SIMULATED_PROCESS_CRASH,
  }] = await modules();
  const paths = resolveRepositoryPublicationPaths();
  for (const boundary of [1, 2, 17, 18, 33, 34]) {
    const fx = await setup();
    const scoped = { ...fx, journalPath: paths.journalPath, lockPath: paths.lockPath };
    let records = 0;
    try {
      const crash = new Error(`simulated journal record ${boundary}`);
      crash[SIMULATED_PROCESS_CRASH] = true;
      await assert.rejects(publishPreparedCaptureTransaction({
        ...scoped,
        fault: (name) => {
          if (name === 'after-journal-record-sync' && ++records === boundary) throw crash;
        },
      }), /simulated journal record/iu);
      await writeFile(paths.journalPath, '00000020 partial-tail', { flag: 'a' });
      const recovered = await withRepositoryPublicationLock((scope) => recoverCapturePublication(scoped, scope));
      assert.equal(recovered.transactionId, fx.manifest.transactionId);
      assert.equal(existsSync(paths.journalPath), false);
      const residue = [...await readdir(fx.baselineDir), ...await readdir(path.dirname(fx.ledgerPath))]
        .filter((name) => name.includes('.midao-temp-') || name.includes('.midao-backup-'));
      assert.deepEqual(residue, []);
    } finally {
      await rm(paths.journalPath, { force: true });
      await rm(fx.parent, { recursive: true, force: true });
    }
  }
});

test('stable-inode journal holds a complete corrupt checksum frame without deleting evidence', async () => {
  const [{
    publishPreparedCaptureTransaction, recoverCapturePublication, resolveRepositoryPublicationPaths,
    withRepositoryPublicationLock, SIMULATED_PROCESS_CRASH,
  }] = await modules();
  const paths = resolveRepositoryPublicationPaths();
  const fx = await setup();
  const scoped = { ...fx, journalPath: paths.journalPath, lockPath: paths.lockPath };
  try {
    const crash = new Error('simulated initial journal');
    crash[SIMULATED_PROCESS_CRASH] = true;
    await assert.rejects(publishPreparedCaptureTransaction({
      ...scoped,
      fault: (name) => { if (name === 'after-journal-record-sync') throw crash; },
    }), /simulated initial journal/iu);
    await writeFile(paths.journalPath, `00000003 ${'0'.repeat(64)}\n{}\n`, { flag: 'a' });
    await assert.rejects(
      withRepositoryPublicationLock((scope) => recoverCapturePublication(scoped, scope)),
      /journal frame digest invalid/iu,
    );
    assert.equal(existsSync(paths.journalPath), true);
  } finally {
    await rm(paths.journalPath, { force: true });
    await rm(fx.parent, { recursive: true, force: true });
  }
});

test('rollback recovery is idempotent after a second crash immediately after restoring a target', async () => {
  const [{
    publishPreparedCaptureTransaction, recoverCapturePublication, resolveRepositoryPublicationPaths,
    withRepositoryPublicationLock, SIMULATED_PROCESS_CRASH,
  }] = await modules();
  const fx = await setup();
  const paths = resolveRepositoryPublicationPaths();
  const scoped = { ...fx, journalPath: paths.journalPath, lockPath: paths.lockPath };
  const overlayPath = path.join(fx.baselineDir, 'managed-overlays.sql');
  const original = Buffer.from('original overlay\n');
  try {
    await writeFile(overlayPath, original, { mode: 0o600, flag: 'wx' });
    const publicationCrash = new Error('simulated publication crash');
    publicationCrash[SIMULATED_PROCESS_CRASH] = true;
    await assert.rejects(publishPreparedCaptureTransaction({
      ...scoped,
      fault: (name) => { if (name === 'after-rename:managed-overlays.sql') throw publicationCrash; },
    }), /simulated publication crash/iu);
    assert.equal(existsSync(paths.journalPath), true);
    const recoveryCrash = new Error('simulated recovery rollback crash');
    recoveryCrash[SIMULATED_PROCESS_CRASH] = true;
    await assert.rejects(withRepositoryPublicationLock((scope) => recoverCapturePublication({
      ...scoped,
      fault: (name) => { if (name === 'after-rollback:managed-overlays.sql') throw recoveryCrash; },
    }, scope)), /simulated recovery rollback crash/iu);
    assert.deepEqual(await readFile(overlayPath), original);
    assert.equal(existsSync(paths.journalPath), true);
    await withRepositoryPublicationLock((scope) => recoverCapturePublication(scoped, scope));
    assert.deepEqual(await readFile(overlayPath), original);
    assert.equal(existsSync(paths.journalPath), false);
    assert.equal((await readdir(fx.baselineDir)).some((name) => name.includes('.midao-')), false);
  } finally {
    await rm(paths.journalPath, { force: true });
    await rm(fx.parent, { recursive: true, force: true });
  }
});

test('committed recovery revalidates every payload digest and rolls back a tampered commit marker', async () => {
  const [{
    publishPreparedCaptureTransaction, recoverCapturePublication, resolveRepositoryPublicationPaths,
    withRepositoryPublicationLock, SIMULATED_PROCESS_CRASH,
  }] = await modules();
  const fx = await setup();
  const paths = resolveRepositoryPublicationPaths();
  const scoped = { ...fx, journalPath: paths.journalPath, lockPath: paths.lockPath };
  try {
    const crash = new Error('simulated committed crash');
    crash[SIMULATED_PROCESS_CRASH] = true;
    await assert.rejects(publishPreparedCaptureTransaction({
      ...scoped,
      fault: (name) => { if (name === 'after-commit-journal') throw crash; },
    }), /simulated committed crash/iu);
    await writeFile(path.join(fx.baselineDir, 'baseline.sql'), 'tampered after commit\n', { mode: 0o600 });
    await withRepositoryPublicationLock((scope) => recoverCapturePublication(scoped, scope));
    assert.equal(existsSync(path.join(fx.baselineDir, 'baseline.sql')), false);
    assert.equal(existsSync(fx.ledgerPath), false);
    assert.equal(existsSync(paths.journalPath), false);
  } finally {
    await rm(paths.journalPath, { force: true });
    await rm(fx.parent, { recursive: true, force: true });
  }
});

test('committed recovery holds a same-content foreign promoted inode', async () => {
  const [{
    publishPreparedCaptureTransaction, recoverCapturePublication, resolveRepositoryPublicationPaths,
    withRepositoryPublicationLock, SIMULATED_PROCESS_CRASH,
  }] = await modules();
  const fx = await setup();
  const paths = resolveRepositoryPublicationPaths();
  const scoped = { ...fx, journalPath: paths.journalPath, lockPath: paths.lockPath };
  const target = path.join(fx.baselineDir, 'baseline.sql');
  try {
    const crash = new Error('simulated committed identity crash');
    crash[SIMULATED_PROCESS_CRASH] = true;
    await assert.rejects(publishPreparedCaptureTransaction({
      ...scoped,
      fault: (name) => { if (name === 'after-commit-journal') throw crash; },
    }), /simulated committed identity crash/iu);
    const sameBytes = await readFile(target);
    await rm(target);
    await writeFile(target, sameBytes, { mode: 0o600, flag: 'wx' });
    await assert.rejects(
      withRepositoryPublicationLock((scope) => recoverCapturePublication(scoped, scope)),
      /identity mismatch|foreign replacement|rollback failed|HOLD/iu,
    );
    assert.deepEqual(await readFile(target), sameBytes);
    assert.equal(existsSync(paths.journalPath), true);
    sameBytes.fill(0);
  } finally {
    await rm(paths.journalPath, { force: true });
    await rm(fx.parent, { recursive: true, force: true });
  }
});

test('opaque repo-lock recovery rolls an interrupted pre-commit publication back idempotently', async () => {
  const [{
    publishPreparedCaptureTransaction, recoverCapturePublication, resolveRepositoryPublicationPaths,
    withRepositoryPublicationLock, SIMULATED_PROCESS_CRASH,
  }, { CAPTURE_PAYLOAD_PATHS }] = await modules();
  const fx = await setup();
  const paths = resolveRepositoryPublicationPaths();
  const scoped = { ...fx, journalPath: paths.journalPath, lockPath: paths.lockPath };
  try {
    const crash = new Error('simulated process crash');
    crash[SIMULATED_PROCESS_CRASH] = true;
    await assert.rejects(
      publishPreparedCaptureTransaction({
        ...scoped,
        fault: (name) => {
          if (name === 'after-rename:managed-overlays.sql') throw crash;
        },
      }),
      /simulated process crash/iu,
    );
    assert.equal(existsSync(paths.journalPath), true);
    assert.equal(existsSync(paths.lockPath), false);
    const recovered = await withRepositoryPublicationLock((scope) => recoverCapturePublication(scoped, scope));
    assert.equal(recovered.transactionId, fx.manifest.transactionId);
    for (const relative of CAPTURE_PAYLOAD_PATHS) assert.equal(existsSync(path.join(fx.baselineDir, relative)), false);
    assert.equal(existsSync(path.join(fx.baselineDir, 'capture-manifest.json')), false);
    assert.equal(existsSync(fx.ledgerPath), false);
    assert.equal(existsSync(paths.journalPath), false);
    assert.equal(existsSync(paths.lockPath), false);
  } finally {
    await rm(paths.journalPath, { force: true });
    await rm(fx.parent, { recursive: true, force: true });
  }
});
