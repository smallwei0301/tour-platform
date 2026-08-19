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
  ['20260723004000_midao_request_read_projection.sql', '639f430e666666c2ee9418f8dd2240d0d2c1b1038345378bee11436fc99aeabb'],
  ['20260723010000_midao_atomic_booking_approval.sql', 'a97d57a82bf2e70425325498b0ca96bdf64c1c3322cf81288135a71abaebc968'],
  ['20260723011000_midao_atomic_booking_decision_command.sql', 'c3abc1a6cc5984bcc5239c9728ebd8d46020c43fa577382f87d2775cfb5fdf8a'],
  ['20260723020000_midao_service_drafts_and_questions.sql', '38e1cd3177d459f5bae1f77366878ef809f8b6e22f323b79a7e82ddf8a410042'],
  ['20260723021000_midao_service_publication_versions.sql', '0d9d5b0acb56d657fbacc638622bc36faa35b682b7d2727db80aa63cb872bda6'],
  ['20260723022000_midao_atomic_service_publication.sql', 'b7b06f0029052c2187401e2b7b160545ab757099fee8ba088bc98c9743e9029c'],
  ['20260723023000_midao_atomic_publication_restore.sql', 'feb4e8db59acbb1703b56ee81417026bc077b0bed12669811c52ac98db832421'],
  ['20260729160000_issue1777_atomic_settlement_and_payout_confirm.sql', 'e916be151520837e7d4e2c8fd3575dc11377ffcee88ed6bbd0f7149f18a3208c'],
  ['20260729170000_issue1777_refund_adjustment_ledger.sql', 'af3e498e2acd6dd0410182fd8aef60d098315df79d4d39cfbf246256840849b6'],
  ['20260729180000_issue1777_revoke_atomic_fns_from_anon.sql', 'a4294771928c98a5b071168db76c8f8301bd4db933e0fb214c1bae891476be24'],
  ['20260729190000_issue1777_post_review_fixes.sql', '0819ea2d54f0759ed35a995e2e4d8488e072cf22c8d2857aa7604ec6acd3668a'],
  ['20260730093000_issue1777_refund_delta_accumulation.sql', '7d96dc7146424de74354fbde2af3f768e0877513e83065b601adb9120578ddd0'],
  ['20260804103000_issue1777_atomic_refund_reversal.sql', '4b77a1dae78b79a43a117fa727f891b152df370653dd31dce6deee8642ab74cc'],
  ['20260804113000_issue1777_settlement_recompute_amounts.sql', 'a09d73cf64af5437db45a3bc2c62af07f02c76e5724f5dcf5d4cca32ebd32331'],
  ['20260806090000_midao_inquiries.sql', '2d7a2467540991d0a5faf33243ab06ca19d205f233f959fb76a8a07073638a70'],
  ['20260806091000_midao_booking_intake_pricing_and_confirmation.sql', 'bf8cd71196adcb6a915455d67679c2642eee8dde123c11bf6f4405b067e27e85'],
  ['20260806120000_midao_atomic_inquiry_conversion.sql', '33e9d312bc8079c1414e4900b995dbb0f1ef02384394ed27b128c2c53b8356e3'],
  ['20260810033421_issue1811_atomic_booking_order_materialization.sql', '4fb09d6863a992c089be849198e13f85537a06f586797cb1ec159a8503372d5c'],
  ['20260812150000_issue1812_addon_atomic_materialization.sql', '4f46c444e3b5bfda3e459c90d658538ffd5058d2d6d016daeaeb299a5a106d24'],
  ['20260812160000_issue1813_points_atomic_materialization.sql', 'c104e62a04fb4ecc04962515f82e0ccc6006aa2f116082141231d27eec0acfa5'],
  ['20260812213000_issue1814_checkout_idempotency_atomic.sql', 'd410646ca1064a52a5b2b5809045d4220283b33f441dbfc904da246c49692a83'],
  ['20260813085910_issue1825_legacy_midao_draft_materialization.sql', '4ea5094f497e953076d41b3e8f878b331398f66f6694f5e2145dc1a845612ff9'],
  ['20260814130000_issue1760_availability_scope_contract.sql', 'faecf2f8448f14e9e994ba7b60f439f302c4475a5198164e637491bf969081ba'],
  ['20260814130100_issue1760_atomic_day_availability.sql', '2f495fef2ace0e7200857fc0894b1c69003e8d8156fd7efa0ffea5aad02e5327'],
  ['20260819002727_issue1825_native_service_draft_ensure.sql', '60d28474f023d6fa6dccb87cde8af27b068ce42fb99a432e6d2ce3406983e15c'],
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
