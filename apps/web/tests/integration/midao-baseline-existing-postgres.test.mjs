import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
assert.ok(databaseUrl, 'existing rehearsal runner must provide local database URL');
const postVersions = [
  '20260723000000', '20260723001000', '20260723002000',
  '20260723002500', '20260723003000', '20260723003500', '20260723004000',
  '20260723010000', '20260723011000', '20260723020000', '20260723021000',
  '20260723022000', '20260723023000', '20260729160000', '20260729170000',
  '20260729180000', '20260729190000', '20260730093000', '20260804103000',
  '20260804113000', '20260806090000', '20260806091000', '20260806120000',
];
let client;
before(async () => { client = new pg.Client({ connectionString: databaseUrl }); await client.connect(); });
after(async () => { await client?.end(); });

test('existing rehearsal keeps 128 occupied cutoff records and applies all 23 post-cutoff versions', async () => {
  const { rows } = await client.query('SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version');
  assert.equal(rows.length, 151);
  assert.equal(rows.filter(({ name }) => name?.startsWith('fixture_cutoff:')).length, 128);
  assert.deepEqual(rows.slice(-postVersions.length).map(({ version }) => version), postVersions);
  assert.equal(rows.some(({ version, name }) => version === '00000000000001' || name === 'baseline_v1'), false);
});

test('existing post-cutoff upgrade exposes the exact Midao foundation objects', async () => {
  const { rows: [objects] } = await client.query(`
    SELECT to_regclass('public.midao_notification_outbox')::text AS outbox,
           to_regclass('public.midao_idempotency_records')::text AS idempotency,
           to_regclass('public.midao_audit_events')::text AS audit,
           to_regprocedure('public.midao_switch_guide_backend_mode(uuid,text,text,text,text,uuid,text,text)')::text AS rpc
  `);
  assert.equal(Object.values(objects).every(Boolean), true);
  const mode = await client.query("SELECT is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='guide_profiles' AND column_name='backend_mode'");
  assert.deepEqual(mode.rows, [{ is_nullable: 'NO', column_default: "'legacy'::text" }]);
});
