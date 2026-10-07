import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { WORLD_MEDIA_TRIAL, worldMediaBuildMode, worldMediaCspSource } from '../../../../scripts/media/world-media-build-contract.mjs';
import { createWorldMediaBlobAdapter, verifyWorldMediaBlob, worldMediaHttpDiagnostic, WORLD_MEDIA_POST_PUT_READBACK } from '../../../../scripts/media/world-media-blob-adapter.mjs';

const context = { nodeVersion: '22.23.1', sourceRoot: '/vercel/path0', appRoot: '/vercel/path0/apps/web', exclusiveCheckout: true };
const env = { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: WORLD_MEDIA_TRIAL.branch, VERCEL_PROJECT_ID: WORLD_MEDIA_TRIAL.projectId, TOUR_WORLD_BLOB_STORE_ID: WORLD_MEDIA_TRIAL.storeId, VERCEL_OIDC_TOKEN: 'synthetic-test-only' };
const bytes = Buffer.from('fake-public-media');
const info = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
const pathname = `world-media/v1/intro/${info.sha256}.mp4`;
const url = `${WORLD_MEDIA_TRIAL.storeOrigin}/${pathname}`;
const response = (body, status = 200, headers = {}) => new Response(body, { status, headers: { 'content-type': 'video/mp4', ...headers } });
const remote = (objects, events) => async (url, options) => {
  assert.equal(options.redirect, 'error');
  assert.equal(url.startsWith(`${WORLD_MEDIA_TRIAL.storeOrigin}/`), true);
  events.push(options.headers?.Range ? 'range' : 'get');
  const buffer = objects.get(url);
  if (!buffer) return new Response(null, { status: 404 });
  if (options.headers?.Range) return response(buffer.subarray(0, Math.min(32, buffer.length)), 206, { 'content-range': `bytes 0-${Math.min(31, buffer.length - 1)}/${buffer.length}` });
  return response(buffer, 200, { 'content-length': String(buffer.length) });
};

test('Preview build mode requires exact branch/project/store/Node22/exclusive Vercel checkout; others local', () => {
  assert.equal(worldMediaBuildMode(env, context), 'blob-trial');
  for (const e of [{}, { ...env, VERCEL_ENV: 'production' }, { ...env, VERCEL_GIT_COMMIT_REF: 'other-branch' }]) assert.equal(worldMediaBuildMode(e, context), 'local');
  for (const e of [{ ...env, VERCEL_PROJECT_ID: 'foreign' }, { ...env, TOUR_WORLD_BLOB_STORE_ID: 'foreign' }, { ...env, BLOB_READ_WRITE_TOKEN: 'synthetic' }, { ...env, VERCEL_BLOB_API_URL: 'https://foreign.invalid' }]) assert.throws(() => worldMediaBuildMode(e, context));
  const noOidc = { ...env }; delete noOidc.VERCEL_OIDC_TOKEN; assert.throws(() => worldMediaBuildMode(noOidc, context));
  for (const c of [{ ...context, exclusiveCheckout: false }, { ...context, sourceRoot: '/workspace/original' }, { ...context, nodeVersion: '24.19.0' }]) assert.throws(() => worldMediaBuildMode(env, c));
});

test('precise media-src only activates for the approved Preview manifest and never wildcard', () => {
  assert.equal(worldMediaCspSource({ mode: 'local' }, {}), "media-src 'self'");
  const state = { mode: 'blob-trial', storeOrigin: WORLD_MEDIA_TRIAL.storeOrigin };
  assert.equal(worldMediaCspSource(state, env), `media-src 'self' ${WORLD_MEDIA_TRIAL.storeOrigin}`);
  assert.throws(() => worldMediaCspSource(state, { ...env, VERCEL_ENV: 'production' }));
  assert.throws(() => worldMediaCspSource({ ...state, storeOrigin: 'https://foreign.public.blob.vercel-storage.com' }, env));
});

