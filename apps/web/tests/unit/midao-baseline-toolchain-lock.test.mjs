import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '../../../..');
const resolverPath = path.join(root, 'scripts/database-baseline/resolve-toolchain-supply.mjs');
const acquirerPath = path.join(root, 'scripts/database-baseline/acquire-toolchain-images.mjs');
const verifierPath = path.join(root, 'scripts/database-baseline/verify-toolchain-lock.mjs');
const cliPath = '/root/.hermes/toolchains/supabase/2.87.2/supabase';
const dockerPath = '/usr/bin/docker';
const expectedCliSha = 'e325dd50b274e88fd1416f93b9e063902827ae326d356ab7f9dc604c3eba5c59';
const digestA = `sha256:${'a'.repeat(64)}`;
const digestB = `sha256:${'b'.repeat(64)}`;

async function modules() {
  return Promise.all([resolverPath, acquirerPath, verifierPath].map((file) => import(pathToFileURL(file))));
}

const embeddedDockerfile = `# Exposed for updates\nFROM supabase/postgres:17.6.1.104 AS pg\n# Append to ServiceImages when adding new dependencies below\nFROM library/kong:2.8.1 AS kong\nFROM axllent/mailpit:v1.22.3 AS mailpit\nFROM postgrest/postgrest:v14.8 AS postgrest\nFROM supabase/postgres-meta:v0.96.2 AS pgmeta\nFROM supabase/studio:2026.04.06-sha-b9e83b2 AS studio\nFROM darthsim/imgproxy:v3.8.0 AS imgproxy\nFROM supabase/edge-runtime:v1.73.3 AS edgeruntime\nFROM timberio/vector:0.53.0-alpine AS vector\nFROM supabase/supavisor:2.7.4 AS supavisor\nFROM supabase/gotrue:v2.188.1 AS gotrue\nFROM supabase/realtime:v2.80.12 AS realtime\nFROM supabase/storage-api:v1.48.21 AS storage\nFROM supabase/logflare:1.36.1 AS logflare\n# Append to JobImages when adding new dependencies below\n`;
const config = `[api]\nenabled = true\n[db]\nmajor_version = 17\n[studio]\nenabled = true\n[inbucket]\nenabled = true\n[storage]\nenabled = true\n[auth]\nenabled = true\n[analytics]\nenabled = false\n`;

function fakeRequest(images, approval = { status: 'not-required', approvedDigests: [] }) {
  return {
    schemaVersion: 1,
    approval,
    architecture: 'amd64',
    cli: { path: cliPath, realpath: cliPath, version: '2.87.2', sha256: expectedCliSha, uid: 0, gid: 0, mode: '0755', nlink: 1 },
    docker: { path: dockerPath, realpath: dockerPath, endpoint: 'unix:///var/run/docker.sock', architecture: 'amd64' },
    images,
  };
}

function fakeImage(repository, tag, digest, localPresent = true) {
  return { role: `service-${repository.replace(/[^a-z0-9]+/gi, '-')}`, repository, tag, repoDigest: `${repository}@${digest}`, platform: 'linux/amd64', architecture: 'amd64', localPresent, localImageId: localPresent ? `sha256:${'c'.repeat(64)}` : null, estimatedMissingBytes: localPresent ? 0 : 1234 };
}

