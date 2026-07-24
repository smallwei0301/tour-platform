#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const FIXED_CLI = '/root/.hermes/toolchains/supabase/2.87.2/supabase';
export const FIXED_DOCKER = '/usr/bin/docker';
export const FIXED_CLI_SHA256 = 'e325dd50b274e88fd1416f93b9e063902827ae326d356ab7f9dc604c3eba5c59';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
const EMBEDDED_START = '# Exposed for updates';
const EMBEDDED_END = '# Append to JobImages when adding new dependencies below';

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, sorted(value[key])]));
  return value;
}

export function stableJson(value) {
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}

export async function strictSpawn(executable, args, { timeoutMs = 30_000, allowFailure = false } = {}) {
  const home = await mkdtemp(path.join(tmpdir(), 'midao-toolchain-'));
  await chmod(home, 0o700);
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        env: { HOME: home, PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', DOCKER_HOST: 'unix:///var/run/docker.sock' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const stdout = [];
      const stderr = [];
      let bytes = 0;
      const collect = (chunks) => (chunk) => {
        bytes += chunk.length;
        if (bytes > 16 * 1024 * 1024) child.kill('SIGTERM');
        else chunks.push(chunk);
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
        const result = { code, signal, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') };
        if (code === 0 || allowFailure) resolve(result);
        else reject(new Error(`${path.basename(executable)} ${args.slice(0, 2).join(' ')} failed (${signal ?? code}): ${result.stderr.trim()}`));
      });
    });
  } finally {
    await rm(home, { recursive: true });
  }
}

export async function verifyCliIdentity(cliPath) {
  if (cliPath !== FIXED_CLI || !path.isAbsolute(cliPath)) throw new Error('CLI path substitution refused');
  const [link, target, bytes] = await Promise.all([lstat(cliPath), realpath(cliPath), readFile(cliPath)]);
  if (!link.isFile() || link.isSymbolicLink() || link.nlink !== 1 || link.uid !== 0 || link.gid !== 0 || (link.mode & 0o7777) !== 0o755 || target !== FIXED_CLI) throw new Error('CLI filesystem identity mismatch');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== FIXED_CLI_SHA256) throw new Error('CLI SHA-256 mismatch');
  const result = await strictSpawn(cliPath, ['--version']);
  const version = result.stdout.trim();
  if (version !== '2.87.2') throw new Error(`CLI version mismatch: ${version}`);
  return { path: cliPath, realpath: target, version, sha256, uid: link.uid, gid: link.gid, mode: '0755', nlink: link.nlink };
}

function tomlBoolean(config, section, fallback) {
  const match = config.match(new RegExp(`(?:^|\\n)\\[${section.replace('.', '\\.') }\\]\\s*\\n([\\s\\S]*?)(?=\\n\\[|$)`));
  if (!match) return fallback;
  const enabled = match[1].match(/(?:^|\n)\s*enabled\s*=\s*(true|false)\s*(?:\n|$)/);
  return enabled ? enabled[1] === 'true' : fallback;
}

function extractEmbeddedDockerfile(cliBytes) {
  const text = cliBytes.toString('latin1');
  const start = text.indexOf(EMBEDDED_START);
  const end = text.indexOf(EMBEDDED_END, start);
  if (start < 0 || end < 0 || text.indexOf(EMBEDDED_START, start + 1) >= 0) throw new Error('exact embedded CLI image contract not found');
  return text.slice(start, end + EMBEDDED_END.length);
}

export function parseRequiredImages(cliBytes, config) {
  if (!/(?:^|\n)\s*major_version\s*=\s*17\s*(?:\n|$)/.test(config)) throw new Error('db.major_version must be exact 17');
  if (tomlBoolean(config, 'analytics', true)) throw new Error('analytics must remain disabled');
  const dockerfile = extractEmbeddedDockerfile(cliBytes);
  const aliases = new Map([...dockerfile.matchAll(/^FROM\s+(\S+):(\S+)\s+AS\s+(\S+)\s*$/gm)].map((match) => [match[3], { sourceRepository: match[1], tag: match[2] }]));
  const definitions = [
    ['pg17-client', 'postgres', '17', true],
    ['db', 'pg', null, true],
    ['gateway', 'kong', null, tomlBoolean(config, 'api', true)],
    ['api', 'postgrest', null, tomlBoolean(config, 'api', true)],
    ['auth', 'gotrue', null, tomlBoolean(config, 'auth', true)],
    ['mailpit', 'mailpit', null, tomlBoolean(config, 'inbucket', true)],
    ['realtime', 'realtime', null, tomlBoolean(config, 'realtime', true)],
    ['storage', 'storage', null, tomlBoolean(config, 'storage', true)],
    ['imgproxy', 'imgproxy', null, tomlBoolean(config, 'storage', true)],
    ['edge-runtime', 'edgeruntime', null, tomlBoolean(config, 'edge_runtime', true)],
    ['studio', 'studio', null, tomlBoolean(config, 'studio', true)],
    ['postgres-meta', 'pgmeta', null, tomlBoolean(config, 'studio', true)],
  ];
  return definitions.filter((entry) => entry[3]).map(([role, alias, forcedTag]) => {
    if (role === 'pg17-client') return { role, repository: alias, tag: forcedTag };
    const image = aliases.get(alias);
    if (!image) throw new Error(`required image alias missing from embedded CLI contract: ${alias}`);
    return { role, repository: `public.ecr.aws/supabase/${image.sourceRepository.split('/').at(-1)}`, tag: image.tag };
  });
}

