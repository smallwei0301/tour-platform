import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const execFile = promisify(execFileCallback);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const image = 'postgres@sha256:0027bef26712baaee437a4ea48fdf3d2d2e2bc5f0d81615374408ca320f3c7e3';
const docker = '/usr/bin/docker';
const fixtureDirectory = path.join(here, '../fixtures/database-baseline');
const candidateRoot = path.join(root, '.hermes/tmp');
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function dockerExec(args, options = {}) {
  return execFile(docker, args, { encoding: options.encoding ?? 'buffer', maxBuffer: 64 * 1024 * 1024, timeout: options.timeout ?? 30_000 });
}

function buildCatalog() {
  const sectionNames = [
    'schemas', 'relations', 'sequences', 'columns', 'types', 'constraints', 'indexes', 'routines', 'triggers',
    'rls', 'policies', 'acl', 'owners', 'defaultPrivileges', 'extensions', 'extensionMemberships',
    'publicationMembership', 'managedSchemaInventory', 'managedSchemaOverlays',
  ];
  const sections = Object.fromEntries(sectionNames.map((name) => [name, []]));
  sections.schemas.push({ canonicalKey: ['schema', 'public'] });
  for (let index = 0; index < 59; index += 1) {
    const table = index === 0 ? 'example' : `drift_${String(index).padStart(2, '0')}`;
    sections.relations.push({ canonicalKey: ['relation', 'public', table] });
    sections.rls.push({ canonicalKey: ['rls', 'public', table], schema: 'public', relation: table, enabled: true, forced: false });
    sections.acl.push({
      canonicalKey: ['acl', 'relation', 'public', table, 'postgres', 'authenticated', 'UPDATE', false],
      objectType: 'relation', schema: 'public', object: table, grantor: 'postgres', grantee: 'authenticated',
      privilege: 'UPDATE', grantable: false, usesDefaultAcl: false,
    });
  }
  sections.constraints.push({ canonicalKey: ['constraint', 'relation', 'public', 'example', 'example_pkey'] });
  return {
    schemaVersion: 1, extractorVersion: 1, serverVersionNum: 170010, transactionReadOnly: true,
    ownershipOverlayStatus: 'pending', sections,
  };
}

async function buildReviewedOwnership(catalog, tocEntries) {
  const input = JSON.parse(await readFile(path.join(fixtureDirectory, 'ownership-template.json'), 'utf8'));
  input.templateOnly = false;
  input.catalog = catalog;
  input.ownershipBoundary.status = 'reviewed';
  input.ownershipBoundary.assignments = Object.entries(catalog.sections).flatMap(([section, rows]) => rows.map((row) => {
    const environmental = row.canonicalKey[0] === 'schema'
      || row.canonicalKey.some((value) => typeof value === 'string' && value.startsWith('drift_'));
    return {
      objectKey: row.canonicalKey,
      section,
      ownerDomain: environmental ? 'excluded_environmental' : 'application',
      role: environmental ? 'excluded-environmental-owner' : 'application-owner',
      dependsOn: [],
      rationale: environmental
        ? 'synthetic metadata-only security drift excluded from archive render'
        : 'synthetic locked-image public publisher integration fixture',
    };
  }));
  input.tocOwnershipMap.expectedTocIds = tocEntries.map((entry) => entry.tocId);
  input.tocOwnershipMap.entries = tocEntries.map((entry) => {
    let objectKey = ['relation', 'public', 'example'];
    if (entry.descriptor === 'SCHEMA') objectKey = ['schema', 'public'];
    if (entry.descriptor === 'TABLE') objectKey = ['relation', 'public', entry.identity];
    if (entry.descriptor === 'CONSTRAINT') {
      const [relation, constraint] = entry.identity.split(' ');
      objectKey = ['constraint', 'relation', 'public', relation, constraint];
    }
    if (entry.descriptor === 'ACL' && entry.identity.startsWith('TABLE ')) {
      const table = entry.identity.slice('TABLE '.length);
      objectKey = ['acl', 'relation', 'public', table, 'postgres', 'authenticated', 'UPDATE', false];
    }
    return { tocId: entry.tocId, objectKey, ownerDomain: 'application' };
  });
  input.exclusions.entries = input.ownershipBoundary.assignments
    .filter((assignment) => assignment.ownerDomain === 'excluded_environmental')
    .map((assignment) => ({
      objectKey: assignment.objectKey,
      field: '*',
      reason: 'synthetic integration metadata does not exist in the tiny archive',
      approval: { status: 'approved', approvedBy: 'Task 7 integration fixture', reference: 'local-synthetic-no-production' },
    }));
  input.platformPrerequisites.objects = [];
  return input;
}