test('resolver command exists and publishes usage instead of an import or syntax failure', () => {
  const result = spawnSync(process.execPath, [resolverPath, '--help'], { cwd: root, encoding: 'utf8', env: { PATH: '/usr/bin:/bin', NODE_ENV: 'test' } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--registry-metadata-only/);
});

test('fixed CLI identity is exact absolute realpath/version/SHA/uid/gid/mode/nlink regular file', async () => {
  const [{ verifyCliIdentity }] = await modules();
  const identity = await verifyCliIdentity(cliPath);
  assert.deepEqual(identity, { path: cliPath, realpath: cliPath, version: '2.87.2', sha256: expectedCliSha, uid: 0, gid: 0, mode: '0755', nlink: 1 });
  await assert.rejects(() => verifyCliIdentity('/bin/true'), /CLI path substitution/);
});

test('embedded CLI contract and config select every enabled local service image and exclude analytics/pooler', async () => {
  const [{ parseRequiredImages }] = await modules();
  const images = parseRequiredImages(Buffer.from(`prefix\0${embeddedDockerfile}\0suffix`), config);
  assert.deepEqual(images.map(({ role, repository, tag }) => ({ role, repository, tag })), [
    { role: 'pg17-client', repository: 'postgres', tag: '17' },
    { role: 'db', repository: 'public.ecr.aws/supabase/postgres', tag: '17.6.1.104' },
    { role: 'gateway', repository: 'public.ecr.aws/supabase/kong', tag: '2.8.1' },
    { role: 'api', repository: 'public.ecr.aws/supabase/postgrest', tag: 'v14.8' },
    { role: 'auth', repository: 'public.ecr.aws/supabase/gotrue', tag: 'v2.188.1' },
    { role: 'mailpit', repository: 'public.ecr.aws/supabase/mailpit', tag: 'v1.22.3' },
    { role: 'realtime', repository: 'public.ecr.aws/supabase/realtime', tag: 'v2.80.12' },
    { role: 'storage', repository: 'public.ecr.aws/supabase/storage-api', tag: 'v1.48.21' },
    { role: 'imgproxy', repository: 'public.ecr.aws/supabase/imgproxy', tag: 'v3.8.0' },
    { role: 'edge-runtime', repository: 'public.ecr.aws/supabase/edge-runtime', tag: 'v1.73.3' },
    { role: 'studio', repository: 'public.ecr.aws/supabase/studio', tag: '2026.04.06-sha-b9e83b2' },
    { role: 'postgres-meta', repository: 'public.ecr.aws/supabase/postgres-meta', tag: 'v0.96.2' },
  ]);
  assert.equal(images.some(({ repository }) => /logflare|vector|supavisor/.test(repository)), false);
});

test('config must pin PostgreSQL 17 and disable analytics', async () => {
  const [{ parseRequiredImages }] = await modules();
  assert.throws(() => parseRequiredImages(Buffer.from(embeddedDockerfile), config.replace('major_version = 17', 'major_version = 15')), /major_version.*17/);
  assert.throws(() => parseRequiredImages(Buffer.from(embeddedDockerfile), config.replace('enabled = false', 'enabled = true')), /analytics.*disabled/);
});

test('registry metadata resolver accepts only immutable platform descriptor and estimates missing bytes', async () => {
  const [{ parseManifestMetadata }] = await modules();
  const metadata = parseManifestMetadata(JSON.stringify([{ Ref: 'repo:tag', Descriptor: { digest: digestA }, Platform: { os: 'linux', architecture: 'amd64' }, SchemaV2Manifest: { config: { size: 99 }, layers: [{ size: 101 }, { size: 200 }] } }]), 'amd64');
  assert.deepEqual(metadata, { digest: digestA, platform: 'linux/amd64', estimatedBytes: 400 });
  assert.throws(() => parseManifestMetadata('{}', 'amd64'), /platform descriptor/);
});

test('local tagged image read-back resolves one immutable repository digest without registry access', async () => {
  const [{ parseLocalTaggedMetadata }] = await modules();
  const output = JSON.stringify([{
    Id: `sha256:${'c'.repeat(64)}`,
    Architecture: 'amd64',
    RepoDigests: [`repo/name@${digestA}`, `other/name@${digestB}`],
  }]);
  assert.deepEqual(parseLocalTaggedMetadata(output, 'repo/name', 'amd64'), {
    digest: digestA,
    imageId: `sha256:${'c'.repeat(64)}`,
    platform: 'linux/amd64',
    estimatedBytes: 0,
  });
  assert.throws(() => parseLocalTaggedMetadata(output, 'repo/name', 'arm64'), /architecture/);
});

test('canonical inventory re-derivation rejects partial extra duplicate-role tag-only and repository-only mutation', async () => {
  const [{ parseRequiredImages, verifyCanonicalInventory }] = await modules();
  const required = parseRequiredImages(Buffer.from(`prefix\0${embeddedDockerfile}\0suffix`), config);
  const images = required.map((item, index) => ({
    ...item,
    repoDigest: `${item.repository}@sha256:${String(index + 1).padStart(64, '0')}`,
    platform: 'linux/amd64',
    architecture: 'amd64',
    localPresent: true,
    localImageId: `sha256:${String(index + 101).padStart(64, '0')}`,
    estimatedMissingBytes: 0,
  }));
  const request = fakeRequest(images);
  const dependencies = {
    verifyCli: async () => request.cli,
    readCliBytes: async () => Buffer.from(`prefix\0${embeddedDockerfile}\0suffix`),
    readConfig: async () => config,
  };
  await verifyCanonicalInventory(request, dependencies);
  await assert.rejects(() => verifyCanonicalInventory(fakeRequest(images.slice(0, -1)), dependencies), /inventory/iu);
  await assert.rejects(() => verifyCanonicalInventory(fakeRequest([...images, { ...images[0], role: 'extra', repoDigest: `extra/repo@${digestA}`, repository: 'extra/repo' }]), dependencies), /inventory/iu);
  await assert.rejects(() => verifyCanonicalInventory(fakeRequest(images.map((image, i) => i === 1 ? { ...image, role: images[0].role } : image)), dependencies), /duplicate role|inventory/iu);
  await assert.rejects(() => verifyCanonicalInventory(fakeRequest(images.map((image, i) => i === 1 ? { ...image, tag: 'mutated-only' } : image)), dependencies), /inventory/iu);
  await assert.rejects(() => verifyCanonicalInventory(fakeRequest(images.map((image, i) => i === 1 ? { ...image, repository: 'mutated/repo', repoDigest: `mutated/repo@${digestB}` } : image)), dependencies), /inventory/iu);
});

test('only exact requested No-such-image is classified as missing', async () => {
  const [{ isExactMissingImageResult }] = await modules();
  const ref = 'repo/name:v1';
  assert.equal(isExactMissingImageResult({ code: 1, signal: null, timedOut: false, overflow: false, stderr: `Error response from daemon: No such image: ${ref}\n` }, ref), true);
  assert.equal(isExactMissingImageResult({ code: 1, signal: null, timedOut: false, overflow: false, stderr: 'permission denied\n' }, ref), false);
  assert.equal(isExactMissingImageResult({ code: null, signal: 'SIGTERM', timedOut: true, overflow: false, stderr: `No such image: ${ref}` }, ref), false);
  assert.equal(isExactMissingImageResult({ code: 1, signal: null, timedOut: false, overflow: false, stderr: 'Error response from daemon: No such image: other/ref:v1\n' }, ref), false);
});

test('live toolchain preflight re-verifies canonical CLI inventory and Docker identity', async () => {
  const [{ verifyToolchainPreflight }] = await modules();
  const image = fakeImage('repo/name', 'v1', digestA);
  const request = fakeRequest([image]);
  const calls = [];
  const result = await verifyToolchainPreflight(request, {
    verifyInventory: async () => { calls.push('inventory'); return request.cli; },
    verifyDocker: async () => { calls.push('docker'); return request.docker; },
  });
  assert.deepEqual(calls, ['inventory', 'docker']);
  assert.deepEqual(result, { cli: request.cli, docker: request.docker });
  await assert.rejects(() => verifyToolchainPreflight(request, {
    verifyInventory: async () => ({ ...request.cli, sha256: '0'.repeat(64) }),
    verifyDocker: async () => request.docker,
  }), /CLI identity drift/iu);
  await assert.rejects(() => verifyToolchainPreflight(request, {
    verifyInventory: async () => request.cli,
    verifyDocker: async () => ({ ...request.docker, endpoint: 'tcp://host:2375' }),
  }), /Docker identity drift/iu);
});

test('strict child timeout is a distinct failure and escalates bounded TERM to KILL', async () => {
  const [{ strictSpawn }] = await modules();
  await assert.rejects(
    () => strictSpawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { timeoutMs: 20 }),
    /timeout/iu
  );
});

