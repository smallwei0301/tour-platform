import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  __resetMidaoRequestsStoreForTest,
  __seedMidaoBookingRequestForTest,
  getMidaoBookingRequestDb,
  getMidaoInquiryRequestDb,
  listMidaoRequestsDb,
} from '../../src/lib/db-midao-requests.mjs';
import { resolveRequestBucket } from '../../src/lib/midao/request-buckets.mjs';
import { __setSupabaseClientForTest } from '../../src/lib/supabase-env.mjs';

const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GUIDE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CURSOR_SECRET = 'task14-test-cursor-secret-0123456789abcdef';

const IDS = {
  pending: '11111111-1111-4111-8111-111111111111',
  reply: '11111111-1111-4111-8111-111111111112',
  approved: '11111111-1111-4111-8111-111111111113',
  complete: '11111111-1111-4111-8111-111111111114',
};

function row({
  bookingId,
  orderId,
  createdAt,
  startAt,
  bookingStatus = 'draft',
  guideApprovalStatus = 'pending',
  orderStatus = 'pending_payment',
  lastSenderRole = null,
  guideId = GUIDE_ID,
  activityTitle = '島嶼散步',
  adminNote = 'MUST_NOT_LEAK',
} = {}) {
  const messages = lastSenderRole
    ? [{
      id: `55555555-5555-4555-8555-${bookingId.slice(-12)}`,
      sender_role: lastSenderRole,
      created_at: '2026-07-28T00:30:00.000Z',
      body: 'MUST_NOT_LEAK',
    }]
    : [];
  return {
    id: bookingId,
    booking_no: `BK-${bookingId.slice(-4)}`,
    guide_id: guideId,
    order_id: orderId,
    activity_id: '33333333-3333-4333-8333-333333333333',
    activity_plan_id: '44444444-4444-4444-8444-444444444444',
    status: bookingStatus,
    guide_approval_status: guideApprovalStatus,
    guide_approval_decided_at: guideApprovalStatus === 'pending' ? null : '2026-07-28T00:15:00.000Z',
    guide_approval_note: guideApprovalStatus === 'rejected' ? '行程已滿' : null,
    start_at: startAt,
    end_at: '2026-08-01T06:00:00.000Z',
    timezone: 'Asia/Taipei',
    participants: 2,
    customer_note: '需要低強度路線',
    internal_note: 'MUST_NOT_LEAK',
    created_at: createdAt,
    updated_at: createdAt,
    activities: { id: '33333333-3333-4333-8333-333333333333', title: activityTitle },
    activity_plans: {
      id: '44444444-4444-4444-8444-444444444444',
      name: '半日方案',
      booking_type: 'request',
    },
    orders: orderId ? {
      id: orderId,
      booking_id: bookingId,
      status: orderStatus,
      total_twd: 3600,
      contact_name: '王小明',
      contact_email: 'traveler@example.com',
      contact_phone: '0912345678',
      payment_deadline_at: '2026-07-29T00:15:00.000Z',
      created_at: createdAt,
      updated_at: createdAt,
      admin_note: adminNote,
      order_messages: messages,
    } : null,
  };
}

function fixtures() {
  return [
    row({
      bookingId: IDS.pending,
      orderId: '22222222-2222-4222-8222-222222222221',
      createdAt: '2026-07-28T00:00:00.000Z',
      startAt: '2026-08-01T02:00:00.000Z',
      lastSenderRole: 'traveler',
    }),
    row({
      bookingId: IDS.reply,
      orderId: '22222222-2222-4222-8222-222222222222',
      createdAt: '2026-07-28T01:00:00.000Z',
      startAt: '2026-08-03T02:00:00.000Z',
      guideApprovalStatus: 'approved',
      lastSenderRole: 'traveler',
    }),
    row({
      bookingId: IDS.approved,
      orderId: '22222222-2222-4222-8222-222222222223',
      createdAt: '2026-07-28T02:00:00.000Z',
      startAt: '2026-08-02T02:00:00.000Z',
      guideApprovalStatus: 'approved',
      lastSenderRole: 'guide',
    }),
    row({
      bookingId: IDS.complete,
      orderId: '22222222-2222-4222-8222-222222222224',
      createdAt: '2026-07-28T03:00:00.000Z',
      startAt: '2026-07-31T02:00:00.000Z',
      bookingStatus: 'completed',
      guideApprovalStatus: 'approved',
      orderStatus: 'completed',
      lastSenderRole: 'traveler',
    }),
  ];
}

