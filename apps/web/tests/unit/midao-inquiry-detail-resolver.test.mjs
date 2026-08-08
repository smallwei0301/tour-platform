import assert from 'node:assert/strict';
import test from 'node:test';

const { resolveMidaoInquiryDetail, InvalidMidaoInquiryProjectionError } = await import(
  '../../src/lib/midao/inquiry-detail-resolver.ts'
);
const { resolveMidaoRequestDetail } = await import(
  '../../src/lib/midao/request-detail-resolver.ts'
);
const { resolveRequestBucket } = await import('../../src/lib/midao/request-buckets.mjs');

const INQUIRY_ID = '55555555-5555-4555-8555-555555555555';
const ACTIVITY_ID = '33333333-3333-4333-8333-333333333333';
const PLAN_ID = '44444444-4444-4444-8444-444444444444';
const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';

const PROJECTION_KEYS = [
  'kind',
  'requestRef',
  'inquiryId',
  'inquiryNo',
  'inquiryStatus',
  'bucket',
  'secondaryState',
  'needsReply',
  'traveler',
  'service',
  'request',
  'plan',
  'convertedBookingId',
  'lastRepliedAt',
  'expiresAt',
  'receivedAt',
  'updatedAt',
];

function planSummary(overrides = {}) {
  return {
    activityPlanId: PLAN_ID,
    name: '半日方案',
    bookingType: 'request',
    status: 'active',
    minParticipants: 1,
    maxParticipants: 6,
    basePrice: 1800,
    ...overrides,
  };
}

function inquiryProjection(overrides = {}) {
  const inquiryStatus = overrides.inquiryStatus ?? 'replied';
  const needsReply = overrides.needsReply
    ?? (inquiryStatus === 'new' || inquiryStatus === 'opened');
  const bucketResult = resolveRequestBucket({ kind: 'inquiry', inquiryStatus, needsReply });
  return {
    kind: 'inquiry',
    requestRef: `inquiry_${INQUIRY_ID}`,
    inquiryId: INQUIRY_ID,
    inquiryNo: 'IQ-20260808-0001',
    inquiryStatus,
    bucket: bucketResult.bucket,
    secondaryState: bucketResult.secondaryState,
    needsReply,
    traveler: { displayName: null, emailMasked: null },
    service: {
      activityId: ACTIVITY_ID,
      activityPlanId: PLAN_ID,
      title: '島嶼散步',
      planName: '半日方案',
      bookingType: 'request',
    },
    request: {
      preferredDate: '2026-09-01',
      backupDate: null,
      startTimeLocal: '09:00',
      partySize: 2,
      language: 'zh-TW',
      pickupRequired: false,
      travelerNote: '想走輕鬆路線',
    },
    plan: planSummary(),
    convertedBookingId: null,
    lastRepliedAt: null,
    expiresAt: null,
    receivedAt: '2026-08-08T01:00:00.000Z',
    updatedAt: '2026-08-08T01:00:00.000Z',
    ...overrides,
  };
}

function bookingDetailProjection() {
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
      contactEmail: 'traveler@example.com',
      contactPhone: '0912345678',
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
      customerNote: '需要低強度路線',
    },
    totalTwd: 3600,
    paymentDeadlineAt: '2026-07-29T00:15:00.000Z',
    receivedAt: '2026-07-28T00:00:00.000Z',
    updatedAt: '2026-07-28T00:00:00.000Z',
    lastMessageAt: null,
    status: {
      bookingStatus: 'draft',
      guideApprovalStatus: 'pending',
      orderStatus: 'pending_payment',
      guideApprovalDecidedAt: null,
      guideApprovalNote: null,
    },
  };
}

test('inquiry detail projection keeps the exact key set plus allowedActions', () => {
  const resolved = resolveMidaoInquiryDetail(inquiryProjection());
  assert.deepEqual(
    Object.keys(resolved).sort(),
    [...PROJECTION_KEYS, 'allowedActions'].sort(),
  );
  assert.deepEqual(Object.keys(resolved.traveler).sort(), ['displayName', 'emailMasked']);
  assert.deepEqual(
    Object.keys(resolved.service).sort(),
    ['activityId', 'activityPlanId', 'bookingType', 'planName', 'title'].sort(),
  );
  assert.deepEqual(
    Object.keys(resolved.request).sort(),
    ['backupDate', 'language', 'partySize', 'pickupRequired', 'preferredDate', 'startTimeLocal', 'travelerNote'].sort(),
  );
  assert.deepEqual(
    Object.keys(resolved.plan).sort(),
    ['activityPlanId', 'basePrice', 'bookingType', 'maxParticipants', 'minParticipants', 'name', 'status'].sort(),
  );
});

test('missing or extra top-level keys are rejected', () => {
  for (const key of PROJECTION_KEYS) {
    const projection = inquiryProjection();
    delete projection[key];
    assert.throws(() => resolveMidaoInquiryDetail(projection), InvalidMidaoInquiryProjectionError, key);
  }
  assert.throws(
    () => resolveMidaoInquiryDetail({ ...inquiryProjection(), travelerUserId: INQUIRY_ID }),
    InvalidMidaoInquiryProjectionError,
  );
});

