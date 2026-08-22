import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const subjectPath = path.join(root, 'scripts/database-baseline/build-expected-terminal.mjs');
const baselineDir = path.join(root, 'supabase/baselines/v1');
const captureLedgerPath = path.join(root, 'docs/operations/baseline-ledger.json');
const terminalName = 'catalog.expected-terminal.normalized.json';
const digestName = 'catalog-expected-terminal.sha256';
const manifestName = 'manifest.json';
const ledgerName = 'expected-terminal-ledger.json';
const exactMigrations = [
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
  ['20260723090000_midao2_request_plan_columns.sql', 'ffa84961fcecbeea0922f6bd7ee117b5b38086951e883e6e62c8f79db5aea687'],
  ['20260727120000_midao2_instant_booking.sql', 'c12b16109664baa7e812dfa7479ee1c54e429cdbd690c938d35ed174ad21a2da'],
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
  ['20260819210000_issue1855_pg_catalog_nullif_repair.sql', 'e098674c2ce4bff9342a3ef4de032988ac6910b067ae549fe4dc16ba3cb0ffc3'],
];
const historyVersions = ['00000000000001', ...exactMigrations.map(([name]) => name.slice(0, 14))];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function subject() {
  assert.equal(existsSync(subjectPath), true, 'expected-terminal builder missing');
  return import(`${pathToFileURL(subjectPath).href}?t=${Date.now()}`);
}

test('builder CLI accepts only the exact Task10 flag sequence and two runs', async () => {
  const api = await subject();
  const argv = [
    '--runs', '2', '--baseline', 'supabase/baselines/v1', '--publish-dir', 'supabase/baselines/v1',
    '--capture-ledger', 'docs/operations/baseline-ledger.json', '--ledger', 'docs/operations/expected-terminal-ledger.json',
  ];
  assert.deepEqual(api.parseBuilderArgs(argv, root), {
    runs: 2,
    baselineDir,
    publishDir: baselineDir,
    captureLedgerPath,
    ledgerPath: path.join(root, 'docs/operations/expected-terminal-ledger.json'),
  });
  for (const hostile of [
    [...argv, '--extra'],
    argv.with(1, '1'),
    ['--baseline', ...argv],
    argv.with(3, '../foreign'),
    argv.with(9, 'docs/operations/baseline-ledger.json'),
  ]) assert.throws(() => api.parseBuilderArgs(hostile, root), /argument|CLI|path/iu);
});

test('Task 10 heavy command pins the verified Node 22.23.1 binary', async () => {
  const plan = await readFile(path.join(root, 'docs/plans/2026-07-24-as-built-database-baseline-implementation.md'), 'utf8');
  assert.match(plan, /timeout --signal=TERM 570s \/root\/\.hermes\/toolchains\/node\/22\.23\.1\/node scripts\/database-baseline\/build-expected-terminal\.mjs \\\n\s+--runs 2/u);
});

test('local connection parser accepts only exact loopback PostgreSQL URLs without ambient or query overrides', async () => {
  const api = await subject();
  assert.deepEqual(api.parseLocalConnectionEnv('postgresql://postgres:local-only@127.0.0.1:54322/postgres'), {
    PGHOST: '127.0.0.1', PGPORT: '54322', PGDATABASE: 'postgres', PGUSER: 'postgres', PGPASSWORD: 'local-only', PGSSLMODE: 'disable',
  });
  for (const url of [
    'postgresql://postgres:x@example.com:54322/postgres',
    'postgresql://postgres:x@localhost:54322/postgres',
    'postgresql://postgres:x@127.0.0.1:54322/postgres?sslmode=require',
    'http://postgres:x@127.0.0.1:54322/postgres',
    'postgresql://postgres:x@127.0.0.1:54322/other',
    'postgresql://postgres:x@127.0.0.1/postgres',
  ]) assert.throws(() => api.parseLocalConnectionEnv(url), /local|loopback|connection/iu);
  assert.throws(() => api.assertNoAmbientDatabaseEnv({ DATABASE_URL: 'postgresql://remote' }), /ambient/iu);
  assert.doesNotThrow(() => api.assertNoAmbientDatabaseEnv({ PATH: '/bin' }));
});