function seed(rows = fixtures()) {
  __resetMidaoRequestsStoreForTest();
  for (const fixture of rows) __seedMidaoBookingRequestForTest(fixture);
}

function assertForbiddenKeysAbsent(value) {
  const forbidden = new Set(['admin_note', 'adminNote', 'internal_note', 'internalNote', 'body']);
  const visit = (current) => {
    if (!current || typeof current !== 'object') return;
    for (const [key, child] of Object.entries(current)) {
      assert.equal(forbidden.has(key), false, `forbidden key leaked: ${key}`);
      visit(child);
    }
  };
  visit(value);
}

async function authoritativeOrdersBookingConstraint() {
  const baseline = await readFile(
    new URL('../../../../supabase/baselines/v1/baseline.sql', import.meta.url),
    'utf8',
  );
  const matches = [...baseline.matchAll(
    /ALTER TABLE ONLY public\.orders\s+ADD CONSTRAINT ([a-z0-9_]+) FOREIGN KEY \(booking_id\) REFERENCES public\.bookings\(id\);/giu,
  )];
  assert.equal(matches.length, 1, 'authoritative baseline must expose exactly one orders.booking_id FK');
  return matches[0][1];
}

function toRpcRow(fixture) {
  const order = fixture.orders;
  const latest = [...order.order_messages]
    .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))[0] ?? null;
  const needsReply = latest?.sender_role === 'traveler';
  const resolved = resolveRequestBucket({
    kind: 'booking',
    bookingStatus: fixture.status,
    guideApprovalStatus: fixture.guide_approval_status,
    orderStatus: order.status,
    needsReply,
  });
  assert.equal(resolved.ok, true);
  const priority = { needs_reply: 0, new: 1, replied: 2, completed: 3 }[resolved.bucket];
  const timestamps = [fixture.updated_at, order.updated_at, latest?.created_at].filter(Boolean).sort();
  const email = order.contact_email;
  const emailMasked = typeof email === 'string' && /^[^@]+@[^@]+$/u.test(email)
    ? `${email[0]}***@${email.split('@')[1]}`
    : null;
  return {
    booking_id: fixture.id,
    guide_id: fixture.guide_id,
    order_id: order.id,
    booking_no: fixture.booking_no,
    booking_status: fixture.status,
    guide_approval_status: fixture.guide_approval_status,
    order_status: order.status,
    bucket: resolved.bucket,
    secondary_state: resolved.secondaryState,
    needs_reply: needsReply,
    display_name: order.contact_name,
    email_masked: emailMasked,
    activity_id: fixture.activity_id,
    activity_plan_id: fixture.activity_plan_id,
    activity_title: fixture.activities.title,
    plan_name: fixture.activity_plans.name,
    booking_type: fixture.activity_plans.booking_type,
    start_at: fixture.start_at,
    end_at: fixture.end_at,
    timezone: fixture.timezone,
    party_size: fixture.participants,
    total_twd: order.total_twd,
    payment_deadline_at: order.payment_deadline_at,
    received_at: fixture.created_at,
    updated_at: timestamps.at(-1),
    last_message_at: latest?.created_at ?? null,
    priority_rank: priority,
  };
}