test('SDK adapter uploads only missing immutable object, reads full hash/Range back, then reuses without put', async () => {
  const objects = new Map(); const events = []; let puts = 0;
  const sdk = {
    async list(options) { assert.deepEqual(options, { prefix: 'world-media/v1/', limit: 1, storeId: WORLD_MEDIA_TRIAL.storeId }); events.push('oidc-auth'); },
    async put(p, body, options) {
      assert.equal(p, pathname); assert.equal(options.storeId, WORLD_MEDIA_TRIAL.storeId);
      assert.equal(options.allowOverwrite, false); assert.equal(options.addRandomSuffix, false);
      assert.equal(Object.hasOwn(options, 'token'), false); assert.equal(Object.hasOwn(options, 'oidcToken'), false);
      objects.set(url, Buffer.from(body)); puts += 1; events.push('put'); return { url, pathname: p };
    },
  };
  const adapter = createWorldMediaBlobAdapter({ sdk, fetchImpl: remote(objects, events) });
  await assert.rejects(() => adapter.put(pathname, bytes, info));
  await adapter.authenticate();
  assert.deepEqual(await adapter.put(pathname, bytes, info), { url, action: 'uploaded' });
  assert.deepEqual(await adapter.put(pathname, bytes, info), { url, action: 'reused' });
  assert.equal(puts, 1); assert.deepEqual(events, ['oidc-auth', 'get', 'put', 'get', 'range', 'get', 'range']);
});

test('bad existing object, failed OIDC, bad SDK URL or missing Range fail closed without overwrite/fallback', async () => {
  await assert.rejects(() => verifyWorldMediaBlob(url, info, pathname, { fetchImpl: async () => response('bad') }));
  await assert.rejects(() => verifyWorldMediaBlob(url, info, pathname, { fetchImpl: async () => response(bytes) }));
  await assert.rejects(() => createWorldMediaBlobAdapter({ sdk: { put() {}, list() { throw new Error('denied'); } } }).authenticate(), /denied/);
  const adapter = createWorldMediaBlobAdapter({ sdk: { list() {}, put() { return { url: 'https://foreign.invalid', pathname }; } }, fetchImpl: async () => new Response(null, { status: 404 }) });
  await adapter.authenticate(); await assert.rejects(() => adapter.put(pathname, bytes, info));
});

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { WORLD_MEDIA_FILES } from '../../src/lib/scroll-world/media-manifest.mjs';
import { inventoryWorldMedia } from '../../../../scripts/media/world-media-sync.mjs';
import { prepareWorldMediaPreview, validateWorldMediaPreviewOutput } from '../../../../scripts/media/prepare-world-media-preview.mjs';
import { runWorldMediaBuild } from '../../../../scripts/media/build-world-media-preview.mjs';
import { verifyWorldMediaNode22Archive } from '../../../../scripts/media/bootstrap-world-media-node22.mjs';

const statePath = 'apps/web/src/lib/scroll-world/media-trial-state.mjs';
const mediaPath = (root, key) => path.join(root, 'apps/web/public', key.slice(1));
const exists = async (file) => fs.access(file).then(() => true, () => false);
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'world-media-preview-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const key of WORLD_MEDIA_FILES) {
    await fs.mkdir(path.dirname(mediaPath(root, key)), { recursive: true });
    await fs.writeFile(mediaPath(root, key), `fake public media ${key}`);
  }
  await fs.mkdir(path.dirname(path.join(root, statePath)), { recursive: true });
  await fs.writeFile(path.join(root, statePath), "export const WORLD_MEDIA_STATE = { mode: 'local', storeOrigin: null, manifest: null };\n");
  await fs.mkdir(path.join(root, 'apps/web/public/images/world'), { recursive: true });
  await fs.writeFile(path.join(root, 'apps/web/public/images/world/intro.webp'), 'fake poster');
  return root;
}
function multiRemote(objects, metrics) {
  const sdk = {
    async list(options) { assert.equal(options.storeId, WORLD_MEDIA_TRIAL.storeId); metrics.auth += 1; },
    async put(p, body, options) {
      assert.equal(options.allowOverwrite, false); assert.equal(options.addRandomSuffix, false);
      const u = `${WORLD_MEDIA_TRIAL.storeOrigin}/${p}`;
      objects.set(u, { bytes: Buffer.from(body), mime: options.contentType }); metrics.put += 1;
      return { url: u, pathname: p };
    },
  };
  const fetchImpl = async (u, options) => {
    const object = objects.get(u);
    if (!object) return new Response(null, { status: 404 });
    if (options.headers?.Range) {
      const end = Math.min(31, object.bytes.length - 1);
      return new Response(object.bytes.subarray(0, end + 1), { status: 206, headers: { 'content-range': `bytes 0-${end}/${object.bytes.length}`, 'content-type': object.mime } });
    }
    metrics.fullGet += 1;
    return new Response(object.bytes, { status: 200, headers: { 'content-type': object.mime, 'content-length': String(object.bytes.length) } });
  };
  return createWorldMediaBlobAdapter({ sdk, fetchImpl });
}