test('local extract path normalizes PG17 catalog and reads exact migration history', async () => {
  const api = await subject();
  const raw = JSON.parse(await readFile(path.join(root, 'apps/web/tests/fixtures/database-baseline/catalog-unstable-a.json'), 'utf8'));
  const calls = [];
  class FakeClient {
    async connect() { calls.push('connect'); }
    async query(sql) {
      calls.push(sql);
      return { rows: historyVersions.map((version) => ({ version })) };
    }
    async end() { calls.push('end'); }
  }
  const result = await api.__internal.extractLocalTerminalAndHistory({
    databaseUrl: 'postgresql://postgres:local-only@127.0.0.1:54322/postgres',
    extractCatalogAdapter: async ({ connectionEnv }) => {
      assert.equal(connectionEnv.PGHOST, '127.0.0.1');
      return structuredClone(raw);
    },
    ClientClass: FakeClient,
  });
  try {
    const normalized = JSON.parse(result.terminalBytes);
    assert.equal(normalized.serverMajorVersion, 17);
    assert.equal(normalized.normalizerVersion, 1);
    assert.deepEqual(result.historyVersions, historyVersions);
    assert.deepEqual(calls, [
      'connect',
      'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version',
      'end',
    ]);
  } finally { result.terminalBytes.fill(0); }
});

test('exact replay uses supabase_admin simple-query psql and replaces bootstrap with exact history', async () => {
  const api = await subject();
  const versions = ['00000000000000']; const calls = [];
  const schemaRows = [
    { column_name: 'version', data_type: 'text', udt_name: 'text', is_nullable: 'NO' },
    { column_name: 'statements', data_type: 'ARRAY', udt_name: '_text', is_nullable: 'YES' },
    { column_name: 'name', data_type: 'text', udt_name: 'text', is_nullable: 'YES' },
  ];
  class FakeClient {
    constructor(options) { assert.match(options.connectionString, /^postgresql:\/\/supabase_admin:/u); }
    async connect() { calls.push('connect'); }
    async query(sql, values) {
      if (sql.includes('information_schema.columns')) return { rows: schemaRows };
      if (sql.startsWith('SELECT version')) return { rows: versions.slice().sort().map((version) => ({ version })) };
      if (sql.startsWith('DELETE FROM')) { versions.splice(0, versions.length); return { rows: [], rowCount: 1 }; }
      if (sql.startsWith('INSERT INTO')) { versions.push(values[0]); return { rows: [] }; }
      throw new Error(`unexpected SQL: ${sql}`);
    }
    async end() { calls.push('end'); }
  }
  const history = ['00000000000001_baseline_v1.sql', ...exactMigrations.map(([name]) => name)];
  await api.__internal.replayExactMigrations({
    databaseUrl: 'postgresql://postgres:***@127.0.0.1:54322/postgres',
    pendingMigrationsDir: '/tmp/exact-pending', history,
    ClientClass: FakeClient,
    commandRunner: async (command, args, options) => {
      assert.equal(command, '/usr/bin/psql');
      assert.deepEqual(args.slice(0, 4), ['-X', '--set=ON_ERROR_STOP=1', '--quiet', '--file']);
      assert.equal(options.env.PGUSER, 'supabase_admin');
      calls.push(path.basename(args[4]));
      return { exitCode: 0, signal: null, stdout: '', stderr: '' };
    },
  });
  assert.deepEqual(versions, historyVersions);
  assert.deepEqual(calls.filter((entry) => entry.endsWith?.('.sql')), history);
});

test('builder locks exact terminal transaction paths, history and source migrations', async () => {
  const api = await subject();
  assert.deepEqual(api.EXPECTED_TERMINAL_PAYLOAD_PATHS, [terminalName, digestName]);
  assert.deepEqual(api.EXPECTED_HISTORY_VERSIONS, historyVersions);
  assert.deepEqual(api.POST_CUTOFF_MIGRATIONS.map(({ filename, sha256: digest }) => [filename, digest]), exactMigrations);
  assert.equal(api.EXPECTED_TERMINAL_MANIFEST_NAME, manifestName);
  assert.equal(api.EXPECTED_TERMINAL_LEDGER_NAME, ledgerName);
});