function createSupabaseFake(rows, { listError = null, detailError = null, transformRpc = null } = {}) {
  const calls = [];
  const supabase = {
    async rpc(name, args) {
      calls.push({ type: 'rpc', name, args: structuredClone(args) });
      assert.equal(name, 'midao_list_booking_requests');
      if (listError) return { data: null, error: { message: listError } };
      let projected = rows
        .filter((item) => item.guide_id === args.p_guide_id)
        .map(toRpcRow)
        .filter((item) => args.p_bucket === 'all' || item.bucket === args.p_bucket);
      const compare = (left, right) => {
        if (args.p_sort === 'priority') {
          return left.priority_rank - right.priority_rank
            || right.updated_at.localeCompare(left.updated_at)
            || right.booking_id.localeCompare(left.booking_id);
        }
        if (args.p_sort === 'updated_desc') {
          return right.updated_at.localeCompare(left.updated_at)
            || right.booking_id.localeCompare(left.booking_id);
        }
        return left.start_at.localeCompare(right.start_at)
          || left.booking_id.localeCompare(right.booking_id);
      };
      projected.sort(compare);
      if (args.p_cursor_rank !== null) {
        projected = projected.filter((item) => {
          if (args.p_sort === 'priority') {
            return item.priority_rank > args.p_cursor_rank
              || (item.priority_rank === args.p_cursor_rank && (
                item.updated_at < args.p_cursor_at
                || (item.updated_at === args.p_cursor_at && item.booking_id < args.p_cursor_id)
              ));
          }
          if (args.p_sort === 'updated_desc') {
            return item.updated_at < args.p_cursor_at
              || (item.updated_at === args.p_cursor_at && item.booking_id < args.p_cursor_id);
          }
          return item.start_at > args.p_cursor_at
            || (item.start_at === args.p_cursor_at && item.booking_id > args.p_cursor_id);
        });
      }
      const page = projected.slice(0, args.p_limit);
      return { data: transformRpc ? transformRpc(structuredClone(page)) : page, error: null };
    },
    from(table) {
      assert.equal(table, 'bookings');
      const state = { rows: structuredClone(rows), select: '', filters: [] };
      const query = {
        select(clause) {
          state.select = String(clause);
          calls.push({ type: 'select', clause: state.select });
          return query;
        },
        eq(field, value) {
          state.filters.push([field, value]);
          if (field === 'guide_id') state.rows = state.rows.filter((item) => item.guide_id === value);
          if (field === 'id') state.rows = state.rows.filter((item) => item.id === value);
          if (field === 'activity_plans.booking_type') {
            state.rows = state.rows.filter((item) => item.activity_plans?.booking_type === value);
          }
          return query;
        },
        maybeSingle() {
          if (detailError) return Promise.resolve({ data: null, error: { message: detailError } });
          return Promise.resolve({ data: state.rows[0] ?? null, error: null });
        },
      };
      return query;
    },
  };
  return { supabase, calls };
}

test.beforeEach(() => {
  process.env.GUIDE_SESSION_SECRET = CURSOR_SECRET;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  __setSupabaseClientForTest(null);
  __resetMidaoRequestsStoreForTest();
});

test.afterEach(() => {
  delete process.env.GUIDE_SESSION_SECRET;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  __setSupabaseClientForTest(null);
  __resetMidaoRequestsStoreForTest();
});

test('in-memory list returns discriminated booking projection without list PII or internal notes', async () => {
  seed();
  const result = await listMidaoRequestsDb({ guideId: GUIDE_ID });
  assert.equal(result.items.length, 4);
  assert.deepEqual(result.items.map((item) => item.bookingId), [
    IDS.reply,
    IDS.pending,
    IDS.approved,
    IDS.complete,
  ]);

  const item = result.items.find((candidate) => candidate.bookingId === IDS.pending);
  assert.equal(item.kind, 'booking');
  assert.equal(item.requestRef, `booking_${IDS.pending}`);
  assert.notEqual(item.bookingId, item.orderId);
  assert.equal(item.bucket, 'new');
  assert.equal(item.secondaryState, 'pending_approval');
  assert.equal(item.needsReply, true);
  assert.deepEqual(item.traveler, {
    displayName: '王小明',
    emailMasked: 't***@example.com',
  });
  assert.equal('contactPhone' in item.traveler, false);
  assert.equal('customerNote' in item.request, false);
  assertForbiddenKeysAbsent(result);
});

