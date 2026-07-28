import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveMidaoRequestList } from '../../src/lib/midao/request-list-resolver.ts';
import { resolveMidaoRequestDetail } from '../../src/lib/midao/request-detail-resolver.ts';

const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const ACTIVITY_ID = '33333333-3333-4333-8333-333333333333';
const PLAN_ID = '44444444-4444-4444-8444-444444444444';

function canonicalBookingListItem(overrides = {}) {
  return {
    kind: 'booking',
    requestRef: `booking_${BOOKING_ID}`,
    bookingId: BOOKING_ID,
    orderId: ORDER_ID,
    bookingNo: 'BK-1111',
    bookingStatus: 'draft',
    guideApprovalStatus: 'pending',
    orderStatus: 'pending_payment',
    bucket: 'new',
    secondaryState: 'pending_approval',
    needsReply: false,
    traveler: {
      displayName: '王小明',
      emailMasked: 't***@example.com',
    },
    service: {
      activityId: ACTIVITY_ID,
      activityPlanId: PLAN_ID,
      title: '島嶼散步',
      planName: '半日方案',
      bookingType: 'request',
    },
    request: {
      startAt: '2026-08-01T02:00:00.000Z',
      endAt: '2026-08-01T06:00:00.000Z',
      timezone: 'Asia/Taipei',
      partySize: 2,
    },
    totalTwd: 3600,
    paymentDeadlineAt: '2026-07-29T00:15:00.000Z',
    receivedAt: '2026-07-28T00:00:00.000Z',
    updatedAt: '2026-07-28T00:00:00.000Z',
    lastMessageAt: null,
    ...overrides,
  };
}

function canonicalBookingDetailProjection(overrides = {}) {
  const listItem = canonicalBookingListItem();
  return {
    ...listItem,
    traveler: {
      ...listItem.traveler,
      contactEmail: 'traveler@example.com',
      contactPhone: '0912345678',
    },
    request: {
      ...listItem.request,
      customerNote: '需要低強度路線',
    },
    status: {
      bookingStatus: listItem.bookingStatus,
      guideApprovalStatus: listItem.guideApprovalStatus,
      orderStatus: listItem.orderStatus,
      guideApprovalDecidedAt: null,
      guideApprovalNote: null,
    },
    ...overrides,
  };
}

function detailWithLifecycle({
  bookingStatus,
  guideApprovalStatus,
  orderStatus,
  bucket,
  secondaryState,
  needsReply = false,
  guideApprovalDecidedAt = null,
  guideApprovalNote = null,
}) {
  return canonicalBookingDetailProjection({
    bookingStatus,
    guideApprovalStatus,
    orderStatus,
    bucket,
    secondaryState,
    needsReply,
    status: {
      bookingStatus,
      guideApprovalStatus,
      orderStatus,
      guideApprovalDecidedAt,
      guideApprovalNote,
    },
  });
}

function assertInvalidProjection(operation, hostileValue = 'MUST_NOT_ECHO') {
  assert.throws(operation, (error) => {
    assert.equal(error.name, 'InvalidMidaoRequestProjectionError');
    assert.equal(error.code, 'INVALID_MIDAO_REQUEST_PROJECTION');
    assert.equal(error.message, 'Invalid Midao request projection');
    assert.doesNotMatch(error.message, new RegExp(String(hostileValue), 'u'));
    return true;
  });
}

test('list resolver rebuilds a canonical booking DTO and preserves the opaque cursor', () => {
  const input = {
    items: [canonicalBookingListItem()],
    nextCursor: 'opaque-cursor-token',
  };

  assert.deepEqual(resolveMidaoRequestList(input), input);
});

test('list resolver rejects PII, internal notes, message bodies, and unknown projection fields', () => {
  const cases = [
    (item) => { item.traveler.contactEmail = 'private@example.com'; },
    (item) => { item.traveler.contactPhone = '0912345678'; },
    (item) => { item.request.customerNote = 'private note'; },
    (item) => { item.guideApprovalNote = 'internal decision'; },
    (item) => { item.internalNote = 'internal note'; },
    (item) => { item.messages = [{ body: 'private message' }]; },
    (item) => { item.traveler = [item.traveler]; },
    (item) => { item.service.activities = [{ id: ACTIVITY_ID }]; },
    (item) => { item.booking_id = BOOKING_ID; },
  ];

  for (const mutate of cases) {
    const item = canonicalBookingListItem();
    mutate(item);
    assertInvalidProjection(() => resolveMidaoRequestList({ items: [item], nextCursor: null }));
  }
});

