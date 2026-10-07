import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { WORLD_MEDIA_FILES, validateWorldMediaManifest } from '../../apps/web/src/lib/scroll-world/media-manifest.mjs';
import { WORLD_MEDIA_TRIAL } from './world-media-build-contract.mjs';
import { syncWorldMedia } from './world-media-sync.mjs';
import { openSourceDirectory, readSourceFile } from './secure-source-files.mjs';

const stateRelative = 'apps/web/src/lib/scroll-world/media-trial-state.mjs';
const manifestRelative = 'apps/web/.world-media-trial/manifest.json';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fdPath = (handle) => `/proc/self/fd/${handle.fd}`;
const logicalMedia = (key) => `apps/web/public${key}`;

/** 僅 caller 獨占的 disposable checkout；不聲稱抵抗 hostile same-UID writer。 */
async function atomicWrite(sourceRoot, relative, bytes) {
  const target = path.join(sourceRoot, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (await fs.realpath(path.dirname(target)) !== path.dirname(target)) throw new Error('WORLD_MEDIA_PREVIEW_WRITE_BOUNDARY');
  const temp = `${target}.tmp-${randomUUID()}`;
  try {
    await fs.writeFile(temp, bytes, { flag: 'wx' });
    await fs.rename(temp, target);
  } finally { await fs.unlink(temp).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }
}

/** 已核 source14，descriptor 指向已開啟的 parent；只 unlink allowlist leaf。 */
async function removeMediaLeaf(anchor, key) {
  const segments = logicalMedia(key).split('/');
  const opened = []; let handle = anchor.handle;
  try {
    for (const segment of segments.slice(0, -1)) {
      handle = await fs.open(path.join(fdPath(handle), segment), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      opened.push(handle);
    }
    await fs.unlink(path.join(fdPath(handle), segments.at(-1)));
  } finally { for (const handle of opened.reverse()) await handle.close(); }
}

async function restoreMediaLeaf(sourceRoot, key, bytes) {
  const file = path.join(sourceRoot, logicalMedia(key));
  const parent = path.dirname(file);
  if (await fs.realpath(parent) !== parent) throw new Error('WORLD_MEDIA_PREVIEW_RESTORE_BOUNDARY');
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || await fs.realpath(file) !== file || sha(await fs.readFile(file)) !== sha(bytes)) throw new Error('WORLD_MEDIA_PREVIEW_RESTORE_CONFLICT');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.writeFile(file, bytes, { flag: 'wx' });
  }
}

/**
 * all14遠端 hash/type/Range readback -> atomic manifest/state -> 才排除 disposable copies。
 * API 不啟動 build、不用 SDK token；adapter 由已驗 context 的 build wrapper 提供。
 */
export async function prepareWorldMediaPreview({ sourceRoot, adapter, exclusiveCheckout = false, onPhase = () => {} }) {
  if (exclusiveCheckout !== true) throw new Error('WORLD_MEDIA_TRIAL_EXCLUSIVE_CHECKOUT_REQUIRED');
  const root = await fs.realpath(sourceRoot);
  const anchor = await openSourceDirectory(root);
  const stateBefore = (await readSourceFile(anchor, stateRelative)).bytes;
  let snapshot = null;
  let stateWritten = false;
  const removed = [];
  try {
    await adapter.authenticate();
    onPhase('oidc-authenticated');
    // Live 不信任 previous manifest 當遠端存在證明；adapter 每檔做實際 readback。
    const result = await syncWorldMedia({ sourceRoot: root, storeOrigin: WORLD_MEDIA_TRIAL.storeOrigin, adapter, includeSnapshot: true });
    snapshot = result.sourceSnapshot;
    const manifest = validateWorldMediaManifest(result.manifest, WORLD_MEDIA_TRIAL.storeOrigin, snapshot.inventory);
    onPhase('all14-remote-verified');
    await atomicWrite(root, manifestRelative, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
    const parsed = JSON.parse(await fs.readFile(path.join(root, manifestRelative), 'utf8'));
    validateWorldMediaManifest(parsed, WORLD_MEDIA_TRIAL.storeOrigin, snapshot.inventory);
    const state = { mode: 'blob-trial', storeOrigin: WORLD_MEDIA_TRIAL.storeOrigin, manifest: parsed };
    await atomicWrite(root, stateRelative, Buffer.from(`/** disposable Preview build 產物；原 Git source 保持 local。 */\nexport const WORLD_MEDIA_STATE = Object.freeze(${JSON.stringify(state, null, 2)});\n`));
    stateWritten = true;
    onPhase('manifest-committed');
    // 再核全14目前copy，任何 mismatch 都在首次 unlink 前停止。
    for (const key of WORLD_MEDIA_FILES) {
      const { bytes } = await readSourceFile(anchor, logicalMedia(key));
      if (sha(bytes) !== snapshot.inventory[key].sha256 || bytes.length !== snapshot.inventory[key].bytes) throw new Error('WORLD_MEDIA_PREVIEW_SOURCE_CHANGED');
    }
    for (const key of WORLD_MEDIA_FILES) { await removeMediaLeaf(anchor, key); removed.push(key); }
    onPhase('14-disposable-copies-excluded');
    const rollback = async () => {
      for (const key of WORLD_MEDIA_FILES) await restoreMediaLeaf(root, key, snapshot.contents[key]);
      await atomicWrite(root, stateRelative, stateBefore);
    };
    return { manifest, uploaded: result.uploaded, reused: result.reused, totalBytes: result.totalBytes, excludedFiles: [...WORLD_MEDIA_FILES], rollback };
  } catch (error) {
    try {
      if (snapshot) for (const key of removed) await restoreMediaLeaf(root, key, snapshot.contents[key]);
      if (stateWritten) await atomicWrite(root, stateRelative, stateBefore);
    } catch { error.rollbackStatus = 'DISPOSABLE_RESTORE_INCOMPLETE'; }
    throw error;
  } finally { await anchor.handle.close(); }
}

/** 後續 original build 真 exit0 才核artifact contract；不是平台emit完全驗證的替代。 */
export async function validateWorldMediaPreviewOutput(sourceRoot, prepared) {
  const root = await fs.realpath(sourceRoot);
  for (const key of WORLD_MEDIA_FILES) {
    try { await fs.lstat(path.join(root, logicalMedia(key))); throw new Error('WORLD_MEDIA_PREVIEW_COPY_REAPPEARED'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const outputRoot of ['apps/web/.next/standalone/apps/web/public', 'apps/web/.vercel/output/static']) {
      try { await fs.lstat(path.join(root, outputRoot, key.slice(1))); throw new Error('WORLD_MEDIA_PREVIEW_OUTPUT_CONTAINS_VIDEO'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  validateWorldMediaManifest(JSON.parse(await fs.readFile(path.join(root, manifestRelative), 'utf8')), WORLD_MEDIA_TRIAL.storeOrigin, prepared.manifest.files);
  if (!(await fs.stat(path.join(root, 'apps/web/.next/BUILD_ID'))).isFile()) throw new Error('WORLD_MEDIA_PREVIEW_BUILD_ARTIFACT_REQUIRED');
  return { mode: 'blob-trial', excludedFiles: WORLD_MEDIA_FILES.length, uploaded: prepared.uploaded.length, reused: prepared.reused.length, totalBytes: prepared.totalBytes };
}