test('all14 remote readback and atomic manifest precede exclusion; second disposable build reuses all; rollback restores complete local bytes', async (t) => {
  const root = await fixture(t); const before = await inventoryWorldMedia(root); const stateBefore = await fs.readFile(path.join(root, statePath));
  const objects = new Map(); const metrics = { auth: 0, put: 0, fullGet: 0 }; const phases = [];
  const first = await prepareWorldMediaPreview({ sourceRoot: root, exclusiveCheckout: true, adapter: multiRemote(objects, metrics), onPhase(phase) { phases.push(phase); } });
  assert.deepEqual(phases, ['oidc-authenticated', 'all14-remote-verified', 'manifest-committed', '14-disposable-copies-excluded']);
  assert.equal(first.uploaded.length, 14); assert.equal(first.reused.length, 0); assert.equal(metrics.put, 14); assert.equal(metrics.fullGet, 14);
  for (const key of WORLD_MEDIA_FILES) assert.equal(await exists(mediaPath(root, key)), false);
  assert.equal(await exists(path.join(root, 'apps/web/public/images/world/intro.webp')), true);
  const { WORLD_MEDIA_STATE } = await import(pathToFileURL(path.join(root, statePath)).href);
  assert.equal(WORLD_MEDIA_STATE.mode, 'blob-trial'); assert.deepEqual(WORLD_MEDIA_STATE.manifest, first.manifest);
  await fs.mkdir(path.join(root, 'apps/web/.next')); await fs.writeFile(path.join(root, 'apps/web/.next/BUILD_ID'), 'mock-build-only');
  const output = await validateWorldMediaPreviewOutput(root, first); assert.equal(output.excludedFiles, 14);
  await first.rollback(); assert.deepEqual(await inventoryWorldMedia(root), before); assert.deepEqual(await fs.readFile(path.join(root, statePath)), stateBefore);
  const second = await prepareWorldMediaPreview({ sourceRoot: root, exclusiveCheckout: true, adapter: multiRemote(objects, metrics) });
  assert.equal(second.uploaded.length, 0); assert.equal(second.reused.length, 14); assert.equal(metrics.put, 14); assert.equal(metrics.fullGet, 28);
  await second.rollback(); assert.deepEqual(await inventoryWorldMedia(root), before);
});

test('any missing/bad all14 readback aborts before state/exclusion; partial remote objects are never treated as complete manifest', async (t) => {
  const root = await fixture(t); const before = await inventoryWorldMedia(root); const stateBefore = await fs.readFile(path.join(root, statePath));
  let calls = 0;
  const adapter = { async authenticate() {}, async put(p) { if (++calls === 14) throw new Error('READBACK_FAILED'); return { url: `${WORLD_MEDIA_TRIAL.storeOrigin}/${p}`, action: 'uploaded' }; } };
  await assert.rejects(() => prepareWorldMediaPreview({ sourceRoot: root, exclusiveCheckout: true, adapter }), /READBACK_FAILED/);
  assert.deepEqual(await inventoryWorldMedia(root), before); assert.deepEqual(await fs.readFile(path.join(root, statePath)), stateBefore);
  assert.equal(await exists(path.join(root, 'apps/web/.world-media-trial/manifest.json')), false);
  await assert.rejects(() => prepareWorldMediaPreview({ sourceRoot: root, adapter }), /EXCLUSIVE_CHECKOUT/);
});

test('local, Production and other branches run only original build without loading SDK, reads or source deletion', async (t) => {
  const root = await fixture(t); const before = await inventoryWorldMedia(root); let builds = 0; let loads = 0; let bootstraps = 0;
  for (const e of [{}, { ...env, VERCEL_ENV: 'production' }, { ...env, VERCEL_GIT_COMMIT_REF: 'other-branch' }]) {
    const code = await runWorldMediaBuild({ env: e, sourceRoot: root, appRoot: `${root}/apps/web`, nodeVersion: '24.0.0', exclusiveCheckout: false, build: async () => { builds += 1; return 0; }, loadAdapter: async () => { loads += 1; throw new Error('should not load'); }, bootstrapNode22: async () => { bootstraps += 1; throw new Error('should not bootstrap'); } });
    assert.equal(code, 0);
  }
  assert.equal(builds, 3); assert.equal(loads, 0); assert.equal(bootstraps, 0); assert.deepEqual(await inventoryWorldMedia(root), before);
});

