#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIXED_DOCKER,
  stableJson,
  strictSpawn,
  validateSupplyRequest,
  verifyToolchainPreflight,
} from './resolve-toolchain-supply.mjs';

const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
const ARCHITECTURES = new Map([['x86_64', 'amd64'], ['aarch64', 'arm64'], ['amd64', 'amd64'], ['arm64', 'arm64']]);

// Owner-approved isolated #1814 lane only. The capture/toolchain lock remains immutable.
export const RUNTIME_DB_OVERRIDE_PROFILE = 'issue1894-pg-supautils-3.2.2';
const APPROVED_RUNTIME_DB_OVERRIDE = Object.freeze({
  schemaVersion: 1,
  profile: RUNTIME_DB_OVERRIDE_PROFILE,
  toolchainLockSha256: 'f9c9daabfb47d48d074d79d6d0ef7c8749c262fc1c1d500d75682ef4dc24f094',
  registryIndexDigest: 'sha256:80d7b27c3e8d77cfa7226eee9508671796da214781ff15a35b3670d7ad5ee453',
  image: Object.freeze({
    role: 'db', repository: 'public.ecr.aws/supabase/postgres', tag: '17.6.1.143',
    repoDigest: 'public.ecr.aws/supabase/postgres@sha256:b021e96054128399f84f24e39d29c21ee7c7169515e5d9e4e99ff15d5043d1d8',
    imageId: 'sha256:2d3ac69ad5c95d81458cc93a6cc6c31a98dfa00cd28f88a0a9358d315e1c357a',
    platform: 'linux/amd64', architecture: 'amd64',
  }),
});

function assertApprovedRuntimeDbOverride(override) {
  if (!override || Object.keys(override).sort().join(',') !== 'image,profile,registryIndexDigest,schemaVersion,toolchainLockSha256'
    || !override.image || Object.keys(override.image).sort().join(',') !== 'architecture,imageId,platform,repoDigest,repository,role,tag'
    || stableJson(override) !== stableJson(APPROVED_RUNTIME_DB_OVERRIDE)) {
    throw new Error('runtime DB override profile invalid');
  }
  return APPROVED_RUNTIME_DB_OVERRIDE;
}

export function validateRuntimeDbOverride(override, lockBytes) {
  const approved = assertApprovedRuntimeDbOverride(override);
  if (!Buffer.isBuffer(lockBytes)
    || createHash('sha256').update(lockBytes).digest('hex') !== approved.toolchainLockSha256) {
    throw new Error('runtime DB override toolchain lock binding mismatch');
  }
  validateToolchainLock(JSON.parse(lockBytes.toString('utf8')));
  return approved;
}

async function readRuntimeContract(file) {
  const before = await lstat(file);
  const owned = (stat) => stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid()
    && stat.nlink === 1 && (stat.mode & 0o022) === 0 && stat.size <= 65_536;
  if (!owned(before)) throw new Error('runtime DB override source identity invalid');
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
    const opened = await handle.stat();
    bytes = await handle.readFile();
    const after = await lstat(file); const afterFd = await handle.stat();
    if (![opened, after, afterFd].every((stat) => owned(stat)
      && stat.dev === before.dev && stat.ino === before.ino && stat.mode === before.mode
      && stat.size === bytes.length && stat.size === before.size)) {
      throw new Error('runtime DB override source identity changed');
    }
    return bytes;
  } catch (error) { bytes?.fill(0); throw error; }
  finally { await handle.close(); }
}

export async function loadRuntimeDbOverride(profile) {
  if (profile !== RUNTIME_DB_OVERRIDE_PROFILE) throw new Error('runtime DB override profile invalid');
  const baseline = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../supabase/baselines/v1');
  let overrideBytes; let lockBytes;
  try {
    overrideBytes = await readRuntimeContract(path.join(baseline, 'runtime-db-override.json'));
    lockBytes = await readRuntimeContract(path.join(baseline, 'toolchain-lock.json'));
    return validateRuntimeDbOverride(JSON.parse(overrideBytes.toString('utf8')), lockBytes);
  } finally { overrideBytes?.fill(0); lockBytes?.fill(0); }
}