test('list resolver rejects booking identity drift and never guesses inquiry or order identity', () => {
  const cases = [
    (item) => { item.requestRef = `booking_${ORDER_ID}`; },
    (item) => { item.bookingId = ORDER_ID; },
    (item) => { item.orderId = BOOKING_ID; },
    (item) => { item.inquiryId = '55555555-5555-4555-8555-555555555555'; },
    (item) => { item.kind = 'inquiry'; },
  ];

  for (const mutate of cases) {
    const item = canonicalBookingListItem();
    mutate(item);
    assertInvalidProjection(() => resolveMidaoRequestList({ items: [item], nextCursor: null }));
  }
});

test('list resolver rejects unknown or contradictory lifecycle states instead of defaulting actions or buckets', () => {
  const cases = [
    (item) => { item.bookingStatus = 'mystery'; },
    (item) => { item.guideApprovalStatus = 'approved'; },
    (item) => { item.bucket = 'completed'; },
    (item) => { item.secondaryState = 'mystery'; },
    (item) => { item.needsReply = 'true'; },
  ];

  for (const mutate of cases) {
    const item = canonicalBookingListItem();
    mutate(item);
    assertInvalidProjection(() => resolveMidaoRequestList({ items: [item], nextCursor: null }));
  }
});

test('detail resolver accepts ownership-established contact and note fields and computes a closed action map', () => {
  const input = canonicalBookingDetailProjection();
  const result = resolveMidaoRequestDetail(input);

  assert.deepEqual(result, {
    ...input,
    allowedActions: {
      approve: true,
      reject: true,
      markReplied: false,
      convertInquiry: false,
    },
  });
  assert.notEqual(result, input);
  assert.notEqual(result.traveler, input.traveler);
  assert.notEqual(result.request, input.request);
  assert.notEqual(result.status, input.status);
});

test('detail resolver rejects list-only projections, client ownership fields, relation arrays, and status drift', () => {
  const cases = [
    () => canonicalBookingListItem(),
    () => ({ ...canonicalBookingDetailProjection(), guideId: '66666666-6666-4666-8666-666666666666' }),
    () => {
      const detail = canonicalBookingDetailProjection();
      detail.traveler.contact = [{ email: 'private@example.com' }];
      return detail;
    },
    () => {
      const detail = canonicalBookingDetailProjection();
      detail.request.customerNote = { body: 'private note' };
      return detail;
    },
    () => {
      const detail = canonicalBookingDetailProjection();
      detail.status.bookingStatus = 'mystery';
      return detail;
    },
    () => {
      const detail = canonicalBookingDetailProjection();
      detail.status.orderStatus = 'paid';
      return detail;
    },
  ];

  for (const createProjection of cases) {
    assertInvalidProjection(() => resolveMidaoRequestDetail(createProjection()));
  }
});

test('detail resolver enables only approve and reject for the exact pending booking tuple', () => {
  const result = resolveMidaoRequestDetail(canonicalBookingDetailProjection());
  assert.deepEqual(result.allowedActions, {
    approve: true,
    reject: true,
    markReplied: false,
    convertInquiry: false,
  });
});

test('detail resolver returns false decision actions for every other known booking lifecycle', () => {
  const cases = [
    {
      bookingStatus: 'draft',
      guideApprovalStatus: 'approved',
      orderStatus: 'pending_payment',
      bucket: 'replied',
      secondaryState: 'awaiting_payment',
    },
    {
      bookingStatus: 'draft',
      guideApprovalStatus: 'approved',
      orderStatus: 'pending_payment',
      bucket: 'needs_reply',
      secondaryState: null,
      needsReply: true,
    },
    {
      bookingStatus: 'confirmed',
      guideApprovalStatus: 'approved',
      orderStatus: 'paid',
      bucket: 'completed',
      secondaryState: 'success',
    },
    {
      bookingStatus: 'cancelled',
      guideApprovalStatus: 'approved',
      orderStatus: 'cancelled_by_user',
      bucket: 'completed',
      secondaryState: 'cancelled',
    },
    {
      bookingStatus: 'cancelled',
      guideApprovalStatus: 'rejected',
      orderStatus: 'cancelled_by_guide',
      bucket: 'completed',
      secondaryState: 'rejected',
      guideApprovalDecidedAt: '2026-07-28T00:15:00.000Z',
      guideApprovalNote: '行程已滿',
    },
  ];

  for (const lifecycle of cases) {
    const result = resolveMidaoRequestDetail(detailWithLifecycle(lifecycle));
    assert.deepEqual(result.allowedActions, {
      approve: false,
      reject: false,
      markReplied: false,
      convertInquiry: false,
    });
  }
});

