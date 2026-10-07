import { createHash } from 'node:crypto';
import { setTimeout as waitTimer } from 'node:timers/promises';
import { WORLD_MEDIA_TRIAL } from './world-media-build-contract.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const approvedPath = /^world-media\/v1\/(intro|mountain|river|cave|culture|ecology|finale)\/([a-f0-9]{64})\.(mp4|webm)$/;
const mimeFor = (pathname) => pathname.endsWith('.mp4') ? 'video/mp4' : pathname.endsWith('.webm') ? 'video/webm' : null;
const safeContentRange = (value) => typeof value === 'string' && /^bytes (?:\d{1,16}-\d{1,16}|\*)\/\d{1,16}$/.test(value) ? value : null;
const safeLength = (value) => typeof value === 'string' && /^\d{1,16}$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;

// 只保存要求的至多32B prefix；第一個超長chunk立即cancel，不繼續吞整個response。
async function readRangePrefix(response, expectedLength, signal) {
  const reader = response.body?.getReader();
  if (!reader) return { part: Buffer.alloc(0), observedBodyLength: 0, bodyComplete: true };
  const parts = []; let observedBodyLength = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) return { part: Buffer.concat(parts), observedBodyLength, bodyComplete: true };
      const remaining = Math.max(0, expectedLength - observedBodyLength);
      if (remaining) parts.push(Buffer.from(value.subarray(0, remaining)));
      observedBodyLength += value.byteLength;
      if (observedBodyLength > expectedLength) {
        await reader.cancel();
        return { part: Buffer.concat(parts), observedBodyLength, bodyComplete: false };
      }
    }
  } finally { reader.releaseLock(); }
}

function rangeFailure(detail) {
  const error = new Error('WORLD_MEDIA_REMOTE_RANGE_INVALID');
  error.worldMediaRange = detail;
  return error;
}

/** Public readback：不帶 auth、不跟 redirect，驗實際 bytes/hash/type；404 才視為不存在。 */
export async function verifyWorldMediaBlob(url, info, pathname, { fetchImpl = fetch, allowMissing = false, checkRange = true, verificationStage = 'readback', signal } = {}) {
  if (!approvedPath.test(pathname) || pathname.split('/').at(-1).split('.')[0] !== info.sha256 || url !== `${WORLD_MEDIA_TRIAL.storeOrigin}/${pathname}` || !mimeFor(pathname)) throw new Error('WORLD_MEDIA_REMOTE_URL_INVALID');
  signal?.throwIfAborted();
  const response = await fetchImpl(url, { redirect: 'error', cache: 'no-store', ...(signal ? { signal } : {}) });
  if (response.status === 404 && allowMissing) return null;
  if (response.status !== 200 || response.url && response.url !== url) {
    const error = new Error('WORLD_MEDIA_REMOTE_HTTP_INVALID');
    // 只保留public path／status／固定stage，不能印provider body、headers或auth payload。
    error.worldMediaHttp = { status: response.status, pathname, stage: verificationStage, responseURLMatches: !response.url || response.url === url };
    throw error;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== info.bytes || digest(bytes) !== info.sha256 || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== mimeFor(pathname)) throw new Error('WORLD_MEDIA_REMOTE_CONTENT_INVALID');
  const length = response.headers.get('content-length');
  if (length !== null && Number(length) !== info.bytes) throw new Error('WORLD_MEDIA_REMOTE_LENGTH_INVALID');
  if (checkRange) {
    const end = Math.min(31, info.bytes - 1);
    signal?.throwIfAborted();
    const range = await fetchImpl(url, { redirect: 'error', cache: 'no-store', headers: { Range: `bytes=0-${end}` }, ...(signal ? { signal } : {}) });
    const expectedBodyLength = end + 1;
    const reportedLength = range.headers.get('content-length');
    const detail = {
      status: range.status, pathname, stage: verificationStage,
      responseURLMatches: !range.url || range.url === url,
      contentRange: safeContentRange(range.headers.get('content-range')),
      contentRangeMatches: range.headers.get('content-range') === `bytes 0-${end}/${info.bytes}`,
      reportedContentLength: safeLength(reportedLength),
      contentLengthMatches: reportedLength === null ? null : safeLength(reportedLength) === expectedBodyLength,
      contentTypeMatches: range.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === mimeFor(pathname),
      expectedBodyLength, observedBodyLength: null, bodyComplete: false, bodyLengthMatches: null, prefixMatches: null,
    };
    if (!detail.responseURLMatches || range.status !== 206 || !detail.contentRangeMatches || detail.contentLengthMatches === false) {
      await range.body?.cancel();
      throw rangeFailure(detail);
    }
    const body = await readRangePrefix(range, expectedBodyLength, signal);
    Object.assign(detail, {
      observedBodyLength: body.observedBodyLength, bodyComplete: body.bodyComplete,
      bodyLengthMatches: body.bodyComplete && body.observedBodyLength === expectedBodyLength,
      prefixMatches: body.part.equals(bytes.subarray(0, expectedBodyLength)),
    });
    if (!detail.bodyLengthMatches || !detail.prefixMatches) throw rangeFailure(detail);
  }
  signal?.throwIfAborted();
  return { url, bytes: info.bytes, sha256: info.sha256 };
}

