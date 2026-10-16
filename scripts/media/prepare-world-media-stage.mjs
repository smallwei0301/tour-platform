import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WORLD_MEDIA_FILES, validateWorldMediaManifest } from '../../apps/web/src/lib/scroll-world/media-manifest.mjs';
import { inventoryWorldMedia } from './world-media-sync.mjs';
import { openSourceDirectory, createStageDirectory, inspectSourceFile, readSourceFile, writeStageFile, removeOwnedStage, validateOwnedStageContents } from './secure-source-files.mjs';

const statePath = 'apps/web/src/lib/scroll-world/media-trial-state.mjs';
const localState = { mode: 'local', storeOrigin: null, manifest: null };
const excludedVideos = new Set(WORLD_MEDIA_FILES.map((key) => `apps/web/public${key}`));
const inside = (parent, child) => child === parent || child.startsWith(`${parent}${path.sep}`);

// 排除部署連線、runtime state、credentials 與既有 build/cache；即使誤入 tracked 也不複製。
const operationalPath = (relative) => relative.split('/').some((part) => ['.git', 'node_modules', '.next', '.vercel', 'test-results', 'playwright-report'].includes(part)) || relative.startsWith('.claude/state/') || /(^|\/)\.env(?:\.|$)/.test(relative) && !/\.env\.(?:example|sample)$/.test(relative);

function sourcePaths(sourceRoot) {
  return [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: sourceRoot, encoding: 'utf8' }).split('\0').filter(Boolean))].sort();
}

/**
 * 只建立新的 source staging，不修改／刪除 source、不上傳、不 build、不 deploy。
 * Blob sync 必須先由完整 source 完成；此處驗 full inventory 才排除 deploy copies。
 * staging 成功才回傳，呼叫方必須 await 成功後才進入 build。
 * exclusiveControl 必須由 caller 聲明：checkout、parent、stage namespace 全程無並行 writer。
 */
