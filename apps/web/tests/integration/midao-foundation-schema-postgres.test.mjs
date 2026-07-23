import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
assert.ok(databaseUrl, 'local Supabase runner must provide SUPABASE_DB_URL or DATABASE_URL');

let client;
before(async () => {
  client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
});
after(async () => { await client?.end(); });

const protectedTables = [
  ['midao_notification_outbox', ['DELETE', 'INSERT', 'SELECT', 'UPDATE']],
  ['midao_idempotency_records', ['DELETE', 'INSERT', 'SELECT', 'UPDATE']],
  ['midao_audit_events', ['INSERT', 'SELECT']],
];

async function aclRows(kind, objectName) {
  const aclDefaultKind = kind === 'r' ? 'r' : 'f';
  const catalog = kind === 'r' ? 'pg_class' : 'pg_proc';
  const aclColumn = kind === 'r' ? 'relacl' : 'proacl';
  const ownerColumn = kind === 'r' ? 'relowner' : 'proowner';
  const identity = kind === 'r' ? 'oid = $1::regclass' : 'oid = $1::regprocedure';
  const result = await client.query(`
    SELECT COALESCE(role_row.rolname, 'PUBLIC') AS grantee,
           exploded.privilege_type
      FROM pg_catalog.${catalog} object_row
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(object_row.${aclColumn}, pg_catalog.acldefault('${aclDefaultKind}', object_row.${ownerColumn}))
      ) exploded
      LEFT JOIN pg_catalog.pg_roles role_row ON role_row.oid = exploded.grantee
     WHERE object_row.${identity}
     ORDER BY grantee, privilege_type
  `, [objectName]);
  return result.rows;
}

test('clean migrations expose the exact foundation schema, constraints, indexes and table ACL/RLS flags', async () => {
  const objects = await client.query(`
    SELECT to_regclass('public.guide_profiles')::text AS guides,
           to_regclass('public.midao_notification_outbox')::text AS outbox,
           to_regclass('public.midao_idempotency_records')::text AS idempotency,
           to_regclass('public.midao_audit_events')::text AS audit,
           to_regprocedure('public.midao_switch_guide_backend_mode(uuid,text,text,text,text,uuid,text,text)')::text AS rpc
  `);
  assert.deepEqual(Object.values(objects.rows[0]).every(Boolean), true);

  const backend = await client.query(`
    SELECT column_default, is_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'guide_profiles' AND column_name = 'backend_mode'
  `);
  assert.equal(backend.rowCount, 1);
  assert.equal(backend.rows[0].column_default, "'legacy'::text");
  assert.equal(backend.rows[0].is_nullable, 'NO');
  const backendContracts = await client.query(`
    SELECT
      EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'midao_guide_profiles_backend_mode_check' AND conrelid = 'public.guide_profiles'::regclass) AS has_check,
      to_regclass('public.midao_guide_profiles_backend_mode_idx') IS NOT NULL AS has_index
  `);
  assert.deepEqual(backendContracts.rows[0], { has_check: true, has_index: true });

  for (const [table, servicePrivileges] of protectedTables) {
    const relation = await client.query(`
      SELECT relrowsecurity, relforcerowsecurity
        FROM pg_catalog.pg_class
       WHERE oid = $1::regclass
    `, [`public.${table}`]);
    assert.deepEqual(relation.rows[0], { relrowsecurity: true, relforcerowsecurity: true });

    const rows = await aclRows('r', `public.${table}`);
    for (const clientRole of ['PUBLIC', 'anon', 'authenticated']) {
      assert.deepEqual(rows.filter((row) => row.grantee === clientRole), [], `${table} leaked ACL to ${clientRole}`);
    }
    assert.deepEqual(
      rows.filter((row) => row.grantee === 'service_role').map((row) => row.privilege_type).sort(),
      servicePrivileges,
    );

    const policies = await client.query(`
      SELECT policyname
        FROM pg_catalog.pg_policies
       WHERE schemaname = 'public'
         AND tablename = $1
         AND permissive = 'PERMISSIVE'
         AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
    `, [table]);
    assert.equal(policies.rowCount, 0, `${table} has a client-permissive policy`);
  }
});

