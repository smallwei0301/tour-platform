import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { link, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const builderPath = resolve(repoRoot, 'scripts/database-baseline/build-frozen-migration-manifest.mjs');
const liveManifestPath = resolve(repoRoot, 'supabase/baselines/v1/frozen-migrations.sha256');
const cutoffName = '20260723000000_midao_backend_mode.sql';

function sha(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function loadBuilder() {
  assert.equal(existsSync(builderPath), true, 'frozen migration manifest builder missing');
  return import(`${pathToFileURL(builderPath).href}?t=${Date.now()}`);
}

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'midao-frozen-history-'));
  const migrations = resolve(root, 'supabase/migrations');
  await mkdir(migrations, { recursive: true });
  await writeFile(resolve(migrations, '001_a.sql'), 'select 1;\n');
  await writeFile(resolve(migrations, '002_b.sql'), 'select 2;\n');
  await writeFile(resolve(migrations, '002_b.rollback.sql'), 'select 0;\n');
  await writeFile(resolve(migrations, cutoffName), 'select 3;\n');
  await writeFile(resolve(migrations, '20260724000000_future.sql'), 'select 4;\n');
  return { root, migrations };
}

const fixtureOptions = (root) => ({
  repoRoot: root,
  migrationsDir: 'supabase/migrations',
  cutoffName,
  expectedCount: 2,
});

test('builder command exists before manifest behavior can pass', async () => {
  await loadBuilder();
});

test('live cutoff collection is exact 128 and excludes rollback plus six Midao post-cutoff files', async () => {
  const { collectFrozenMigrations, renderFrozenManifest } = await loadBuilder();
  const entries = await collectFrozenMigrations({
    repoRoot,
    migrationsDir: 'supabase/migrations',
    cutoffName,
    expectedCount: 128,
  });
  assert.equal(entries.length, 128);
  assert.equal(entries[0].filename, '001_mvp_core.sql');
  assert.equal(entries.at(-1).filename, '20260710121345_pin_payment_callback_search_path.sql');
  assert.equal(entries.some((entry) => entry.filename.endsWith('.rollback.sql')), false);
  assert.equal(entries.some((entry) => entry.filename.startsWith('2026072300')), false);
  const rendered = renderFrozenManifest(entries);
  const lines = rendered.trimEnd().split('\n');
  assert.equal(lines.length, 128);
  assert.ok(lines.every((line) => /^[0-9a-f]{64}  supabase\/migrations\/[^/]+\.sql$/u.test(line)));
  assert.ok(rendered.endsWith('\n'));
});

test('collector hashes exact bytes and renderer is deterministic in filename order', async (t) => {
  const { collectFrozenMigrations, renderFrozenManifest } = await loadBuilder();
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const entries = await collectFrozenMigrations(fixtureOptions(f.root));
  assert.deepEqual(entries.map((entry) => entry.filename), ['001_a.sql', '002_b.sql']);
  assert.equal(entries[0].sha256, sha(Buffer.from('select 1;\n')));
  assert.equal(
    renderFrozenManifest(entries),
    `${sha(Buffer.from('select 1;\n'))}  supabase/migrations/001_a.sql\n${sha(Buffer.from('select 2;\n'))}  supabase/migrations/002_b.sql\n`
  );
});

test('manifest parser rejects malformed paths hashes order and duplicate filenames', async () => {
  const { parseFrozenManifest } = await loadBuilder();
  const h = 'a'.repeat(64);
  assert.throws(() => parseFrozenManifest(`${h} supabase/migrations/001.sql\n`), /format/iu);
  assert.throws(() => parseFrozenManifest(`${h}  ..\/001.sql\n`), /path/iu);
  assert.throws(() => parseFrozenManifest(`${h}  supabase/migrations/002.sql\n${h}  supabase/migrations/001.sql\n`), /order/iu);
  assert.throws(() => parseFrozenManifest(`${h}  supabase/migrations/001.sql\n${h}  supabase/migrations/001.sql\n`), /duplicate/iu);
});

test('verification rejects missing byte drift and unexpected backdated forward migration', async (t) => {
  const { collectFrozenMigrations, renderFrozenManifest, verifyFrozenManifest } = await loadBuilder();
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const options = fixtureOptions(f.root);
  const manifest = renderFrozenManifest(await collectFrozenMigrations(options));
  await verifyFrozenManifest({ ...options, manifestText: manifest });

  await writeFile(resolve(f.migrations, '001_a.sql'), 'changed\n');
  await assert.rejects(() => verifyFrozenManifest({ ...options, manifestText: manifest }), /drift/iu);
  await writeFile(resolve(f.migrations, '001_a.sql'), 'select 1;\n');
  await unlink(resolve(f.migrations, '002_b.sql'));
  await assert.rejects(() => verifyFrozenManifest({ ...options, manifestText: manifest }), /missing|count/iu);
  await writeFile(resolve(f.migrations, '002_b.sql'), 'select 2;\n');
  await writeFile(resolve(f.migrations, '003_backdated.sql'), 'select 5;\n');
  await assert.rejects(() => verifyFrozenManifest({ ...options, manifestText: manifest }), /unexpected|count/iu);
});

test('collector and verifier reject symlinks and hardlinks', async (t) => {
  const { collectFrozenMigrations, renderFrozenManifest, verifyFrozenManifest } = await loadBuilder();
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const options = fixtureOptions(f.root);
  const manifest = renderFrozenManifest(await collectFrozenMigrations(options));

  await unlink(resolve(f.migrations, '002_b.sql'));
  await symlink('001_a.sql', resolve(f.migrations, '002_b.sql'));
  await assert.rejects(() => verifyFrozenManifest({ ...options, manifestText: manifest }), /symlink|regular/iu);

  await unlink(resolve(f.migrations, '002_b.sql'));
  await link(resolve(f.migrations, '001_a.sql'), resolve(f.migrations, '002_b.sql'));
  await assert.rejects(() => verifyFrozenManifest({ ...options, manifestText: manifest }), /hardlink|nlink/iu);
});

test('legal future post-cutoff additions do not invalidate the frozen checker', async (t) => {
  const { collectFrozenMigrations, renderFrozenManifest, verifyFrozenManifest } = await loadBuilder();
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const options = fixtureOptions(f.root);
  const manifest = renderFrozenManifest(await collectFrozenMigrations(options));
  await writeFile(resolve(f.migrations, '20260725000000_future_two.sql'), 'select 6;\n');
  await verifyFrozenManifest({ ...options, manifestText: manifest });
});

test('published live manifest is deterministic and verifies exact current bytes', async () => {
  const { verifyFrozenManifest } = await loadBuilder();
  assert.equal(existsSync(liveManifestPath), true, 'published frozen manifest missing');
  const manifestText = await readFile(liveManifestPath, 'utf8');
  await verifyFrozenManifest({
    repoRoot,
    migrationsDir: 'supabase/migrations',
    cutoffName,
    expectedCount: 128,
    manifestText,
  });
});