test('list filters buckets, sorts deterministically, and paginates with opaque sort-bound cursor', async () => {
  seed();
  const needsReply = await listMidaoRequestsDb({ guideId: GUIDE_ID, bucket: 'needs_reply' });
  assert.deepEqual(needsReply.items.map((item) => item.bookingId), [IDS.reply]);

  const first = await listMidaoRequestsDb({ guideId: GUIDE_ID, limit: 2 });
  assert.equal(first.items.length, 2);
  assert.equal(typeof first.nextCursor, 'string');
  const second = await listMidaoRequestsDb({ guideId: GUIDE_ID, limit: 2, cursor: first.nextCursor });
  assert.deepEqual(
    [...first.items, ...second.items].map((item) => item.bookingId),
    [IDS.reply, IDS.pending, IDS.approved, IDS.complete],
  );
  assert.equal(second.nextCursor, null);

  const updated = await listMidaoRequestsDb({ guideId: GUIDE_ID, sort: 'updated_desc' });
  assert.deepEqual(updated.items.map((item) => item.bookingId), [
    IDS.complete,
    IDS.approved,
    IDS.reply,
    IDS.pending,
  ]);

  const service = await listMidaoRequestsDb({ guideId: GUIDE_ID, sort: 'service_asc' });
  assert.deepEqual(service.items.map((item) => item.bookingId), [
    IDS.complete,
    IDS.pending,
    IDS.approved,
    IDS.reply,
  ]);

  await assert.rejects(
    listMidaoRequestsDb({ guideId: GUIDE_ID, sort: 'service_asc', cursor: first.nextCursor }),
    /INVALID_CURSOR/,
  );

  const [payload, signature] = first.nextCursor.split('.');
  assert.equal(typeof signature, 'string', 'cursor must carry a detached signature');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  const forgedPayload = Buffer.from(JSON.stringify({ ...decoded, guideId: OTHER_GUIDE_ID })).toString('base64url');
  await assert.rejects(
    listMidaoRequestsDb({ guideId: GUIDE_ID, limit: 2, cursor: `${forgedPayload}.${signature}` }),
    /INVALID_CURSOR/,
  );
  const extraPayload = Buffer.from(JSON.stringify({ ...decoded, extra: 'signed-but-forbidden' })).toString('base64url');
  const extraSignature = createHmac('sha256', CURSOR_SECRET).update(extraPayload).digest('base64url');
  await assert.rejects(
    listMidaoRequestsDb({ guideId: GUIDE_ID, limit: 2, cursor: `${extraPayload}.${extraSignature}` }),
    /INVALID_CURSOR/,
  );
  await assert.rejects(
    listMidaoRequestsDb({ guideId: OTHER_GUIDE_ID, limit: 2, cursor: first.nextCursor }),
    /INVALID_CURSOR/,
  );

  for (const limit of [0, 51, 1.5, Number.NaN]) {
    await assert.rejects(listMidaoRequestsDb({ guideId: GUIDE_ID, limit }), /BAD_REQUEST/);
  }
});

test('same-timestamp keyset pages use booking id as deterministic tie-break without gaps or duplicates', async () => {
  const sameTimestampRows = [
    row({
      bookingId: IDS.pending,
      orderId: '22222222-2222-4222-8222-222222222221',
      createdAt: '2026-07-28T00:00:00.000Z',
      startAt: '2026-08-01T02:00:00.000Z',
      guideApprovalStatus: 'approved',
      lastSenderRole: 'traveler',
    }),
    row({
      bookingId: IDS.reply,
      orderId: '22222222-2222-4222-8222-222222222222',
      createdAt: '2026-07-28T00:00:00.000Z',
      startAt: '2026-08-02T02:00:00.000Z',
      guideApprovalStatus: 'approved',
      lastSenderRole: 'traveler',
    }),
  ];
  seed(sameTimestampRows);
  const first = await listMidaoRequestsDb({ guideId: GUIDE_ID, limit: 1 });
  const second = await listMidaoRequestsDb({ guideId: GUIDE_ID, limit: 1, cursor: first.nextCursor });
  assert.deepEqual([...first.items, ...second.items].map((item) => item.bookingId), [IDS.reply, IDS.pending]);
  assert.equal(second.nextCursor, null);
});