export const WORLD_MEDIA_POST_PUT_READBACK = Object.freeze({ maxAttempts: 8, maxWallMs: 90_000, delaysMs: Object.freeze([1000, 2000, 4000, 8000, 16000, 16000, 16000]) });
const delay = (ms, signal) => waitTimer(ms, undefined, { signal });

/** 只處理SDK已成功put之後的同URL 404；不重傳、不把lookup/其他HTTP/內容錯當可重试。 */
export async function verifyWorldMediaAfterPut(url, info, pathname, { fetchImpl = fetch, signal, waitImpl = delay, now = () => performance.now() } = {}) {
  const policy = WORLD_MEDIA_POST_PUT_READBACK;
  const budgetSignal = AbortSignal.timeout(policy.maxWallMs);
  const boundedSignal = signal ? AbortSignal.any([signal, budgetSignal]) : budgetSignal;
  const deadline = now() + policy.maxWallMs;
  let last404;
  const expired = () => {
    const error = new Error('WORLD_MEDIA_POST_PUT_VISIBILITY_TIMEOUT');
    if (last404?.worldMediaHttp) error.worldMediaHttp = last404.worldMediaHttp;
    return error;
  };
  try {
    for (let attempt = 0; attempt < policy.maxAttempts; attempt += 1) {
      boundedSignal.throwIfAborted();
      if (now() >= deadline) throw expired();
      if (attempt > 0) await waitImpl(Math.min(policy.delaysMs[attempt - 1], Math.max(0, deadline - now())), boundedSignal);
      boundedSignal.throwIfAborted();
      if (now() >= deadline) throw expired();
      try {
        const result = await verifyWorldMediaBlob(url, info, pathname, { fetchImpl, verificationStage: 'post-put-readback', signal: boundedSignal });
        boundedSignal.throwIfAborted();
        return result;
      } catch (error) {
        if (error.message !== 'WORLD_MEDIA_REMOTE_HTTP_INVALID' || error.worldMediaHttp?.status !== 404 || error.worldMediaHttp?.responseURLMatches !== true) throw error;
        last404 = error;
        if (attempt + 1 === policy.maxAttempts) throw error;
      }
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    if (budgetSignal.aborted && (error === budgetSignal.reason || error === boundedSignal.reason || ['TimeoutError', 'AbortError'].includes(error.name))) throw expired();
    throw error;
  }
}

/** CLI只准這四個已知public欄位，未知SDK error內容不會被轉貼到build log。 */
export function worldMediaHttpDiagnostic(error) {
  const range = error?.worldMediaRange;
  if (range) {
    if (!Number.isInteger(range.status) || range.status < 100 || range.status > 599 || typeof range.pathname !== 'string' || !approvedPath.test(range.pathname) || !['lookup-existing', 'post-put-readback', 'readback'].includes(range.stage) || !['responseURLMatches', 'contentRangeMatches', 'contentTypeMatches', 'bodyComplete'].every((key) => typeof range[key] === 'boolean') || !['contentLengthMatches', 'bodyLengthMatches', 'prefixMatches'].every((key) => range[key] === null || typeof range[key] === 'boolean') || !Number.isInteger(range.expectedBodyLength) || range.expectedBodyLength < 1 || range.expectedBodyLength > 32 || !['reportedContentLength', 'observedBodyLength'].every((key) => range[key] === null || Number.isSafeInteger(range[key]) && range[key] >= 0) || range.contentRange !== null && safeContentRange(range.contentRange) !== range.contentRange) return null;
    const { status, pathname, stage, responseURLMatches, contentRange, contentRangeMatches, reportedContentLength, contentLengthMatches, contentTypeMatches, expectedBodyLength, observedBodyLength, bodyComplete, bodyLengthMatches, prefixMatches } = range;
    return { phase: 'world-media-public-range-failure', status, pathname, stage, responseURLMatches, contentRange, contentRangeMatches, reportedContentLength, contentLengthMatches, contentTypeMatches, expectedBodyLength, observedBodyLength, bodyComplete, bodyLengthMatches, prefixMatches };
  }
  const detail = error?.worldMediaHttp;
  if (!Number.isInteger(detail?.status) || detail.status < 100 || detail.status > 599 || !approvedPath.test(detail?.pathname || '') || !['lookup-existing', 'post-put-readback', 'readback'].includes(detail?.stage) || typeof detail.responseURLMatches !== 'boolean') return null;
  return { phase: 'world-media-public-http-failure', status: detail.status, stage: detail.stage, pathname: detail.pathname, responseURLMatches: detail.responseURLMatches };
}

/** SDK 只接明確 storeId；OIDC 全由 SDK 處理，沒有 token/oidcToken 參數。 */
export function createWorldMediaBlobAdapter({ sdk, fetchImpl = fetch, signal, waitImpl, now }) {
  if (typeof sdk?.put !== 'function' || typeof sdk?.list !== 'function') throw new Error('WORLD_MEDIA_SDK_REQUIRED');
  let authenticated = false;
  return {
    async authenticate() {
      signal?.throwIfAborted();
      await sdk.list({ prefix: 'world-media/v1/', limit: 1, storeId: WORLD_MEDIA_TRIAL.storeId, ...(signal ? { abortSignal: signal } : {}) });
      authenticated = true;
    },
    async put(pathname, bytes, info) {
      signal?.throwIfAborted();
      if (!authenticated || digest(bytes) !== info.sha256 || bytes.length !== info.bytes) throw new Error('WORLD_MEDIA_ADAPTER_SOURCE_INVALID');
      const url = `${WORLD_MEDIA_TRIAL.storeOrigin}/${pathname}`;
      const current = await verifyWorldMediaBlob(url, info, pathname, { fetchImpl, allowMissing: true, verificationStage: 'lookup-existing', signal });
      signal?.throwIfAborted();
      if (current) return { url, action: 'reused' };
      const result = await sdk.put(pathname, bytes, {
        storeId: WORLD_MEDIA_TRIAL.storeId, access: 'public', addRandomSuffix: false, allowOverwrite: false, contentType: mimeFor(pathname), ...(signal ? { abortSignal: signal } : {}),
      });
      if (result?.url !== url || result.pathname !== pathname) throw new Error('WORLD_MEDIA_SDK_RESULT_INVALID');
      await verifyWorldMediaAfterPut(url, info, pathname, { fetchImpl, signal, waitImpl, now });
      return { url, action: 'uploaded' };
    },
  };
}
