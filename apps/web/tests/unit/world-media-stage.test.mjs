import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { WORLD_MEDIA_FILES } from '../../src/lib/scroll-world/media-manifest.mjs';
import { inventoryWorldMedia, syncWorldMedia, createMockWorldMediaAdapter } from '../../../../scripts/media/world-media-sync.mjs';
import { prepareWorldMediaStage } from '../../../../scripts/media/prepare-world-media-stage.mjs';

const origin = 'https://example-trial.public.blob.vercel-storage.com';
const statePath = 'apps/web/src/lib/scroll-world/media-trial-state.mjs';
const filePath = (root, key) => path.join(root, 'apps/web/public', key.slice(1));
async function fixture(t) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'world-media-stage-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'source');
  await fs.mkdir(root);
  for (const key of WORLD_MEDIA_FILES) {
    await fs.mkdir(path.dirname(filePath(root, key)), { recursive: true });
    await fs.writeFile(filePath(root, key), `mock video ${key}`);
  }
  for (const file of ['apps/web/public/images/world/intro.webp', statePath, 'package.json', '.gitignore', 'notes/race.txt']) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), file === '.gitignore' ? '.env\nnode_modules/\n' : `source ${file}`);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  await fs.mkdir(path.join(root, '.vercel'));
  await fs.writeFile(path.join(root, '.vercel/project.json'), 'must not copy deployment association');
  execFileSync('git', ['add', '.'], { cwd: root });
  await fs.writeFile(path.join(root, '.env'), 'must never copy');
  const result = await syncWorldMedia({ sourceRoot: root, storeOrigin: origin, adapter: createMockWorldMediaAdapter(origin) });
  return { parent, root, manifest: result.manifest };
}
const exists = async (file) => fs.access(file).then(() => true, () => false);

test('trial validates full source first, excludes exactly 14 staged videos and leaves original intact', async (t) => {
  const { root, parent, manifest } = await fixture(t);
  const before = await inventoryWorldMedia(root);
  const stage = path.join(parent, 'trial');
  const report = await prepareWorldMediaStage({ exclusiveControl: true, sourceRoot: root, stageRoot: stage, mode: 'blob-trial', storeOrigin: origin, manifest });
  assert.equal(report.excludedFiles.length, 14);
  assert.deepEqual(report.excludedFiles, WORLD_MEDIA_FILES);
  for (const key of WORLD_MEDIA_FILES) assert.equal(await exists(filePath(stage, key)), false);
  assert.equal(await exists(path.join(stage, 'apps/web/public/images/world/intro.webp')), true);
  assert.equal(await exists(path.join(stage, '.env')), false);
  assert.equal(await exists(path.join(stage, '.git')), false);
  assert.equal(await exists(path.join(stage, '.vercel')), false);
  const { WORLD_MEDIA_STATE } = await import(pathToFileURL(path.join(stage, statePath)).href);
  assert.equal(WORLD_MEDIA_STATE.mode, 'blob-trial');
  assert.deepEqual(WORLD_MEDIA_STATE.manifest, manifest);
  assert.deepEqual(await inventoryWorldMedia(root), before);
});

test('local rollback stage reproduces all 14 hashes independently of missing Blob origin/manifest', async (t) => {
  const { root, parent, manifest } = await fixture(t);
  const before = await inventoryWorldMedia(root);
  await prepareWorldMediaStage({ exclusiveControl: true, sourceRoot: root, stageRoot: path.join(parent, 'trial'), mode: 'blob-trial', storeOrigin: origin, manifest });
  const local = path.join(parent, 'rollback-local');
  const report = await prepareWorldMediaStage({ exclusiveControl: true, sourceRoot: root, stageRoot: local });
  assert.equal(report.mode, 'local');
  assert.equal(report.excludedFiles.length, 0);
  assert.deepEqual(await inventoryWorldMedia(local), before);
  const { WORLD_MEDIA_STATE } = await import(pathToFileURL(path.join(local, statePath)).href);
  assert.deepEqual(WORLD_MEDIA_STATE, { mode: 'local', storeOrigin: null, manifest: null });
  assert.deepEqual(await inventoryWorldMedia(root), before);
});