export function parseManifestMetadata(output, architecture) {
  const parsed = JSON.parse(output);
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const entry = entries.find((candidate) => {
    const platform = candidate.Platform ?? candidate.Descriptor?.platform ?? candidate.Descriptor?.Platform;
    return platform?.os === 'linux' && platform?.architecture === architecture;
  });
  if (!entry) throw new Error(`registry metadata has no linux/${architecture} platform descriptor`);
  const descriptor = entry.Descriptor ?? entry.descriptor;
  const digest = descriptor?.digest ?? descriptor?.Digest;
  if (!DIGEST.test(digest ?? '')) throw new Error('registry metadata returned invalid immutable digest');
  const manifest = entry.SchemaV2Manifest ?? entry.schemaV2Manifest ?? {};
  const estimatedBytes = Number(manifest.config?.size ?? 0) + (manifest.layers ?? []).reduce((sum, layer) => sum + Number(layer.size ?? 0), 0);
  if (!Number.isSafeInteger(estimatedBytes) || estimatedBytes < 0) throw new Error('registry metadata returned invalid byte estimate');
  return { digest, platform: `linux/${architecture}`, estimatedBytes };
}

export function parseLocalTaggedMetadata(output, repository, architecture) {
  const parsed = JSON.parse(output);
  const inspection = Array.isArray(parsed) ? parsed[0] : null;
  if (!inspection || !IMAGE_ID.test(inspection.Id ?? '')) throw new Error('local tagged image identity invalid');
  if (inspection.Architecture !== architecture) throw new Error('local tagged image architecture mismatch');
  const prefix = `${repository}@`;
  const matches = [...new Set((inspection.RepoDigests ?? []).filter((value) => value.startsWith(prefix)))];
  if (matches.length !== 1) throw new Error('local tagged image must expose exactly one repository digest');
  const digest = matches[0].slice(prefix.length);
  if (!DIGEST.test(digest)) throw new Error('local tagged image immutable digest invalid');
  return { digest, platform: `linux/${architecture}`, estimatedBytes: 0 };
}

function exactKeys(object, keys, label) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error(`${label} must be an object`);
  const extras = Object.keys(object).filter((key) => !keys.includes(key));
  if (extras.length) throw new Error(`${label} unexpected key: ${extras[0]}`);
}

export function validateSupplyRequest(request) {
  exactKeys(request, ['schemaVersion', 'approval', 'architecture', 'cli', 'docker', 'images'], 'request');
  if (request.schemaVersion !== 1 || !['amd64', 'arm64'].includes(request.architecture)) throw new Error('request schemaVersion or architecture invalid');
  exactKeys(request.approval, ['status', 'approvedDigests'], 'approval');
  exactKeys(request.cli, ['path', 'realpath', 'version', 'sha256', 'uid', 'gid', 'mode', 'nlink'], 'cli');
  exactKeys(request.docker, ['path', 'realpath', 'endpoint', 'architecture'], 'docker');
  if (request.cli.path !== FIXED_CLI || request.cli.realpath !== FIXED_CLI
    || request.cli.version !== '2.87.2' || request.cli.sha256 !== FIXED_CLI_SHA256
    || request.cli.uid !== 0 || request.cli.gid !== 0 || request.cli.mode !== '0755' || request.cli.nlink !== 1) {
    throw new Error('CLI identity invalid');
  }
  if (request.docker.path !== FIXED_DOCKER || request.docker.realpath !== FIXED_DOCKER
    || request.docker.endpoint !== 'unix:///var/run/docker.sock'
    || request.docker.architecture !== request.architecture) {
    throw new Error('Docker identity invalid');
  }
  if (!['pending', 'approved', 'not-required'].includes(request.approval.status) || !Array.isArray(request.approval.approvedDigests)) throw new Error('approval invalid');
  const seenDigests = new Set();
  for (const image of request.images ?? []) {
    exactKeys(image, ['role', 'repository', 'tag', 'repoDigest', 'platform', 'architecture', 'localPresent', 'localImageId', 'estimatedMissingBytes'], 'image');
    if (seenDigests.has(image.repoDigest)) throw new Error('duplicate image');
    seenDigests.add(image.repoDigest);
    if (image.repoDigest !== `${image.repository}@${image.repoDigest.split('@').at(-1)}` || !DIGEST.test(image.repoDigest.split('@').at(-1) ?? '')) throw new Error('image immutable repo digest invalid');
    if (image.architecture !== request.architecture || image.platform !== `linux/${request.architecture}`) throw new Error('image architecture mismatch');
    if (typeof image.localPresent !== 'boolean' || (image.localPresent && !IMAGE_ID.test(image.localImageId ?? '')) || (!image.localPresent && image.localImageId !== null)) throw new Error('local image identity invalid');
    if (!Number.isSafeInteger(image.estimatedMissingBytes) || image.estimatedMissingBytes < 0) throw new Error('estimated bytes invalid');
  }
  return request;
}