test('Node24 exact Preview delegates before SDK/build and preserves the child failure; invalid contexts cannot bootstrap', async () => {
  let bootstraps = 0; let loads = 0; let builds = 0;
  const options = { ...context, env, nodeVersion: '24.19.0', bootstrapNode22: async (args) => { bootstraps += 1; assert.equal(args.sourceRoot, context.sourceRoot); return 7; }, loadAdapter: async () => { loads += 1; throw new Error('SDK must not run on Node24'); }, build: async () => { builds += 1; return 0; } };
  assert.equal(await runWorldMediaBuild(options), 7);
  assert.equal(bootstraps, 1); assert.equal(loads, 0); assert.equal(builds, 0);
  for (const changes of [{ env: { ...env, VERCEL_PROJECT_ID: 'foreign' } }, { exclusiveCheckout: false }, { sourceRoot: '/workspace/original' }]) await assert.rejects(() => runWorldMediaBuild({ ...options, ...changes }));
  assert.equal(bootstraps, 1);
  await assert.rejects(() => runWorldMediaBuild({ ...options, bootstrapNode22: async () => { throw new Error('bootstrap failure'); } }), /bootstrap failure/);
  assert.equal(loads, 0); assert.equal(builds, 0);
});

test('untrusted Node archive bytes fail the immutable official SHA check before extraction or execution', () => {
  assert.throws(() => verifyWorldMediaNode22Archive(Buffer.from('synthetic invalid archive')), /WORLD_MEDIA_NODE22_ARCHIVE_INVALID/);
});

test('public HTTP failure reports exact lookup/post-put phase without provider body or secret fields, and never retries put', async () => {
  let puts = 0; const sdk = { list() {}, put() { puts += 1; return { url, pathname }; } };
  const lookup = createWorldMediaBlobAdapter({ sdk, fetchImpl: async () => new Response('synthetic private provider detail', { status: 503 }) });
  await lookup.authenticate();
  await assert.rejects(() => lookup.put(pathname, bytes, info), (error) => {
    assert.equal(error.message, 'WORLD_MEDIA_REMOTE_HTTP_INVALID');
    assert.deepEqual(worldMediaHttpDiagnostic(error), { phase: 'world-media-public-http-failure', status: 503, stage: 'lookup-existing', pathname, responseURLMatches: true });
    assert.equal(JSON.stringify(error).includes('synthetic private provider detail'), false);
    return true;
  });
  assert.equal(puts, 0);
  let gets = 0; const postPut = createWorldMediaBlobAdapter({ sdk, fetchImpl: async () => new Response(null, { status: ++gets === 1 ? 404 : 503 }) });
  await postPut.authenticate();
  await assert.rejects(() => postPut.put(pathname, bytes, info), (error) => {
    assert.equal(worldMediaHttpDiagnostic(error).stage, 'post-put-readback');
    assert.equal(worldMediaHttpDiagnostic(error).status, 503);
    return true;
  });
  assert.equal(puts, 1); assert.equal(gets, 2);
  assert.equal(worldMediaHttpDiagnostic({ worldMediaHttp: { status: 503, pathname: 'foreign', stage: 'lookup-existing', responseURLMatches: true, token: 'synthetic-secret' } }), null);
  const safe = worldMediaHttpDiagnostic({ worldMediaHttp: { status: 403, pathname, stage: 'lookup-existing', responseURLMatches: true, token: 'synthetic-secret' } });
  assert.equal(Object.hasOwn(safe, 'token'), false);
});

function waitingAdapter(fetchImpl, overrides = {}) {
  let puts = 0; let clock = 0; const waits = [];
  const sdk = { list() {}, put() { puts += 1; return { url, pathname }; } };
  const adapter = createWorldMediaBlobAdapter({ sdk, fetchImpl, now: () => clock, waitImpl: async (ms, signal) => { signal.throwIfAborted(); waits.push(ms); clock += ms; }, ...overrides });
  return { adapter, waits, get puts() { return puts; }, get clock() { return clock; } };
}