test('request validation rejects mutable refs, secrets, image duplicates and architecture drift', async () => {
  const [{ validateSupplyRequest }] = await modules();
  const image = fakeImage('repo/name', 'v1', digestA);
  assert.doesNotThrow(() => validateSupplyRequest(fakeRequest([image])));
  assert.throws(() => validateSupplyRequest(fakeRequest([{ ...image, repoDigest: 'repo/name:v1' }])), /immutable/);
  assert.throws(() => validateSupplyRequest({ ...fakeRequest([image]), token: 'secret' }), /unexpected key|secret/i);
  assert.throws(() => validateSupplyRequest(fakeRequest([image, image])), /duplicate/);
  assert.throws(() => validateSupplyRequest(fakeRequest([{ ...image, architecture: 'arm64' }])), /architecture/);
});

test('acquirer refuses missing images without exact owner approval and never partially pulls', async () => {
  const [, { acquireImages }] = await modules();
  const images = [fakeImage('repo/a', 'v1', digestA, false), fakeImage('repo/b', 'v2', digestB, false)];
  const calls = [];
  await assert.rejects(() => acquireImages(fakeRequest(images, { status: 'pending', approvedDigests: [] }), { preflight: async () => {}, runDocker: async (args) => calls.push(args) }), /owner approval/);
  assert.deepEqual(calls, []);
  await assert.rejects(() => acquireImages(fakeRequest(images, { status: 'approved', approvedDigests: [images[0].repoDigest] }), { preflight: async () => {}, runDocker: async (args) => calls.push(args) }), /exact digest set/);
  assert.deepEqual(calls, []);
});

