import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
assert.ok(databaseUrl, 'local Supabase runner must provide SUPABASE_DB_URL or DATABASE_URL');

const rpcSql = `SELECT public.midao_switch_guide_backend_mode($1,$2,$3,$4,$5,$6,$7,$8) AS result`;
const actorId = 'admin@example.com';
let admin;
const openedClients = new Set();

before(async () => {
  admin = new pg.Client({ connectionString: databaseUrl });
  await admin.connect();
});

after(async () => {
  await Promise.allSettled([...openedClients].map((client) => client.end()));
  await admin?.end();
});

async function resetFixture() {
  await admin.query('DELETE FROM public.midao_audit_events');
  await admin.query('DELETE FROM public.midao_notification_outbox');
  await admin.query('DELETE FROM public.midao_idempotency_records');
  await admin.query('DELETE FROM public.guide_profiles');
  const guideA = randomUUID();
  const guideB = randomUUID();
  await admin.query(`
    INSERT INTO public.guide_profiles(id, verification_status, guide_session_version, backend_mode)
    VALUES ($1, 'approved', 10, 'legacy'), ($2, 'approved', 10, 'legacy')
  `, [guideA, guideB]);
  return { guideA, guideB };
}

async function connectPair() {
  const clients = [new pg.Client({ connectionString: databaseUrl }), new pg.Client({ connectionString: databaseUrl })];
  for (const client of clients) {
    openedClients.add(client);
    await client.connect();
    await client.query("SET statement_timeout = '8s'");
    await client.query("SET lock_timeout = '7s'");
  }
  return clients;
}

async function closeClient(client) {
  if (!client) return;
  openedClients.delete(client);
  await client.end();
}

async function closePair(clients) {
  for (const client of clients) await closeClient(client);
}

async function waitForDatabaseLockOverlap(pids) {
  const deadline = Date.now() + 4_000;
  let lastRows = [];
  while (Date.now() < deadline) {
    const activity = await admin.query(`
      SELECT pid, state, wait_event_type
        FROM pg_catalog.pg_stat_activity
       WHERE pid = ANY($1::int[])
       ORDER BY pid
    `, [pids]);
    lastRows = activity.rows;
    if (
      activity.rowCount === pids.length
      && activity.rows.every((row) => row.state === 'active' && row.wait_event_type === 'Lock')
    ) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`RPCs did not overlap on database locks: ${JSON.stringify(lastRows)}`);
}

function rpcArgs({ guideId, key, hash, targetMode = 'midao', requestId = randomUUID() }) {
  return [guideId, targetMode, 'D3d concurrent verification', 'admin', actorId, requestId, key, hash];
}

async function concurrentCalls(firstArgs, secondArgs) {
  const clients = await connectPair();
  const blocker = new pg.Client({ connectionString: databaseUrl });
  openedClients.add(blocker);
  await blocker.connect();
  let blockerOpen = false;
  const invoke = async (client, args) => {
    try {
      const result = await client.query(rpcSql, args);
      return { ok: true, value: result.rows[0].result };
    } catch (error) {
      return { ok: false, error };
    }
  };
  try {
    const guideIds = [...new Set([firstArgs[0], secondArgs[0]])];
    await blocker.query('BEGIN');
    blockerOpen = true;
    await blocker.query(
      'SELECT id FROM public.guide_profiles WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
      [guideIds],
    );
    const pending = [invoke(clients[0], firstArgs), invoke(clients[1], secondArgs)];
    await waitForDatabaseLockOverlap(clients.map((client) => client.processID));
    await blocker.query('COMMIT');
    blockerOpen = false;
    return await Promise.all(pending);
  } finally {
    if (blockerOpen) await blocker.query('ROLLBACK').catch(() => undefined);
    await closeClient(blocker);
    await closePair(clients);
  }
}

async function guideState(guideId) {
  const result = await admin.query('SELECT backend_mode, guide_session_version FROM public.guide_profiles WHERE id = $1', [guideId]);
  return result.rows[0];
}

async function counts(guideId) {
  const result = await admin.query(`
    SELECT
      (SELECT count(*)::int FROM public.midao_audit_events WHERE guide_id = $1) AS audit,
      (SELECT count(*)::int FROM public.midao_notification_outbox WHERE aggregate_id = $1::text) AS outbox,
      (SELECT count(*)::int FROM public.midao_idempotency_records WHERE scope_id = $1) AS idempotency,
      (SELECT count(*)::int FROM public.midao_idempotency_records WHERE scope_id = $1 AND state = 'processing') AS processing
  `, [guideId]);
  return result.rows[0];
}

async function idempotencyRows(guideId, key) {
  const result = await admin.query(`
    SELECT scope_id, idempotency_key, request_hash, state, response_status, response_body, resource_type, resource_id
      FROM public.midao_idempotency_records
     WHERE scope_type = 'guide' AND scope_id = $1 AND command_name = 'switch_backend_mode'
       AND ($2::text IS NULL OR idempotency_key = $2)
     ORDER BY idempotency_key
  `, [guideId, key ?? null]);
  return result.rows;
}

function expectedSnapshot({ guideId, key, hash, response }) {
  return {
    scope_id: guideId,
    idempotency_key: key,
    request_hash: hash,
    state: 'completed',
    response_status: 200,
    response_body: response,
    resource_type: 'guide_backend_mode',
    resource_id: guideId,
  };
}

function assertNoTimeout(result) {
  if (!result.ok) assert.notEqual(result.error?.code, '57014', 'statement timeout/deadlock-like stall occurred');
}

