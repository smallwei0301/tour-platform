import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { worldMediaBuildContext } from './world-media-build-contract.mjs';

// 與既有 operator provision 相同的 official archive；不改該helper或其workspace限制。
export const WORLD_MEDIA_NODE22 = Object.freeze({
  version: '22.23.1',
  archive: 'node-v22.23.1-linux-x64.tar.xz',
  url: 'https://nodejs.org/dist/v22.23.1/node-v22.23.1-linux-x64.tar.xz',
  sha256: '9749e988f437343b7fa832c69ded82a312e41a03116d766797ac14f6f9eee578',
});

export function verifyWorldMediaNode22Archive(bytes) {
  if (createHash('sha256').update(bytes).digest('hex') !== WORLD_MEDIA_NODE22.sha256) throw new Error('WORLD_MEDIA_NODE22_ARCHIVE_INVALID');
}

function command(program, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('close', (code, signal) => signal ? reject(new Error('WORLD_MEDIA_CHILD_SIGNAL')) : resolve(code ?? 1));
  });
}

/** exact Preview caller獨占的一次性build；只改本process的toolchain變數，OIDC由child自動繼承。 */
export async function bootstrapWorldMediaNode22({ sourceRoot, appRoot, exclusiveCheckout = false, env = process.env }) {
  if (worldMediaBuildContext(env, { sourceRoot, appRoot, exclusiveCheckout }) !== 'blob-trial') throw new Error('WORLD_MEDIA_NODE22_TRIAL_CONTEXT_REQUIRED');
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('WORLD_MEDIA_NODE22_PLATFORM_REQUIRED');
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'tour-world-media-node22-'));
  const archive = path.join(stage, WORLD_MEDIA_NODE22.archive);
  const priorPath = process.env.PATH;
  const priorRoot = process.env.TP_NODE22_ROOT;
  try {
    if (await command('curl', ['--fail', '--location', '--proto', '=https', '--tlsv1.2', '--output', archive, WORLD_MEDIA_NODE22.url]) !== 0) throw new Error('WORLD_MEDIA_NODE22_DOWNLOAD_FAILED');
    verifyWorldMediaNode22Archive(await fs.readFile(archive));
    if (await command('tar', ['-xJf', archive, '-C', stage]) !== 0) throw new Error('WORLD_MEDIA_NODE22_EXTRACT_FAILED');
    const root = await fs.realpath(path.join(stage, `node-v${WORLD_MEDIA_NODE22.version}-linux-x64`));
    process.env.TP_NODE22_ROOT = root;
    // 原canonical helper核完整official file/link digests、symlink boundary及actual版本。
    if (await command('bash', [path.join(sourceRoot, 'scripts/toolchain/tp-node22.sh'), '--check']) !== 0) throw new Error('WORLD_MEDIA_NODE22_VERIFY_FAILED');
    process.env.PATH = `${root}/bin:${priorPath || ''}`;
    console.log(JSON.stringify({ phase: 'verified-node22-bootstrap', version: WORLD_MEDIA_NODE22.version }));
    return await command(path.join(root, 'bin/node'), [path.join(sourceRoot, 'scripts/media/build-world-media-preview.mjs')], { cwd: appRoot });
  } finally {
    if (priorPath === undefined) delete process.env.PATH; else process.env.PATH = priorPath;
    if (priorRoot === undefined) delete process.env.TP_NODE22_ROOT; else process.env.TP_NODE22_ROOT = priorRoot;
    await fs.rm(stage, { recursive: true, force: true });
  }
}
