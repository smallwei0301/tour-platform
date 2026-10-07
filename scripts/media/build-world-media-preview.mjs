import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { worldMediaBuildContext, worldMediaBuildMode } from './world-media-build-contract.mjs';
import { bootstrapWorldMediaNode22 } from './bootstrap-world-media-node22.mjs';
import { createWorldMediaBlobAdapter, worldMediaHttpDiagnostic } from './world-media-blob-adapter.mjs';
import { prepareWorldMediaPreview, validateWorldMediaPreviewOutput } from './prepare-world-media-preview.mjs';

const originalBuild = () => command('npm', ['run', 'build', '-w', '@tour/web']);
function command(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('close', (code, signal) => signal ? reject(new Error('WORLD_MEDIA_CHILD_SIGNAL')) : resolve(code ?? 1));
  });
}

export async function runWorldMediaBuild({ env = process.env, sourceRoot, appRoot, nodeVersion = process.versions.node, exclusiveCheckout = false, build = originalBuild, loadAdapter = loadRealAdapter, bootstrapNode22 = bootstrapWorldMediaNode22 }) {
  const context = { nodeVersion, sourceRoot, appRoot, exclusiveCheckout };
  const mode = worldMediaBuildContext(env, context);
  if (mode === 'local') return build(); // 不bootstrap／載SDK、不碰Blob、manifest或原影片
  if (!/^22\./.test(nodeVersion)) return bootstrapNode22({ env, sourceRoot, appRoot, exclusiveCheckout });
  worldMediaBuildMode(env, context); // SDK／sync只能在actualNode22 child通過原版本gate後執行
  const adapter = await loadAdapter();
  const prepared = await prepareWorldMediaPreview({ sourceRoot, adapter, exclusiveCheckout });
  try {
    const code = await build();
    if (code !== 0) { await prepared.rollback(); return code; }
    const result = await validateWorldMediaPreviewOutput(sourceRoot, prepared);
    console.log(JSON.stringify({ phase: 'preview-build-contract', ...result }));
    return 0;
  } catch (error) {
    try { await prepared.rollback(); } catch { error.rollbackStatus = 'DISPOSABLE_RESTORE_INCOMPLETE'; }
    throw error;
  }
}

async function loadRealAdapter() {
  const runtime = path.join(path.dirname(fileURLToPath(import.meta.url)), 'blob-runtime');
  // 僅指定 Preview 分支才安裝 SDK；官方 npm lockfile，不改共用 manifests、不跑 lifecycle。
  const code = await command('npm', ['ci', '--prefix', runtime, '--workspaces=false', '--ignore-scripts', '--no-audit', '--no-fund', '--registry', 'https://registry.npmjs.org', '--fetch-retries', '0']);
  if (code !== 0) throw new Error('WORLD_MEDIA_SDK_INSTALL_FAILED');
  const sdk = createRequire(path.join(runtime, 'package.json'))('@vercel/blob');
  return createWorldMediaBlobAdapter({ sdk });
}

async function cli() {
  const sourceRoot = await fs.realpath(path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'));
  const appRoot = await fs.realpath(process.cwd());
  // Caller契約：managed Vercel disposable checkout 與此wrapper全程獨占，沒有其他writer。
  // 這不是同UID敵對process不存在的證明；未知路徑或caller環境會fail closed。
  const exclusiveCheckout = /^\/vercel\/path\d+$/.test(sourceRoot) && appRoot === `${sourceRoot}/apps/web`;
  return runWorldMediaBuild({ sourceRoot, appRoot, exclusiveCheckout });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().then((code) => { process.exitCode = code; }).catch((error) => {
    // 不印SDK request、token、env或原始provider payload；只回安全錯誤碼。
    const safe = /^WORLD_MEDIA_[A-Z_]+$/.test(error.message) ? error.message : 'WORLD_MEDIA_TRIAL_BUILD_FAILED';
    console.error(safe);
    const diagnostic = worldMediaHttpDiagnostic(error);
    if (diagnostic) console.error(JSON.stringify(diagnostic));
    if (error.rollbackStatus) console.error(error.rollbackStatus);
    process.exitCode = 1;
  });
}