const probes = [
  {
    table: 'midao_notification_outbox',
    ownerInsert: `INSERT INTO public.midao_notification_outbox(id,event_name,aggregate_type,aggregate_id,payload) VALUES ($1,'probe.owner','guide',$2,'{}'::jsonb)`,
    probeInsert: `INSERT INTO public.midao_notification_outbox(id,event_name,aggregate_type,aggregate_id,payload) VALUES ($1,'probe.client','guide',$2,'{}'::jsonb)`,
  },
  {
    table: 'midao_idempotency_records',
    ownerInsert: `INSERT INTO public.midao_idempotency_records(id,actor_type,actor_id,command_name,scope_type,scope_id,idempotency_key,request_hash,expires_at) VALUES ($1,'admin',$2,'probe','guide',$1,'owner-key',repeat('a',64),now()+interval '1 hour')`,
    probeInsert: `INSERT INTO public.midao_idempotency_records(id,actor_type,actor_id,command_name,scope_type,scope_id,idempotency_key,request_hash,expires_at) VALUES ($1,'admin',$2,'probe','guide',$1,'client-key',repeat('b',64),now()+interval '1 hour')`,
  },
  {
    table: 'midao_audit_events',
    ownerInsert: `INSERT INTO public.midao_audit_events(id,actor_type,actor_id,guide_id,action,resource_type,resource_id,request_id) VALUES ($1,'admin','owner',$1,'probe.owner','guide',$2,$1)`,
    probeInsert: `INSERT INTO public.midao_audit_events(id,actor_type,actor_id,guide_id,action,resource_type,resource_id,request_id) VALUES ($1,'admin','client',$1,'probe.client','guide',$2,$1)`,
  },
];

test('each service-only table independently proves RLS silent SELECT suppression and exact 42501 WITH CHECK rejection', async () => {
  for (const probe of probes) {
    const sentinelId = randomUUID();
    let transactionOpen = false;
    try {
      await client.query('BEGIN');
      transactionOpen = true;
      await client.query(probe.ownerInsert, [sentinelId, `sentinel-${sentinelId}`]);
      const ownerRole = await client.query('SELECT current_user');
      assert.equal(ownerRole.rows[0].current_user, 'postgres');
      await client.query('CREATE ROLE midao_rls_probe NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');
      await client.query('GRANT midao_rls_probe TO postgres');
      await client.query('GRANT USAGE ON SCHEMA public TO midao_rls_probe');
      await client.query(`GRANT SELECT, INSERT ON TABLE public.${probe.table} TO midao_rls_probe`);
      await client.query('SET LOCAL ROLE midao_rls_probe');
      const role = await client.query('SELECT current_user');
      assert.equal(role.rows[0].current_user, 'midao_rls_probe');
      const hidden = await client.query(`SELECT id FROM public.${probe.table} WHERE id = $1`, [sentinelId]);
      assert.equal(hidden.rowCount, 0, `${probe.table} sentinel was visible through RLS`);

      let rejected = false;
      try {
        await client.query(probe.probeInsert, [randomUUID(), `probe-${sentinelId}`]);
      } catch (error) {
        rejected = true;
        assert.equal(error.code, '42501', `${probe.table} rejected with wrong SQLSTATE`);
      }
      assert.equal(rejected, true, `${probe.table} probe INSERT unexpectedly succeeded`);
      await client.query('ROLLBACK');
      transactionOpen = false;
    } finally {
      if (transactionOpen) {
        try { await client.query('ROLLBACK'); } catch { /* primary failure remains authoritative */ }
      }
    }
  }
});

test('exact RPC identity has service-role-only EXECUTE and safe SECURITY DEFINER catalog shape', async () => {
  const signature = 'public.midao_switch_guide_backend_mode(uuid,text,text,text,text,uuid,text,text)';
  const acl = await aclRows('f', signature);
  assert.deepEqual(acl.filter((row) => row.grantee === 'PUBLIC'), []);
  assert.deepEqual(acl.filter((row) => row.grantee === 'anon'), []);
  assert.deepEqual(acl.filter((row) => row.grantee === 'authenticated'), []);
  assert.deepEqual(acl.filter((row) => row.grantee === 'service_role').map((row) => row.privilege_type), ['EXECUTE']);

  const privileges = await client.query(`
    SELECT has_function_privilege('anon', $1, 'EXECUTE') AS anon,
           has_function_privilege('authenticated', $1, 'EXECUTE') AS authenticated,
           has_function_privilege('service_role', $1, 'EXECUTE') AS service_role
  `, [signature]);
  assert.deepEqual(privileges.rows[0], { anon: false, authenticated: false, service_role: true });

  const functionRow = await client.query(`
    SELECT prosecdef, proconfig, prosrc
      FROM pg_catalog.pg_proc
     WHERE oid = $1::regprocedure
  `, [signature]);
  assert.equal(functionRow.rows[0].prosecdef, true);
  assert.deepEqual(functionRow.rows[0].proconfig, ['search_path=pg_catalog']);
  for (const object of ['public.guide_profiles', 'public.midao_idempotency_records', 'public.midao_audit_events', 'public.midao_notification_outbox']) {
    assert.match(functionRow.rows[0].prosrc, new RegExp(object.replace('.', '\\.'), 'u'));
  }
});