export async function prepareWorldMediaStage({ sourceRoot, stageRoot, mode = 'local', storeOrigin = null, manifest = null, exclusiveControl = false }) {
  if (exclusiveControl !== true) throw new Error('WORLD_MEDIA_EXCLUSIVE_CONTROL_REQUIRED');
  if (!['local', 'blob-trial'].includes(mode)) throw new Error('WORLD_MEDIA_MODE_INVALID');
  const source = await fs.realpath(sourceRoot);
  const target = path.resolve(stageRoot);
  const parent = await fs.realpath(path.dirname(target));
  if (parent !== path.dirname(target)) throw new Error('WORLD_MEDIA_STAGE_PARENT_CANONICAL_REQUIRED');
  if (inside(source, target) || inside(target, source)) throw new Error('WORLD_MEDIA_STAGE_SOURCE_OVERLAP');
  try { await fs.lstat(target); throw new Error('WORLD_MEDIA_STAGE_DESTINATION_EXISTS'); } catch (error) { if (error.code !== 'ENOENT') throw error; }

  // 全部驗證都在 mkdir 前；缺失或 stale trial manifest 不能建出 local-fallback bundle。
  const inventory = await inventoryWorldMedia(source);
  const validated = mode === 'blob-trial' ? validateWorldMediaManifest(manifest, storeOrigin, inventory) : null;
  const files = sourcePaths(source).filter((relative) => !operationalPath(relative));
  for (const relative of files) if (path.isAbsolute(relative) || relative.split('/').includes('..')) throw new Error('WORLD_MEDIA_STAGE_SOURCE_PATH_INVALID');
  if (!files.includes(statePath) || WORLD_MEDIA_FILES.some((key) => !files.includes(`apps/web/public${key}`))) throw new Error('WORLD_MEDIA_STAGE_SOURCE_INCOMPLETE');

  const sourceAnchor = await openSourceDirectory(source);
  let parentAnchor = null;
  let stageAnchor = null;
  try {
    parentAnchor = await openSourceDirectory(parent);
    const snapshots = new Map();
    for (const relative of files) snapshots.set(relative, await inspectSourceFile(sourceAnchor, relative));
    stageAnchor = await createStageDirectory(parentAnchor, path.basename(target), { exclusiveControl });
    const outputSnapshots = new Map();
    const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
    for (const relative of files) {
      if (relative === statePath || mode === 'blob-trial' && excludedVideos.has(relative)) continue;
      const { bytes, stat } = await readSourceFile(sourceAnchor, relative, snapshots.get(relative));
      const outputStat = await writeStageFile(stageAnchor, relative, bytes, Number(stat.mode & 0o777n));
      outputSnapshots.set(relative, { stat: outputStat, sha256: digest(bytes) });
    }
    const state = validated ? { mode, storeOrigin, manifest: validated } : localState;
    const stateBytes = Buffer.from(`/** 隔離 staging 產物；不能用於覆寫正式 source。 */\nexport const WORLD_MEDIA_STATE = Object.freeze(${JSON.stringify(state, null, 2)});\n`);
    outputSnapshots.set(statePath, { stat: await writeStageFile(stageAnchor, statePath, stateBytes), sha256: digest(stateBytes) });
    // 不只驗影片：所有 staged source 與生成 state 都以相同 FD 邊界重讀、核 metadata/hash。
    for (const [relative, expected] of outputSnapshots) {
      const { bytes } = await readSourceFile(stageAnchor, relative, expected.stat);
      if (digest(bytes) !== expected.sha256) throw new Error('WORLD_MEDIA_STAGE_OUTPUT_CHANGED');
    }
    const after = await inventoryWorldMedia(source);
    for (const key of WORLD_MEDIA_FILES) if (inventory[key].sha256 !== after[key].sha256 || inventory[key].bytes !== after[key].bytes) throw new Error('WORLD_MEDIA_SOURCE_CHANGED_DURING_STAGE');
    if (mode === 'local') {
      const output = await inventoryWorldMedia(target);
      for (const key of WORLD_MEDIA_FILES) if (inventory[key].sha256 !== output[key].sha256 || inventory[key].bytes !== output[key].bytes) throw new Error('WORLD_MEDIA_LOCAL_OUTPUT_MISMATCH');
    } else {
      for (const key of excludedVideos) {
        try { await fs.lstat(path.join(target, key)); throw new Error('WORLD_MEDIA_TRIAL_OUTPUT_CONTAINS_VIDEO'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
    await validateOwnedStageContents(stageAnchor);
    return { mode, sourceRoot: source, stageRoot: target, excludedFiles: mode === 'blob-trial' ? [...WORLD_MEDIA_FILES] : [], totalSourceBytes: Object.values(inventory).reduce((sum, entry) => sum + entry.bytes, 0), sourceInventory: inventory };
  } catch (error) {
    if (stageAnchor) {
      try { if (!await removeOwnedStage(parentAnchor, stageAnchor)) error.cleanupStatus = 'OWNED_STAGE_PATH_CHANGED'; }
      catch { error.cleanupStatus = 'OWNED_STAGE_CLEANUP_INCOMPLETE'; }
    }
    throw error;
  } finally {
    if (stageAnchor) await stageAnchor.handle.close();
    if (parentAnchor) await parentAnchor.handle.close();
    await sourceAnchor.handle.close();
  }
}

async function cli(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    if (key === '--exclusive-control') {
      if (options.exclusiveControl) throw new Error('WORLD_MEDIA_STAGE_CLI_ARGUMENT');
      options.exclusiveControl = true; continue;
    }
    if (!['--source', '--stage', '--mode', '--origin', '--manifest'].includes(key) || !args[i + 1] || args[i + 1].startsWith('--') || options[key]) throw new Error('WORLD_MEDIA_STAGE_CLI_ARGUMENT');
    options[key] = args[++i];
  }
  if (!options.exclusiveControl) throw new Error('WORLD_MEDIA_EXCLUSIVE_CONTROL_REQUIRED');
  if (!options['--stage']) throw new Error('WORLD_MEDIA_STAGE_CLI_DESTINATION_REQUIRED');
  const mode = options['--mode'] ?? 'local';
  if (mode === 'local' && (options['--origin'] || options['--manifest'])) throw new Error('WORLD_MEDIA_STAGE_LOCAL_NO_BLOB_CONFIG');
  const manifest = options['--manifest'] ? JSON.parse(await fs.readFile(options['--manifest'], 'utf8')) : null;
  return prepareWorldMediaStage({ sourceRoot: options['--source'] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'), stageRoot: options['--stage'], exclusiveControl: options.exclusiveControl, mode, storeOrigin: options['--origin'] ?? null, manifest });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli(process.argv.slice(2)).then((report) => console.log(JSON.stringify(report, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