const changedResponse = (sessionVersion = 11) => ({
  backendMode: 'midao', sessionVersion, changed: true, redirectTo: '/midao',
});
const unchangedResponse = (sessionVersion = 11) => ({
  backendMode: 'midao', sessionVersion, changed: false, redirectTo: '/midao',
});

test('same guide plus same key and hash returns one identical completed effect', async () => {
  const { guideA } = await resetFixture();
  const args = rpcArgs({ guideId: guideA, key: 'd3d-same-key-hash', hash: '1'.repeat(64) });
  const results = await concurrentCalls(args, [...args.slice(0, 5), randomUUID(), ...args.slice(6)]);
  results.forEach(assertNoTimeout);
  assert.equal(results.every((result) => result.ok), true);
  assert.deepEqual(results.map((result) => result.value), [changedResponse(), changedResponse()]);
  assert.deepEqual(await guideState(guideA), { backend_mode: 'midao', guide_session_version: 11 });
  assert.deepEqual(await counts(guideA), { audit: 1, outbox: 1, idempotency: 1, processing: 0 });
  assert.deepEqual(await idempotencyRows(guideA, 'd3d-same-key-hash'), [expectedSnapshot({
    guideId: guideA,
    key: 'd3d-same-key-hash',
    hash: '1'.repeat(64),
    response: changedResponse(),
  })]);
});

test('same guide plus same key and different hash has one winner and one deterministic conflict', async () => {
  const { guideA } = await resetFixture();
  const first = rpcArgs({ guideId: guideA, key: 'd3d-key-reuse', hash: '2'.repeat(64) });
  const second = rpcArgs({ guideId: guideA, key: 'd3d-key-reuse', hash: '3'.repeat(64) });
  const results = await concurrentCalls(first, second);
  results.forEach(assertNoTimeout);
  const successes = results.filter((result) => result.ok);
  const failures = results.filter((result) => !result.ok);
  assert.equal(successes.length, 1);
  assert.deepEqual(successes[0].value, changedResponse());
  assert.equal(failures.length, 1);
  assert.equal(failures[0].error.message, 'IDEMPOTENCY_KEY_REUSED');
  assert.deepEqual(await guideState(guideA), { backend_mode: 'midao', guide_session_version: 11 });
  assert.deepEqual(await counts(guideA), { audit: 1, outbox: 1, idempotency: 1, processing: 0 });
  const winnerIndex = results.findIndex((result) => result.ok);
  const winnerHash = [first[7], second[7]][winnerIndex];
  assert.deepEqual(await idempotencyRows(guideA, 'd3d-key-reuse'), [expectedSnapshot({
    guideId: guideA,
    key: 'd3d-key-reuse',
    hash: winnerHash,
    response: changedResponse(),
  })]);
});

test('same guide plus different keys changes once and completes both canonical snapshots', async () => {
  const { guideA } = await resetFixture();
  const results = await concurrentCalls(
    rpcArgs({ guideId: guideA, key: 'd3d-different-a', hash: '4'.repeat(64) }),
    rpcArgs({ guideId: guideA, key: 'd3d-different-b', hash: '5'.repeat(64) }),
  );
  results.forEach(assertNoTimeout);
  assert.equal(results.every((result) => result.ok), true);
  assert.deepEqual(results.map((result) => result.value).sort((a, b) => Number(b.changed) - Number(a.changed)), [changedResponse(), unchangedResponse()]);
  assert.deepEqual(await guideState(guideA), { backend_mode: 'midao', guide_session_version: 11 });
  assert.deepEqual(await counts(guideA), { audit: 1, outbox: 1, idempotency: 2, processing: 0 });
  assert.deepEqual(await idempotencyRows(guideA, null), [
    expectedSnapshot({ guideId: guideA, key: 'd3d-different-a', hash: '4'.repeat(64), response: results[0].value }),
    expectedSnapshot({ guideId: guideA, key: 'd3d-different-b', hash: '5'.repeat(64), response: results[1].value }),
  ]);
});

test('different guides can reuse the same client key and both succeed independently', async () => {
  const { guideA, guideB } = await resetFixture();
  const key = 'd3d-cross-guide-key';
  const results = await concurrentCalls(
    rpcArgs({ guideId: guideA, key, hash: '6'.repeat(64) }),
    rpcArgs({ guideId: guideB, key, hash: '7'.repeat(64) }),
  );
  results.forEach(assertNoTimeout);
  assert.equal(results.every((result) => result.ok), true);
  assert.deepEqual(results.map((result) => result.value), [changedResponse(), changedResponse()]);
  assert.deepEqual(await guideState(guideA), { backend_mode: 'midao', guide_session_version: 11 });
  assert.deepEqual(await guideState(guideB), { backend_mode: 'midao', guide_session_version: 11 });
  assert.deepEqual(await counts(guideA), { audit: 1, outbox: 1, idempotency: 1, processing: 0 });
  assert.deepEqual(await counts(guideB), { audit: 1, outbox: 1, idempotency: 1, processing: 0 });
  assert.deepEqual(await idempotencyRows(guideA, key), [expectedSnapshot({
    guideId: guideA, key, hash: '6'.repeat(64), response: changedResponse(),
  })]);
  assert.deepEqual(await idempotencyRows(guideB, key), [expectedSnapshot({
    guideId: guideB, key, hash: '7'.repeat(64), response: changedResponse(),
  })]);
});