test('missing, incomplete, stale or malicious manifest aborts before stage exists; never silent local fallback', async (t) => {
  const { root, parent, manifest } = await fixture(t);
  const incomplete = JSON.parse(JSON.stringify(manifest));
  delete incomplete.files['/videos/world/intro.webm'];
  const scenarios = [
    { mode: 'blob-trial', storeOrigin: origin },
    { mode: 'blob-trial', storeOrigin: origin, manifest: incomplete },
    { mode: 'blob-trial', storeOrigin: 'https://foreign-trial.public.blob.vercel-storage.com', manifest },
    { mode: 'invalid' },
  ];
  for (let i = 0; i < scenarios.length; i += 1) {
    const stage = path.join(parent, `invalid-${i}`);
    await assert.rejects(() => prepareWorldMediaStage({ exclusiveControl: true, sourceRoot: root, stageRoot: stage, ...scenarios[i] }));
    assert.equal(await exists(stage), false);
  }
  await fs.writeFile(filePath(root, '/videos/world/intro.mp4'), 'new source');
  const stage = path.join(parent, 'stale');
  await assert.rejects(() => prepareWorldMediaStage({ exclusiveControl: true, sourceRoot: root, stageRoot: stage, mode: 'blob-trial', storeOrigin: origin, manifest }), /SOURCE_MISMATCH/);
  assert.equal(await exists(stage), false);
});

test('stage rejects source overlap, existing destinations and symlink source files', async (t) => {
  const { root, parent } = await fixture(t);
  await assert.rejects(() => prepareWorldMediaStage({ exclusiveControl: true, sourceRoot: root, stageRoot: path.join(root, 'output') }), /OVERLAP/);
  await assert.rejects(() => prepareWorldMediaStage({ exclusiveControl: true, sourceRoot: root, stageRoot: root }), /OVERLAP/);
  await assert.rejects(() => prepareWorldMediaStage({ exclusiveControl: true, sourceRoot: root, stageRoot: parent }), /OVERLAP/);
  const stage = path.join(parent, 'existing');
  await fs.mkdir(stage);
  await fs.writeFile(path.join(stage, 'preserved.txt'), 'preserve');
  await assert.rejects(() => prepareWorldMediaStage({ exclusiveControl: true, sourceRoot: root, stageRoot: stage }), /DESTINATION_EXISTS/);
  assert.equal(await fs.readFile(path.join(stage, 'preserved.txt'), 'utf8'), 'preserve');
  await fs.symlink(path.join(root, 'package.json'), path.join(root, 'unsafe-link'));
  await assert.rejects(() => prepareWorldMediaStage({ exclusiveControl: true, sourceRoot: root, stageRoot: path.join(parent, 'symlink') }), /REGULAR_FILE/);
  assert.equal(await exists(path.join(parent, 'symlink')), false);
});


// 普通、序列化的caller-owned fixtures；不建立concurrent writer或dynamic injection。
import { openSourceDirectory, createStageDirectory, writeStageFile, validateOwnedStageContents } from '../../../../scripts/media/secure-source-files.mjs';

test('stage API requires explicit exclusive-control declaration before changing files', async (t) => {
  const { root, parent } = await fixture(t);
  const stage = path.join(parent, 'control-missing');
  await assert.rejects(() => prepareWorldMediaStage({ sourceRoot: root, stageRoot: stage }), /EXCLUSIVE_CONTROL_REQUIRED/);
  assert.equal(await exists(stage), false);
});

test('owned stage rejects unknown regular entries and exclusive writes preserve existing file', async (t) => {
  const { parent } = await fixture(t);
  const parentHandle = await openSourceDirectory(parent);
  const stage = await createStageDirectory(parentHandle, 'ordinary-owned-stage', { exclusiveControl: true });
  try {
    await writeStageFile(stage, 'known.txt', Buffer.from('original-known'));
    await assert.rejects(() => writeStageFile(stage, 'known.txt', Buffer.from('replacement')), /EEXIST/);
    assert.equal(await fs.readFile(path.join(stage.absolute, 'known.txt'), 'utf8'), 'original-known');
    await validateOwnedStageContents(stage);
    await fs.writeFile(path.join(stage.absolute, 'unknown.txt'), 'ordinary-unknown-fixture');
    await assert.rejects(() => validateOwnedStageContents(stage), /UNKNOWN_FILE/);
    assert.equal(await fs.readFile(path.join(stage.absolute, 'unknown.txt'), 'utf8'), 'ordinary-unknown-fixture');
  } finally { await stage.handle.close(); await parentHandle.handle.close(); }
});