export async function verifyRuntimeDbOverrideImages(override, {
  inspectImage = async (ref) => strictDocker(['image', 'inspect', '--', ref]),
} = {}) {
  const { image } = assertApprovedRuntimeDbOverride(override);
  for (const ref of [image.repoDigest, `${image.repository}:${image.tag}`]) {
    let inspections;
    try { inspections = JSON.parse(await inspectImage(ref)); } catch {
      throw new Error('runtime DB override image identity invalid');
    }
    if (!Array.isArray(inspections) || inspections.length !== 1) throw new Error('runtime DB override image identity invalid');
    const inspected = parseInspection(JSON.stringify(inspections), image);
    if (inspected.Id !== image.imageId || inspected.Os !== 'linux') throw new Error('runtime DB override image identity invalid');
  }
  return image;
}

export async function verifyRenameNoReplaceRuntime(runtime = {
  path: '/usr/bin/perl', realpath: '/usr/bin/perl', version: 'v5.36.0',
  sha256: 'f01fa7776dc21c9e4b5f60b2d231ca4d96dab958b8d06aff611cb1c16f871574',
  uid: 0, gid: 0, mode: '0755', nlink: 2, platform: 'linux', architecture: 'amd64',
  syscall: 316, flag: 1,
}) {
  if (process.platform !== 'linux' || process.arch !== 'x64'
    || runtime?.path !== '/usr/bin/perl' || runtime.realpath !== '/usr/bin/perl'
    || runtime.platform !== 'linux' || runtime.architecture !== 'amd64'
    || runtime.syscall !== 316 || runtime.flag !== 1) throw new Error('rename noreplace runtime contract invalid');
  const [stat, target] = await Promise.all([lstat(runtime.path), realpath(runtime.path)]);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== runtime.uid || stat.gid !== runtime.gid
    || stat.nlink !== runtime.nlink || stat.mode.toString(8).slice(-4) !== runtime.mode || target !== runtime.realpath) {
    throw new Error('rename noreplace runtime identity mismatch');
  }
  const handle = await open(runtime.path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
    bytes = await handle.readFile();
    if (createHash('sha256').update(bytes).digest('hex') !== runtime.sha256) throw new Error('rename noreplace runtime digest mismatch');
  } finally {
    bytes?.fill(0);
    await handle.close();
  }
  const version = (await strictSpawn(runtime.path, ['-e', 'print "$^V\\n"'], { timeoutMs: 5_000 })).stdout.trim();
  if (version !== runtime.version) throw new Error('rename noreplace runtime version mismatch');
  return Object.freeze({ ...runtime });
}

async function strictDocker(args, timeoutMs = 60_000) {
  return (await strictSpawn(FIXED_DOCKER, args, { timeoutMs })).stdout;
}

async function cleanupOwnedContainer(name) {
  const result = await strictSpawn(FIXED_DOCKER, ['rm', '-f', name], { timeoutMs: 30_000, allowFailure: true });
  if (result.code === 0) return;
  const missing = `Error response from daemon: No such container: ${name}`;
  if (result.code === 1 && result.signal === null && result.stderr.trim() === missing) return;
  throw new Error(`owned container cleanup failed: ${name}`);
}

export async function verifyDockerIdentity(dockerPath) {
  if (dockerPath !== FIXED_DOCKER || !path.isAbsolute(dockerPath)) {
    throw new Error('Docker path substitution refused');
  }
  const [link, target] = await Promise.all([lstat(dockerPath), realpath(dockerPath)]);
  if (!link.isFile() || link.isSymbolicLink() || link.nlink !== 1
    || link.uid !== 0 || link.gid !== 0 || (link.mode & 0o7777) !== 0o755
    || target !== FIXED_DOCKER) {
    throw new Error('Docker filesystem identity mismatch');
  }
  const [endpointRaw, infoRaw] = await Promise.all([
    strictDocker(['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}']),
    strictDocker(['info', '--format', '{{.Architecture}}']),
  ]);
  const endpoint = JSON.parse(endpointRaw.trim());
  if (endpoint !== 'unix:///var/run/docker.sock') throw new Error('Docker endpoint mismatch');
  const architecture = ARCHITECTURES.get(infoRaw.trim());
  if (!architecture) throw new Error(`Docker architecture unsupported: ${infoRaw.trim()}`);
  return { path: dockerPath, realpath: target, endpoint, architecture };
}