test('detail requires ownership, returns contact snapshot, and excludes admin/internal notes recursively', async () => {
  seed();
  const detail = await getMidaoBookingRequestDb({ guideId: GUIDE_ID, bookingId: IDS.approved });
  assert.equal(detail.bookingId, IDS.approved);
  assert.notEqual(detail.bookingId, detail.orderId);
  assert.equal(detail.traveler.contactEmail, 'traveler@example.com');
  assert.equal(detail.traveler.contactPhone, '0912345678');
  assert.equal(detail.request.customerNote, '需要低強度路線');
  assert.equal(detail.status.guideApprovalStatus, 'approved');
  assertForbiddenKeysAbsent(detail);

  await assert.rejects(
    getMidaoBookingRequestDb({ guideId: OTHER_GUIDE_ID, bookingId: IDS.approved }),
    /BOOKING_NOT_FOUND/,
  );
  await assert.rejects(getMidaoBookingRequestDb({ guideId: '', bookingId: IDS.approved }), /BAD_REQUEST/);
});

test('in-memory and schema-faithful RPC branches produce identical list/detail shapes with server-side pagination', async () => {
  const rows = fixtures();
  seed(rows);
  const memoryList = await listMidaoRequestsDb({ guideId: GUIDE_ID, limit: 3 });
  const memoryDetail = await getMidaoBookingRequestDb({ guideId: GUIDE_ID, bookingId: IDS.reply });

  const { supabase, calls } = createSupabaseFake(rows);
  process.env.SUPABASE_URL = 'http://example.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  __setSupabaseClientForTest(supabase);

  const remoteList = await listMidaoRequestsDb({ guideId: GUIDE_ID, limit: 3 });
  const remoteDetail = await getMidaoBookingRequestDb({ guideId: GUIDE_ID, bookingId: IDS.reply });
  assert.deepEqual(remoteList, memoryList);
  assert.deepEqual(remoteDetail, memoryDetail);

  const rpcCalls = calls.filter((call) => call.type === 'rpc');
  assert.equal(rpcCalls.length, 1);
  assert.deepEqual(rpcCalls[0], {
    type: 'rpc',
    name: 'midao_list_booking_requests',
    args: {
      p_guide_id: GUIDE_ID,
      p_bucket: 'all',
      p_sort: 'priority',
      p_cursor_rank: null,
      p_cursor_at: null,
      p_cursor_id: null,
      p_limit: 4,
    },
  });
  const selectClauses = calls.filter((call) => call.type === 'select').map((call) => call.clause);
  assert.equal(selectClauses.length, 1);
  const ordersBookingConstraint = await authoritativeOrdersBookingConstraint();
  for (const clause of selectClauses) {
    assert.match(clause, /guide_id/);
    assert.match(clause, new RegExp(`orders!${ordersBookingConstraint}\\(`, 'u'));
    assert.doesNotMatch(clause, /orders!fk_orders_booking_id/u);
    assert.match(clause, /order_messages\(id, sender_role, created_at\)/);
    assert.doesNotMatch(clause, /admin_note|internal_note|\bbody\b/);
    assert.doesNotMatch(clause, /\*/);
  }
  assertForbiddenKeysAbsent(remoteList);
  assertForbiddenKeysAbsent(remoteDetail);
});