test('resolvers preserve legal nullable values, remain deterministic, and do not mutate or share input objects', () => {
  const item = canonicalBookingListItem({
    bookingStatus: 'draft',
    guideApprovalStatus: 'approved',
    orderStatus: 'pending_payment',
    bucket: 'needs_reply',
    secondaryState: null,
    needsReply: true,
    bookingNo: null,
    traveler: { displayName: null, emailMasked: null },
    service: {
      activityId: ACTIVITY_ID,
      activityPlanId: PLAN_ID,
      title: null,
      planName: null,
      bookingType: 'request',
    },
    request: {
      startAt: '2026-08-01T02:00:00.000Z',
      endAt: '2026-08-01T06:00:00.000Z',
      timezone: 'Asia/Taipei',
      partySize: null,
    },
    totalTwd: null,
    paymentDeadlineAt: null,
    lastMessageAt: null,
  });
  const input = { items: [item], nextCursor: null };
  const before = structuredClone(input);

  const first = resolveMidaoRequestList(input);
  const second = resolveMidaoRequestList(input);

  assert.deepEqual(input, before);
  assert.deepEqual(first, second);
  assert.deepEqual(first, input);
  assert.notEqual(first.items, input.items);
  assert.notEqual(first.items[0].traveler, input.items[0].traveler);
  assert.notEqual(first.items[0].service, input.items[0].service);
  assert.notEqual(first.items[0].request, input.items[0].request);
});

test('resolvers fail closed on critical nulls, non-canonical scalar shapes, raw rows, wrapper extras, and array cardinality', () => {
  const cases = [
    () => {
      const item = canonicalBookingListItem();
      delete item.kind;
      return () => resolveMidaoRequestList({ items: [item], nextCursor: null });
    },
    () => {
      const item = canonicalBookingListItem();
      item.bookingId = null;
      return () => resolveMidaoRequestList({ items: [item], nextCursor: null });
    },
    () => {
      const item = canonicalBookingListItem();
      item.orderId = null;
      return () => resolveMidaoRequestList({ items: [item], nextCursor: null });
    },
    () => {
      const item = canonicalBookingListItem();
      item.service.activityId = null;
      return () => resolveMidaoRequestList({ items: [item], nextCursor: null });
    },
    () => {
      const item = canonicalBookingListItem();
      item.request.startAt = '2026-08-01T10:00:00+08:00';
      return () => resolveMidaoRequestList({ items: [item], nextCursor: null });
    },
    () => {
      const item = canonicalBookingListItem();
      item.totalTwd = '3600';
      return () => resolveMidaoRequestList({ items: [item], nextCursor: null });
    },
    () => {
      const item = canonicalBookingListItem();
      item.needsReply = null;
      return () => resolveMidaoRequestList({ items: [item], nextCursor: null });
    },
    () => () => resolveMidaoRequestList({
      items: [{ booking_id: BOOKING_ID, order_id: ORDER_ID }],
      nextCursor: null,
    }),
    () => () => resolveMidaoRequestList({
      items: [],
      nextCursor: null,
      adminNote: 'MUST_NOT_ECHO',
    }),
    () => () => resolveMidaoRequestList({ items: [], nextCursor: {} }),
    () => () => resolveMidaoRequestList({ items: [{}], nextCursor: null }),
  ];

  for (const createOperation of cases) {
    assertInvalidProjection(createOperation());
  }
});

test('detail resolver never downgrades unknown, contradictory, or critical-null action-driving fields to false', () => {
  const cases = [
    (detail) => {
      detail.bookingStatus = null;
      detail.status.bookingStatus = null;
    },
    (detail) => {
      detail.guideApprovalStatus = 'unknown';
      detail.status.guideApprovalStatus = 'unknown';
    },
    (detail) => {
      detail.orderStatus = null;
      detail.status.orderStatus = null;
    },
    (detail) => { detail.bucket = null; },
    (detail) => { detail.secondaryState = 'unknown'; },
    (detail) => { detail.status.guideApprovalDecidedAt = 'not-a-timestamp'; },
  ];

  for (const mutate of cases) {
    const detail = canonicalBookingDetailProjection();
    mutate(detail);
    assertInvalidProjection(() => resolveMidaoRequestDetail(detail));
  }
});