test('terminal artifact requires canonical normalized JSON framing', async () => {
  const api = await subject();
  const terminal = await readFile(path.join(baselineDir, 'catalog.cutoff.normalized.json'));
  const captureManifestBytes = await readFile(path.join(baselineDir, 'capture-manifest.json'));
  const captureLedgerBytes = await readFile(captureLedgerPath);
  try {
    for (const hostile of [Buffer.concat([terminal, Buffer.from('\n')]), Buffer.from(JSON.stringify(JSON.parse(terminal)))]) {
      assert.throws(() => api.prepareExpectedTerminalArtifacts({
        terminalRuns: [hostile, Buffer.from(hostile)], captureManifestBytes, captureLedgerBytes,
      }), /canonical|framing/iu);
      hostile.fill(0);
    }
  } finally {
    terminal.fill(0); captureManifestBytes.fill(0); captureLedgerBytes.fill(0);
  }
});

test('two byte-identical terminal runs derive one canonical 2-path manifest and independent ledger', async () => {
  const api = await subject();
  const terminal = await readFile(path.join(baselineDir, 'catalog.cutoff.normalized.json'));
  const captureManifestBytes = await readFile(path.join(baselineDir, 'capture-manifest.json'));
  const captureLedgerBytes = await readFile(captureLedgerPath);
  const result = api.prepareExpectedTerminalArtifacts({
    terminalRuns: [Buffer.from(terminal), Buffer.from(terminal)],
    captureManifestBytes,
    captureLedgerBytes,
  });
  try {
    assert.equal(result.payloads.size, 2);
    assert.deepEqual([...result.payloads.keys()], [terminalName, digestName]);
    assert.equal(result.payloads.get(terminalName).equals(terminal), true);
    assert.equal(result.payloads.get(digestName).toString(), `${sha256(terminal)}  ${terminalName}\n`);

    const manifest = JSON.parse(result.manifestBytes);
    const ledger = JSON.parse(result.ledgerBytes);
    assert.equal(manifest.kind, 'midao-expected-terminal-manifest');
    assert.equal(ledger.kind, 'midao-expected-terminal-ledger');
    assert.deepEqual(Object.keys(manifest.payloadDigests).sort(), [terminalName, digestName].sort());
    assert.deepEqual(ledger.payloadDigests, manifest.payloadDigests);
    assert.equal(ledger.manifestSha256, sha256(result.manifestBytes));
    assert.equal(ledger.transactionId, manifest.transactionId);
    assert.equal(ledger.captureTransactionId, JSON.parse(captureManifestBytes).transactionId);
    assert.equal(ledger.captureManifestSha256, sha256(captureManifestBytes));
    assert.deepEqual(manifest.historyVersions, historyVersions);
    assert.deepEqual(manifest.postCutoffMigrations.map(({ filename, sha256: digest }) => [filename, digest]), exactMigrations);
    assert.equal(Object.hasOwn(ledger, 'migrationApplyLedger'), false);
  } finally {
    result.dispose();
    terminal.fill(0);
    captureManifestBytes.fill(0);
    captureLedgerBytes.fill(0);
  }
});

test('publication semantic validator binds immutable capture reference and exact history', async () => {
  const api = await subject();
  const terminal = await readFile(path.join(baselineDir, 'catalog.cutoff.normalized.json'));
  const captureManifestBytes = await readFile(path.join(baselineDir, 'capture-manifest.json'));
  const captureLedgerBytes = await readFile(captureLedgerPath);
  const prepared = api.prepareExpectedTerminalArtifacts({ terminalRuns: [terminal, Buffer.from(terminal)], captureManifestBytes, captureLedgerBytes });
  try {
    assert.equal(api.validateExpectedTerminalPublicationSemantics(prepared, captureLedgerBytes), true);
    const hostile = JSON.parse(captureLedgerBytes);
    hostile.transactionId = 'f'.repeat(64);
    assert.throws(() => api.validateExpectedTerminalPublicationSemantics(prepared, Buffer.from(`${JSON.stringify(hostile)}\n`)), /capture|transaction|reference/iu);
  } finally {
    prepared.dispose(); terminal.fill(0); captureManifestBytes.fill(0); captureLedgerBytes.fill(0);
  }
});

