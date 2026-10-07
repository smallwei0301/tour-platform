import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { WORLD_MEDIA_TRIAL, worldMediaBuildMode, worldMediaCspSource } from '../../../../scripts/media/world-media-build-contract.mjs';
import { createWorldMediaBlobAdapter, verifyWorldMediaBlob } from '../../../../scripts/media/world-media-blob-adapter.mjs';

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
  const root = await fixture(t); const before = await inventoryWorldMedia(root); let builds = 0; let loads = 0;
  for (const e of [{}, { ...env, VERCEL_ENV: 'production' }, { ...env, VERCEL_GIT_COMMIT_REF: 'other-branch' }]) {
    const code = await runWorldMediaBuild({ env: e, sourceRoot: root, appRoot: `${root}/apps/web`, exclusiveCheckout: false, build: async () => { builds += 1; return 0; }, loadAdapter: async () => { loads += 1; throw new Error('should not load'); } });
    assert.equal(code, 0);
  }
  assert.equal(builds, 3); assert.equal(loads, 0); assert.deepEqual(await inventoryWorldMedia(root), before);
});
