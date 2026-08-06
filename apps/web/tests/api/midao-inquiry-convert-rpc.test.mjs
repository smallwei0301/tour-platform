// Issue #1759 Package 4 Task 38: atomic inquiry -> booking conversion RPC contracts.
//
// 真實雙 PostgreSQL 連線的併發矩陣（Canary A–J）＋風險回歸（R1–R5）＋本卡新增必測
// （T-K1/T-K2/T-K3/T-K4/T-S1/T-S2）。禁止 mock Supabase client，禁止只 assert SQL 字串。
//
// 連線來源：MIDAO_TEST_DATABASE_URL（未設定時整檔 skip，避免無 DB 的 CI lane 紅燈）。
// 只准指向 disposable/local 測試資料庫，絕不指向生產或 staging。
//
// 誠實邊界：案例 F 明確斷言「conversion vs 直接 INSERT INTO bookings（模擬 draft route，
// 不取 mutex）的超賣確實可能發生」，追蹤於 #1795。

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, before, beforeEach, describe } from 'node:test';

const DATABASE_URL = process.env.MIDAO_TEST_DATABASE_URL;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');
const SEED_PATH = path.join(HERE, 'fixtures/midao-task38-seed.sql');
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase/migrations/20260806120000_midao_atomic_inquiry_conversion.sql',
);
const ROLLBACK_PATH = path.join(
  REPO_ROOT,
  'supabase/migrations/20260806120000_midao_atomic_inquiry_conversion.rollback.sql',
);

const GUIDE_ID = '22222222-0000-0000-0000-000000000001';
const ACTIVITY_ID = '33333333-0000-0000-0000-000000000001';
const PLAN_ID = '44444444-0000-0000-0000-000000000001';
const PLAN_INSTANT_ID = '44444444-0000-0000-0000-000000000002';
const TRAVELER_A = '11111111-0000-0000-0000-000000000002';
const TRAVELER_B = '11111111-0000-0000-0000-000000000003';
const TRAVELER_ORPHAN = '11111111-0000-0000-0000-0000000000ff';
const INQ = (n) => `55555555-0000-0000-0000-00000000000${n}`;
const INQ_ORPHAN = '55555555-0000-0000-0000-0000000000ff';

const START_AT = '2026-09-10T02:00:00.000Z'; // Asia/Taipei 2026-09-10 10:00
const END_AT = '2026-09-10T06:00:00.000Z';

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');
const tokenHash = (label) => sha256(`task38-token-${label}`);
const requestHash = (label) => sha256(`task38-request-${label}`);

/** 只保留可執行 SQL：移除 `--` 行註解，避免掃描到守門註解自身的字面詞。 */
function executableSql(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/--.*$/u, ''))
    .join('\n');
}

const CONVERT_SQL = `SELECT public.midao_convert_inquiry_to_booking(
  $1::uuid, $2::text, $3::text, $4::uuid, $5::uuid, $6::timestamptz, $7::timestamptz,
  $8::integer, $9::integer, $10::text, $11::integer, $12::text,
  $13::text, $14::text, $15::text, $16::text, $17::text
) AS result`;

function convertArgs({
  inquiryId,
  participants = 2,
  idempotencyKey,
  token = 'a',
  reqHash = 'a',
  planId = PLAN_ID,
  guideId = GUIDE_ID,
  startAt = START_AT,
  endAt = END_AT,
  ttlHours = 2,
  quotedTotal = 6000,
  actorType = 'guide',
} = {}) {
  return [
    guideId, actorType, 'task38-actor', inquiryId, planId, startAt, endAt,
    participants, quotedTotal, 'seed note', ttlHours, tokenHash(token),
    'Task38 Contact', '0900000000', 'task38@example.test',
    idempotencyKey ?? `task38-${randomUUID()}`, requestHash(reqHash),
  ];
}

let pg;
let ownedClients = [];

async function newClient() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query("SET lock_timeout = '5s'");
  await client.query("SET statement_timeout = '15s'");
  ownedClients.push(client);
  return client;
}

function errorOf(result) {
  return result.status === 'rejected' ? result.reason : null;
}

function messageOf(result) {
  const error = errorOf(result);
  return error ? String(error.message) : null;
}

/**
 * Deterministic barrier: a third connection holds `lockSql` while both operations are
 * started, then we poll pg_stat_activity until every worker backend is actually blocked
 * (pg_blocking_pids non-empty) before releasing. No setTimeout guessing of interleavings.
 */
async function raceWithBarrier(control, lockSql, workers) {
  await control.query('BEGIN');
  await control.query(lockSql);

  const pids = [];
  const settledFlags = workers.map(() => false);
  const started = workers.map(async (worker, index) => {
    const { rows } = await worker.client.query('SELECT pg_backend_pid() AS pid');
    pids[index] = rows[0].pid;
    const promise = worker.run().finally(() => { settledFlags[index] = true; });
    return promise;
  });

  const settled = Promise.allSettled(started);

  let blockingEvidence = [];
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (pids.filter(Boolean).length === workers.length) {
      const { rows } = await control.query(
        `SELECT pid, pg_blocking_pids(pid) AS blocked_by, state, wait_event_type
         FROM pg_stat_activity WHERE pid = ANY($1::int[])`,
        [pids.filter(Boolean)],
      );
      blockingEvidence = rows;
      const blockedCount = rows.filter((row) => row.blocked_by.length > 0).length;
      const doneCount = settledFlags.filter(Boolean).length;
      if (blockedCount + doneCount >= workers.length && blockedCount > 0) break;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }

  await control.query('COMMIT');
  const results = await settled;
  return { results, blockingEvidence };
}

const describeOrSkip = DATABASE_URL ? describe : describe.skip;