test('valid PostgREST timestamptz wire variants normalize to canonical UTC while invalid values fail closed', async () => {
  const fixture = row({
    bookingId: IDS.approved,
    orderId: '22222222-2222-4222-8222-222222222223',
    createdAt: '2026-07-28T00:00:00.000Z',
    startAt: '2026-08-01T02:00:00.000Z',
    guideApprovalStatus: 'approved',
    lastSenderRole: 'traveler',
  });
  fixture.created_at = '2026-07-28T00:00:00Z';
  fixture.updated_at = '2026-07-28T00:05:00+00:00';
  fixture.start_at = '2026-08-01T10:00:00+08:00';
  fixture.end_at = '2026-08-01T06:00:00.000Z';
  fixture.guide_approval_decided_at = '2026-07-28T00:15:00Z';
  fixture.orders.updated_at = '2026-07-28T08:10:00+08:00';
  fixture.orders.payment_deadline_at = '2026-07-29T00:15:00+00:00';
  fixture.orders.order_messages[0].created_at = '2026-07-28T08:30:00+08:00';

  seed([fixture]);
  const memoryList = await listMidaoRequestsDb({ guideId: GUIDE_ID });
  const memoryDetail = await getMidaoBookingRequestDb({ guideId: GUIDE_ID, bookingId: IDS.approved });
  assert.deepEqual({
    startAt: memoryList.items[0].request.startAt,
    endAt: memoryList.items[0].request.endAt,
    receivedAt: memoryList.items[0].receivedAt,
    updatedAt: memoryList.items[0].updatedAt,
    lastMessageAt: memoryList.items[0].lastMessageAt,
    paymentDeadlineAt: memoryList.items[0].paymentDeadlineAt,
    decidedAt: memoryDetail.status.guideApprovalDecidedAt,
  }, {
    startAt: '2026-08-01T02:00:00.000Z',
    endAt: '2026-08-01T06:00:00.000Z',
    receivedAt: '2026-07-28T00:00:00.000Z',
    updatedAt: '2026-07-28T00:30:00.000Z',
    lastMessageAt: '2026-07-28T00:30:00.000Z',
    paymentDeadlineAt: '2026-07-29T00:15:00.000Z',
    decidedAt: '2026-07-28T00:15:00.000Z',
  });

  const { supabase } = createSupabaseFake([fixture]);
  process.env.SUPABASE_URL = 'http://example.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  __setSupabaseClientForTest(supabase);
  const remoteList = await listMidaoRequestsDb({ guideId: GUIDE_ID });
  const remoteDetail = await getMidaoBookingRequestDb({ guideId: GUIDE_ID, bookingId: IDS.approved });
  assert.deepEqual(remoteList, memoryList);
  assert.deepEqual(remoteDetail, memoryDetail);

  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  __setSupabaseClientForTest(null);
  for (const invalid of ['2026-02-30T00:00:00Z', 'not-a-timestamp', 1_722_124_800_000]) {
    const malformed = structuredClone(fixture);
    malformed.start_at = invalid;
    seed([malformed]);
    await assert.rejects(listMidaoRequestsDb({ guideId: GUIDE_ID }), /INVALID_REQUEST_ROW/u);
  }
});

test('Supabase list/detail backend failures stay distinct from successful null ownership 404', async () => {
  process.env.SUPABASE_URL = 'http://example.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

  const failing = createSupabaseFake(fixtures(), {
    listError: 'schema cache failure',
    detailError: 'permission denied',
  });
  __setSupabaseClientForTest(failing.supabase);
  await assert.rejects(
    listMidaoRequestsDb({ guideId: GUIDE_ID }),
    /MIDAO_REQUESTS_BACKEND_ERROR: list query failed/,
  );
  await assert.rejects(
    getMidaoBookingRequestDb({ guideId: GUIDE_ID, bookingId: IDS.pending }),
    /MIDAO_REQUESTS_BACKEND_ERROR: detail query failed/,
  );

  const missing = createSupabaseFake([]);
  __setSupabaseClientForTest(missing.supabase);
  await assert.rejects(
    getMidaoBookingRequestDb({ guideId: GUIDE_ID, bookingId: IDS.pending }),
    /BOOKING_NOT_FOUND/,
  );
});