test('only successful immutable put gets bounded same-URL 404 reads until full hash/type/Range all pass, without another put', async () => {
  let gets = 0; let ranges = 0;
  const probe = waitingAdapter(async (u, options) => {
    assert.equal(u, url); assert.equal(options.redirect, 'error');
    if (options.headers?.Range) { ranges += 1; return response(bytes, 206, { 'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}` }); }
    if (++gets <= 3) return new Response(null, { status: 404 }); // lookup plus two post-put misses
    return response(bytes, 200, { 'content-length': String(bytes.length) });
  });
  await probe.adapter.authenticate();
  assert.deepEqual(await probe.adapter.put(pathname, bytes, info), { url, action: 'uploaded' });
  assert.equal(probe.puts, 1); assert.equal(gets, 4); assert.equal(ranges, 1); assert.deepEqual(probe.waits, [1000, 2000]);
});

test('post-put persistent404 exhausts exactly8 reads and7 bounded backoffs; no fallback or repeated upload', async () => {
  let gets = 0;
  const probe = waitingAdapter(async () => { gets += 1; return new Response(null, { status: 404 }); });
  await probe.adapter.authenticate();
  await assert.rejects(() => probe.adapter.put(pathname, bytes, info), (error) => {
    assert.equal(error.message, 'WORLD_MEDIA_REMOTE_HTTP_INVALID'); assert.equal(worldMediaHttpDiagnostic(error).status, 404); return true;
  });
  assert.equal(probe.puts, 1); assert.equal(gets, 1 + WORLD_MEDIA_POST_PUT_READBACK.maxAttempts);
  assert.deepEqual(probe.waits, WORLD_MEDIA_POST_PUT_READBACK.delaysMs);
  assert.equal(probe.clock, 63000); assert.equal(WORLD_MEDIA_POST_PUT_READBACK.maxWallMs, 90000);
});

test('post-put401/403/500/503, foreignURL, badcontent/type and badRange all stop immediately without a read retry', async () => {
  for (const kind of ['401', '403', '500', '503', 'foreign-url', 'bad-content', 'bad-type', 'bad-range']) {
    let gets = 0; let ranges = 0;
    const probe = waitingAdapter(async (_u, options) => {
      if (options.headers?.Range) { ranges += 1; return response(bytes, 200); }
      if (++gets === 1) return new Response(null, { status: 404 });
      if (/^\d+$/.test(kind)) return new Response(null, { status: Number(kind) });
      if (kind === 'foreign-url') { const r = new Response(null, { status: 404 }); Object.defineProperty(r, 'url', { value: 'https://foreign.invalid/path' }); return r; }
      if (kind === 'bad-content') return response('wrong bytes');
      if (kind === 'bad-type') return new Response(bytes, { headers: { 'content-type': 'text/plain' } });
      return response(bytes);
    });
    await probe.adapter.authenticate(); await assert.rejects(() => probe.adapter.put(pathname, bytes, info));
    assert.equal(probe.puts, 1, kind); assert.equal(gets, 2, kind); assert.equal(probe.waits.length, 0, kind);
    assert.equal(ranges, kind === 'bad-range' ? 1 : 0, kind);
  }
});

test('post-put wall deadline and cancellation during wait abort before any further GET or put', async () => {
  let gets = 0; let clock = 0;
  const timeout = waitingAdapter(async () => { gets += 1; return new Response(null, { status: 404 }); }, { now: () => clock, waitImpl: async () => { clock = 90001; } });
  await timeout.adapter.authenticate(); await assert.rejects(() => timeout.adapter.put(pathname, bytes, info), /WORLD_MEDIA_POST_PUT_VISIBILITY_TIMEOUT/);
  assert.equal(timeout.puts, 1); assert.equal(gets, 2);
  const controller = new AbortController(); let cancelledGets = 0;
  const cancelled = waitingAdapter(async () => { cancelledGets += 1; return new Response(null, { status: 404 }); }, { signal: controller.signal, waitImpl: async () => { controller.abort(); } });
  await cancelled.adapter.authenticate(); await assert.rejects(() => cancelled.adapter.put(pathname, bytes, info), (error) => error.name === 'AbortError');
  assert.equal(cancelled.puts, 1); assert.equal(cancelledGets, 2);
  const preCancelled = new AbortController(); preCancelled.abort(); let auths = 0;
  const noAuth = createWorldMediaBlobAdapter({ sdk: { list() { auths += 1; }, put() { throw new Error('must not put'); } }, signal: preCancelled.signal });
  await assert.rejects(() => noAuth.authenticate(), (error) => error.name === 'AbortError'); assert.equal(auths, 0);
  const duringLookup = new AbortController();
  const noPut = waitingAdapter(async () => { duringLookup.abort(); return new Response(null, { status: 404 }); }, { signal: duringLookup.signal });
  await noPut.adapter.authenticate(); await assert.rejects(() => noPut.adapter.put(pathname, bytes, info), (error) => error.name === 'AbortError');
  assert.equal(noPut.puts, 0); assert.equal(noPut.waits.length, 0);
});

test('every nonretryable Range header rejection reports all safe fields and cancels unread body without another GET or put', async () => {
  for (const kind of ['200', '401', '403', '500', 'foreign-url', 'wrong-range', 'unsafe-range', 'wrong-length', 'unsafe-length']) {
    let gets = 0; let ranges = 0; let pulls = 0; let cancelled = 0;
    const probe = waitingAdapter(async (_u, options) => {
      if (!options.headers?.Range) return ++gets === 1 ? new Response(null, { status: 404 }) : response(bytes);
      ranges += 1;
      const headers = { 'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}`, 'content-length': String(bytes.length), 'content-type': 'text/plain' };
      if (kind === 'wrong-range') headers['content-range'] = 'bytes 1-17/18';
      if (kind === 'unsafe-range') headers['content-range'] = 'synthetic-secret';
      if (kind === 'wrong-length') headers['content-length'] = '999';
      if (kind === 'unsafe-length') headers['content-length'] = 'synthetic-secret';
      const body = new ReadableStream({ pull(controller) { pulls += 1; controller.enqueue(bytes); }, cancel() { cancelled += 1; } }, { highWaterMark: 0 });
      const result = new Response(body, { status: /^\d+$/.test(kind) ? Number(kind) : 206, headers });
      if (kind === 'foreign-url') Object.defineProperty(result, 'url', { value: 'https://foreign.invalid/synthetic-secret' });
      return result;
    });
    await probe.adapter.authenticate();
    await assert.rejects(() => probe.adapter.put(pathname, bytes, info), (error) => {
      assert.equal(error.message, 'WORLD_MEDIA_REMOTE_RANGE_INVALID', kind);
      const safe = worldMediaHttpDiagnostic(error);
      assert.equal(safe.phase, 'world-media-public-range-failure'); assert.equal(safe.stage, 'post-put-readback');
      assert.equal(safe.pathname, pathname); assert.equal(safe.expectedBodyLength, bytes.length);
      assert.equal(safe.status, /^\d+$/.test(kind) ? Number(kind) : 206);
      assert.equal(safe.responseURLMatches, kind !== 'foreign-url');
      assert.equal(safe.contentRangeMatches, !['wrong-range', 'unsafe-range'].includes(kind));
      assert.equal(safe.contentLengthMatches, !['wrong-length', 'unsafe-length'].includes(kind));
      assert.equal(safe.contentTypeMatches, false); assert.equal(safe.observedBodyLength, null);
      assert.equal(safe.bodyLengthMatches, null); assert.equal(safe.prefixMatches, null); assert.equal(safe.bodyComplete, false);
      assert.equal(safe.contentRange, kind === 'unsafe-range' ? null : kind === 'wrong-range' ? 'bytes 1-17/18' : `bytes 0-${bytes.length - 1}/${bytes.length}`);
      assert.equal(safe.reportedContentLength, kind === 'unsafe-length' ? null : kind === 'wrong-length' ? 999 : bytes.length);
      assert.equal(JSON.stringify(error).includes('synthetic-secret'), false); assert.equal(JSON.stringify(safe).includes('synthetic-secret'), false);
      return true;
    });
    assert.equal(probe.puts, 1); assert.equal(gets, 2); assert.equal(ranges, 1); assert.equal(probe.waits.length, 0);
    assert.equal(pulls, 0, kind); assert.equal(cancelled, 1, kind);
  }
});

test('Range body length and prefix rejection retain strict gates; oversized body cancels after its first chunk', async () => {
  for (const kind of ['empty', 'short', 'long', 'wrong-prefix']) {
    let gets = 0; let pulls = 0; let cancelled = 0;
    const body = kind === 'empty' ? Buffer.alloc(0) : kind === 'short' ? bytes.subarray(0, bytes.length - 1) : kind === 'long' ? Buffer.concat([bytes, Buffer.from('unexpected-extra')]) : Buffer.alloc(bytes.length, 0);
    const probe = waitingAdapter(async (_u, options) => {
      if (!options.headers?.Range) return ++gets === 1 ? new Response(null, { status: 404 }) : response(bytes);
      const stream = new ReadableStream({ pull(controller) { pulls += 1; if (pulls === 1) controller.enqueue(body); else controller.close(); }, cancel() { cancelled += 1; } }, { highWaterMark: 0 });
      return new Response(stream, { status: 206, headers: { 'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}`, 'content-type': 'video/mp4' } });
    });
    await probe.adapter.authenticate();
    await assert.rejects(() => probe.adapter.put(pathname, bytes, info), (error) => {
      const safe = worldMediaHttpDiagnostic(error); assert.equal(safe.observedBodyLength, body.length);
      assert.equal(safe.expectedBodyLength, bytes.length); assert.equal(safe.contentLengthMatches, null);
      assert.equal(safe.bodyLengthMatches, kind === 'wrong-prefix'); assert.equal(safe.prefixMatches, kind === 'long');
      assert.equal(safe.bodyComplete, kind !== 'long'); assert.equal(safe.contentRangeMatches, true); assert.equal(safe.contentTypeMatches, true);
      return error.message === 'WORLD_MEDIA_REMOTE_RANGE_INVALID';
    });
    assert.equal(probe.puts, 1); assert.equal(gets, 2); assert.equal(probe.waits.length, 0);
    assert.equal(pulls, kind === 'long' ? 1 : 2); assert.equal(cancelled, kind === 'long' ? 1 : 0);
  }
});

test('Range diagnostic handles lookup/direct stages and rejects malformed fields or extra payloads', async () => {
  let puts = 0; let gets = 0;
  const adapter = createWorldMediaBlobAdapter({ sdk: { list() {}, put() { puts += 1; } }, fetchImpl: async (_u, options) => options.headers?.Range ? response(bytes, 404) : (gets += 1, response(bytes)) });
  await adapter.authenticate();
  let detail;
  await assert.rejects(() => adapter.put(pathname, bytes, info), (error) => { detail = error.worldMediaRange; assert.equal(worldMediaHttpDiagnostic(error).stage, 'lookup-existing'); return true; });
  assert.equal(puts, 0); assert.equal(gets, 1);
  await assert.rejects(() => verifyWorldMediaBlob(url, info, pathname, { fetchImpl: async (_u, options) => options.headers?.Range ? response('wrong', 206, { 'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}` }) : response(bytes) }), (error) => worldMediaHttpDiagnostic(error).stage === 'readback');
  for (const invalid of [{ pathname: 7 }, { pathname: 'foreign' }, { status: 0 }, { status: 600 }, { stage: 'synthetic-secret' }, { contentRange: 'synthetic-secret' }, { expectedBodyLength: 33 }, { observedBodyLength: -1 }, { prefixMatches: 'synthetic-secret' }, { responseURLMatches: undefined }]) assert.equal(worldMediaHttpDiagnostic({ worldMediaRange: { ...detail, ...invalid } }), null);
  const safe = worldMediaHttpDiagnostic({ worldMediaRange: { ...detail, token: 'synthetic-secret', headers: { private: 'synthetic-secret' }, body: 'synthetic-secret', foreignURL: 'https://foreign.invalid' } });
  assert.equal(JSON.stringify(safe).includes('synthetic-secret'), false); assert.equal(Object.hasOwn(safe, 'foreignURL'), false);
});

test('external cancellation still aborts a pending Range stream without another GET or put', async () => {
  const controller = new AbortController(); let gets = 0; let ranges = 0;
  const probe = waitingAdapter(async (_u, options) => {
    if (!options.headers?.Range) return ++gets === 1 ? new Response(null, { status: 404 }) : response(bytes);
    ranges += 1;
    const body = new ReadableStream({ start(stream) { options.signal.addEventListener('abort', () => stream.error(options.signal.reason), { once: true }); } });
    setTimeout(() => controller.abort(), 10);
    return new Response(body, { status: 206, headers: { 'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}`, 'content-type': 'video/mp4' } });
  }, { signal: controller.signal });
  await probe.adapter.authenticate(); await assert.rejects(() => probe.adapter.put(pathname, bytes, info), (error) => error.name === 'AbortError');
  assert.equal(probe.puts, 1); assert.equal(gets, 2); assert.equal(ranges, 1); assert.equal(probe.waits.length, 0);
});

test('post-put fullGET404 and sameURL Range404 share one finite attempt/backoff budget and never repeat put', async () => {
  let gets = 0; let ranges = 0;
  const probe = waitingAdapter(async (_u, options) => {
    if (options.headers?.Range) return ++ranges === 1 ? new Response(null, { status: 404 }) : response(bytes, 206, { 'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}` });
    return ++gets <= 2 ? new Response(null, { status: 404 }) : response(bytes);
  });
  await probe.adapter.authenticate(); assert.deepEqual(await probe.adapter.put(pathname, bytes, info), { url, action: 'uploaded' });
  assert.equal(probe.puts, 1); assert.equal(gets, 4); assert.equal(ranges, 2); assert.deepEqual(probe.waits, [1000, 2000]);
});

test('persistent post-put Range404 exhausts at most8 Range/full reads within the same90s policy and retains safe details', async () => {
  let gets = 0; let ranges = 0;
  const probe = waitingAdapter(async (_u, options) => {
    if (options.headers?.Range) { ranges += 1; return new Response('not found', { status: 404 }); }
    return ++gets === 1 ? new Response(null, { status: 404 }) : response(bytes);
  });
  await probe.adapter.authenticate(); await assert.rejects(() => probe.adapter.put(pathname, bytes, info), (error) => {
    assert.equal(error.message, 'WORLD_MEDIA_REMOTE_RANGE_INVALID'); assert.equal(worldMediaHttpDiagnostic(error).status, 404); assert.equal(worldMediaHttpDiagnostic(error).stage, 'post-put-readback'); return true;
  });
  assert.equal(probe.puts, 1); assert.equal(gets, 9); assert.equal(ranges, 8); assert.deepEqual(probe.waits, WORLD_MEDIA_POST_PUT_READBACK.delaysMs);
  assert.equal(probe.clock, 63000); assert.equal(WORLD_MEDIA_POST_PUT_READBACK.maxWallMs, 90000);
});

test('Range404 readiness keeps the shared wall deadline and external cancellation, while lookup/foreign404 never wait', async () => {
  let gets = 0; let clock = 0;
  const timeout = waitingAdapter(async (_u, options) => options.headers?.Range ? new Response(null, { status: 404 }) : ++gets === 1 ? new Response(null, { status: 404 }) : response(bytes), { now: () => clock, waitImpl: async () => { clock = 90001; } });
  await timeout.adapter.authenticate(); await assert.rejects(() => timeout.adapter.put(pathname, bytes, info), (error) => error.message === 'WORLD_MEDIA_POST_PUT_VISIBILITY_TIMEOUT' && worldMediaHttpDiagnostic(error).phase === 'world-media-public-range-failure');
  assert.equal(timeout.puts, 1); assert.equal(gets, 2);
  const controller = new AbortController(); let cancelledGets = 0;
  const cancelled = waitingAdapter(async (_u, options) => options.headers?.Range ? new Response(null, { status: 404 }) : ++cancelledGets === 1 ? new Response(null, { status: 404 }) : response(bytes), { signal: controller.signal, waitImpl: async (_ms, signal) => { controller.abort(); signal.throwIfAborted(); } });
  await cancelled.adapter.authenticate(); await assert.rejects(() => cancelled.adapter.put(pathname, bytes, info), (error) => error.name === 'AbortError');
  assert.equal(cancelled.puts, 1); assert.equal(cancelledGets, 2);
  for (const existing of [true, false]) {
    let fullGets = 0;
    const noWait = waitingAdapter(async (_u, options) => {
      if (!options.headers?.Range) return !existing && ++fullGets === 1 ? new Response(null, { status: 404 }) : response(bytes);
      const result = new Response(null, { status: 404 });
      if (!existing) Object.defineProperty(result, 'url', { value: 'https://foreign.invalid/path' });
      return result;
    });
    await noWait.adapter.authenticate(); await assert.rejects(() => noWait.adapter.put(pathname, bytes, info), /WORLD_MEDIA_REMOTE_RANGE_INVALID/);
    assert.equal(noWait.waits.length, 0); assert.equal(noWait.puts, existing ? 0 : 1);
  }
});
