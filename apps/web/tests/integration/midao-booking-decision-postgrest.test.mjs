import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.SUPABASE_DB_URL;
const apiUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
const decisionSignature = 'public.midao_decide_booking_request(uuid,text,text,uuid,text,text,text,text)';
const oldDecisionSignature = 'public.midao_decide_booking_request(uuid,text,text)';

assert.ok(databaseUrl, 'decision PostgREST integration runner must provide SUPABASE_DB_URL');
assert.ok(apiUrl && serviceRoleKey && anonKey, 'decision PostgREST integration runner must provide local API credentials');
for (const value of [databaseUrl, apiUrl]) {
  const parsed = new URL(value);
  assert.equal(parsed.hostname, '127.0.0.1', 'decision integration must remain on exact loopback');
  assert.equal(parsed.search, '');
  assert.equal(parsed.hash, '');
}

let client;

before(async () => {
  client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
});

after(async () => {
  await client?.end();
});

async function callDecision(key) {
  const response = await fetch(new URL('/rest/v1/rpc/midao_decide_booking_request', apiUrl), {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      p_guide_id: '99999999-9999-4999-8999-999999999999',
      p_actor_type: 'guide',
      p_actor_id: 'runtime-acl-probe',
      p_booking_id: null,
      p_action: 'approve',
      p_note: null,
      p_idempotency_key: 'runtime-acl-probe',
      p_request_hash: '0'.repeat(64),
    }),
  });
  return { response, text: await response.text() };
}

test('runtime catalog materializes the exact 8-arg decision RPC and canonical security posture', async () => {
  const catalog = await client.query(`
    SELECT p.oid::regprocedure::text AS signature,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
           pg_catalog.pg_get_function_result(p.oid) AS result,
           p.prosecdef,
           p.proconfig
      FROM pg_catalog.pg_proc AS p
     WHERE p.oid = $1::regprocedure
  `, [decisionSignature]);
  assert.equal(catalog.rowCount, 1);
  assert.deepEqual(catalog.rows[0], {
    signature: decisionSignature,
    identity_arguments: 'uuid, text, text, uuid, text, text, text, text',
    result: 'jsonb',
    prosecdef: true,
    proconfig: ['search_path=pg_catalog'],
  });
});

test('runtime catalog exposes service-role-only 8-arg ACL and revokes the old 3-arg service role grant', async () => {
  const privileges = await client.query(`
    SELECT has_function_privilege('anon', $1, 'EXECUTE') AS anon,
           has_function_privilege('authenticated', $1, 'EXECUTE') AS authenticated,
           has_function_privilege('service_role', $1, 'EXECUTE') AS service_role
  `, [decisionSignature]);
  assert.deepEqual(privileges.rows[0], { anon: false, authenticated: false, service_role: true });

  const old = await client.query(`
    SELECT pg_catalog.to_regprocedure($1)::text AS signature,
           has_function_privilege('service_role', $1, 'EXECUTE') AS service_role
  `, [oldDecisionSignature]);
  assert.deepEqual(old.rows[0], { signature: oldDecisionSignature, service_role: false });
});

test('runtime PostgREST rejects the anon role for the decision RPC', async () => {
  const { response, text } = await callDecision(anonKey);
  assert.equal(response.ok, false, text);
});

test('runtime PostgREST service role is not rejected by the API ACL', async () => {
  assert.equal(typeof serviceRoleKey, 'string');
  assert.notEqual(serviceRoleKey, anonKey);
  const { response } = await callDecision(serviceRoleKey);
  assert.notEqual(response.status, 401);
  assert.notEqual(response.status, 403);
});