test('malformed RPC owner, shape, lifecycle, and sort order fail closed', async () => {
  process.env.SUPABASE_URL = 'http://example.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  const mutations = [
    (page) => { page[0].guide_id = OTHER_GUIDE_ID; return page; },
    (page) => { page[0].unexpected = 'field'; return page; },
    (page) => { page[0].bucket = 'completed'; return page; },
    (page) => [page[1], page[0], ...page.slice(2)],
  ];
  for (const transformRpc of mutations) {
    const { supabase } = createSupabaseFake(fixtures(), { transformRpc });
    __setSupabaseClientForTest(supabase);
    await assert.rejects(
      listMidaoRequestsDb({ guideId: GUIDE_ID, limit: 3 }),
      /INVALID_REQUEST_ROW/,
    );
  }
});

test('malformed nested relation cardinality, identity, and sender roles fail closed', async () => {
  const base = row({
    bookingId: IDS.pending,
    orderId: '22222222-2222-4222-8222-222222222221',
    createdAt: '2026-07-28T00:00:00.000Z',
    startAt: '2026-08-01T02:00:00.000Z',
    lastSenderRole: 'traveler',
  });
  const malformed = [];

  const activityMany = structuredClone(base);
  activityMany.activities = [structuredClone(base.activities), structuredClone(base.activities)];
  malformed.push(activityMany);

  const activityMismatch = structuredClone(base);
  activityMismatch.activities.id = OTHER_GUIDE_ID;
  malformed.push(activityMismatch);

  const planMany = structuredClone(base);
  planMany.activity_plans = [structuredClone(base.activity_plans), structuredClone(base.activity_plans)];
  malformed.push(planMany);

  const planMismatch = structuredClone(base);
  planMismatch.activity_plans.id = OTHER_GUIDE_ID;
  malformed.push(planMismatch);

  const orderMany = structuredClone(base);
  orderMany.orders = [structuredClone(base.orders), structuredClone(base.orders)];
  malformed.push(orderMany);

  const orderBookingMismatch = structuredClone(base);
  orderBookingMismatch.orders.booking_id = IDS.complete;
  malformed.push(orderBookingMismatch);

  const unknownSender = structuredClone(base);
  unknownSender.orders.order_messages[0].sender_role = 'robot';
  malformed.push(unknownSender);

  for (const fixture of malformed) {
    __resetMidaoRequestsStoreForTest();
    __seedMidaoBookingRequestForTest(fixture);
    await assert.rejects(listMidaoRequestsDb({ guideId: GUIDE_ID }), /INVALID_REQUEST_ROW/);
  }
});

test('missing owner, malformed rows, tampered cursor, and unavailable inquiry branch fail closed', async () => {
  seed();
  await assert.rejects(listMidaoRequestsDb({ guideId: '' }), /BAD_REQUEST/);
  await assert.rejects(listMidaoRequestsDb({ guideId: GUIDE_ID, bucket: 'mystery' }), /BAD_REQUEST/);
  await assert.rejects(listMidaoRequestsDb({ guideId: GUIDE_ID, cursor: 'not-base64' }), /INVALID_CURSOR/);
  await assert.rejects(getMidaoInquiryRequestDb({ guideId: GUIDE_ID, inquiryId: IDS.pending }), /INQUIRY_NOT_FOUND/);

  __resetMidaoRequestsStoreForTest();
  __seedMidaoBookingRequestForTest(row({
    bookingId: IDS.pending,
    orderId: '22222222-2222-4222-8222-222222222221',
    createdAt: '2026-07-28T00:00:00.000Z',
    startAt: '2026-08-01T02:00:00.000Z',
    guideId: null,
  }));
  await assert.rejects(listMidaoRequestsDb({ guideId: GUIDE_ID }), /INVALID_REQUEST_ROW/);
});