test('acquirer uses digest-only pulls after exact approval and fails on partial read-back mismatch', async () => {
  const [, { acquireImages }] = await modules();
  const images = [fakeImage('repo/a', 'v1', digestA, false), fakeImage('repo/b', 'v2', digestB, false)];
  const request = fakeRequest(images, { status: 'approved', approvedDigests: images.map((x) => x.repoDigest) });
  const calls = [];
  await assert.rejects(() => acquireImages(request, { preflight: async () => {}, runDocker: async (args) => { calls.push(args); return args[0] === 'pull' ? '' : JSON.stringify([{ Id: `sha256:${'c'.repeat(64)}`, Architecture: 'amd64', RepoDigests: args.at(-1).includes('repo/a') ? [images[0].repoDigest] : [] }]); } }), /read-back mismatch/);
  assert.deepEqual(calls.filter((args) => args[0] === 'pull').map((args) => args[1]), images.map((x) => x.repoDigest));
  assert.equal(calls.some((args) => args.some((arg) => /:v[12]$/.test(arg))), false);
});

test('all-present acquisition skips pulls but re-verifies every exact repo digest', async () => {
  const [, { acquireImages }] = await modules();
  const images = [fakeImage('repo/a', 'v1', digestA), fakeImage('repo/b', 'v2', digestB)];
  const calls = [];
  await acquireImages(fakeRequest(images), { preflight: async () => {}, runDocker: async (args) => { calls.push(args); const ref = args.at(-1); return JSON.stringify([{ Id: `sha256:${'c'.repeat(64)}`, Architecture: 'amd64', RepoDigests: [ref] }]); } });
  assert.equal(calls.some((args) => args[0] === 'pull'), false);
  assert.equal(calls.filter((args) => args[0] === 'image' && args[1] === 'inspect').length, 2);
});

test('lock verifier pins docker absolute identity/endpoint and rejects PATH or docker substitution', async () => {
  const [, , { verifyDockerIdentity }] = await modules();
  const identity = await verifyDockerIdentity(dockerPath);
  assert.equal(identity.path, dockerPath);
  assert.equal(identity.realpath, dockerPath);
  assert.equal(identity.endpoint, 'unix:///var/run/docker.sock');
  assert.equal(identity.architecture, 'amd64');
  await assert.rejects(() => verifyDockerIdentity('/bin/true'), /Docker path substitution/);
});