test('builder derives capture references only from verified capability and checks two clean histories', async () => {
  const api = await subject();
  const terminal = await readFile(path.join(baselineDir, 'catalog.cutoff.normalized.json'));
  const manifest = JSON.parse(await readFile(path.join(baselineDir, 'capture-manifest.json'), 'utf8'));
  const ledger = JSON.parse(await readFile(captureLedgerPath, 'utf8'));
  const calls = [];
  const prepared = await api.__internal.buildWithAdapters({
    runs: 2,
    verifyCapture: async () => ({
      transactionId: manifest.transactionId,
      manifest: structuredClone(manifest),
      ledger: structuredClone(ledger),
      dispose: () => calls.push('capture-dispose'),
    }),
    materialize: async ({ run }) => ({ id: `workdir-${run}`, cleanup: async () => calls.push(`cleanup-${run}`) }),
    runLocal: async ({ materialized, run }) => ({ stack: `stack-${run}`, materialized }),
    extractTerminal: async ({ run }) => ({ terminalBytes: Buffer.from(terminal), historyVersions: [...historyVersions], run }),
  });
  try {
    const expectedCaptureDigest = sha256(Buffer.from(`${JSON.stringify(manifest)}\n`));
    assert.equal(JSON.parse(prepared.manifestBytes).captureManifestSha256, expectedCaptureDigest);
    assert.deepEqual(calls, ['cleanup-0', 'cleanup-1', 'capture-dispose']);
  } finally {
    prepared.dispose();
    terminal.fill(0);
  }
});

test('builder preserves extract primary and materializer cleanup failures together', async () => {
  const api = await subject();
  const manifest = JSON.parse(await readFile(path.join(baselineDir, 'capture-manifest.json'), 'utf8'));
  const ledger = JSON.parse(await readFile(captureLedgerPath, 'utf8'));
  await assert.rejects(api.__internal.buildWithAdapters({
    runs: 2,
    verifyCapture: async () => ({ transactionId: manifest.transactionId, manifest, ledger, dispose() {} }),
    materialize: async () => ({ cleanup: async () => { throw new Error('MATERIALIZER_CLEANUP'); } }),
    runLocal: async () => ({}),
    extractTerminal: async () => { throw new Error('EXTRACT_PRIMARY'); },
  }), (error) => error instanceof AggregateError
    && error.errors.some((entry) => /EXTRACT_PRIMARY/u.test(entry.message))
    && error.errors.some((entry) => /MATERIALIZER_CLEANUP/u.test(entry.message)));
});

test('builder rejects nondeterministic runs and hostile capture transaction before local run or terminal extraction', async () => {
  const api = await subject();
  const calls = { verify: 0, materialize: 0, local: 0, extract: 0, payload: 0 };
  await assert.rejects(api.__internal.buildWithAdapters({
    runs: 2,
    verifyCapture: async () => { calls.verify += 1; throw new Error('capture transaction mismatch'); },
    materialize: async () => { calls.materialize += 1; },
    runLocal: async () => { calls.local += 1; },
    extractTerminal: async () => { calls.extract += 1; },
    onCapturePayloadRead: () => { calls.payload += 1; },
  }), /capture transaction mismatch/iu);
  assert.deepEqual(calls, { verify: 1, materialize: 0, local: 0, extract: 0, payload: 0 });

  const first = Buffer.from('{"schemaVersion":1}\n');
  const second = Buffer.from('{"schemaVersion":2}\n');
  assert.throws(() => api.prepareExpectedTerminalArtifacts({
    terminalRuns: [first, second],
    captureManifestBytes: Buffer.from('{}\n'),
    captureLedgerBytes: Buffer.from('{}\n'),
  }), /deterministic|byte-identical/iu);
  first.fill(0);
  second.fill(0);
});
