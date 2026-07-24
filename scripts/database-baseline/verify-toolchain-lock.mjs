#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
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
      const version = String(await runDocker(['run', '--name', containerName, '--rm', '--network', 'none', repoDigest, executable, '--version'])).trim();
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
  return {
    schemaVersion: 1,
    architecture: request.architecture,
    cli: live.cli,
    docker: live.docker,
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
  for (const image of lock.images) {
    if (!/@sha256:[0-9a-f]{64}$/.test(image.repoDigest ?? '') || !IMAGE_ID.test(image.imageId ?? '')) throw new Error('toolchain lock image invalid');
  }
  return lock;
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
