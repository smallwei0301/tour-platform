import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
assert.ok(databaseUrl, 'fresh-install runner must provide a local database URL');
const expectedHistory = [
  '00000000000001',
  '20260723000000',
  '20260723001000',
  '20260723002000',
  '20260723002500',
  '20260723003000',
  '20260723003500',
];
let client;
before(async () => {
  client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
});
after(async () => { await client?.end(); });

test('fresh install records one synthetic baseline marker and six exact post-cutoff migrations', async () => {
  const { rows } = await client.query('SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version');
  assert.deepEqual(rows.map(({ version }) => version), expectedHistory);
  assert.equal(rows[0].name, 'baseline_v1');
  assert.equal(rows.some(({ name }) => /overlay/iu.test(name)), false);
});

test('fresh install applies the deterministic non-secret guide seed exactly once', async () => {
  const users = await client.query("SELECT id::text, role FROM public.users WHERE id = '11111111-1111-1111-1111-111111111111'::uuid");
  assert.deepEqual(users.rows, [{ id: '11111111-1111-1111-1111-111111111111', role: 'guide' }]);
  const guides = await client.query("SELECT id::text, user_id::text, slug, display_name FROM public.guide_profiles WHERE id = '22222222-2222-2222-2222-222222222222'::uuid");
  assert.deepEqual(guides.rows, [{
    id: '22222222-2222-2222-2222-222222222222',
    user_id: '11111111-1111-1111-1111-111111111111',
    slug: 'andy-lee', display_name: 'Andy Lee',
  }]);
  const experiences = await client.query("SELECT id::text, guide_id::text, slug, title, price_twd::text FROM public.experiences WHERE id = '33333333-3333-3333-3333-333333333333'::uuid");
  assert.deepEqual(experiences.rows, [{
    id: '33333333-3333-3333-3333-333333333333',
    guide_id: '22222222-2222-2222-2222-222222222222',
    slug: 'chaishan-cave-tour', title: '柴山探洞體驗', price_twd: '1800',
  }]);
});
