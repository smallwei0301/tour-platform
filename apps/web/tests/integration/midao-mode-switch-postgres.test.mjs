import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
assert.ok(databaseUrl, 'local Supabase runner must provide SUPABASE_DB_URL or DATABASE_URL');
const parsedDatabaseUrl = new URL(databaseUrl);
assert.ok(['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol));
assert.deepEqual(
  [parsedDatabaseUrl.hostname, parsedDatabaseUrl.port, parsedDatabaseUrl.pathname, parsedDatabaseUrl.search, parsedDatabaseUrl.hash],
  ['127.0.0.1', '54322', '/postgres', '', ''],
  'owner test connection must remain exact local loopback PostgreSQL',
);
parsedDatabaseUrl.username = 'supabase_admin';
const ownerDatabaseUrl = parsedDatabaseUrl.toString();

const activeGuideId = randomUUID();
const rollbackGuideId = randomUUID();
const inactiveGuideId = randomUUID();
const missingGuideId = randomUUID();
const actorId = 'admin@example.com';
const rpcSql = `SELECT public.midao_switch_guide_backend_mode($1,$2,$3,$4,$5,$6,$7,$8) AS result`;
const faultTrigger = 'midao_test_outbox_failure_trigger';
const faultFunction = 'public.midao_test_raise_outbox_failure';
let client;
let ownerClient;

before(async () => {
  client = new pg.Client({ connectionString: databaseUrl });
  ownerClient = new pg.Client({ connectionString: ownerDatabaseUrl });
  await client.connect();
  await ownerClient.connect();
  await client.query(`
    INSERT INTO public.guide_profiles(id, slug, display_name, verification_status, guide_session_version, backend_mode)
    VALUES
      ($1, 'd3c-active', 'D3c Active', 'approved', 7, 'legacy'),
      ($2, 'd3c-rollback', 'D3c Rollback', 'approved', 11, 'legacy'),
      ($3, 'd3c-inactive', 'D3c Inactive', 'pending', 3, 'legacy')
  `, [activeGuideId, rollbackGuideId, inactiveGuideId]);
});

after(async () => {
  if (!client) return;
  try { await ownerClient?.query(`DROP TRIGGER IF EXISTS ${faultTrigger} ON public.midao_notification_outbox`); } catch { /* disposable DB cleanup continues */ }
  try { await ownerClient?.query(`DROP FUNCTION IF EXISTS ${faultFunction}()`); } catch { /* disposable DB cleanup continues */ }
  await Promise.allSettled([client.end(), ownerClient?.end()].filter(Boolean));
});

async function callSwitch({ guideId, targetMode, reason, requestId = randomUUID(), key, hash }) {
  const response = await client.query(rpcSql, [guideId, targetMode, reason, 'admin', actorId, requestId, key, hash]);
  return response.rows[0].result;
}

async function guideState(guideId) {
  const result = await client.query('SELECT backend_mode, guide_session_version FROM public.guide_profiles WHERE id = $1', [guideId]);
  return result.rows[0] ?? null;
}

async function effectCounts(guideId) {
  const result = await client.query(`
    SELECT
      (SELECT count(*)::int FROM public.midao_audit_events WHERE guide_id = $1) AS audit,
      (SELECT count(*)::int FROM public.midao_notification_outbox WHERE aggregate_type = 'guide' AND aggregate_id = $1::text) AS outbox,
      (SELECT count(*)::int FROM public.midao_idempotency_records WHERE scope_type = 'guide' AND scope_id = $1) AS idempotency,
      (SELECT count(*)::int FROM public.midao_idempotency_records WHERE scope_type = 'guide' AND scope_id = $1 AND state = 'processing') AS processing
  `, [guideId]);
  return result.rows[0];
}

async function asSupabaseAdmin(operation) {
  if (!ownerClient) throw new Error('owner test connection unavailable');
  return operation(ownerClient);
}

async function expectRpcError(expectedMessage, invocation) {
  let caught;
  try { await invocation(); } catch (error) { caught = error; }
  assert.ok(caught, `expected RPC error ${expectedMessage}`);
  assert.equal(caught.message, expectedMessage);
}

test('legacy to midao increments once and atomically records sanitized audit, outbox and replay snapshot', async () => {
  const requestId = randomUUID();
  const key = 'd3c-success';
  const hash = 'a'.repeat(64);
  const response = await callSwitch({
    guideId: activeGuideId,
    targetMode: 'midao',
    reason: 'D3c forward verification',
    requestId,
    key,
    hash,
  });

  assert.deepEqual(response, {
    backendMode: 'midao',
    sessionVersion: 8,
    changed: true,
    redirectTo: '/midao',
  });
  assert.deepEqual(await guideState(activeGuideId), { backend_mode: 'midao', guide_session_version: 8 });
  assert.deepEqual(await effectCounts(activeGuideId), { audit: 1, outbox: 1, idempotency: 1, processing: 0 });

  const audit = await client.query(`
    SELECT actor_type, actor_id, action, resource_type, resource_id, request_id, reason, metadata
      FROM public.midao_audit_events WHERE guide_id = $1
  `, [activeGuideId]);
  assert.deepEqual(audit.rows[0], {
    actor_type: 'admin',
    actor_id: actorId,
    action: 'guide_backend_mode_changed',
    resource_type: 'guide_backend_mode',
    resource_id: activeGuideId,
    request_id: requestId,
    reason: 'D3c forward verification',
    metadata: { previousMode: 'legacy', backendMode: 'midao', sessionVersion: 8 },
  });

  const outbox = await client.query(`
    SELECT event_name, aggregate_type, aggregate_id, payload, status, attempt_count
      FROM public.midao_notification_outbox WHERE aggregate_id = $1
  `, [activeGuideId]);
  assert.deepEqual(outbox.rows[0], {
    event_name: 'guide.backend_mode_changed',
    aggregate_type: 'guide',
    aggregate_id: activeGuideId,
    payload: { guideId: activeGuideId, backendMode: 'midao', sessionVersion: 8, requestId },
    status: 'pending',
    attempt_count: 0,
  });

  const replay = await client.query(`
    SELECT state, response_status, response_body, resource_type, resource_id
      FROM public.midao_idempotency_records
     WHERE scope_id = $1 AND idempotency_key = $2
  `, [activeGuideId, key]);
  assert.deepEqual(replay.rows[0], {
    state: 'completed',
    response_status: 200,
    response_body: response,
    resource_type: 'guide_backend_mode',
    resource_id: activeGuideId,
  });
  assert.deepEqual(Object.keys(replay.rows[0].response_body).sort(), ['backendMode', 'changed', 'redirectTo', 'sessionVersion']);
});

test('fresh-key same-mode completes replay without version, audit or outbox side effects', async () => {
  const key = 'd3c-same-mode';
  const hash = 'b'.repeat(64);
  const response = await callSwitch({
    guideId: activeGuideId,
    targetMode: 'midao',
    reason: 'D3c same-mode verification',
    key,
    hash,
  });
  assert.deepEqual(response, {
    backendMode: 'midao',
    sessionVersion: 8,
    changed: false,
    redirectTo: '/midao',
  });
  assert.deepEqual(await guideState(activeGuideId), { backend_mode: 'midao', guide_session_version: 8 });
  assert.deepEqual(await effectCounts(activeGuideId), { audit: 1, outbox: 1, idempotency: 2, processing: 0 });
  const replay = await client.query(`
    SELECT state, request_hash, response_status, response_body, resource_type, resource_id
      FROM public.midao_idempotency_records
     WHERE scope_type = 'guide' AND scope_id = $1 AND command_name = 'switch_backend_mode' AND idempotency_key = $2
  `, [activeGuideId, key]);
  assert.deepEqual(replay.rows, [{
    state: 'completed',
    request_hash: hash,
    response_status: 200,
    response_body: response,
    resource_type: 'guide_backend_mode',
    resource_id: activeGuideId,
  }]);
});

test('unknown, inactive and invalid reason errors are deterministic and leave no processing claims', async () => {
  const cases = [
    {
      expected: 'GUIDE_NOT_FOUND', guideId: missingGuideId, targetMode: 'midao', reason: 'unknown guide',
      key: 'd3c-missing', hash: 'c'.repeat(64),
    },
    {
      expected: 'GUIDE_NOT_ACTIVE', guideId: inactiveGuideId, targetMode: 'midao', reason: 'inactive guide',
      key: 'd3c-inactive', hash: 'd'.repeat(64),
    },
    {
      expected: 'INVALID_REASON', guideId: activeGuideId, targetMode: 'legacy', reason: '   ',
      key: 'd3c-invalid-reason', hash: 'e'.repeat(64),
    },
  ];

  for (const entry of cases) {
    await expectRpcError(entry.expected, () => callSwitch(entry));
    const claims = await client.query('SELECT state FROM public.midao_idempotency_records WHERE idempotency_key = $1', [entry.key]);
    assert.equal(claims.rowCount, 0, `${entry.expected} left an idempotency claim`);
  }
  assert.deepEqual(await guideState(inactiveGuideId), { backend_mode: 'legacy', guide_session_version: 3 });
  assert.equal((await effectCounts(missingGuideId)).processing, 0);
  assert.equal((await effectCounts(inactiveGuideId)).processing, 0);
});

test('outbox failure rolls back profile, audit, outbox and idempotency together', async () => {
  const beforeState = await guideState(rollbackGuideId);
  const beforeCounts = await effectCounts(rollbackGuideId);
  const key = 'd3c-fault-rollback';
  let triggerCreated = false;
  try {
    await asSupabaseAdmin(async (adminClient) => {
      await adminClient.query(`
        CREATE OR REPLACE FUNCTION ${faultFunction}()
        RETURNS trigger LANGUAGE plpgsql AS $fault$
        BEGIN
          RAISE EXCEPTION 'MIDAO_TEST_OUTBOX_FAILURE';
        END
        $fault$
      `);
      await adminClient.query(`
        CREATE TRIGGER ${faultTrigger}
        BEFORE INSERT ON public.midao_notification_outbox
        FOR EACH ROW EXECUTE FUNCTION ${faultFunction}()
      `);
    });
    triggerCreated = true;
    await expectRpcError('MIDAO_TEST_OUTBOX_FAILURE', () => callSwitch({
      guideId: rollbackGuideId,
      targetMode: 'midao',
      reason: 'D3c atomic rollback verification',
      key,
      hash: 'f'.repeat(64),
    }));
  } finally {
    await asSupabaseAdmin(async (adminClient) => {
      if (triggerCreated) await adminClient.query(`DROP TRIGGER IF EXISTS ${faultTrigger} ON public.midao_notification_outbox`);
      await adminClient.query(`DROP FUNCTION IF EXISTS ${faultFunction}()`);
    });
  }

  assert.deepEqual(await guideState(rollbackGuideId), beforeState);
  assert.deepEqual(await effectCounts(rollbackGuideId), beforeCounts);
  const faultClaim = await client.query('SELECT state FROM public.midao_idempotency_records WHERE idempotency_key = $1', [key]);
  assert.equal(faultClaim.rowCount, 0);
});