test('INV-C forbidden PII keys can never enter the projection', () => {
  for (const forbidden of ['travelerUserId', 'guideId', 'questionnaireSnapshot', 'answers']) {
    assert.throws(
      () => resolveMidaoInquiryDetail({ ...inquiryProjection(), [forbidden]: {} }),
      InvalidMidaoInquiryProjectionError,
      forbidden,
    );
  }
  const resolved = resolveMidaoInquiryDetail(inquiryProjection());
  const serialized = JSON.stringify(resolved);
  for (const forbidden of ['travelerUserId', 'guideId', 'questionnaireSnapshot', 'answers']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('requestRef must match inquiry_<inquiryId> and inquiryId must be a uuid', () => {
  assert.throws(
    () => resolveMidaoInquiryDetail(inquiryProjection({ requestRef: `booking_${INQUIRY_ID}` })),
    InvalidMidaoInquiryProjectionError,
  );
  assert.throws(
    () => resolveMidaoInquiryDetail(inquiryProjection({ inquiryId: 'not-a-uuid' })),
    InvalidMidaoInquiryProjectionError,
  );
});

test('bucket and secondaryState must equal resolveRequestBucket output', () => {
  for (const inquiryStatus of ['new', 'opened', 'replied', 'ready_to_convert', 'converted', 'closed', 'expired']) {
    const projection = inquiryProjection({ inquiryStatus });
    const expected = resolveRequestBucket({
      kind: 'inquiry',
      inquiryStatus,
      needsReply: projection.needsReply,
    });
    const resolved = resolveMidaoInquiryDetail(projection);
    assert.equal(resolved.bucket, expected.bucket, inquiryStatus);
    assert.equal(resolved.secondaryState, expected.secondaryState, inquiryStatus);
  }

  assert.throws(
    () => resolveMidaoInquiryDetail(inquiryProjection({ bucket: 'completed' })),
    InvalidMidaoInquiryProjectionError,
  );
});

test('needsReply must be derived from the inquiry status', () => {
  assert.throws(
    () => resolveMidaoInquiryDetail(inquiryProjection({ inquiryStatus: 'new', needsReply: false })),
    InvalidMidaoInquiryProjectionError,
  );
  assert.throws(
    () => resolveMidaoInquiryDetail(inquiryProjection({ inquiryStatus: 'replied', needsReply: true })),
    InvalidMidaoInquiryProjectionError,
  );
  assert.equal(resolveMidaoInquiryDetail(inquiryProjection({ inquiryStatus: 'opened' })).needsReply, true);
});

test('allowedActions follow the inquiry state machine and plan eligibility', () => {
  const cases = [
    { inquiryStatus: 'new', plan: planSummary(), markReplied: true, convertInquiry: false },
    { inquiryStatus: 'opened', plan: planSummary(), markReplied: false, convertInquiry: false },
    { inquiryStatus: 'replied', plan: planSummary(), markReplied: false, convertInquiry: true },
    { inquiryStatus: 'ready_to_convert', plan: planSummary(), markReplied: false, convertInquiry: true },
    { inquiryStatus: 'converted', plan: planSummary(), markReplied: false, convertInquiry: false },
    { inquiryStatus: 'closed', plan: planSummary(), markReplied: false, convertInquiry: false },
    { inquiryStatus: 'expired', plan: planSummary(), markReplied: false, convertInquiry: false },
    { inquiryStatus: 'replied', plan: null, markReplied: false, convertInquiry: false },
    { inquiryStatus: 'replied', plan: planSummary({ status: 'draft' }), markReplied: false, convertInquiry: false },
    {
      inquiryStatus: 'replied',
      plan: planSummary({ bookingType: 'instant' }),
      markReplied: false,
      convertInquiry: false,
    },
  ];

  for (const testCase of cases) {
    const label = `${testCase.inquiryStatus}/${testCase.plan ? testCase.plan.status : 'no-plan'}/${testCase.plan?.bookingType ?? '-'}`;
    const projection = inquiryProjection({ inquiryStatus: testCase.inquiryStatus, plan: testCase.plan });
    if (testCase.plan === null) projection.service.activityPlanId = null;
    const resolved = resolveMidaoInquiryDetail(projection);
    assert.deepEqual(resolved.allowedActions, {
      approve: false,
      reject: false,
      markReplied: testCase.markReplied,
      convertInquiry: testCase.convertInquiry,
    }, label);
  }
});

test('plan summary must agree with service.activityPlanId', () => {
  assert.throws(
    () => resolveMidaoInquiryDetail(inquiryProjection({
      plan: planSummary({ activityPlanId: '99999999-9999-4999-8999-999999999999' }),
    })),
    InvalidMidaoInquiryProjectionError,
  );
  const projection = inquiryProjection({ plan: null });
  projection.service.activityPlanId = null;
  const resolved = resolveMidaoInquiryDetail(projection);
  assert.equal(resolved.plan, null);
  assert.equal(resolved.service.activityPlanId, null);
});

test('resolveMidaoRequestDetail routes inquiry projections without touching booking behaviour', () => {
  const inquiry = resolveMidaoRequestDetail(inquiryProjection());
  assert.equal(inquiry.kind, 'inquiry');
  assert.equal(inquiry.allowedActions.convertInquiry, true);

  const booking = resolveMidaoRequestDetail(bookingDetailProjection());
  assert.equal(booking.kind, 'booking');
  assert.deepEqual(booking.allowedActions, {
    approve: true,
    reject: true,
    markReplied: false,
    convertInquiry: false,
  });

  for (const notInquiry of [null, undefined, 'inquiry', { kind: 'order' }, { kind: 'inquiry ' }]) {
    assert.throws(() => resolveMidaoRequestDetail(notInquiry));
  }
});
