import { createHash } from 'node:crypto';
import { WORLD_MEDIA_TRIAL } from './world-media-build-contract.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const approvedPath = /^world-media\/v1\/(intro|mountain|river|cave|culture|ecology|finale)\/([a-f0-9]{64})\.(mp4|webm)$/;
const mimeFor = (pathname) => pathname.endsWith('.mp4') ? 'video/mp4' : pathname.endsWith('.webm') ? 'video/webm' : null;

/** Public readback：不帶 auth、不跟 redirect，驗實際 bytes/hash/type；404 才視為不存在。 */
export async function verifyWorldMediaBlob(url, info, pathname, { fetchImpl = fetch, allowMissing = false, checkRange = true } = {}) {
  if (!approvedPath.test(pathname) || pathname.split('/').at(-1).split('.')[0] !== info.sha256 || url !== `${WORLD_MEDIA_TRIAL.storeOrigin}/${pathname}` || !mimeFor(pathname)) throw new Error('WORLD_MEDIA_REMOTE_URL_INVALID');
  const response = await fetchImpl(url, { redirect: 'error', cache: 'no-store' });
  if (response.status === 404 && allowMissing) return null;
  if (response.status !== 200 || response.url && response.url !== url) throw new Error('WORLD_MEDIA_REMOTE_HTTP_INVALID');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== info.bytes || digest(bytes) !== info.sha256 || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== mimeFor(pathname)) throw new Error('WORLD_MEDIA_REMOTE_CONTENT_INVALID');
  const length = response.headers.get('content-length');
  if (length !== null && Number(length) !== info.bytes) throw new Error('WORLD_MEDIA_REMOTE_LENGTH_INVALID');
  if (checkRange) {
    const end = Math.min(31, info.bytes - 1);
    const range = await fetchImpl(url, { redirect: 'error', cache: 'no-store', headers: { Range: `bytes=0-${end}` } });
    const part = Buffer.from(await range.arrayBuffer());
    if (range.url && range.url !== url || range.status !== 206 || range.headers.get('content-range') !== `bytes 0-${end}/${info.bytes}` || !part.equals(bytes.subarray(0, end + 1))) throw new Error('WORLD_MEDIA_REMOTE_RANGE_INVALID');
  }
  return { url, bytes: info.bytes, sha256: info.sha256 };
}

/** SDK 只接明確 storeId；OIDC 全由 SDK 處理，沒有 token/oidcToken 參數。 */
export function createWorldMediaBlobAdapter({ sdk, fetchImpl = fetch }) {
  if (typeof sdk?.put !== 'function' || typeof sdk?.list !== 'function') throw new Error('WORLD_MEDIA_SDK_REQUIRED');
  let authenticated = false;
  return {
    async authenticate() {
      await sdk.list({ prefix: 'world-media/v1/', limit: 1, storeId: WORLD_MEDIA_TRIAL.storeId });
      authenticated = true;
    },
    async put(pathname, bytes, info) {
      if (!authenticated || digest(bytes) !== info.sha256 || bytes.length !== info.bytes) throw new Error('WORLD_MEDIA_ADAPTER_SOURCE_INVALID');
      const url = `${WORLD_MEDIA_TRIAL.storeOrigin}/${pathname}`;
      const current = await verifyWorldMediaBlob(url, info, pathname, { fetchImpl, allowMissing: true });
      if (current) return { url, action: 'reused' };
      const result = await sdk.put(pathname, bytes, {
        storeId: WORLD_MEDIA_TRIAL.storeId, access: 'public', addRandomSuffix: false, allowOverwrite: false, contentType: mimeFor(pathname),
      });
      if (result?.url !== url || result.pathname !== pathname) throw new Error('WORLD_MEDIA_SDK_RESULT_INVALID');
      await verifyWorldMediaBlob(url, info, pathname, { fetchImpl });
      return { url, action: 'uploaded' };
    },
  };
}