export async function verifyPg17Binaries(repoDigest, {
  runDocker = (args) => strictDocker(args),
  cleanupContainer = cleanupOwnedContainer,
  nameFactory = () => `midao-pg17-probe-${randomUUID()}`,
} = {}) {
  if (!/@sha256:[0-9a-f]{64}$/.test(repoDigest)) throw new Error('PG17 image must use an immutable digest');
  const binaries = {};
  for (const name of ['psql', 'pg_dump', 'pg_restore']) {
    const executable = `/usr/bin/${name}`;
    const containerName = nameFactory();
    if (!/^midao-[a-z0-9-]{1,100}$/.test(containerName)) throw new Error('owned probe container name invalid');
    let primaryError;
    try {
      const version = String(await runDocker(['run', '--pull=never', '--name', containerName, '--rm', '--network', 'none', repoDigest, executable, '--version'])).trim();
      if (!new RegExp(`^${name} \\(PostgreSQL\\) 17(?:\\.|$)`).test(version)) {
        throw new Error(`${name} must be exact PostgreSQL major 17`);
      }
      binaries[name] = { path: executable, version };
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      try {
        await cleanupContainer(containerName);
      } catch (cleanupError) {
        if (primaryError) throw new AggregateError([primaryError, cleanupError], 'PG17 probe and owned cleanup failed');
        throw cleanupError;
      }
    }
  }
  return binaries;
}

function parseInspection(output, image) {
  const parsed = JSON.parse(output);
  const inspection = Array.isArray(parsed) ? parsed[0] : null;
  if (!inspection || !IMAGE_ID.test(inspection.Id ?? '')
    || inspection.Architecture !== image.architecture
    || !Array.isArray(inspection.RepoDigests)
    || !inspection.RepoDigests.includes(image.repoDigest)
    || (image.localPresent && inspection.Id !== image.localImageId)) {
    throw new Error(`image identity mismatch: ${image.repoDigest}`);
  }
  return inspection;
}

export async function buildToolchainLock(request, {
  inspectImage = async (repoDigest) => strictDocker(['image', 'inspect', repoDigest]),
  pgVersions,
  preflight = verifyToolchainPreflight,
  renameRuntime = verifyRenameNoReplaceRuntime,
} = {}) {
  validateSupplyRequest(request);
  const live = await preflight(request);
  const images = [];
  for (const image of request.images) {
    const inspection = parseInspection(await inspectImage(image.repoDigest), image);
    images.push({
      role: image.role,
      repository: image.repository,
      tag: image.tag,
      repoDigest: image.repoDigest,
      imageId: inspection.Id,
      platform: image.platform,
      architecture: inspection.Architecture,
    });
  }
  const pgImage = images.find((image) => image.role === 'pg17-client') ?? images[0];
  if (!pgImage) throw new Error('PG17 image missing');
  if (!pgVersions || !['psql', 'pg_dump', 'pg_restore'].every((name) => pgVersions[name]?.path === `/usr/bin/${name}` && /\(PostgreSQL\) 17(?:\.|$)/.test(pgVersions[name]?.version ?? ''))) {
    throw new Error('PG17 binary lock mismatch');
  }
  const lockedRenameRuntime = await renameRuntime();
  return {
    schemaVersion: 1,
    architecture: request.architecture,
    cli: live.cli,
    docker: live.docker,
    renameNoReplace: lockedRenameRuntime,
    images,
    pg17: {
      image: pgImage.repoDigest,
      majorVersion: 17,
      binaries: pgVersions,
    },
  };
}