async function waitReady(containerName) {
  let initComplete = false;
  let stableSqlChecks = 0;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const logs = await dockerExec(['logs', containerName], { encoding: 'utf8', timeout: 5_000 });
      initComplete ||= `${logs.stdout}${logs.stderr}`.includes('PostgreSQL init process complete; ready for start up.');
      if (initComplete) {
        await dockerExec(['exec', containerName, '/usr/bin/psql', '-X', '--set=ON_ERROR_STOP=1', '-d', 'postgres', '-Atqc', 'SELECT 1'], { timeout: 5_000 });
        stableSqlChecks += 1;
        if (stableSqlChecks >= 3) return;
      }
    } catch {
      stableSqlChecks = 0;
    }
    await sleep(250);
  }
  throw new Error('integration PostgreSQL final server did not become ready');
}

test('public publisher performs locked real PG17 A/B render, semantic composition, transaction read-back and candidate cleanup', { timeout: 240_000 }, async () => {
  const nonce = `${process.pid}-${Date.now()}`;
  const containerName = `midao-baseline-it-${nonce}`;
  const parent = await mkdtemp(path.join(os.tmpdir(), 'midao-public-integration-'));
  const baselineDir = path.join(parent, 'baseline');
  const docsDir = path.join(parent, 'docs');
  const candidatePath = path.join(candidateRoot, `candidate-it-${nonce}`);
  const handoffPath = path.join(candidateRoot, `handoff-it-${nonce}.json`);
  let createdRoot = false;
  try {
    await dockerExec(['image', 'inspect', image]);
    const dockerRunArgs = [
      'run', '--pull=never', '--detach', '--rm', '--name', containerName, '--network=none', '--read-only', '--user=999:999',
      '--security-opt=no-new-privileges', '--cap-drop=ALL',
      '--tmpfs=/var/lib/postgresql/data:rw,nosuid,nodev,size=64m,uid=999,gid=999,mode=0700',
      '--tmpfs=/var/run/postgresql:rw,nosuid,nodev,size=4m,uid=999,gid=999,mode=0700',
      '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777',
      '--env=POSTGRES_HOST_AUTH_METHOD=trust', image, '-c', 'listen_addresses=',
    ];
    assert.equal(dockerRunArgs.filter((value) => value === '--pull=never').length, 1);
    await dockerExec(dockerRunArgs, { timeout: 60_000 });
    await waitReady(containerName);
    const fixtureSql = [
      'CREATE ROLE authenticated;',
      'CREATE TABLE public.example (id bigint PRIMARY KEY);',
      'GRANT UPDATE ON TABLE public.example TO authenticated;',
    ];
    await dockerExec(['exec', containerName, '/usr/bin/psql', '-X', '--set=ON_ERROR_STOP=1', '-d', 'postgres', '-c', fixtureSql.join('\n')]);
    const dump = (await dockerExec(['exec', containerName, '/usr/bin/pg_dump', '--schema-only', '--format=custom', '--no-owner', '-d', 'postgres'])).stdout;

    const capture = await import(`${pathToFileURL(path.join(root, 'scripts/database-baseline/capture-production-catalog.mjs')).href}?t=${Date.now()}`);
    const renderer = await import(`${pathToFileURL(path.join(root, 'scripts/database-baseline/render-baseline-from-archive.mjs')).href}?t=${Date.now()}`);
    const normalizer = await import(`${pathToFileURL(path.join(root, 'scripts/database-baseline/normalize-catalog.mjs')).href}?t=${Date.now()}`);
    const publisher = await import(`${pathToFileURL(path.join(root, 'scripts/database-baseline/publish-baseline.mjs')).href}?t=${Date.now()}`);
    const ownershipValidator = await import(`${pathToFileURL(path.join(root, 'scripts/database-baseline/validate-ownership-boundary.mjs')).href}?t=${Date.now()}`);
    const verifier = await import(`${pathToFileURL(path.join(root, 'scripts/database-baseline/verify-manifest.mjs')).href}?t=${Date.now()}`);
    const loaded = await capture.loadCaptureToolchain();
    const listInvocation = capture.buildPg17RestoreListInvocation({ toolchain: loaded.trusted, home: '/tmp/empty-capture-home' });
    const listResult = await capture.runBoundedChild(listInvocation, { stdinBuffer: dump, maxBytes: 4 * 1024 * 1024, timeoutMs: 60_000 });
    assert.equal(listResult.code, 0);
    assert.equal(listResult.stderr.length, 0);
    const toc = listResult.stdout;
    const tocEntries = renderer.parsePg17Toc(toc);
    assert.ok(tocEntries.length > 0);

    const catalog = buildCatalog();
    const normalizedCatalog = Buffer.from(normalizer.normalizeCatalog(catalog));
    const reviewedCatalog = JSON.parse(normalizedCatalog.toString('utf8'));
    const ownership = await buildReviewedOwnership(reviewedCatalog, tocEntries);
    ownershipValidator.validateOwnershipBoundary(ownership);
    if (!existsSync(candidateRoot)) {
      await mkdir(candidateRoot, { mode: 0o700, recursive: true });
      createdRoot = true;
    }
    await chmod(candidateRoot, 0o700);
    await mkdir(candidatePath, { mode: 0o700 });
    await mkdir(baselineDir, { mode: 0o700 });
    await mkdir(docsDir, { mode: 0o700 });
    const files = new Map([
      ['capture-a.dump', dump], ['capture-b.dump', Buffer.from(dump)],
      ['catalog-a.normalized.json', normalizedCatalog], ['catalog-b.normalized.json', Buffer.from(normalizedCatalog)],
      ['toc-a.txt', toc], ['toc-b.txt', Buffer.from(toc)],
      ['ownership-validation-input.json', Buffer.from(`${JSON.stringify(ownership)}\n`)],
    ]);
    for (const [name, bytes] of files) await writeFile(path.join(candidatePath, name), bytes, { mode: 0o600, flag: 'wx' });
    const candidateStat = await stat(candidatePath, { bigint: true });
    await writeFile(handoffPath, `${JSON.stringify({
      schemaVersion: 1,
      candidatePath,
      candidateIdentity: { dev: String(candidateStat.dev), ino: String(candidateStat.ino), uid: Number(candidateStat.uid), mode: '0700' },
    })}\n`, { mode: 0o600, flag: 'wx' });
    const ledgerPath = path.join(docsDir, 'baseline-ledger.json');
    const result = await publisher.publishCaptureTransaction({ handoffPath, baselineDir, ledgerPath });
    assert.match(result.transactionId, /^[0-9a-f]{64}$/u);
    assert.equal(existsSync(candidatePath), false);
    assert.equal(existsSync(handoffPath), false);
    const verified = await verifier.verifyCaptureTransaction({
      baselineDir, ledgerPath, journalPath: publisher.resolveRepositoryPublicationPaths().journalPath,
    });
    assert.equal(verified.transactionId, result.transactionId);
    verified.dispose();
    for (const bytes of files.values()) bytes.fill(0);
    listResult.stderr.fill(0);
  } finally {
    await dockerExec(['rm', '-f', containerName], { timeout: 30_000 }).catch(() => {});
    await rm(candidatePath, { recursive: true, force: true });
    await rm(handoffPath, { force: true });
    await rm(parent, { recursive: true, force: true });
    if (createdRoot && existsSync(candidateRoot) && (await readdir(candidateRoot)).length === 0) await rmdir(candidateRoot);
  }
});
