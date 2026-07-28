import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

import { existsSync } from 'node:fs';
import { copyFile, link, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const subjectPath = path.join(root, 'scripts/database-baseline/materialize-fresh-workdir.mjs');
const publisherPath = path.join(root, 'scripts/database-baseline/publish-baseline.mjs');
const baselineDir = path.join(root, 'supabase/baselines/v1');
const ledgerPath = path.join(root, 'docs/operations/baseline-ledger.json');
const migrationsDir = path.join(root, 'supabase/migrations');
const seedPath = path.join(root, 'supabase/seed.sql');

const exactPostCutoff = [
  ['20260723000000_midao_backend_mode.sql', 'fe108aa5ca68f135f49e22cbb5074941ce8ff5464a6d91a56f9f4cbdae437b17'],
  ['20260723001000_midao_notification_outbox.sql', '6babce9053d6a3f7658276c9cfbbfc5ec0f10ffaeadf4fa07ed904b5f5c66569'],
  ['20260723002000_midao_idempotency_records.sql', '051719cce046ce438668b9424a707b709f5bc1c254a537a525f07261b1a8d7db'],
  ['20260723002500_midao_audit_events.sql', '62fa29d6d4d8fe119867ef05e69eba465f52b5cfa2ca96bddd83e93da9b9bcca'],
  ['20260723003000_midao_atomic_backend_mode_switch.sql', 'c59afc5ee72da4d76ae77fb984db4b34d8f160198544ba233d0fb9f2190c90e5'],
  ['20260723003500_midao_service_role_acl_hardening.sql', 'f16fd369b9ce0b405c38ec2df5a46676cc84ba2de087b3b010cc00e4415353e5'],
  ['20260723004000_midao_request_read_projection.sql', 'f1f9478f17e865a05864974cafafe52b8d5101f8e829ed5519e19ea151835352'],
];

async function subject() {
  assert.ok(existsSync(subjectPath), 'materializer implementation missing');
  return import(`${pathToFileURL(subjectPath).href}?t=${Date.now()}`);
}

test('materializer locks one baseline marker and exact post-cutoff manifest', async () => {
  const api = await subject();
  assert.equal(api.SYNTHETIC_BASELINE_FILENAME, '00000000000001_baseline_v1.sql');
  assert.deepEqual(api.POST_CUTOFF_MIGRATIONS.map(({ filename, sha256: digest }) => [filename, digest]), exactPostCutoff);
  assert.equal(api.SYNTHETIC_BASELINE_PREFIX, '-- MIDAO BASELINE V1: BASELINE BEGIN --\n');
  assert.equal(api.BASELINE_OVERLAY_BOUNDARY, '\n-- MIDAO BASELINE V1: BASELINE END --\n-- MIDAO BASELINE V1: MANAGED OVERLAYS BEGIN --\n');
  assert.equal(api.SYNTHETIC_BASELINE_FOOTER, '\n-- MIDAO BASELINE V1: MANAGED OVERLAYS END --\n');
  assert.equal(api.CONFIG_SHA256, '5289984d402959cd0d4596b056df9a3d27590b3abefa4d7551151ad54ae084ee');
  assert.equal(api.SEED_SHA256, 'b603bc6f0c92b7cdd8da382adfbdaa28a26431dc6ff687ea51f06fa53810c8a5');
  const seed = await readFile(seedPath, 'utf8');
  const authFixture = seed.indexOf('insert into auth.users');
  const publicFixture = seed.indexOf('insert into users');
  assert.ok(authFixture >= 0 && publicFixture > authFixture, 'auth fixture must satisfy users_id_fkey before the public seed');
  assert.match(seed, /andy-lee@example\.invalid/u);
  assert.doesNotMatch(seed, /encrypted_password|password\s*=/iu);
});

test('standalone CLI is library-only so cleanup ownership cannot cross a process boundary', () => {
  const run = spawnSync(process.execPath, [subjectPath, '--output-parent', os.tmpdir()], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /LIBRARY_ONLY|library-only/iu);
});

test('public materializer can bind an exact lowercase Supabase project identity without arbitrary paths', async () => {
  const api = await subject();
  const parent = await mkdtemp(path.join(os.tmpdir(), 'midao-materializer-project-'));
  try {
    const result = await api.materializeFreshWorkdir({ outputParent: parent, projectId: 'midao-terminal-run' });
    assert.equal(result.workdir, path.join(parent, 'midao-terminal-run'));
    await result.cleanup();
    for (const projectId of ['Uppercase', '../escape', 'has.dot', '', 'a'.repeat(65)]) {
      await assert.rejects(api.materializeFreshWorkdir({ outputParent: parent, projectId }), /projectId|project identity/iu);
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('fresh materialized config disables optional service jobs without mutating repository config', async () => {
  const api = await subject();
  const parent = await mkdtemp(path.join(os.tmpdir(), 'midao-materializer-db-only-'));
  const sourcePath = path.join(root, 'supabase/config.toml');
  const sourceBefore = await readFile(sourcePath);
  let result;
  try {
    result = await api.materializeFreshWorkdir({ outputParent: parent, projectId: 'midao-terminal-db-only' });
    const text = await readFile(result.configPath, 'utf8');
    const enabledFor = (section) => {
      const marker = `[${section}]\n`; const start = text.indexOf(marker);
      assert.notEqual(start, -1, `missing [${section}]`);
      const next = text.indexOf('\n[', start + marker.length);
      const body = text.slice(start + marker.length, next < 0 ? text.length : next + 1);
      const values = [...body.matchAll(/^enabled\s*=\s*(true|false)\s*$/gmu)].map((entry) => entry[1]);
      assert.deepEqual(values, ['false'], `[${section}] must have one false enabled value`);
    };
    for (const section of ['storage', 'auth', 'realtime', 'db.seed']) enabledFor(section);
    assert.deepEqual(await readFile(sourcePath), sourceBefore);
  } finally {
    await result?.cleanup();
    await rm(parent, { recursive: true, force: true });
    assert.deepEqual(await readFile(sourcePath), sourceBefore);
  }
});

test('materializer exposes identity-bound bootstrap staging and restores exact migration inventory', async () => {
  const api = await subject();
  const parent = await mkdtemp(path.join(os.tmpdir(), 'midao-materializer-replay-'));
  let result;
  try {
    result = await api.materializeFreshWorkdir({ outputParent: parent, projectId: 'midao-terminal-replay' });
    const original = (await readdir(result.migrationsDir)).sort();
    const replay = await result.stageCliReplay();
    assert.deepEqual(await readdir(result.migrationsDir), ['00000000000000_midao_history_bootstrap.sql']);
    assert.deepEqual((await readdir(replay.pendingMigrationsDir)).sort(), original);
    await assert.rejects(result.cleanup(), /replay|staged|restore/iu);
    await replay.restore();
    assert.deepEqual((await readdir(result.migrationsDir)).sort(), original);
    const supabaseDir = path.dirname(result.migrationsDir);
    await mkdir(path.join(supabaseDir, '.temp'), { mode: 0o755 });
    await writeFile(path.join(supabaseDir, '.temp/cli-latest'), 'v2.109.1', { mode: 0o644, flag: 'wx' });
    await mkdir(path.join(supabaseDir, '.branches'), { mode: 0o755 });
    await writeFile(path.join(supabaseDir, '.branches/_current_branch'), 'main', { mode: 0o644, flag: 'wx' });
    await result.cleanupCliMetadata();
    assert.deepEqual((await readdir(supabaseDir)).sort(), ['config.toml', 'migrations', 'seed.sql']);
    await result.cleanup(); result = null;
  } finally {
    await result?.stageCliReplay?.().then((replay) => replay.restore()).catch(() => {});
    await result?.cleanup?.().catch(() => {});
    await rm(parent, { recursive: true, force: true });
  }
});

test('materializer verifies capture transaction then emits one marker, exact migrations and separate seed', async () => {
  const api = await subject();
  const parent = await mkdtemp(path.join(os.tmpdir(), 'midao-materializer-green-'));
  let sourceOpens = 0;
  try {
    const result = await api.__internal.materializeWithPaths({
      repoRoot: root, baselineDir, ledgerPath, migrationsDir, outputParent: parent,
      onSourceOpen: () => { sourceOpens += 1; },
    });
    const names = (await readdir(result.migrationsDir)).sort();
    assert.deepEqual(names, [api.SYNTHETIC_BASELINE_FILENAME, ...exactPostCutoff.map(([name]) => name)].sort());
    assert.deepEqual(result.history, [api.SYNTHETIC_BASELINE_FILENAME, ...exactPostCutoff.map(([name]) => name)]);
    assert.deepEqual(result.historyVersions, ['00000000000001', ...exactPostCutoff.map(([name]) => name.slice(0, 14))]);
    assert.equal(result.transactionId, JSON.parse(await readFile(path.join(baselineDir, 'capture-manifest.json'), 'utf8')).transactionId);
    assert.equal(sourceOpens, exactPostCutoff.length + 2, 'exact migrations plus config and seed only after verifier');

    const marker = await readFile(path.join(result.migrationsDir, api.SYNTHETIC_BASELINE_FILENAME));
    const baseline = await readFile(path.join(baselineDir, 'baseline.sql'));
    const overlay = await readFile(path.join(baselineDir, 'managed-overlays.sql'));
    assert.deepEqual(marker, Buffer.concat([
      Buffer.from(api.SYNTHETIC_BASELINE_PREFIX), baseline,
      Buffer.from(api.BASELINE_OVERLAY_BOUNDARY), overlay, Buffer.from(api.SYNTHETIC_BASELINE_FOOTER),
    ]));
    assert.equal(names.some((name) => /overlay|rollback|20260[1-6]/iu.test(name)), false);
    assert.equal(existsSync(result.seedPath), true);
    assert.equal(existsSync(result.configPath), true);
    for (const target of [result.workdir, path.dirname(result.migrationsDir), result.migrationsDir]) {
      assert.equal((await lstat(target)).mode & 0o777, 0o700);
    }
    for (const target of [result.configPath, result.seedPath, ...names.map((name) => path.join(result.migrationsDir, name))]) {
      const identity = await lstat(target);
      assert.equal(identity.mode & 0o777, 0o600);
      assert.equal(identity.nlink, 1);
    }
    assert.equal(path.dirname(result.seedPath), path.dirname(result.migrationsDir));
    await result.cleanup();
    assert.equal(existsSync(result.workdir), false);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('unfinished journal or mismatched ledger rejects before post-cutoff and seed source opens', async () => {
  const api = await subject();
  const parent = await mkdtemp(path.join(os.tmpdir(), 'midao-materializer-hostile-'));
  try {
    const journal = path.join(parent, 'publication.journal.json');
    await writeFile(journal, '{"state":"PROMOTING"}\n', { mode: 0o600, flag: 'wx' });
    let opens = 0;
    let payloadReads = 0;
    await assert.rejects(api.__internal.materializeWithPaths({
      repoRoot: root, baselineDir, ledgerPath, migrationsDir, outputParent: parent, journalPath: journal,
      onSourceOpen: () => { opens += 1; },
      onPayloadRead: () => { payloadReads += 1; },
    }), /journal|unfinished/iu);
    assert.equal(opens, 0);
    assert.equal(payloadReads, 0);

    await rm(journal);
    const badLedger = path.join(parent, 'bad-ledger.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.transactionId = 'f'.repeat(64);
    await writeFile(badLedger, `${JSON.stringify(ledger)}\n`, { mode: 0o600, flag: 'wx' });
    await assert.rejects(api.__internal.materializeWithPaths({
      repoRoot: root, baselineDir, ledgerPath: badLedger, migrationsDir, outputParent: parent, journalPath: journal,
      onSourceOpen: () => { opens += 1; },
      onPayloadRead: () => { payloadReads += 1; },
    }), /ledger|manifest|transaction/iu);
    assert.equal(opens, 0);
    assert.equal(payloadReads, 0);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('public materializer binds journal lookup to its repository when invoked from a foreign cwd', async () => {
  const api = await subject();
  const publisher = await import(`${pathToFileURL(publisherPath).href}?journal=${Date.now()}`);
  const journalPath = publisher.resolveRepositoryPublicationPaths().journalPath;
  const parent = await mkdtemp(path.join(os.tmpdir(), 'midao-materializer-cwd-'));
  const previousCwd = process.cwd();
  try {
    await writeFile(journalPath, '{"state":"PROMOTING"}\n', { mode: 0o600, flag: 'wx' });
    process.chdir(os.tmpdir());
    await assert.rejects(api.materializeFreshWorkdir({ outputParent: parent }), /journal|unfinished/iu);
  } finally {
    process.chdir(previousCwd);
    await rm(journalPath, { force: true });
    await rm(parent, { recursive: true, force: true });
  }
});

test('selection is exact, published manifest is trusted, and rollback/symlink/hardlink sources fail closed', async () => {
  const api = await subject();
  const parent = await mkdtemp(path.join(os.tmpdir(), 'midao-materializer-select-'));
  for (const hostile of [null, [], 42]) {
    await assert.rejects(api.materializeFreshWorkdir(hostile), /public options contain forbidden path override/u);
  }
  const source = path.join(parent, 'migrations');
  await mkdir(source, { mode: 0o700 });
  try {
    for (const [name] of exactPostCutoff) await copyFile(path.join(migrationsDir, name), path.join(source, name));
    const futureName = '20260724000000_future_approved.sql';
    const futureBytes = Buffer.from('SELECT 1;\n');
    await writeFile(path.join(source, futureName), futureBytes, { mode: 0o600, flag: 'wx' });
    await writeFile(path.join(source, '20260724000001_unlisted.sql'), 'SELECT 2;\n', { mode: 0o600, flag: 'wx' });
    const selected = await api.__internal.selectPostCutoffSources({ migrationsDir: source });
    assert.deepEqual(
      selected.map(({ filename }) => filename),
      api.POST_CUTOFF_MIGRATIONS.map(({ filename }) => filename),
    );
    for (const item of selected) item.bytes.fill(0);

    const publishedManifest = JSON.parse(await readFile(path.join(baselineDir, 'manifest.json'), 'utf8'));
    assert.deepEqual(
      publishedManifest.postCutoffMigrations.map(({ filename, sha256 }) => [filename, sha256]),
      exactPostCutoff,
    );
    const manifested = await api.materializeFreshWorkdir({
      outputParent: parent,
      postCutoffManifest: publishedManifest,
      projectId: 'midao-manifest-run',
    });
    assert.deepEqual(manifested.history, [api.SYNTHETIC_BASELINE_FILENAME, ...exactPostCutoff.map(([name]) => name)]);
    await manifested.cleanup();
    await assert.rejects(
      api.materializeFreshWorkdir({ outputParent: parent, postCutoffManifest: { entries: [] } }),
      /expected terminal|manifest/iu,
    );
    const sourceAlias = path.join(parent, 'migrations-alias');
    await symlink(source, sourceAlias);
    await assert.rejects(
      api.__internal.selectPostCutoffSources({ migrationsDir: sourceAlias }),
      /directory|symbolic|symlink|identity/iu,
    );
    await rm(sourceAlias);
    await assert.rejects(api.__internal.selectPostCutoffSources({
      migrationsDir: source,
      entries: [...api.POST_CUTOFF_MIGRATIONS, { filename: '20260724000002_rollback.sql', sha256: '0'.repeat(64) }],
    }), /rollback/iu);
    await assert.rejects(api.__internal.selectPostCutoffSources({
      migrationsDir: source,
      entries: [...api.POST_CUTOFF_MIGRATIONS, { filename: '20260723003500_version_collision.sql', sha256: '0'.repeat(64) }],
    }), /version|order|duplicate/iu);

    const first = exactPostCutoff[0][0];
    const real = path.join(source, first);
    const moved = `${real}.real`;
    await rename(real, moved);
    await symlink(moved, real);
    await assert.rejects(api.__internal.selectPostCutoffSources({ migrationsDir: source, entries: api.POST_CUTOFF_MIGRATIONS }), /symbolic|symlink|identity/iu);
    await rm(real);
    await rename(moved, real);

    let replaced = false;
    await assert.rejects(api.__internal.selectPostCutoffSources({
      migrationsDir: source,
      entries: api.POST_CUTOFF_MIGRATIONS,
      afterOpen: async (openedPath) => {
        if (replaced || openedPath !== real) return;
        replaced = true;
        await rename(real, moved);
        await copyFile(moved, real);
      },
    }), /identity changed/iu);
    await rm(real);
    await rename(moved, real);

    const second = exactPostCutoff[1][0];
    await link(path.join(source, second), path.join(parent, 'hardlink.sql'));
    await assert.rejects(api.__internal.selectPostCutoffSources({ migrationsDir: source, entries: api.POST_CUTOFF_MIGRATIONS }), /hardlink|link count|identity/iu);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('cleanup refuses a foreign replacement and removes only the owned workdir identity', async () => {
  const api = await subject();
  const parent = await mkdtemp(path.join(os.tmpdir(), 'midao-materializer-cleanup-'));
  try {
    const result = await api.__internal.materializeWithPaths({ repoRoot: root, baselineDir, ledgerPath, migrationsDir, outputParent: parent });
    const owned = `${result.workdir}.owned`;
    await rename(result.workdir, owned);
    await mkdir(result.workdir, { mode: 0o700 });
    await writeFile(path.join(result.workdir, 'foreign'), 'preserve', { mode: 0o600, flag: 'wx' });
    await assert.rejects(result.cleanup(), /identity|foreign|replaced/iu);
    assert.equal(await readFile(path.join(result.workdir, 'foreign'), 'utf8'), 'preserve');
    await rm(result.workdir, { recursive: true });
    await rename(owned, result.workdir);
    const unknown = path.join(result.workdir, 'supabase/foreign-child');
    await writeFile(unknown, 'preserve', { mode: 0o600, flag: 'wx' });
    await assert.rejects(result.cleanup(), /inventory|HOLD/iu);
    assert.equal(await readFile(unknown, 'utf8'), 'preserve');
    await rm(unknown);
    await result.cleanup();
    assert.equal(existsSync(result.workdir), false);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('directory cleanup identity tolerates child-count nlink changes but rejects inode replacement', async () => {
  const api = await subject();
  const original = { dev: 11, ino: 22, uid: 33, nlink: 2 };
  assert.equal(api.__internal.sameDirectoryObjectIdentity(original, { ...original, nlink: 3 }), true);
  assert.equal(api.__internal.sameDirectoryObjectIdentity(original, { ...original, ino: 23, nlink: 2 }), false);
  assert.equal(api.__internal.sameDirectoryObjectIdentity(original, { ...original, dev: 12, nlink: 2 }), false);
  assert.equal(api.__internal.sameDirectoryObjectIdentity(original, { ...original, uid: 34, nlink: 2 }), false);
});
