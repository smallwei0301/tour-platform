import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WORLD_MEDIA_FILES, validateWorldMediaManifest, validateWorldMediaOrigin, worldMediaPathname } from '../../apps/web/src/lib/scroll-world/media-manifest.mjs';
import { openSourceDirectory, readSourceFile } from './secure-source-files.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** 先取得全數核准 source 的 FD-protected snapshot，任何讀取失敗都在 adapter 前停止。 */
export async function captureWorldMediaSource(sourceRoot) {
  const root = await fs.realpath(sourceRoot);
  const anchor = await openSourceDirectory(root);
  const inventory = {};
  const contents = {};
  try {
    for (const key of WORLD_MEDIA_FILES) {
      const { bytes } = await readSourceFile(anchor, `apps/web/public${key}`);
      if (!bytes.length) throw new Error(`WORLD_MEDIA_EMPTY:${key}`);
      inventory[key] = Object.freeze({ sha256: hash(bytes), bytes: bytes.length });
      contents[key] = bytes;
    }
    return { inventory: Object.freeze(inventory), contents };
  } catch (error) {
    if (['ELOOP', 'ENOTDIR'].includes(error.code)) throw new Error('WORLD_MEDIA_REGULAR_FILE_REQUIRED', { cause: error });
    throw error;
  } finally { await anchor.handle.close(); }
}

/** 完整 source 是唯一輸入；inventory 不會以 pathname 再讀檔。 */
export async function inventoryWorldMedia(sourceRoot) {
  return (await captureWorldMediaSource(sourceRoot)).inventory;
}

/**
 * adapter 必須由 caller 明確傳入；沒有隱含 token／env／network 路徑。
 * previous manifest 的相同 hash 直接重用；changed 只新增 immutable pathname。
 * 此比對證明 source hash 相同，不冒稱遠端物件可用性已實測。
 */
export async function syncWorldMedia({ sourceRoot, storeOrigin, adapter, previousManifest = null, includeSnapshot = false }) {
  validateWorldMediaOrigin(storeOrigin);
  const { inventory, contents } = await captureWorldMediaSource(sourceRoot);
  const previous = previousManifest === null ? null : validateWorldMediaManifest(previousManifest, storeOrigin);
  if (!adapter || typeof adapter.put !== 'function') throw new Error('WORLD_MEDIA_ADAPTER_REQUIRED');
  const files = {};
  const uploaded = [];
  const reused = [];
  for (const key of WORLD_MEDIA_FILES) {
    const info = inventory[key];
    const old = previous?.files[key];
    if (old && old.sha256 === info.sha256 && old.bytes === info.bytes) {
      files[key] = old;
      reused.push(key);
      continue;
    }
    // 與 inventory 使用同一份已核 FD bytes；不再次開 pathname，避免 late symlink read。
    const bytes = contents[key];
    if (hash(bytes) !== info.sha256 || bytes.length !== info.bytes) throw new Error(`WORLD_MEDIA_SOURCE_CHANGED:${key}`);
    const pathname = worldMediaPathname(key, info.sha256);
    const result = await adapter.put(pathname, bytes, info);
    if (result?.url !== `${storeOrigin}/${pathname}`) throw new Error('WORLD_MEDIA_ADAPTER_URL_INVALID');
    files[key] = { ...info, pathname, url: result.url };
    if (result.action === 'reused') reused.push(key);
    else uploaded.push(key);
  }
  const manifest = validateWorldMediaManifest({ version: 1, storeOrigin, files }, storeOrigin, inventory);
  return { manifest, uploaded, reused, totalBytes: Object.values(inventory).reduce((sum, entry) => sum + entry.bytes, 0), ...(includeSnapshot ? { sourceSnapshot: { inventory, contents } } : {}) };
}

/** 只有記憶體假物件；不能發網路請求，也不讀 credentials。 */
export function createMockWorldMediaAdapter(storeOrigin) {
  validateWorldMediaOrigin(storeOrigin);
  const objects = new Map();
  let putCount = 0;
  return {
    get putCount() { return putCount; },
    async put(pathname, bytes, info) {
      if (hash(bytes) !== info.sha256 || bytes.length !== info.bytes) throw new Error('WORLD_MEDIA_MOCK_HASH_MISMATCH');
      const old = objects.get(pathname);
      if (old && old.sha256 !== info.sha256) throw new Error('WORLD_MEDIA_IMMUTABLE_CONFLICT');
      if (!old) { objects.set(pathname, { ...info }); putCount += 1; }
      return { url: `${storeOrigin}/${pathname}` };
    },
  };
}

export async function runWorldMediaSyncCli(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    if (key === '--mock') { options.mock = true; continue; }
    if (!['--source', '--output', '--previous', '--origin'].includes(key) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('WORLD_MEDIA_CLI_ARGUMENT');
    if (options[key]) throw new Error('WORLD_MEDIA_CLI_DUPLICATE');
    options[key] = args[++i];
  }
  const sourceRoot = path.resolve(options['--source'] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'));
  if (!options.mock) {
    if (options['--output'] || options['--previous'] || options['--origin']) throw new Error('WORLD_MEDIA_CLI_MOCK_REQUIRED');
    return { mode: 'local-inventory', files: await inventoryWorldMedia(sourceRoot) };
  }
  if (!options['--output']) throw new Error('WORLD_MEDIA_CLI_OUTPUT_REQUIRED');
  const storeOrigin = options['--origin'] ?? 'https://example-trial.public.blob.vercel-storage.com';
  const previousManifest = options['--previous'] ? JSON.parse(await fs.readFile(options['--previous'], 'utf8')) : null;
  const result = await syncWorldMedia({ sourceRoot, storeOrigin, previousManifest, adapter: createMockWorldMediaAdapter(storeOrigin) });
  await fs.writeFile(options['--output'], `${JSON.stringify(result.manifest, null, 2)}\n`, { flag: 'wx' });
  return { mode: 'mock-only', manifestPath: path.resolve(options['--output']), uploaded: result.uploaded.length, reused: result.reused.length, totalBytes: result.totalBytes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runWorldMediaSyncCli(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
