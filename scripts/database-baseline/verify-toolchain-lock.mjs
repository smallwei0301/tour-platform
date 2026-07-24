#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdtemp, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  FIXED_DOCKER,
  stableJson,
  validateSupplyRequest,
} from './resolve-toolchain-supply.mjs';

const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
const ARCHITECTURES = new Map([['x86_64', 'amd64'], ['aarch64', 'arm64'], ['amd64', 'amd64'], ['arm64', 'arm64']]);

async function strictDocker(args, timeoutMs = 60_000) {
  const home = await mkdtemp(path.join(tmpdir(), 'midao-docker-'));
  await chmod(home, 0o700);
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(FIXED_DOCKER, args, {
        env: {
          HOME: home,
          PATH: '/usr/bin:/bin',
          LANG: 'C',
          LC_ALL: 'C',
          DOCKER_HOST: 'unix:///var/run/docker.sock',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const stdout = [];
      const stderr = [];
      let bytes = 0;
      const collect = (target) => (chunk) => {
        bytes += chunk.length;
        if (bytes > 16 * 1024 * 1024) child.kill('SIGTERM');
        else target.push(chunk);
      };
      child.stdout.on('data', collect(stdout));
      child.stderr.on('data', collect(stderr));
      let killTimer;
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        killTimer = setTimeout(() => child.kill('SIGKILL'), 2_000);
      }, timeoutMs);
      child.once('error', reject);
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        const out = Buffer.concat(stdout).toString('utf8');
        const err = Buffer.concat(stderr).toString('utf8');
        if (code === 0) resolve(out);
        else reject(new Error(`docker ${args.slice(0, 2).join(' ')} failed (${signal ?? code}): ${err.trim()}`));
      });
    });
  } finally {
    await rm(home, { recursive: true });
  }
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

export async function verifyPg17Binaries(repoDigest, runDocker = (args) => strictDocker(args)) {
  if (!/@sha256:[0-9a-f]{64}$/.test(repoDigest)) throw new Error('PG17 image must use an immutable digest');
  const binaries = {};
  for (const name of ['psql', 'pg_dump', 'pg_restore']) {
    const executable = `/usr/bin/${name}`;
    const version = String(await runDocker(['run', '--rm', '--network', 'none', repoDigest, executable, '--version'])).trim();
    if (!new RegExp(`^${name.replace('_', '_')} \\(PostgreSQL\\) 17(?:\\.|$)`).test(version)) {
      throw new Error(`${name} must be exact PostgreSQL major 17`);
    }
    binaries[name] = { path: executable, version };
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
  dockerIdentity = request.docker,
} = {}) {
  validateSupplyRequest(request);
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
    cli: request.cli,
    docker: dockerIdentity,
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
  if (request.images.some((image) => !image.localPresent)) throw new Error('cannot publish lock while required images are missing');
  const docker = await verifyDockerIdentity(dockerPath);
  if (stableJson(docker) !== stableJson(request.docker)) throw new Error('Docker identity drift');
  const pgImage = request.images.find((image) => image.role === 'pg17-client');
  if (!pgImage) throw new Error('PG17 client image missing');
  const pgVersions = await verifyPg17Binaries(pgImage.repoDigest);
  const lock = await buildToolchainLock(request, { pgVersions, dockerIdentity: docker });
  lock.requestSha256 = createHash('sha256').update(requestBytes).digest('hex');
  await atomicWriteLock(output, lock);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`toolchain verifier: ${error.message}\n`);
    process.exitCode = 1;
  });
}
