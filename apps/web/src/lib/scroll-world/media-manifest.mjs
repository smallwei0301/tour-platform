/** 僅核准首頁七景的兩種 codec；不從任意 public 目錄動態擴充。 */
const SCENE_IDS = ['intro', 'mountain', 'river', 'cave', 'culture', 'ecology', 'finale'];
export const WORLD_MEDIA_FILES = Object.freeze(SCENE_IDS.flatMap((id) => ['mp4', 'webm'].map((codec) => `/videos/world/${id}.${codec}`)));
const approvedFiles = new Set(WORLD_MEDIA_FILES);
const SHA256 = /^[a-f0-9]{64}$/;

function exactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(code);
  const actual = Object.keys(value).sort();
  if (actual.length !== keys.length || actual.some((key, i) => key !== [...keys].sort()[i])) throw new Error(code);
}

/** 必須是外部核准的單一 HTTPS Blob store origin，不能從 manifest 自行授權。 */
export function validateWorldMediaOrigin(storeOrigin) {
  if (typeof storeOrigin !== 'string') throw new Error('WORLD_MEDIA_ORIGIN_REQUIRED');
  const url = new URL(storeOrigin);
  if (url.protocol !== 'https:' || url.origin !== storeOrigin || url.username || url.password || url.search || url.hash || url.pathname !== '/' || !/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname)) {
    throw new Error('WORLD_MEDIA_ORIGIN_INVALID');
  }
  return storeOrigin;
}

/** hash 在檔名；不同內容永遠不覆寫既有 pathname。 */
export function worldMediaPathname(localPath, sha256) {
  if (!approvedFiles.has(localPath) || !SHA256.test(sha256)) throw new Error('WORLD_MEDIA_PATH_INVALID');
  const [id, codec] = localPath.slice('/videos/world/'.length).split('.');
  return `world-media/v1/${id}/${sha256}.${codec}`;
}

/**
 * 完整、無額外欄位的 public manifest；禁止 token、query string 與未核准 origin。
 * expectedInventory 是從完整本地 source 算出的 SHA-256／bytes；trial staging 必須傳入。
 */
export function validateWorldMediaManifest(manifest, storeOrigin, expectedInventory = null) {
  validateWorldMediaOrigin(storeOrigin);
  exactKeys(manifest, ['version', 'storeOrigin', 'files'], 'WORLD_MEDIA_MANIFEST_SHAPE');
  if (manifest.version !== 1 || manifest.storeOrigin !== storeOrigin) throw new Error('WORLD_MEDIA_MANIFEST_ORIGIN');
  exactKeys(manifest.files, WORLD_MEDIA_FILES, 'WORLD_MEDIA_MANIFEST_INCOMPLETE');
  if (expectedInventory) exactKeys(expectedInventory, WORLD_MEDIA_FILES, 'WORLD_MEDIA_INVENTORY_INCOMPLETE');
  const files = {};
  for (const key of WORLD_MEDIA_FILES) {
    const entry = manifest.files[key];
    exactKeys(entry, ['sha256', 'bytes', 'pathname', 'url'], 'WORLD_MEDIA_ENTRY_SHAPE');
    if (typeof entry.sha256 !== 'string' || !SHA256.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0) throw new Error('WORLD_MEDIA_ENTRY_INVALID');
    const pathname = worldMediaPathname(key, entry.sha256);
    if (entry.pathname !== pathname || entry.url !== `${storeOrigin}/${pathname}`) throw new Error('WORLD_MEDIA_URL_INVALID');
    if (expectedInventory && (entry.sha256 !== expectedInventory[key].sha256 || entry.bytes !== expectedInventory[key].bytes)) throw new Error(`WORLD_MEDIA_SOURCE_MISMATCH:${key}`);
    files[key] = Object.freeze({ sha256: entry.sha256, bytes: entry.bytes, pathname, url: entry.url });
  }
  return Object.freeze({ version: 1, storeOrigin, files: Object.freeze(files) });
}

/** 先從原本的站內路徑選 codec；绝不對已 hash 的遠端 URL replace 副檔名。 */
export function worldMediaLocalPath(clip, codec) {
  if (codec !== 'mp4' && codec !== 'webm') return null;
  if (typeof clip !== 'string' || !approvedFiles.has(clip) || !clip.endsWith('.mp4')) return null;
  const key = codec === 'webm' ? `${clip.slice(0, -4)}.webm` : clip;
  return approvedFiles.has(key) ? key : null;
}
