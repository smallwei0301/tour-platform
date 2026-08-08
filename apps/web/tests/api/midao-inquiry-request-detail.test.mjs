import assert from 'node:assert/strict';
import test from 'node:test';

const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GUIDE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TRAVELER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const INQUIRY_ID = '55555555-5555-4555-8555-555555555555';
const ACTIVITY_ID = '33333333-3333-4333-8333-333333333333';
const PLAN_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_ACTIVITY_ID = '66666666-6666-4666-8666-666666666666';
const GUIDE_SESSION_SECRET = 'task42-inquiry-detail-api-test-guide-session-secret-0123456789';

process.env.GUIDE_SESSION_SECRET = GUIDE_SESSION_SECRET;

const { createGuideSessionCookies } = await import('../../src/lib/guide-auth.ts');
const { __setSupabaseClientForTest } = await import('../../src/lib/supabase-env.mjs');
const {
  getMidaoInquiryRequestDb,
  __resetMidaoRequestsStoreForTest,
  __seedMidaoInquiryPlanForTest,
} = await import('../../src/lib/midao/db-requests.mjs');
const {
  __resetMidaoInquiryStoreForTest,
  __seedMidaoInquiryForTest,
} = await import('../../src/lib/midao/db-midao-inquiries.mjs');
const { GET } = await import('../../app/api/v2/guide/requests/[requestRef]/route.ts');

