import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WORLD_MEDIA_FILES, validateWorldMediaManifest, worldMediaPathname } from '../../src/lib/scroll-world/media-manifest.mjs';
import { createWorldMediaResolver, worldClipSource } from '../../src/lib/scroll-world/media-source.mjs';
import { inventoryWorldMedia, syncWorldMedia, createMockWorldMediaAdapter } from '../../../../scripts/media/world-media-sync.mjs';

const origin = 'https://example-trial.public.blob.vercel-storage.com';
const sourceFile = (root, key) => path.join(root, 'apps/web/public', key.slice(1));
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'world-media-sync-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const key of WORLD_MEDIA_FILES) {
    const file = sourceFile(root, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `mock video ${key}`);
  }
  return root;
}
const clone = (value) => JSON.parse(JSON.stringify(value));

test('local default resolves codec before mapping and does not need Blob/config/token', () => {
  assert.equal(worldClipSource('/videos/world/intro.mp4', 'webm'), '/videos/world/intro.webm');
  assert.equal(worldClipSource('/videos/world/intro.mp4', 'mp4'), '/videos/world/intro.mp4');
  assert.equal(worldClipSource(null, 'webm'), null);
  assert.equal(worldClipSource('/videos/world/intro.mp4', null), null);
  assert.equal(worldClipSource('https://unknown.invalid/intro.mp4', 'webm'), null);
});

test('mock sync hashes all 14 files, reuses unchanged manifest, uploads only changed file', async (t) => {
  const root = await fixture(t);
  const adapter = createMockWorldMediaAdapter(origin);
  const first = await syncWorldMedia({ sourceRoot: root, storeOrigin: origin, adapter });
  assert.equal(first.uploaded.length, 14);
  assert.equal(first.reused.length, 0);
  assert.equal(adapter.putCount, 14);
  const inventory = await inventoryWorldMedia(root);
  const verified = validateWorldMediaManifest(first.manifest, origin, inventory);
  assert.equal(Object.keys(verified.files).length, 14);
  for (const key of WORLD_MEDIA_FILES) {
    assert.equal(verified.files[key].url, `${origin}/${worldMediaPathname(key, inventory[key].sha256)}`);
  }
  const second = await syncWorldMedia({ sourceRoot: root, storeOrigin: origin, adapter, previousManifest: first.manifest });
  assert.deepEqual(second.manifest, first.manifest);
  assert.equal(second.uploaded.length, 0);
  assert.equal(second.reused.length, 14);
  assert.equal(adapter.putCount, 14);
  await fs.writeFile(sourceFile(root, '/videos/world/intro.webm'), 'changed fake video');
  const third = await syncWorldMedia({ sourceRoot: root, storeOrigin: origin, adapter, previousManifest: first.manifest });
  assert.deepEqual(third.uploaded, ['/videos/world/intro.webm']);
  assert.equal(third.reused.length, 13);
  assert.equal(adapter.putCount, 15);
  assert.equal(third.manifest.files['/videos/world/intro.mp4'].url, first.manifest.files['/videos/world/intro.mp4'].url);
  assert.notEqual(third.manifest.files['/videos/world/intro.webm'].url, first.manifest.files['/videos/world/intro.webm'].url);
  assert.equal(Object.keys(first.manifest.files).length, 14, 'previous immutable manifest remains intact');
});

test('trial codec selects independent hash URL, and invalid trial state returns poster fallback', async (t) => {
  const root = await fixture(t);
  const { manifest } = await syncWorldMedia({ sourceRoot: root, storeOrigin: origin, adapter: createMockWorldMediaAdapter(origin) });
  const resolve = createWorldMediaResolver({ mode: 'blob-trial', storeOrigin: origin, manifest });
  assert.equal(resolve('/videos/world/intro.mp4', 'webm'), manifest.files['/videos/world/intro.webm'].url);
  assert.equal(resolve('/videos/world/intro.mp4', 'mp4'), manifest.files['/videos/world/intro.mp4'].url);
  const broken = clone(manifest);
  delete broken.files['/videos/world/intro.webm'];
  assert.equal(createWorldMediaResolver({ mode: 'blob-trial', storeOrigin: origin, manifest: broken })('/videos/world/intro.mp4', 'mp4'), null);
  assert.equal(createWorldMediaResolver({ mode: 'blob-trial', storeOrigin: origin, manifest: null })('/videos/world/intro.mp4', 'mp4'), null);
  assert.equal(createWorldMediaResolver({ mode: 'typo', storeOrigin: origin, manifest })('/videos/world/intro.mp4', 'mp4'), null);
});

test('manifest rejects incomplete codecs, unexpected fields/secrets, wrong origin/hash/URL and source mismatch', async (t) => {
  const root = await fixture(t);
  const { manifest } = await syncWorldMedia({ sourceRoot: root, storeOrigin: origin, adapter: createMockWorldMediaAdapter(origin) });
  const key = '/videos/world/intro.mp4';
  const mutations = [
    (m) => { delete m.files['/videos/world/finale.webm']; },
    (m) => { m.files['/videos/world/extra.mp4'] = clone(m.files[key]); },
    (m) => { m.token = 'forbidden'; },
    (m) => { m.files[key].token = 'forbidden'; },
    (m) => { m.files[key].url = m.files[key].url.replace('example-trial.', 'foreign.'); },
    (m) => { m.files[key].url += '?token=forbidden'; },
    (m) => { m.files[key].url += '#fragment'; },
    (m) => { m.files[key].url = m.files[key].url.replace('https://', 'http://'); },
    (m) => { m.files[key].sha256 = 'g'.repeat(64); },
    (m) => { m.files[key].bytes = 0; },
    (m) => { m.files[key].pathname = '../escape.mp4'; },
    (m) => { m.files[key].url = `${origin}/%2e%2e/intro.mp4`; },
    (m) => { m.storeOrigin = `${origin}/different`; },
  ];
  for (const mutate of mutations) {
    const changed = clone(manifest);
    mutate(changed);
    assert.throws(() => validateWorldMediaManifest(changed, origin));
  }
  for (const invalid of ['http://example-trial.public.blob.vercel-storage.com', `${origin}/`, 'https://evil.invalid', 'https://user:secret@example-trial.public.blob.vercel-storage.com', `${origin}:443`]) {
    assert.throws(() => validateWorldMediaManifest(manifest, invalid));
  }
  await fs.writeFile(sourceFile(root, key), 'different source');
  await assert.rejects(async () => validateWorldMediaManifest(manifest, origin, await inventoryWorldMedia(root)), /SOURCE_MISMATCH/);
});

test('sync refuses missing/symlink source or malformed previous manifest before adapter writes', async (t) => {
  const root = await fixture(t);
  const adapter = createMockWorldMediaAdapter(origin);
  await assert.rejects(() => syncWorldMedia({ sourceRoot: root, storeOrigin: origin, adapter, previousManifest: {} }));
  assert.equal(adapter.putCount, 0);
  const file = sourceFile(root, '/videos/world/intro.mp4');
  await fs.unlink(file);
  await assert.rejects(() => syncWorldMedia({ sourceRoot: root, storeOrigin: origin, adapter }));
  assert.equal(adapter.putCount, 0);
  await fs.symlink(sourceFile(root, '/videos/world/river.mp4'), file);
  await assert.rejects(() => inventoryWorldMedia(root), /REGULAR_FILE/);
  assert.equal(adapter.putCount, 0);
});
