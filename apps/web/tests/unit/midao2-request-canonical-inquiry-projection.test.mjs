import assert from 'node:assert/strict';
import test from 'node:test';

const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GUIDE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TRAVELER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const REQUEST_ID = 'mreq-canonical-projection';
const INQUIRY_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const BOOKING_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ACTIVITY_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const PLAN_ID = '11111111-2222-4333-8444-555555555555';

const requestsModule = await import('../../src/lib/midao/db-midao-requests.mjs');
const inquiriesModule = await import('../../src/lib/midao/db-midao-inquiries.mjs');
const requestProjectionModule = await import('../../src/lib/midao/db-requests.mjs');

function requestRow(overrides = {}) {
  return {
    id: REQUEST_ID,
    request_no: 'R-CANONICAL-001',
    guide_id: GUIDE_ID,
    activity_id: ACTIVITY_ID,
    activity_title_snapshot: '祕島導覽',
    plan_id: PLAN_ID,
    plan_title_snapshot: '半日方案',
    traveler_name: '不可外洩旅人',
    traveler_line_id: 'private-line',
    traveler_email: 'private@example.invalid',
    preferred_date: '2026-09-01',
    backup_date: null,
    preferred_period: 'morning',
    start_time: '09:00',
    end_time: '12:00',
    participants_count: 2,
    participants_note: null,
    language: 'zh-TW',
    need_pickup: false,
    special_note: 'private note',
    answers: [],
    status: 'closed_won',
    source: 'public_page',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    status_changed_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function inquiryRow(overrides = {}) {
  return {
    id: INQUIRY_ID,
    inquiry_no: 'INQ-CANONICAL-001',
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
    traveler_note: 'private inquiry note',
    questionnaire_snapshot: {},
    answers: {},
    last_replied_at: null,
    converted_booking_id: null,
    expires_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function planRow(overrides = {}) {
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
    activity_title: '祕島導覽',
    ...overrides,
  };
}

function resetStores() {
  requestsModule.__resetMemMidaoRequests();
  requestsModule.__resetMemMidaoRequestInquiryMappings();
  inquiriesModule.__resetMidaoInquiryStoreForTest();
  requestProjectionModule.__resetMidaoRequestsStoreForTest();
}

function seedMappedInquiry({ request = requestRow(), inquiry = inquiryRow(), plan = planRow() } = {}) {
  requestsModule.__seedMemMidaoRequests([request]);
  inquiriesModule.__seedMidaoInquiryForTest(inquiry);
  requestProjectionModule.__seedMidaoInquiryPlanForTest(plan);
  requestsModule.__seedMemMidaoRequestInquiryMappings([
    { sourceRequestId: request.id, guideInquiryId: inquiry.id },
  ]);
}

test.beforeEach(resetStores);
test.afterEach(resetStores);

test('owned mapped request returns only canonical conversion defaults and server-derived action', async () => {
  seedMappedInquiry();

  const projection = await requestsModule.getMidaoRequestCanonicalInquiryProjectionDb(GUIDE_ID, REQUEST_ID);

  assert.deepEqual(projection, {
    inquiryId: INQUIRY_ID,
    status: 'replied',
    convertedBookingId: null,
    plan: {
      activityPlanId: PLAN_ID,
      name: '半日方案',
      bookingType: 'request',
      status: 'active',
      minParticipants: 1,
      maxParticipants: 6,
      basePrice: 1800,
    },
    defaults: {
      preferredDate: '2026-09-01',
      startTimeLocal: '09:00',
      participants: 2,
    },
    canConvert: true,
  });
  const serialized = JSON.stringify(projection);
  for (const forbidden of [TRAVELER_ID, 'private@example.invalid', 'private-line', 'private note']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('unmapped, wrong-guide, converted, closed, and expired mappings are no-action without disclosure', async () => {
  requestsModule.__seedMemMidaoRequests([requestRow()]);
  assert.equal(
    await requestsModule.getMidaoRequestCanonicalInquiryProjectionDb(GUIDE_ID, REQUEST_ID),
    null,
  );

  seedMappedInquiry({ inquiry: inquiryRow({ guide_id: OTHER_GUIDE_ID }) });
  assert.equal(
    await requestsModule.getMidaoRequestCanonicalInquiryProjectionDb(GUIDE_ID, REQUEST_ID),
    null,
  );

  for (const inquiry of [
    inquiryRow({ converted_booking_id: BOOKING_ID }),
    inquiryRow({ status: 'closed' }),
    inquiryRow({ status: 'expired' }),
  ]) {
    resetStores();
    seedMappedInquiry({ inquiry });
    const projection = await requestsModule.getMidaoRequestCanonicalInquiryProjectionDb(GUIDE_ID, REQUEST_ID);
    assert.equal(projection?.canConvert, false);
  }
});