const originalEnv = {
  MIDAO_BACKEND_ENABLED: process.env.MIDAO_BACKEND_ENABLED,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function inquiryRow(overrides = {}) {
  return {
    id: INQUIRY_ID,
    inquiry_no: 'INQ-0001',
    traveler_user_id: TRAVELER_ID,
    guide_id: GUIDE_ID,
    activity_id: ACTIVITY_ID,
    activity_plan_id: PLAN_ID,
    status: 'replied',
    preferred_date: '2026-09-01',
    backup_date: null,
    start_time_local: '09:00',
    party_size: 2,
    language: 'zh-TW',
    pickup_required: false,
    traveler_note: '想走輕鬆路線',
    questionnaire_snapshot: { questions: [{ key: 'child_age' }] },
    answers: { child_age: '7' },
    last_replied_at: '2026-08-08T02:00:00.000Z',
    converted_booking_id: null,
    expires_at: null,
    created_at: '2026-08-08T01:00:00.000Z',
    updated_at: '2026-08-08T02:00:00.000Z',
    ...overrides,
  };
}

function planFixture(overrides = {}) {
  return {
    id: PLAN_ID,
    activity_id: ACTIVITY_ID,
    guide_id: GUIDE_ID,
    name: '半日方案',
    booking_type: 'request',
    status: 'active',
    min_participants: 1,
    max_participants: 6,
    base_price: 1800,
    activity_title: '島嶼散步',
    ...overrides,
  };
}

function useMemoryBackend() {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  __setSupabaseClientForTest(null);
  __resetMidaoInquiryStoreForTest();
  __resetMidaoRequestsStoreForTest();
}

test.afterEach(() => {
  __resetMidaoInquiryStoreForTest();
  __resetMidaoRequestsStoreForTest();
  __setSupabaseClientForTest(null);
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  process.env.GUIDE_SESSION_SECRET = GUIDE_SESSION_SECRET;
});

test('owner inquiry projection carries the exact detail contract and no PII fields', async () => {
  useMemoryBackend();
  __seedMidaoInquiryForTest(inquiryRow());
  __seedMidaoInquiryPlanForTest(planFixture());

  const projection = await getMidaoInquiryRequestDb({ guideId: GUIDE_ID, inquiryId: INQUIRY_ID });

  assert.equal(projection.kind, 'inquiry');
  assert.equal(projection.requestRef, `inquiry_${INQUIRY_ID}`);
  assert.equal(projection.inquiryId, INQUIRY_ID);
  assert.equal(projection.inquiryNo, 'INQ-0001');
  assert.equal(projection.inquiryStatus, 'replied');
  assert.equal(projection.bucket, 'replied');
  assert.equal(projection.needsReply, false);
  assert.deepEqual(projection.traveler, { displayName: null, emailMasked: null });
  assert.deepEqual(projection.service, {
    activityId: ACTIVITY_ID,
    activityPlanId: PLAN_ID,
    title: '島嶼散步',
    planName: '半日方案',
    bookingType: 'request',
  });
  assert.deepEqual(projection.request, {
    preferredDate: '2026-09-01',
    backupDate: null,
    startTimeLocal: '09:00',
    partySize: 2,
    language: 'zh-TW',
    pickupRequired: false,
    travelerNote: '想走輕鬆路線',
  });
  assert.deepEqual(projection.plan, {
    activityPlanId: PLAN_ID,
    name: '半日方案',
    bookingType: 'request',
    status: 'active',
    minParticipants: 1,
    maxParticipants: 6,
    basePrice: 1800,
  });
  assert.equal(projection.receivedAt, '2026-08-08T01:00:00.000Z');
  assert.equal(projection.updatedAt, '2026-08-08T02:00:00.000Z');
  assert.equal(projection.lastRepliedAt, '2026-08-08T02:00:00.000Z');
  assert.equal(projection.convertedBookingId, null);
  assert.equal(projection.expiresAt, null);

  const serialized = JSON.stringify(projection);
  for (const forbidden of ['travelerUserId', 'guideId', 'questionnaireSnapshot', 'answers', TRAVELER_ID]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('another guide and a missing inquiry collapse to the same INQUIRY_NOT_FOUND', async () => {
  useMemoryBackend();
  __seedMidaoInquiryForTest(inquiryRow());
  __seedMidaoInquiryPlanForTest(planFixture());

  await assert.rejects(
    getMidaoInquiryRequestDb({ guideId: OTHER_GUIDE_ID, inquiryId: INQUIRY_ID }),
    /INQUIRY_NOT_FOUND/,
  );
  await assert.rejects(
    getMidaoInquiryRequestDb({ guideId: GUIDE_ID, inquiryId: '77777777-7777-4777-8777-777777777777' }),
    /INQUIRY_NOT_FOUND/,
  );
});

test('null activity_plan_id yields a null plan summary instead of failing', async () => {
  useMemoryBackend();
  __seedMidaoInquiryForTest(inquiryRow({ activity_plan_id: null }));

  const projection = await getMidaoInquiryRequestDb({ guideId: GUIDE_ID, inquiryId: INQUIRY_ID });
  assert.equal(projection.plan, null);
  assert.equal(projection.service.activityPlanId, null);
  assert.equal(projection.service.planName, null);
  assert.equal(projection.service.bookingType, null);
});

test('a plan owned by another guide or another activity is never exposed', async () => {
  useMemoryBackend();
  __seedMidaoInquiryForTest(inquiryRow());
  __seedMidaoInquiryPlanForTest(planFixture({ guide_id: OTHER_GUIDE_ID }));
  let projection = await getMidaoInquiryRequestDb({ guideId: GUIDE_ID, inquiryId: INQUIRY_ID });
  assert.equal(projection.plan, null);

  __resetMidaoRequestsStoreForTest();
  __seedMidaoInquiryPlanForTest(planFixture({ activity_id: OTHER_ACTIVITY_ID }));
  projection = await getMidaoInquiryRequestDb({ guideId: GUIDE_ID, inquiryId: INQUIRY_ID });
  assert.equal(projection.plan, null);
});

test('inquiry detail route returns the resolved projection with allowedActions', async () => {
  useMemoryBackend();
  process.env.MIDAO_BACKEND_ENABLED = '1';
  __seedMidaoInquiryForTest(inquiryRow());
  __seedMidaoInquiryPlanForTest(planFixture());

  const cookie = createGuideSessionCookies(GUIDE_ID, 'Cookie Guide Name', 7)
    .map((value) => value.split(';')[0]).join('; ');
  const response = await GET(
    new Request('https://example.test/api/v2/guide/requests/detail', { headers: { cookie } }),
    { params: Promise.resolve({ requestRef: `inquiry_${INQUIRY_ID}` }) },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.kind, 'inquiry');
  assert.equal(body.data.inquiryId, INQUIRY_ID);
  assert.deepEqual(body.data.allowedActions, {
    approve: false,
    reject: false,
    markReplied: false,
    convertInquiry: true,
  });
});

test('inquiry detail route keeps a sanitized 404 for another guide', async () => {
  useMemoryBackend();
  process.env.MIDAO_BACKEND_ENABLED = '1';
  __seedMidaoInquiryForTest(inquiryRow({ guide_id: OTHER_GUIDE_ID }));

  const cookie = createGuideSessionCookies(GUIDE_ID, 'Cookie Guide Name', 7)
    .map((value) => value.split(';')[0]).join('; ');
  const response = await GET(
    new Request('https://example.test/api/v2/guide/requests/detail', { headers: { cookie } }),
    { params: Promise.resolve({ requestRef: `inquiry_${INQUIRY_ID}` }) },
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    success: false,
    error: { code: 'NOT_FOUND', message: 'Resource not found' },
  });
});