export async function inspectExactImage(dockerPath, repoDigest, architecture, { allowMissing = false } = {}) {
  const result = await strictSpawn(dockerPath, ['image', 'inspect', repoDigest], { allowFailure: allowMissing });
  if (result.code !== 0) return null;
  const [inspection] = JSON.parse(result.stdout);
  if (!inspection || !IMAGE_ID.test(inspection.Id ?? '') || inspection.Architecture !== architecture || !inspection.RepoDigests?.includes(repoDigest)) throw new Error(`local image read-back mismatch: ${repoDigest}`);
  return { imageId: inspection.Id, architecture: inspection.Architecture };
}

async function atomicWriteJson(output, value) {
  const directory = path.dirname(output);
  await mkdir(directory, { recursive: true, mode: 0o755 });
  const temporary = `${output}.tmp-${process.pid}-${Date.now()}`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(stableJson(value), 'utf8');
    await handle.sync();
    await handle.close(); handle = undefined;
    const written = JSON.parse(await readFile(temporary, 'utf8'));
    validateSupplyRequest(written);
    await rename(temporary, output);
    const directoryHandle = await open(directory, 'r');
    await directoryHandle.sync(); await directoryHandle.close();
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await rm(temporary, { force: true }).catch((cleanup) => { throw new AggregateError([error, cleanup], 'publish and cleanup failed'); });
    throw error;
  }
}

export async function resolveSupply({ cliPath, dockerPath = FIXED_DOCKER, configPath = 'supabase/config.toml', output }) {
  const cli = await verifyCliIdentity(cliPath);
  const [{ verifyDockerIdentity }, cliBytes, config] = await Promise.all([import('./verify-toolchain-lock.mjs'), readFile(cliPath), readFile(configPath, 'utf8')]);
  const docker = await verifyDockerIdentity(dockerPath);
  const required = parseRequiredImages(cliBytes, config);
  // Metadata-only requests are independent and bounded. Resolve them concurrently so a
  // slow registry cannot multiply the per-command timeout by the full image count.
  const images = await Promise.all(required.map(async (image) => {
    const tagged = `${image.repository}:${image.tag}`;
    const localTag = await strictSpawn(dockerPath, ['image', 'inspect', tagged], { allowFailure: true });
    const metadata = localTag.code === 0
      ? parseLocalTaggedMetadata(localTag.stdout, image.repository, docker.architecture)
      : parseManifestMetadata((await strictSpawn(
        dockerPath,
        ['manifest', 'inspect', '--verbose', tagged],
        { timeoutMs: 45_000 },
      )).stdout, docker.architecture);
    const repoDigest = `${image.repository}@${metadata.digest}`;
    const local = await inspectExactImage(dockerPath, repoDigest, docker.architecture, { allowMissing: true });
    return { ...image, repoDigest, platform: metadata.platform, architecture: docker.architecture, localPresent: Boolean(local), localImageId: local?.imageId ?? null, estimatedMissingBytes: local ? 0 : metadata.estimatedBytes };
  }));
  const missing = images.filter((image) => !image.localPresent);
  const request = { schemaVersion: 1, approval: { status: missing.length ? 'pending' : 'not-required', approvedDigests: [] }, architecture: docker.architecture, cli, docker, images };
  validateSupplyRequest(request);
  await atomicWriteJson(output, request);
  return request;
}

function usage() {
  return 'Usage: resolve-toolchain-supply.mjs --cli <absolute> --registry-metadata-only --output <json>\n';
}

async function main(args) {
  if (args.includes('--help')) { process.stdout.write(usage()); return; }
  const value = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
  if (!args.includes('--registry-metadata-only') || !value('--cli') || !value('--output')) throw new Error(usage().trim());
  await resolveSupply({ cliPath: value('--cli'), output: value('--output') });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main(process.argv.slice(2)).catch((error) => { process.stderr.write(`toolchain resolver: ${error.message}\n`); process.exitCode = 1; });