describeOrSkip('midao atomic inquiry conversion RPC', () => {
  let a;
  let b;
  let control;
  let admin;

  before(async () => {
    pg = (await import('pg')).default;
    a = await newClient();
    b = await newClient();
    control = await newClient();
    admin = await newClient();
    await admin.query("SET statement_timeout = '120s'");
  });

  after(async () => {
    await Promise.allSettled(ownedClients.map((client) => client.end()));
    ownedClients = [];
  });

  async function resetSeed(maxParticipants = 8) {
    await admin.query('ROLLBACK').catch(() => {});
    try {
      await admin.query(readFileSync(SEED_PATH, 'utf8'));
    } catch (error) {
      await admin.query('ROLLBACK').catch(() => {});
      throw error;
    }
    await admin.query('UPDATE public.activity_plans SET max_participants = $1 WHERE id = $2', [
      maxParticipants, PLAN_ID,
    ]);
    for (const client of [a, b, control]) {
      await client.query('ROLLBACK').catch(() => {});
    }
  }

  async function countRows(sql, params = []) {
    const { rows } = await admin.query(sql, params);
    return Number(rows[0].count);
  }

  async function bookingsForInquiry(inquiryId) {
    const { rows } = await admin.query(
      'SELECT * FROM public.bookings WHERE source_inquiry_id = $1', [inquiryId],
    );
    return rows;
  }

  beforeEach(async () => {
    await resetSeed();
  });

  // ---------------------------------------------------------------- Canary A
  test('A: same inquiry, same idempotency key, same token hash -> exactly one booking, one replay', async () => {
    const key = `task38-A-${randomUUID()}`;
    const args = () => convertArgs({ inquiryId: INQ(1), idempotencyKey: key, token: 'A', reqHash: 'A' });

    const { results, blockingEvidence } = await raceWithBarrier(
      control,
      `SELECT 1 FROM public.guide_inquiries WHERE id = '${INQ(1)}' FOR UPDATE`,
      [
        { client: a, run: () => a.query(CONVERT_SQL, args()) },
        { client: b, run: () => b.query(CONVERT_SQL, args()) },
      ],
    );

    const ok = results.filter((r) => r.status === 'fulfilled');
    assert.equal(ok.length, 2, `both calls must succeed; got ${JSON.stringify(results.map(messageOf))} blocking=${JSON.stringify(blockingEvidence)}`);
    const bodies = ok.map((r) => r.value.rows[0].result);
    const created = bodies.filter((body) => body.created === true);
    const replayed = bodies.filter((body) => body.replayed === true);
    assert.equal(created.length, 1);
    assert.equal(replayed.length, 1);
    assert.equal(bodies[0].booking_id, bodies[1].booking_id);
    for (const body of bodies) {
      assert.equal(body.confirmation_token_belongs_to_caller, true);
    }

    const bookingId = bodies[0].booking_id;
    assert.equal(await countRows('SELECT count(*) FROM public.bookings WHERE source_inquiry_id = $1', [INQ(1)]), 1);
    assert.equal(await countRows('SELECT count(*) FROM public.orders WHERE booking_id = $1', [bookingId]), 1);
    assert.equal(await countRows('SELECT count(*) FROM public.booking_pricing_snapshots WHERE booking_id = $1', [bookingId]), 1);
    assert.equal(await countRows('SELECT count(*) FROM public.booking_intake_responses WHERE booking_id = $1', [bookingId]), 1);
    assert.equal(await countRows('SELECT count(*) FROM public.booking_confirmation_tokens WHERE booking_id = $1', [bookingId]), 1);
    assert.equal(await countRows('SELECT count(*) FROM public.booking_status_logs WHERE booking_id = $1', [bookingId]), 1);
    assert.equal(await countRows('SELECT count(*) FROM public.midao_notification_outbox WHERE aggregate_id = $1', [bookingId]), 1);

    const { rows: stored } = await admin.query(
      `SELECT response_body FROM public.midao_idempotency_records
       WHERE scope_type='inquiry' AND scope_id=$1 AND command_name='convert_inquiry_to_booking'`,
      [INQ(1)],
    );
    assert.equal(stored.length, 1);
    assert.equal(
      Object.prototype.hasOwnProperty.call(stored[0].response_body, 'confirmation_token_belongs_to_caller'),
      false,
      'persisted replay snapshot must not freeze belongs_to_caller',
    );
  });

  // ---------------------------------------------------------------- Canary B
  test('B: same idempotency key with a different request hash -> IDEMPOTENCY_CONFLICT', async () => {
    const key = `task38-B-${randomUUID()}`;
    const { results } = await raceWithBarrier(
      control,
      `SELECT 1 FROM public.guide_inquiries WHERE id = '${INQ(1)}' FOR UPDATE`,
      [
        { client: a, run: () => a.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), idempotencyKey: key, reqHash: 'B1' })) },
        { client: b, run: () => b.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), idempotencyKey: key, reqHash: 'B2' })) },
      ],
    );

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    assert.equal(ok.length, 1, JSON.stringify(results.map(messageOf)));
    assert.equal(failed.length, 1);
    assert.equal(errorOf(failed[0]).message, 'IDEMPOTENCY_CONFLICT');
    assert.equal(errorOf(failed[0]).code, 'P0001');
    assert.equal(await countRows('SELECT count(*) FROM public.bookings WHERE source_inquiry_id = $1', [INQ(1)]), 1);
    assert.equal(await countRows('SELECT count(*) FROM public.midao_notification_outbox WHERE event_name = $1', ['booking.converted_from_inquiry']), 1);
  });

  // ---------------------------------------------------------------- Canary C
  test('C: same inquiry with different idempotency keys -> INQUIRY_ALREADY_CONVERTED (never 23505)', async () => {
    const { results } = await raceWithBarrier(
      control,
      `SELECT 1 FROM public.guide_inquiries WHERE id = '${INQ(1)}' FOR UPDATE`,
      [
        { client: a, run: () => a.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), idempotencyKey: `task38-C1-${randomUUID()}`, token: 'C1', reqHash: 'C1' })) },
        { client: b, run: () => b.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), idempotencyKey: `task38-C2-${randomUUID()}`, token: 'C2', reqHash: 'C2' })) },
      ],
    );

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    assert.equal(ok.length, 1, JSON.stringify(results.map(messageOf)));
    assert.equal(errorOf(failed[0]).message, 'INQUIRY_ALREADY_CONVERTED');
    assert.equal(errorOf(failed[0]).code, 'P0001');
    assert.notEqual(errorOf(failed[0]).code, '23505');

    const { rows } = await admin.query('SELECT converted_booking_id FROM public.guide_inquiries WHERE id = $1', [INQ(1)]);
    assert.ok(rows[0].converted_booking_id);
    assert.equal((await bookingsForInquiry(INQ(1))).length, 1);
  });

  // ---------------------------------------------------------------- Canary D
  test('D: different inquiries competing for the last capacity -> exactly one wins, loser rolls back fully', async () => {
    await resetSeed(3);
    const { results } = await raceWithBarrier(
      control,
      `SELECT 1 FROM public.guide_inquiries WHERE id = '${INQ(1)}' FOR UPDATE`,
      [
        { client: a, run: () => a.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(2), participants: 2, idempotencyKey: `task38-D1-${randomUUID()}`, token: 'D1', reqHash: 'D1' })) },
        { client: b, run: () => b.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(3), participants: 2, idempotencyKey: `task38-D2-${randomUUID()}`, token: 'D2', reqHash: 'D2' })) },
      ],
    );

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    assert.equal(ok.length, 1, JSON.stringify(results.map(messageOf)));
    assert.equal(errorOf(failed[0]).message, 'CAPACITY_EXCEEDED');

    const { rows: sums } = await admin.query(
      `SELECT coalesce(sum(participants), 0)::int AS total FROM public.bookings
       WHERE activity_plan_id = $1 AND status IN ('draft','external_hold','pending_confirmation','confirmed','reschedule_requested')`,
      [PLAN_ID],
    );
    assert.ok(sums[0].total <= 3, `capacity must never be exceeded, got ${sums[0].total}`);

    const loserInquiry = ok[0].value.rows[0].result.inquiry_id === INQ(2) ? INQ(3) : INQ(2);
    assert.equal((await bookingsForInquiry(loserInquiry)).length, 0);
    assert.equal(await countRows(
      "SELECT count(*) FROM public.midao_idempotency_records WHERE scope_type='inquiry' AND scope_id=$1", [loserInquiry],
    ), 0, 'loser must leave no idempotency residue');
  });

  // ---------------------------------------------------------------- Canary E
  test('E: capacity exactly consumed then two concurrent stragglers -> both CAPACITY_EXCEEDED', async () => {
    await resetSeed(4);
    await a.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), participants: 4, idempotencyKey: `task38-E0-${randomUUID()}`, token: 'E0', reqHash: 'E0' }));

    const { results } = await raceWithBarrier(
      control,
      `SELECT 1 FROM public.midao_booking_capacity_locks WHERE guide_id='${GUIDE_ID}' AND activity_plan_id='${PLAN_ID}' FOR UPDATE`,
      [
        { client: a, run: () => a.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(2), participants: 1, idempotencyKey: `task38-E1-${randomUUID()}`, token: 'E1', reqHash: 'E1' })) },
        { client: b, run: () => b.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(3), participants: 1, idempotencyKey: `task38-E2-${randomUUID()}`, token: 'E2', reqHash: 'E2' })) },
      ],
    );

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 0, JSON.stringify(results.map(messageOf)));
    for (const result of results) {
      assert.equal(errorOf(result).message, 'CAPACITY_EXCEEDED');
    }
    const { rows } = await admin.query(
      `SELECT coalesce(sum(participants),0)::int AS total FROM public.bookings
       WHERE activity_plan_id=$1 AND status IN ('draft','external_hold','pending_confirmation','confirmed','reschedule_requested')`,
      [PLAN_ID],
    );
    assert.equal(rows[0].total, 4);
  });

  // ---------------------------------------------------------------- Canary F
  test('F: conversion serializes against conversion, but the draft-route style direct insert can still oversell (#1795)', async () => {
    await resetSeed(3);
    // 同 guide／同 plan／同 local date、時段不重疊 -> 仍受同一 mutex 序列化，容量以同日總和判定。
    const { results } = await raceWithBarrier(
      control,
      `SELECT 1 FROM public.guide_inquiries WHERE id='${INQ(1)}' FOR UPDATE`,
      [
        { client: a, run: () => a.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(2), participants: 2, idempotencyKey: `task38-F1-${randomUUID()}`, token: 'F1', reqHash: 'F1' })) },
        {
          client: b,
          run: () => b.query(CONVERT_SQL, convertArgs({
            inquiryId: INQ(3), participants: 2,
            startAt: '2026-09-10T09:00:00.000Z', endAt: '2026-09-10T11:00:00.000Z',
            idempotencyKey: `task38-F2-${randomUUID()}`, token: 'F2', reqHash: 'F2',
          })),
        },
      ],
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, JSON.stringify(results.map(messageOf)));
    assert.equal(errorOf(results.find((r) => r.status === 'rejected')).message, 'CAPACITY_EXCEEDED');

    // 誠實邊界：直接 INSERT（模擬 POST /api/v2/bookings/draft，不取 mutex）不會被本卡序列化。
    const beforeTotal = Number((await admin.query(
      `SELECT coalesce(sum(participants),0)::int AS total FROM public.bookings
       WHERE activity_plan_id=$1 AND status IN ('draft','external_hold','pending_confirmation','confirmed','reschedule_requested')`,
      [PLAN_ID],
    )).rows[0].total);

    await admin.query(
      `INSERT INTO public.bookings (traveler_id, guide_id, activity_id, activity_plan_id, source_channel,
         start_at, end_at, timezone, participants, status)
       VALUES ($1,$2,$3,$4,'web',$5,$6,'Asia/Taipei',3,'draft')`,
      [TRAVELER_A, GUIDE_ID, ACTIVITY_ID, PLAN_ID, START_AT, END_AT],
    );

    const afterTotal = Number((await admin.query(
      `SELECT coalesce(sum(participants),0)::int AS total FROM public.bookings
       WHERE activity_plan_id=$1 AND status IN ('draft','external_hold','pending_confirmation','confirmed','reschedule_requested')`,
      [PLAN_ID],
    )).rows[0].total);

    assert.equal(beforeTotal, 2);
    assert.equal(afterTotal, 5);
    assert.ok(afterTotal > 3, 'Task 38 does NOT close the conversion vs traveler self-serve oversell window (#1795)');
  });

  // ---------------------------------------------------------------- Canary G
  test('G: double-clicked accept consumes the confirmation token exactly once', async () => {
    const created = (await a.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), idempotencyKey: `task38-G-${randomUUID()}`, token: 'G', reqHash: 'G' }))).rows[0].result;
    const bookingId = created.booking_id;

    const acceptSql = 'SELECT public.midao_accept_traveler_confirmation($1::uuid,$2::text,$3::text,$4::text) AS result';
    const { results } = await raceWithBarrier(
      control,
      `SELECT 1 FROM public.bookings WHERE id='${bookingId}' FOR UPDATE`,
      [
        { client: a, run: () => a.query(acceptSql, [TRAVELER_A, tokenHash('G'), `task38-GA-${randomUUID()}`, requestHash('GA')]) },
        { client: b, run: () => b.query(acceptSql, [TRAVELER_A, tokenHash('G'), `task38-GB-${randomUUID()}`, requestHash('GB')]) },
      ],
    );

    const ok = results.filter((r) => r.status === 'fulfilled');
    assert.equal(ok.length, 1, `exactly one accept may succeed; got ${JSON.stringify(results.map(messageOf))}`);
    assert.equal(errorOf(results.find((r) => r.status === 'rejected')).message, 'CONFIRMATION_TOKEN_ALREADY_CONSUMED');

    const { rows: token } = await admin.query('SELECT consumed_at FROM public.booking_confirmation_tokens WHERE booking_id=$1', [bookingId]);
    assert.ok(token[0].consumed_at);
    const { rows: booking } = await admin.query('SELECT status, traveler_confirmation_status FROM public.bookings WHERE id=$1', [bookingId]);
    assert.equal(booking[0].traveler_confirmation_status, 'confirmed');
    assert.equal(booking[0].status, 'draft', 'accept must never change bookings.status');
    assert.equal(await countRows("SELECT count(*) FROM public.midao_notification_outbox WHERE event_name='booking.traveler_confirmed' AND aggregate_id=$1", [bookingId]), 1);
    assert.equal(await countRows("SELECT count(*) FROM public.booking_status_logs WHERE booking_id=$1 AND reason='traveler_confirmation_accepted'", [bookingId]), 1);
  });

  // ---------------------------------------------------------------- Canary H
  //
  // 依 PLAN_DRIFT 裁決 t_7fc893de（PLAN_DOC §8.2 案例 H 定案註記）重寫。
  // 原 Canary 草稿版本（「兩個 token 競爭最後容量，恰一 confirmed」）在決策 §3.3
  // 選項 A 定案後結構性不可達：conversion 層 3 mutex 已序列化 hold 並保證
  // Σ(同 key 全部 hold) ≤ max_participants，而 accept §5.3 步驟 7 判斷的
  // Σ(others) + self 恆等於 Σ(全部 hold)，故正常路徑恆不觸發。
  // 本測試因此分兩段：H1 正常路徑（雙方皆 confirmed、accept 不扣量）、
  // H2 防禦深度（人工繞過 mutex 製造超額 hold，模擬 #1795 的旅客自助下單視窗）。
  test('H: accept revalidates capacity as a defensive invariant (H1 normal path both confirm, H2 guard fires)', async () => {
    // ---- H1：正常路徑（max=4，兩筆各 2，總和恰好不超額）----
    await resetSeed(4);
    const first = (await a.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), participants: 2, idempotencyKey: `task38-H1a-${randomUUID()}`, token: 'H1a', reqHash: 'H1a' }))).rows[0].result;
    const second = (await a.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(2), participants: 2, idempotencyKey: `task38-H1b-${randomUUID()}`, token: 'H1b', reqHash: 'H1b' }))).rows[0].result;
    assert.ok(first.booking_id);
    assert.ok(second.booking_id);
    const bookingIds = [first.booking_id, second.booking_id];

    const scheduleBookedBefore = await countRows(
      'SELECT coalesce(sum(booked_count),0)::int AS count FROM public.activity_schedules WHERE activity_id=$1', [ACTIVITY_ID],
    );
    const { rows: deadlinesBefore } = await admin.query(
      'SELECT booking_id, payment_deadline_at FROM public.orders WHERE booking_id = ANY($1::uuid[]) ORDER BY booking_id', [bookingIds],
    );
    assert.equal(deadlinesBefore.length, 2);

    const acceptSql = 'SELECT public.midao_accept_traveler_confirmation($1::uuid,$2::text,$3::text,$4::text) AS result';
    const { results } = await raceWithBarrier(
      control,
      `SELECT 1 FROM public.midao_booking_capacity_locks WHERE guide_id='${GUIDE_ID}' AND activity_plan_id='${PLAN_ID}' FOR UPDATE`,
      [
        { client: a, run: () => a.query(acceptSql, [TRAVELER_A, tokenHash('H1a'), `task38-HA-${randomUUID()}`, requestHash('HA')]) },
        { client: b, run: () => b.query(acceptSql, [TRAVELER_B, tokenHash('H1b'), `task38-HB-${randomUUID()}`, requestHash('HB')]) },
      ],
    );

    assert.equal(
      results.filter((r) => r.status === 'fulfilled').length, 2,
      `H1: both accepts must succeed under option A; got ${JSON.stringify(results.map(messageOf))}`,
    );
    assert.ok(
      !results.map(messageOf).some((message) => message === 'CAPACITY_EXCEEDED'),
      'H1: CAPACITY_EXCEEDED is structurally unreachable on the normal path',
    );

    const { rows: confirmed } = await admin.query(
      'SELECT id, status, traveler_confirmation_status FROM public.bookings WHERE id = ANY($1::uuid[])', [bookingIds],
    );
    assert.equal(confirmed.length, 2);
    for (const row of confirmed) {
      assert.equal(row.traveler_confirmation_status, 'confirmed');
      // accept 不扣量斷言 1：bookings.status 必須維持 draft（§5.3 步驟 8）
      assert.equal(row.status, 'draft', 'accept must never change bookings.status');
    }
    const { rows: consumed } = await admin.query(
      'SELECT booking_id, consumed_at FROM public.booking_confirmation_tokens WHERE booking_id = ANY($1::uuid[])', [bookingIds],
    );
    assert.equal(consumed.length, 2);
    for (const row of consumed) assert.ok(row.consumed_at, 'both tokens must be consumed');
    assert.equal(
      await countRows(
        "SELECT count(*) FROM public.midao_notification_outbox WHERE event_name='booking.traveler_confirmed' AND aggregate_id = ANY($1::text[])",
        [bookingIds.map(String)],
      ),
      2,
    );

    // accept 不扣量斷言 2：activity_schedules.booked_count 前後不變
    assert.equal(
      await countRows('SELECT coalesce(sum(booked_count),0)::int AS count FROM public.activity_schedules WHERE activity_id=$1', [ACTIVITY_ID]),
      scheduleBookedBefore,
      'accept must never touch activity_schedules.booked_count',
    );
    // accept 不扣量斷言 3：orders.payment_deadline_at 前後不變
    const { rows: deadlinesAfter } = await admin.query(
      'SELECT booking_id, payment_deadline_at FROM public.orders WHERE booking_id = ANY($1::uuid[]) ORDER BY booking_id', [bookingIds],
    );
    assert.deepEqual(
      deadlinesAfter.map((row) => String(row.payment_deadline_at)),
      deadlinesBefore.map((row) => String(row.payment_deadline_at)),
      'accept must never reset orders.payment_deadline_at',
    );

    // ---- H2：防禦深度（人工繞過 mutex 製造超額 hold）----
    await resetSeed(4);
    const guarded = (await a.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(3), participants: 1, idempotencyKey: `task38-H2-${randomUUID()}`, token: 'H2', reqHash: 'H2' }))).rows[0].result;
    const guardedId = guarded.booking_id;

    // 此 INSERT 模擬 Q1 承認的 POST /api/v2/bookings/draft 超賣視窗（#1795）：
    // 它不經 RPC、不取 mutex，因此是 conversion RPC 結構上不可能產生的狀態。
    const { rows: injected } = await admin.query(
      `INSERT INTO public.bookings (traveler_id, guide_id, activity_id, activity_plan_id, source_channel,
         start_at, end_at, timezone, participants, status)
       VALUES ($1,$2,$3,$4,'web',$5,$6,'Asia/Taipei',4,'draft') RETURNING id`,
      [TRAVELER_B, GUIDE_ID, ACTIVITY_ID, PLAN_ID, START_AT, END_AT],
    );
    const injectedId = injected[0].id;

    const logsBefore = await countRows('SELECT count(*) FROM public.booking_status_logs WHERE booking_id=$1', [guardedId]);
    const outboxBefore = await countRows('SELECT count(*) FROM public.midao_notification_outbox WHERE aggregate_id=$1', [String(guardedId)]);

    await assert.rejects(
      () => a.query(acceptSql, [TRAVELER_A, tokenHash('H2'), `task38-H2A-${randomUUID()}`, requestHash('H2A')]),
      (error) => {
        assert.equal(error.message, 'CAPACITY_EXCEEDED');
        assert.equal(error.code, 'P0001');
        return true;
      },
    );

    const { rows: guardedToken } = await admin.query('SELECT consumed_at FROM public.booking_confirmation_tokens WHERE booking_id=$1', [guardedId]);
    assert.equal(guardedToken[0].consumed_at, null, 'guarded token must remain retryable');
    const { rows: guardedBooking } = await admin.query('SELECT status, traveler_confirmation_status FROM public.bookings WHERE id=$1', [guardedId]);
    assert.equal(guardedBooking[0].traveler_confirmation_status, 'pending');
    assert.equal(guardedBooking[0].status, 'draft');
    assert.equal(await countRows('SELECT count(*) FROM public.booking_status_logs WHERE booking_id=$1', [guardedId]), logsBefore);
    assert.equal(await countRows('SELECT count(*) FROM public.midao_notification_outbox WHERE aggregate_id=$1', [String(guardedId)]), outboxBefore);

    // 收尾：清掉人工插入的那筆 booking，避免污染後續案例。
    await admin.query('DELETE FROM public.bookings WHERE id=$1', [injectedId]);
  });

  // ---------------------------------------------------------------- Canary I
  test('I: late-stage failure rolls the whole conversion transaction back, idempotency row included', async () => {
    await admin.query(`
      CREATE OR REPLACE FUNCTION public.task38_outbox_boom() RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN RAISE EXCEPTION 'TASK38_OUTBOX_BOOM'; END; $fn$;
      CREATE TRIGGER task38_outbox_boom BEFORE INSERT ON public.midao_notification_outbox
        FOR EACH ROW EXECUTE FUNCTION public.task38_outbox_boom();
    `);
    try {
      await assert.rejects(
        () => a.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), idempotencyKey: `task38-I-${randomUUID()}`, token: 'I', reqHash: 'I' })),
        /TASK38_OUTBOX_BOOM/,
      );
    } finally {
      await admin.query('DROP TRIGGER IF EXISTS task38_outbox_boom ON public.midao_notification_outbox');
      await admin.query('DROP FUNCTION IF EXISTS public.task38_outbox_boom()');
    }

    const { rows } = await admin.query('SELECT status, converted_booking_id FROM public.guide_inquiries WHERE id=$1', [INQ(1)]);
    assert.equal(rows[0].converted_booking_id, null);
    assert.equal(rows[0].status, 'replied');
    assert.equal((await bookingsForInquiry(INQ(1))).length, 0);
    assert.equal(await countRows("SELECT count(*) FROM public.midao_idempotency_records WHERE scope_type='inquiry' AND scope_id=$1", [INQ(1)]), 0);
    assert.equal(await countRows("SELECT count(*) FROM public.midao_notification_outbox WHERE event_name='booking.converted_from_inquiry'"), 0);
  });

  // ---------------------------------------------------------------- Canary J
  test('J: 20 rounds of mixed atomic commands produce no deadlock_detected (40P01)', async () => {
    const rounds = 20;
    for (let round = 0; round < rounds; round += 1) {
      await resetSeed(8);
      const created = (await admin.query(CONVERT_SQL, convertArgs({
        inquiryId: INQ(1), participants: 1, idempotencyKey: `task38-J-${round}-${randomUUID()}`,
        token: `J${round}`, reqHash: `J${round}`, ttlHours: 1,
      }))).rows[0].result;

      const acceptSql = 'SELECT public.midao_accept_traveler_confirmation($1::uuid,$2::text,$3::text,$4::text) AS result';
      const settled = await Promise.allSettled([
        a.query(acceptSql, [TRAVELER_A, tokenHash(`J${round}`), `task38-JA-${round}-${randomUUID()}`, requestHash(`JA${round}`)]),
        b.query('SELECT * FROM public.fn_expire_unpaid_order_atomic($1::uuid, now() + interval \'48 hours\')', [created.order_id]),
        control.query('SELECT public.midao_expire_stale_confirmation_atomic($1::uuid, now() + interval \'48 hours\') AS result', [created.booking_id]),
      ]);

      for (const result of settled) {
        if (result.status === 'rejected') {
          assert.notEqual(result.reason.code, '40P01', `deadlock in round ${round}: ${result.reason.message}`);
          assert.notEqual(result.reason.code, '55P03', `lock timeout in round ${round}: ${result.reason.message}`);
          assert.notEqual(result.reason.code, '57014', `statement timeout in round ${round}: ${result.reason.message}`);
        }
      }
    }
  });

  // ------------------------------------------------------------------- R1
  test('R1: accept blocks on orders (layer 4) before locking the confirmation token row (layer 7)', async () => {
    const created = (await admin.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), idempotencyKey: `task38-R1-${randomUUID()}`, token: 'R1', reqHash: 'R1' }))).rows[0].result;

    await control.query('BEGIN');
    await control.query('SELECT 1 FROM public.orders WHERE id = $1 FOR UPDATE', [created.order_id]);
    const { rows: pidRows } = await a.query('SELECT pg_backend_pid() AS pid');
    const workerPid = pidRows[0].pid;

    const acceptPromise = a.query(
      'SELECT public.midao_accept_traveler_confirmation($1::uuid,$2::text,$3::text,$4::text) AS result',
      [TRAVELER_A, tokenHash('R1'), `task38-R1a-${randomUUID()}`, requestHash('R1a')],
    );

    let blockedBy = [];
    let waitingRelations = [];
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const { rows } = await control.query('SELECT pg_blocking_pids($1) AS blocked_by', [workerPid]);
      if (rows[0].blocked_by.length > 0) {
        blockedBy = rows[0].blocked_by;
        const { rows: waiting } = await control.query(
          `SELECT c.relname FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
           WHERE l.pid = $1 AND l.granted = false`,
          [workerPid],
        );
        waitingRelations = waiting.map((row) => row.relname);
        break;
      }
      await new Promise((resolve) => setImmediate(resolve));
    }

    assert.ok(blockedBy.length > 0, 'accept must block while the orders row is held');

    // 鎖序證明（row 級）：accept 卡在 orders 時，token 列必須尚未被 accept 鎖住，
    // 因此第三連線可以立刻 NOWAIT 取得該列的 row lock。反向鎖序會讓這裡 55P03。
    await b.query('BEGIN');
    await b.query(
      'SELECT 1 FROM public.booking_confirmation_tokens WHERE booking_id = $1 FOR UPDATE NOWAIT',
      [created.booking_id],
    );
    await b.query('COMMIT');

    // 對照組：accept 確實正在等 orders（tuple 或 relation 級皆可接受的等待證據）。
    assert.ok(
      waitingRelations.length === 0 || waitingRelations.includes('orders'),
      `accept must wait on orders, observed waiting relations=${JSON.stringify(waitingRelations)}`,
    );

    await control.query('COMMIT');
    const accepted = (await acceptPromise).rows[0].result;
    assert.equal(accepted.accepted, true);
  });

  // ------------------------------------------------------------------- R2
  test('R2: conversion mutual exclusion is provably layered (layer 1, layer 2, layer 3 each intercept)', async () => {
    // (c) 同 key 同 hash -> 由層 1 攔下並 replay
    const key = `task38-R2c-${randomUUID()}`;
    const first = (await a.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), idempotencyKey: key, token: 'R2c', reqHash: 'R2c' }))).rows[0].result;
    const replay = (await b.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), idempotencyKey: key, token: 'R2c', reqHash: 'R2c' }))).rows[0].result;
    assert.equal(replay.replayed, true);
    assert.equal(replay.booking_id, first.booking_id);

    // (a) 同 inquiry 不同 key -> 由層 2／2b 攔下
    await assert.rejects(
      () => b.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), idempotencyKey: `task38-R2a-${randomUUID()}`, token: 'R2a', reqHash: 'R2a' })),
      (error) => error.message === 'INQUIRY_ALREADY_CONVERTED' && error.code === 'P0001',
    );

    // (b) 不同 inquiry 同 guide/plan/date -> 由層 3 的容量互斥攔下
    await admin.query('UPDATE public.activity_plans SET max_participants = 2 WHERE id = $1', [PLAN_ID]);
    await assert.rejects(
      () => b.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(2), participants: 2, idempotencyKey: `task38-R2b-${randomUUID()}`, token: 'R2b', reqHash: 'R2b' })),
      (error) => error.message === 'CAPACITY_EXCEEDED' && error.code === 'P0001',
    );
  });

  // ------------------------------------------------------------------- R3
  test('R3: conversion holds an exclusive inquiry row lock before inserting the booking, with no deadlock', async () => {
    await control.query('BEGIN');
    await control.query('SELECT 1 FROM public.guide_inquiries WHERE id=$1 FOR UPDATE', [INQ(1)]);
    const { rows: pidRows } = await a.query('SELECT pg_backend_pid() AS pid');
    const workerPid = pidRows[0].pid;

    const conversion = a.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), idempotencyKey: `task38-R3-${randomUUID()}`, token: 'R3', reqHash: 'R3' }));

    let blocked = false;
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const { rows } = await control.query('SELECT pg_blocking_pids($1) AS blocked_by', [workerPid]);
      if (rows[0].blocked_by.length > 0) { blocked = true; break; }
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.ok(blocked, 'conversion must wait for the inquiry row lock');
    await control.query('COMMIT');

    const created = (await conversion).rows[0].result;
    assert.equal(created.created, true);

    // 併發 UPDATE guide_inquiries：不得 deadlock
    const settled = await Promise.allSettled([
      admin.query('UPDATE public.guide_inquiries SET updated_at = now() WHERE id = $1', [INQ(1)]),
      b.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(2), participants: 1, idempotencyKey: `task38-R3b-${randomUUID()}`, token: 'R3b', reqHash: 'R3b' })),
    ]);
    for (const result of settled) {
      if (result.status === 'rejected') assert.notEqual(result.reason.code, '40P01');
    }
  });

  // ------------------------------------------------------------------- R4
  test('R4: re-converting an already converted inquiry raises P0001, never 23505', async () => {
    await admin.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), idempotencyKey: `task38-R4a-${randomUUID()}`, token: 'R4a', reqHash: 'R4a' }));
    await assert.rejects(
      () => admin.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), idempotencyKey: `task38-R4b-${randomUUID()}`, token: 'R4b', reqHash: 'R4b' })),
      (error) => {
        assert.equal(error.code, 'P0001');
        assert.notEqual(error.code, '23505');
        assert.equal(error.message, 'INQUIRY_ALREADY_CONVERTED');
        return true;
      },
    );
  });

  // ------------------------------------------------------------------- R5
  test('R5: the migration performs no external calls and notifies only through the outbox', async () => {
    const sql = executableSql(readFileSync(MIGRATION_PATH, 'utf8'));
    for (const forbidden of ['pg_net', 'net.http_post', 'curl', 'http_get', 'http_post']) {
      assert.equal(sql.includes(forbidden), false, `migration must not reference ${forbidden}`);
    }
    assert.equal(/\bhttps?\b/iu.test(sql), false, 'migration must not perform external calls');

    const created = (await admin.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), idempotencyKey: `task38-R5-${randomUUID()}`, token: 'R5', reqHash: 'R5' }))).rows[0].result;
    const { rows } = await admin.query('SELECT payload FROM public.midao_notification_outbox WHERE aggregate_id=$1', [created.booking_id]);
    assert.equal(rows.length, 1);
    const payloadText = JSON.stringify(rows[0].payload);
    assert.equal(payloadText.includes(tokenHash('R5')), false, 'outbox payload must not carry the token hash');
    assert.equal(payloadText.toLowerCase().includes('token_hash'), false);
  });

  // ------------------------------------------------------------------ T-K1
  test('T-K1: SQL local_date matches JS getLocalDateInTimezone across UTC day boundaries', async () => {
    const { getLocalDateInTimezone } = await import('../../src/lib/availability-v2/group-booking-rule.ts');
    const samples = [
      '2026-08-06T15:59:59.000Z',
      '2026-08-06T16:00:00.000Z',
      '2026-08-06T16:00:01.000Z',
      '2026-01-01T15:59:00.000Z',
      '2026-01-01T16:00:00.000Z',
      '2026-07-01T16:01:00.000Z',
      '2026-12-31T15:59:59.000Z',
      '2026-12-31T16:00:00.000Z',
      '2027-02-28T16:00:00.000Z',
    ];
    assert.ok(samples.length >= 8);
    for (const sample of samples) {
      const { rows } = await admin.query("SELECT (($1::timestamptz) AT TIME ZONE 'Asia/Taipei')::date::text AS local_date", [sample]);
      assert.equal(rows[0].local_date, getLocalDateInTimezone(sample, 'Asia/Taipei'), `timezone mismatch at ${sample}`);
    }
  });

  // ------------------------------------------------------------------ T-K2
  test('T-K2: confirmation expiry and payment expiry are mutually idempotent noops', async () => {
    // (a) 確認逾期先到
    const first = (await admin.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), idempotencyKey: `task38-K2a-${randomUUID()}`, token: 'K2a', reqHash: 'K2a', ttlHours: 1 }))).rows[0].result;
    const expired = (await admin.query("SELECT public.midao_expire_stale_confirmation_atomic($1::uuid, now() + interval '2 hours') AS result", [first.booking_id])).rows[0].result;
    assert.equal(expired.expired, true);
    const { rows: afterExpire } = await admin.query('SELECT status, traveler_confirmation_status FROM public.bookings WHERE id=$1', [first.booking_id]);
    assert.equal(afterExpire[0].status, 'cancelled');
    assert.equal(afterExpire[0].traveler_confirmation_status, 'expired');
    const { rows: orderAfter } = await admin.query('SELECT status FROM public.orders WHERE id=$1', [first.order_id]);
    assert.equal(orderAfter[0].status, 'cancelled_unpaid');

    // 再跑一次 expire：必須冪等 noop，不重複寫 log／outbox
    const logsAfterFirst = await countRows('SELECT count(*) FROM public.booking_status_logs WHERE booking_id=$1', [first.booking_id]);
    const outboxAfterFirst = await countRows('SELECT count(*) FROM public.midao_notification_outbox WHERE aggregate_id=$1', [first.booking_id]);
    const repeatNoop = (await admin.query("SELECT public.midao_expire_stale_confirmation_atomic($1::uuid, now() + interval '48 hours') AS result", [first.booking_id])).rows[0].result;
    assert.equal(repeatNoop.expired, false);
    assert.equal(repeatNoop.reason, 'already_cancelled');
    assert.equal(await countRows('SELECT count(*) FROM public.booking_status_logs WHERE booking_id=$1', [first.booking_id]), logsAfterFirst);
    assert.equal(await countRows('SELECT count(*) FROM public.midao_notification_outbox WHERE aggregate_id=$1', [first.booking_id]), outboxAfterFirst);

    // (b) N1 交叉冪等：已被付款逾時取消的 booking，expire-stale-confirmation 必須 noop。
    //     注意：這裡以「付款逾時 sweep 完成後的等價終態」直接落庫，而不呼叫
    //     fn_expire_unpaid_order_atomic —— 該既有函式在 booking 需要被取消時會以
    //     42702 ambiguous column 失敗（見同檔的 pre-existing defect 測試）。該函式屬本卡
    //     FORBIDDEN 範圍，不得在此修補。
    const second = (await admin.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(2), idempotencyKey: `task38-K2b-${randomUUID()}`, token: 'K2b', reqHash: 'K2b', ttlHours: 1 }))).rows[0].result;
    await admin.query(
      `UPDATE public.bookings SET status='cancelled', cancelled_at=now(), updated_at=now() WHERE id=$1`,
      [second.booking_id],
    );
    await admin.query("UPDATE public.orders SET status='cancelled_unpaid', updated_at=now() WHERE id=$1", [second.order_id]);
    await admin.query(
      `INSERT INTO public.booking_status_logs (booking_id, from_status, to_status, actor_user_id, actor_role, reason, metadata)
       VALUES ($1, 'draft', 'cancelled', NULL, 'system', 'payment_deadline_expired', '{}'::jsonb)`,
      [second.booking_id],
    );

    const logsAfterPayment = await countRows('SELECT count(*) FROM public.booking_status_logs WHERE booking_id=$1', [second.booking_id]);
    const outboxAfterPayment = await countRows('SELECT count(*) FROM public.midao_notification_outbox WHERE aggregate_id=$1', [second.booking_id]);

    const noop = (await admin.query("SELECT public.midao_expire_stale_confirmation_atomic($1::uuid, now() + interval '48 hours') AS result", [second.booking_id])).rows[0].result;
    assert.equal(noop.expired, false);
    assert.equal(noop.reason, 'already_cancelled');
    assert.equal(noop.traveler_confirmation_status, 'pending', 'noop must not rewrite the confirmation status of a payment-cancelled booking');
    assert.equal(await countRows('SELECT count(*) FROM public.booking_status_logs WHERE booking_id=$1', [second.booking_id]), logsAfterPayment);
    assert.equal(await countRows('SELECT count(*) FROM public.midao_notification_outbox WHERE aggregate_id=$1', [second.booking_id]), outboxAfterPayment);
  });

  // ------------------------------------------------- pre-existing defect (out of scope)
  test('pre-existing: fn_expire_unpaid_order_atomic raises 42702 when it must cancel a booking (NOT introduced by Task 38, function is FORBIDDEN to modify here)', async () => {
    const created = (await admin.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), idempotencyKey: `task38-PRE-${randomUUID()}`, token: 'PRE', reqHash: 'PRE' }))).rows[0].result;
    await assert.rejects(
      () => admin.query("SELECT * FROM public.fn_expire_unpaid_order_atomic($1::uuid, now() + interval '48 hours')", [created.order_id]),
      (error) => {
        assert.equal(error.code, '42702', `expected the known ambiguous-column defect, got ${error.code} ${error.message}`);
        assert.match(error.message, /booking_id/u);
        return true;
      },
    );

    // 證明缺陷來自既有函式本體（OUT 參數 booking_id 遮蔽了資料表欄位），與 Task 38 無關。
    const { rows } = await admin.query(
      "SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname='fn_expire_unpaid_order_atomic'",
    );
    assert.match(rows[0].def, /RETURNS TABLE\(order_id uuid, expired boolean, order_status text, booking_id uuid/u);
    assert.equal(rows[0].def.includes('midao_'), false, 'the defective function is not part of the Task 38 migration');
  });

  // ------------------------------------------------------------------ T-K3
  test('T-K3: the capacity mutex table accepts writes from the SECURITY DEFINER RPC under forced RLS', async () => {
    const { rows: rls } = await admin.query(
      "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid='public.midao_booking_capacity_locks'::regclass",
    );
    assert.equal(rls[0].relrowsecurity, true);
    assert.equal(rls[0].relforcerowsecurity, true);

    await admin.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), idempotencyKey: `task38-K3-${randomUUID()}`, token: 'K3', reqHash: 'K3' }));
    const { rows } = await admin.query(
      'SELECT guide_id::text, activity_plan_id::text, local_date::text FROM public.midao_booking_capacity_locks WHERE guide_id=$1',
      [GUIDE_ID],
    );
    assert.equal(rows.length, 1, 'the RPC must be able to create the mutex row despite FORCE ROW LEVEL SECURITY');
    assert.equal(rows[0].activity_plan_id, PLAN_ID);
    assert.equal(rows[0].local_date, '2026-09-10');
  });

  // ------------------------------------------------------------------ T-K4
  test('T-K4: a traveler missing from public.users raises TRAVELER_PROFILE_NOT_FOUND, never 23503', async () => {
    await assert.rejects(
      () => admin.query(CONVERT_SQL, convertArgs({ inquiryId: INQ_ORPHAN, participants: 1, idempotencyKey: `task38-K4-${randomUUID()}`, token: 'K4', reqHash: 'K4' })),
      (error) => {
        assert.equal(error.message, 'TRAVELER_PROFILE_NOT_FOUND');
        assert.equal(error.code, 'P0002');
        assert.notEqual(error.code, '23503');
        return true;
      },
    );
    const { rows: authRow } = await admin.query('SELECT count(*)::int AS count FROM auth.users WHERE id=$1', [TRAVELER_ORPHAN]);
    assert.equal(authRow[0].count, 1, 'the negative fixture must actually exist in auth.users');
    assert.equal((await bookingsForInquiry(INQ_ORPHAN)).length, 0);
    assert.equal(await countRows("SELECT count(*) FROM public.midao_idempotency_records WHERE scope_type='inquiry' AND scope_id=$1", [INQ_ORPHAN]), 0);
  });

  // ------------------------------------------------------------------- D-checks
  test('defence-in-depth: plan and participant guards are re-verified inside the RPC', async () => {
    const cases = [
      [{ inquiryId: INQ(1), planId: PLAN_INSTANT_ID }, 'PLAN_BOOKING_TYPE_NOT_REQUEST'],
      [{ inquiryId: INQ(1), participants: 99 }, 'PARTICIPANTS_ABOVE_PLAN_MAX'],
      [{ inquiryId: INQ(1), guideId: '22222222-0000-0000-0000-0000000000ee' }, 'INQUIRY_NOT_FOUND'],
      [{ inquiryId: '55555555-0000-0000-0000-0000000000ee' }, 'INQUIRY_NOT_FOUND'],
    ];
    for (const [overrides, expected] of cases) {
      await assert.rejects(
        () => admin.query(CONVERT_SQL, convertArgs({ idempotencyKey: `task38-D-${randomUUID()}`, ...overrides })),
        (error) => { assert.equal(error.message, expected); return true; },
      );
    }

    await admin.query("UPDATE public.activity_plans SET min_participants = 4 WHERE id = $1", [PLAN_ID]);
    await assert.rejects(
      () => admin.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), participants: 2, idempotencyKey: `task38-Dmin-${randomUUID()}` })),
      (error) => { assert.equal(error.message, 'PARTICIPANTS_BELOW_PLAN_MIN'); return true; },
    );

    await admin.query("UPDATE public.guide_inquiries SET status='closed' WHERE id=$1", [INQ(2)]);
    await admin.query("UPDATE public.activity_plans SET min_participants = 1 WHERE id = $1", [PLAN_ID]);
    await assert.rejects(
      () => admin.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(2), participants: 1, idempotencyKey: `task38-Dstate-${randomUUID()}` })),
      (error) => { assert.equal(error.message, 'INQUIRY_STATE_NOT_CONVERTIBLE'); return true; },
    );
  });

  // ------------------------------------------------------------------- Q2 landing
  test('Q2: conversion approves the booking and starts the 24h payment window immediately', async () => {
    const created = (await admin.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), idempotencyKey: `task38-Q2-${randomUUID()}`, token: 'Q2', reqHash: 'Q2', ttlHours: 3 }))).rows[0].result;
    const { rows } = await admin.query(
      `SELECT b.guide_approval_status, b.status, b.customer_note, b.booking_no, b.schedule_id AS booking_schedule,
              b.traveler_confirmation_expires_at, t.expires_at AS token_expires_at,
              o.payment_deadline_at, o.status AS order_status, o.schedule_id, o.booking_no AS order_booking_no,
              extract(epoch FROM (o.payment_deadline_at - b.guide_approval_decided_at))::int AS payment_window_seconds
       FROM public.bookings b
       JOIN public.orders o ON o.id = b.order_id
       JOIN public.booking_confirmation_tokens t ON t.booking_id = b.id
       WHERE b.id = $1`,
      [created.booking_id],
    );
    const row = rows[0];
    assert.equal(row.guide_approval_status, 'approved');
    assert.equal(row.status, 'draft');
    assert.equal(row.order_status, 'pending_payment');
    assert.equal(row.customer_note, null, 'questionnaire answers must not leak into customer_note');
    assert.equal(row.schedule_id, null, 'request-type conversion must not attach a schedule');
    assert.equal(row.booking_schedule, null);
    assert.equal(row.payment_window_seconds, 24 * 60 * 60);
    assert.equal(row.traveler_confirmation_expires_at.getTime(), row.token_expires_at.getTime());
    assert.match(row.booking_no, /^BK-/u, 'booking_no must come from the existing trigger');
    assert.ok(row.order_booking_no !== null, 'orders.booking_no must come from the existing trigger');

    const { rows: schedules } = await admin.query('SELECT count(*)::int AS count FROM public.activity_schedules');
    assert.equal(schedules[0].count, 0, 'conversion must never touch activity_schedules');
  });

  // ------------------------------------------------------------------ T-S1
  test('T-S1: the three RPCs are SECURITY DEFINER, pinned to pg_catalog, and executable only by service_role', async () => {
    const names = [
      'midao_convert_inquiry_to_booking',
      'midao_accept_traveler_confirmation',
      'midao_expire_stale_confirmation_atomic',
    ];
    const { rows: procs } = await admin.query(
      `SELECT p.proname, p.prosecdef, p.proconfig FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname='public' AND p.proname = ANY($1::text[])`,
      [names],
    );
    assert.equal(procs.length, 3);
    for (const proc of procs) {
      assert.equal(proc.prosecdef, true, `${proc.proname} must be SECURITY DEFINER`);
      assert.deepEqual(proc.proconfig, ['search_path=pg_catalog'], `${proc.proname} search_path must be pinned`);
    }

    const { rows: privileges } = await admin.query(
      `SELECT grantee, routine_name, privilege_type FROM information_schema.routine_privileges
       WHERE specific_schema='public' AND routine_name = ANY($1::text[])`,
      [names],
    );
    for (const role of ['anon', 'authenticated', 'PUBLIC']) {
      assert.deepEqual(privileges.filter((row) => row.grantee === role), [], `${role} must hold zero routine privileges`);
    }
    for (const name of names) {
      const serviceRole = privileges.filter((row) => row.grantee === 'service_role' && row.routine_name === name);
      assert.equal(serviceRole.length, 1, `service_role must hold EXECUTE on ${name}`);
      assert.equal(serviceRole[0].privilege_type, 'EXECUTE');
    }
  });

  // ------------------------------------------------------------------ T-S2
  test('T-S2: the rollback companion drops only the functions and loses zero business data', async () => {
    const created = (await admin.query(CONVERT_SQL, convertArgs({ inquiryId: INQ(1), idempotencyKey: `task38-S2-${randomUUID()}`, token: 'S2', reqHash: 'S2' }))).rows[0].result;
    const tables = [
      'bookings', 'orders', 'booking_pricing_snapshots', 'booking_intake_responses',
      'booking_confirmation_tokens', 'booking_status_logs', 'midao_notification_outbox',
      'midao_booking_capacity_locks',
    ];
    const before = {};
    for (const table of tables) {
      before[table] = await countRows(`SELECT count(*) FROM public.${table}`);
    }
    assert.ok(before.bookings > 0);

    await admin.query(readFileSync(ROLLBACK_PATH, 'utf8'));
    try {
      const { rows: remaining } = await admin.query(
        `SELECT proname FROM pg_proc WHERE proname LIKE 'midao_convert%' OR proname LIKE 'midao_accept%' OR proname LIKE 'midao_expire_stale%'`,
      );
      assert.deepEqual(remaining, [], 'rollback must drop all three functions');

      const { rows: tableStillThere } = await admin.query(
        "SELECT to_regclass('public.midao_booking_capacity_locks') AS reg",
      );
      assert.ok(tableStillThere[0].reg, 'rollback must keep the mutex table');

      for (const table of tables) {
        assert.equal(await countRows(`SELECT count(*) FROM public.${table}`), before[table], `${table} row count changed during rollback`);
      }
      const { rows: booking } = await admin.query('SELECT id FROM public.bookings WHERE id=$1', [created.booking_id]);
      assert.equal(booking.length, 1);

      const rollbackSql = executableSql(readFileSync(ROLLBACK_PATH, 'utf8')).toUpperCase();
      for (const forbidden of ['DELETE', 'TRUNCATE', 'DROP TABLE']) {
        assert.equal(rollbackSql.includes(forbidden), false, `rollback must not contain ${forbidden}`);
      }
    } finally {
      // 還原，讓本檔可重複執行
      await admin.query(readFileSync(MIGRATION_PATH, 'utf8'));
    }

    const { rows: restored } = await admin.query(
      `SELECT count(*)::int AS count FROM pg_proc WHERE proname IN
       ('midao_convert_inquiry_to_booking','midao_accept_traveler_confirmation','midao_expire_stale_confirmation_atomic')`,
    );
    assert.equal(restored[0].count, 3);
  });
});
