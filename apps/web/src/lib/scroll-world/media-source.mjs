import { validateWorldMediaManifest, worldMediaLocalPath } from './media-manifest.mjs';
import { WORLD_MEDIA_STATE } from './media-trial-state.mjs';

/** trial 不完整時僅回傳 null 留 poster；不能指向已從 staging 排除的本地影片。 */
export function createWorldMediaResolver(state) {
  if (state?.mode === 'local') return (clip, codec) => worldMediaLocalPath(clip, codec);
  let manifest = null;
  if (state?.mode === 'blob-trial') {
    try {
      manifest = validateWorldMediaManifest(state.manifest, state.storeOrigin);
    } catch {
      // build staging 會先 fail-closed；runtime 的安全網仍保留靜態 poster。
    }
  }
  return (clip, codec) => {
    const key = worldMediaLocalPath(clip, codec);
    return key && manifest ? manifest.files[key].url : null;
  };
}

export const worldClipSource = createWorldMediaResolver(WORLD_MEDIA_STATE);