test('PG17 image verification locks absolute binaries and cleans every owned probe container', async () => {
  const [, , { verifyPg17Binaries }] = await modules();
  const calls = [];
  const cleaned = [];
  let sequence = 0;
  const versions = await verifyPg17Binaries(`postgres@${digestA}`, {
    nameFactory: () => `midao-pg-probe-${++sequence}`,
    runDocker: async (args) => {
      calls.push(args);
      const executable = args.at(-2);
      if (executable === '/usr/bin/psql') return 'psql (PostgreSQL) 17.6 (Debian 17.6-1.pgdg120+1)\n';
      if (executable === '/usr/bin/pg_dump') return 'pg_dump (PostgreSQL) 17.6 (Debian 17.6-1.pgdg120+1)\n';
      return 'pg_restore (PostgreSQL) 17.6 (Debian 17.6-1.pgdg120+1)\n';
    },
    cleanupContainer: async (name) => cleaned.push(name),
  });
  assert.deepEqual(Object.keys(versions), ['psql', 'pg_dump', 'pg_restore']);
  assert.deepEqual(calls.map((args) => args.at(-2)), ['/usr/bin/psql', '/usr/bin/pg_dump', '/usr/bin/pg_restore']);
  assert.deepEqual(calls.map((args) => args[args.indexOf('--name') + 1]), ['midao-pg-probe-1', 'midao-pg-probe-2', 'midao-pg-probe-3']);
  assert.deepEqual(cleaned, ['midao-pg-probe-1', 'midao-pg-probe-2', 'midao-pg-probe-3']);
  await assert.rejects(() => verifyPg17Binaries(`postgres@${digestA}`, {
    nameFactory: () => 'midao-pg-probe-invalid',
    runDocker: async () => 'psql (PostgreSQL) 16.9\n',
    cleanupContainer: async (name) => cleaned.push(name),
  }), /major 17/);
  assert.equal(cleaned.at(-1), 'midao-pg-probe-invalid');
});

test('lock generation rejects image ID/repo digest/architecture/tag substitutions', async () => {
  const [, , { buildToolchainLock }] = await modules();
  const image = fakeImage('repo/name', 'v1', digestA);
  const request = fakeRequest([image]);
  const preflight = async () => ({ cli: request.cli, docker: request.docker });
  const good = async () => JSON.stringify([{ Id: image.localImageId, Architecture: 'amd64', RepoDigests: [image.repoDigest] }]);
  const lock = await buildToolchainLock(request, { preflight, inspectImage: good, pgVersions: { psql: { path: '/usr/bin/psql', version: 'psql (PostgreSQL) 17.6' }, pg_dump: { path: '/usr/bin/pg_dump', version: 'pg_dump (PostgreSQL) 17.6' }, pg_restore: { path: '/usr/bin/pg_restore', version: 'pg_restore (PostgreSQL) 17.6' } } });
  assert.equal(lock.images[0].repoDigest, image.repoDigest);
  await assert.rejects(() => buildToolchainLock(request, { preflight, inspectImage: async () => JSON.stringify([{ Id: `sha256:${'d'.repeat(64)}`, Architecture: 'arm64', RepoDigests: ['repo/name@' + digestB] }]), pgVersions: lock.pg17.binaries }), /mismatch/);
});

test('schemas are strict and generated JSON is deterministic with no credential material', async () => {
  const schemaPaths = ['scripts/database-baseline/schemas/toolchain-supply-request.schema.json', 'scripts/database-baseline/schemas/toolchain-lock.schema.json'];
  for (const relative of schemaPaths) {
    const schema = JSON.parse(await readFile(path.join(root, relative), 'utf8'));
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  }
  const [{ stableJson }] = await modules();
  const output = stableJson({ z: 1, a: { token: undefined, b: 2 } });
  assert.equal(output, '{\n  "a": {\n    "b": 2\n  },\n  "z": 1\n}\n');
  assert.doesNotMatch(output, /credential|password|secret|token/i);
});

test('published live request and lock cover all required images and schema versions', async () => {
  const request = JSON.parse(await readFile(path.join(root, 'supabase/baselines/v1/toolchain-supply-request.json'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(root, 'supabase/baselines/v1/toolchain-lock.json'), 'utf8'));
  assert.equal(request.schemaVersion, 1);
  assert.equal(lock.schemaVersion, 1);
  assert.equal(request.images.length, 12);
  assert.deepEqual(lock.images.map((x) => x.repoDigest), request.images.map((x) => x.repoDigest));
  assert.equal(lock.pg17.majorVersion, 17);
  assert.equal(request.images.every((x) => x.localPresent), true);
});