function validateToolchainLock(lock) {
  if (!lock || lock.schemaVersion !== 1 || !Array.isArray(lock.images) || lock.images.length === 0) throw new Error('toolchain lock invalid');
  if (lock.pg17?.majorVersion !== 17) throw new Error('toolchain lock PG17 invalid');
  if (lock.renameNoReplace?.path !== '/usr/bin/perl' || lock.renameNoReplace.realpath !== '/usr/bin/perl'
    || lock.renameNoReplace.platform !== 'linux' || lock.renameNoReplace.architecture !== 'amd64'
    || lock.renameNoReplace.syscall !== 316 || lock.renameNoReplace.flag !== 1
    || !/^[0-9a-f]{64}$/u.test(lock.renameNoReplace.sha256 ?? '')) throw new Error('toolchain lock rename noreplace invalid');
  for (const image of lock.images) {
    if (!/@sha256:[0-9a-f]{64}$/.test(image.repoDigest ?? '') || !IMAGE_ID.test(image.imageId ?? '')) throw new Error('toolchain lock image invalid');
  }
  return lock;
}

export async function verifyLockedPg17Runtime(lock, {
  verifyDocker = verifyDockerIdentity,
  inspectImage = async (repoDigest) => strictDocker(['image', 'inspect', repoDigest]),
  verifyBinaries = verifyPg17Binaries,
  verifyRenameRuntime = verifyRenameNoReplaceRuntime,
} = {}) {
  validateToolchainLock(lock);
  await verifyRenameRuntime(lock.renameNoReplace);
  const docker = await verifyDocker(lock.docker?.path);
  const image = lock.images.find((entry) => entry.role === 'pg17-client');
  if (!image || image.repoDigest !== lock.pg17.image || image.architecture !== docker.architecture) {
    throw new Error('locked PG17 image identity mismatch');
  }
  const inspection = parseInspection(await inspectImage(image.repoDigest), image);
  if (inspection.Id !== image.imageId) throw new Error('locked PG17 image ID mismatch');
  const binaries = await verifyBinaries(image.repoDigest);
  for (const name of ['psql', 'pg_dump', 'pg_restore']) {
    if (binaries[name]?.path !== lock.pg17.binaries[name]?.path
      || binaries[name]?.version !== lock.pg17.binaries[name]?.version) {
      throw new Error(`locked PG17 ${name} runtime mismatch`);
    }
  }
  return Object.freeze({ docker, image, binaries });
}

async function atomicWriteLock(output, lock) {
  const directory = path.dirname(output);
  const temporary = `${output}.tmp-${process.pid}-${Date.now()}`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(stableJson(lock), 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    validateToolchainLock(JSON.parse(await readFile(temporary, 'utf8')));
    await rename(temporary, output);
    const directoryHandle = await open(directory, 'r');
    await directoryHandle.sync();
    await directoryHandle.close();
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await rm(temporary, { force: true }).catch((cleanup) => {
      throw new AggregateError([error, cleanup], 'lock publish and cleanup failed');
    });
    throw error;
  }
}

function value(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage() {
  return 'Usage: verify-toolchain-lock.mjs --request <json> --output <json> --docker /usr/bin/docker\n';
}

async function main(args) {
  if (args.includes('--help')) {
    process.stdout.write(usage());
    return;
  }
  if (args[0] === '--runtime-db-override' && args.length === 2) {
    process.stdout.write(stableJson(await loadRuntimeDbOverride(args[1])));
    return;
  }
  const requestPath = value(args, '--request');
  const output = value(args, '--output');
  const dockerPath = value(args, '--docker');
  if (!requestPath || !output || dockerPath !== FIXED_DOCKER) throw new Error(usage().trim());
  const requestBytes = await readFile(requestPath);
  const request = validateSupplyRequest(JSON.parse(requestBytes.toString('utf8')));
  const live = await verifyToolchainPreflight(request);
  if (request.images.some((image) => !image.localPresent)) throw new Error('cannot publish lock while required images are missing');
  const pgImage = request.images.find((image) => image.role === 'pg17-client');
  if (!pgImage) throw new Error('PG17 client image missing');
  const pgVersions = await verifyPg17Binaries(pgImage.repoDigest);
  const lock = await buildToolchainLock(request, { pgVersions, preflight: async () => live });
  lock.requestSha256 = createHash('sha256').update(requestBytes).digest('hex');
  await atomicWriteLock(output, lock);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`toolchain verifier: ${error.message}\n`);
    process.exitCode = 1;
  });
}
