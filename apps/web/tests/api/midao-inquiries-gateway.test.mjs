import assert from 'node:assert/strict';
import test from 'node:test';

import { __setSupabaseClientForTest } from '../../src/lib/supabase-env.mjs';

const moduleUrl = new URL('../../src/lib/midao/db-midao-inquiries.mjs', import.meta.url);

async function loadGateway() {
  try {
    return await import(moduleUrl);
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') {
      assert.fail('inquiry gateway module/behavior is absent');
    }
    throw error;
  }
}

const IDS = {
  inquiry: '11111111-1111-4111-8111-111111111111',
  otherInquiry: '11111111-1111-4111-8111-111111111112',
  traveler: '22222222-2222-4222-8222-222222222222',
  otherTraveler: '22222222-2222-4222-8222-222222222223',
  guide: '33333333-3333-4333-8333-333333333333',
  otherGuide: '33333333-3333-4333-8333-333333333334',
  activity: '44444444-4444-4444-8444-444444444444',
  plan: '55555555-5555-4555-8555-555555555555',
};
const CLOCK = '2026-08-04T08:00:00.000Z';

function createInput(overrides = {}) {
  return {
    travelerUserId: IDS.traveler,
    guideId: IDS.guide,
    activityId: IDS.activity,
    activityPlanId: IDS.plan,
    preferredDate: '2026-08-20',
    backupDate: '2026-08-21',
    startTimeLocal: '09:30',
    partySize: 2,
    language: 'zh-TW',
    pickupRequired: true,
    travelerNote: '需要兒童救生衣',
    questionnaireSnapshot: {
      version: 1,
      questions: [{ key: 'child_age', type: 'short_text', required: false }],
    },
    answers: { child_age: '7' },
    ...overrides,
  };
}

function rawInquiry(overrides = {}) {
  return {
    id: IDS.inquiry,
    inquiry_no: 'INQ-0001',
    traveler_user_id: IDS.traveler,
    guide_id: IDS.guide,
    activity_id: IDS.activity,
    activity_plan_id: IDS.plan,
    status: 'new',
    preferred_date: '2026-08-20',
    backup_date: '2026-08-21',
    start_time_local: '09:30:00',
    party_size: 2,
    language: 'zh-TW',
    pickup_required: true,
    traveler_note: '需要兒童救生衣',
    questionnaire_snapshot: {
      version: 1,
      questions: [{ key: 'child_age', type: 'short_text', required: false }],
    },
    answers: { child_age: '7' },
    last_replied_at: null,
    converted_booking_id: null,
    expires_at: null,
    created_at: '2026-08-04T07:00:00.000Z',
    updated_at: '2026-08-04T07:00:00.000Z',
    ...overrides,
  };
}

function createSupabaseFake(initialRows = []) {
  const rows = structuredClone(initialRows);
  const calls = [];

  function matching(filters) {
    return rows.filter((row) => filters.every(([field, value]) => row[field] === value));
  }

  return {
    calls,
    supabase: {
      from(table) {
        assert.equal(table, 'guide_inquiries');
        return {
          select() {
            const filters = [];
            const query = {
              eq(field, value) { filters.push([field, value]); return query; },
              maybeSingle() {
                return Promise.resolve({ data: structuredClone(matching(filters)[0] ?? null), error: null });
              },
              order(field, options) {
                const data = matching(filters)
                  .sort((left, right) => String(right[field]).localeCompare(String(left[field])));
                calls.push({ type: 'order', field, options: structuredClone(options) });
                return Promise.resolve({ data: structuredClone(data), error: null });
              },
            };
            return query;
          },
          insert(record) {
            calls.push({ type: 'insert', record: structuredClone(record) });
            const query = {
              select() { return query; },
              maybeSingle() {
                const inserted = {
                  last_replied_at: null,
                  converted_booking_id: null,
                  expires_at: null,
                  created_at: CLOCK,
                  updated_at: CLOCK,
                  ...structuredClone(record),
                };
                rows.push(inserted);
                return Promise.resolve({ data: structuredClone(inserted), error: null });
              },
            };
            return query;
          },
          update(patch) {
            calls.push({ type: 'update', patch: structuredClone(patch) });
            const filters = [];
            const query = {
              eq(field, value) { filters.push([field, value]); return query; },
              select() { return query; },
              maybeSingle() {
                const row = matching(filters)[0] ?? null;
                if (row) Object.assign(row, structuredClone(patch));
                return Promise.resolve({ data: structuredClone(row), error: null });
              },
            };
            return query;
          },
        };
      },
    },
  };
}

async function setupMemory() {
  const gateway = await loadGateway();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  __setSupabaseClientForTest(null);
  gateway.__resetMidaoInquiryStoreForTest();
  gateway.__setMidaoInquiryClockForTest(CLOCK);
  return gateway;
}

test.afterEach(async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  __setSupabaseClientForTest(null);
  const gateway = await loadGateway();
  gateway.__resetMidaoInquiryStoreForTest();
  gateway.__setMidaoInquiryClockForTest(null);
});

test('create stores immutable questionnaire snapshot and answers as a new inquiry', async () => {
  const gateway = await setupMemory();
  const input = createInput();
  const result = await gateway.createMidaoInquiryDb(input);

  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.equal(result.code, 'CREATED');
  assert.equal(result.inquiry.status, 'new');
  assert.equal(result.inquiry.travelerUserId, IDS.traveler);
  assert.equal(result.inquiry.guideId, IDS.guide);
  assert.deepEqual(result.inquiry.questionnaireSnapshot, input.questionnaireSnapshot);
  assert.deepEqual(result.inquiry.answers, input.answers);
  assert.equal(result.inquiry.createdAt, CLOCK);

  input.questionnaireSnapshot.questions[0].key = 'mutated';
  input.answers.child_age = '8';
  const detail = await gateway.getMidaoInquiryDetailDb({
    inquiryId: result.inquiry.id,
    actor: { role: 'traveler', id: IDS.traveler },
  });
  assert.equal(detail.ok, true);
  assert.equal(detail.inquiry.questionnaireSnapshot.questions[0].key, 'child_age');
  assert.equal(detail.inquiry.answers.child_age, '7');
});

test('list and detail enforce the traveler or guide ownership boundary without existence leaks', async () => {
  const gateway = await setupMemory();
  gateway.__seedMidaoInquiryForTest(rawInquiry());
  gateway.__seedMidaoInquiryForTest(rawInquiry({
    id: IDS.otherInquiry,
    inquiry_no: 'INQ-0002',
    traveler_user_id: IDS.otherTraveler,
    guide_id: IDS.otherGuide,
  }));

  const travelerList = await gateway.listMidaoInquiriesDb({ actor: { role: 'traveler', id: IDS.traveler } });
  assert.deepEqual(travelerList.inquiries.map((inquiry) => inquiry.id), [IDS.inquiry]);
  const guideList = await gateway.listMidaoInquiriesDb({ actor: { role: 'guide', id: IDS.guide } });
  assert.deepEqual(guideList.inquiries.map((inquiry) => inquiry.id), [IDS.inquiry]);

  const ownDetail = await gateway.getMidaoInquiryDetailDb({
    inquiryId: IDS.inquiry,
    actor: { role: 'guide', id: IDS.guide },
  });
  assert.equal(ownDetail.ok, true);
  assert.deepEqual(ownDetail.inquiry.answers, { child_age: '7' });

  for (const actor of [
    { role: 'traveler', id: IDS.otherTraveler },
    { role: 'guide', id: IDS.otherGuide },
  ]) {
    const denied = await gateway.getMidaoInquiryDetailDb({ inquiryId: IDS.inquiry, actor });
    assert.deepEqual(denied, { ok: false, status: 404, code: 'INQUIRY_NOT_FOUND', inquiry: null });
  }
});

test('mark replied is guide-owned and allows only the Task 33 new-to-replied transition', async () => {
  const gateway = await setupMemory();
  gateway.__seedMidaoInquiryForTest(rawInquiry());

  const denied = await gateway.markMidaoInquiryRepliedDb({ inquiryId: IDS.inquiry, guideId: IDS.otherGuide });
  assert.deepEqual(denied, { ok: false, status: 404, code: 'INQUIRY_NOT_FOUND', inquiry: null });

  const replied = await gateway.markMidaoInquiryRepliedDb({ inquiryId: IDS.inquiry, guideId: IDS.guide });
  assert.equal(replied.ok, true);
  assert.equal(replied.inquiry.status, 'replied');
  assert.equal(replied.inquiry.lastRepliedAt, CLOCK);

  // #1916 契約變更：已是 replied 的重複呼叫不再回 409，改為自然冪等的 replayed 200（見下方專屬測試）。
  const repeated = await gateway.markMidaoInquiryRepliedDb({ inquiryId: IDS.inquiry, guideId: IDS.guide });
  assert.equal(repeated.ok, true);
  assert.equal(repeated.status, 200);
  assert.equal(repeated.replayed, true);

  gateway.__seedMidaoInquiryForTest(rawInquiry({ id: IDS.otherInquiry, inquiry_no: 'INQ-0002', status: 'opened' }));
  const opened = await gateway.markMidaoInquiryRepliedDb({ inquiryId: IDS.otherInquiry, guideId: IDS.guide });
  assert.deepEqual(opened, { ok: false, status: 409, code: 'INVALID_INQUIRY_STATE', inquiry: null });
});

test('#1916 mark replied: first transition is replayed:false, repeat is a no-write replayed 200', async () => {
  const gateway = await setupMemory();
  gateway.__seedMidaoInquiryForTest(rawInquiry());

  const first = await gateway.markMidaoInquiryRepliedDb({ inquiryId: IDS.inquiry, guideId: IDS.guide });
  assert.equal(first.ok, true);
  assert.equal(first.status, 200);
  assert.equal(first.replayed, false);
  assert.equal(first.inquiry.lastRepliedAt, CLOCK);

  gateway.__setMidaoInquiryClockForTest('2026-08-04T09:30:00.000Z');
  const second = await gateway.markMidaoInquiryRepliedDb({ inquiryId: IDS.inquiry, guideId: IDS.guide });
  assert.equal(second.ok, true);
  assert.equal(second.status, 200);
  assert.equal(second.code, 'REPLIED');
  assert.equal(second.replayed, true);
  assert.equal(second.inquiry.lastRepliedAt, first.inquiry.lastRepliedAt);
  assert.equal(second.inquiry.updatedAt, first.inquiry.updatedAt);
  assert.deepEqual(second.inquiry, first.inquiry);
  // 回傳值之外，store 本身也不得被改寫（lastRepliedAt／updatedAt 保持第一次轉移時的值）。
  const stored = await gateway.getMidaoInquiryDetailDb({
    inquiryId: IDS.inquiry,
    actor: { role: 'guide', id: IDS.guide },
  });
  assert.deepEqual(stored.inquiry, first.inquiry);
});

test('#1916 mark replied replay stays guide-owned and other states still reject with 409', async () => {
  const gateway = await setupMemory();
  gateway.__seedMidaoInquiryForTest(rawInquiry({ status: 'replied', last_replied_at: CLOCK }));
  const foreign = await gateway.markMidaoInquiryRepliedDb({ inquiryId: IDS.inquiry, guideId: IDS.otherGuide });
  assert.deepEqual(foreign, { ok: false, status: 404, code: 'INQUIRY_NOT_FOUND', inquiry: null });

  for (const [index, status] of ['opened', 'ready_to_convert', 'converted', 'closed', 'expired'].entries()) {
    const id = `11111111-1111-4111-8111-1111111111${30 + index}`;
    gateway.__seedMidaoInquiryForTest(rawInquiry({
      id,
      inquiry_no: `INQ-${status}`,
      status,
      converted_booking_id: status === 'converted' ? '66666666-6666-4666-8666-666666666666' : null,
    }));
    const result = await gateway.markMidaoInquiryRepliedDb({ inquiryId: id, guideId: IDS.guide });
    assert.deepEqual(result, { ok: false, status: 409, code: 'INVALID_INQUIRY_STATE', inquiry: null }, status);
  }
});

test('#1916 Supabase mark replied: repeat on replied performs no second update', async () => {
  const gateway = await setupMemory();
  const fake = createSupabaseFake([rawInquiry()]);
  process.env.SUPABASE_URL = 'http://example.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  __setSupabaseClientForTest(fake.supabase);

  const first = await gateway.markMidaoInquiryRepliedDb({ inquiryId: IDS.inquiry, guideId: IDS.guide });
  assert.equal(first.replayed, false);
  assert.equal(fake.calls.filter((call) => call.type === 'update').length, 1);

  gateway.__setMidaoInquiryClockForTest('2026-08-04T09:30:00.000Z');
  const second = await gateway.markMidaoInquiryRepliedDb({ inquiryId: IDS.inquiry, guideId: IDS.guide });
  assert.equal(second.ok, true);
  assert.equal(second.replayed, true);
  assert.deepEqual(second.inquiry, first.inquiry);
  assert.equal(fake.calls.filter((call) => call.type === 'update').length, 1, 'replay must not write');

  const foreign = await gateway.markMidaoInquiryRepliedDb({ inquiryId: IDS.inquiry, guideId: IDS.otherGuide });
  assert.equal(foreign.code, 'INQUIRY_NOT_FOUND');
});

test('#1916 Supabase mark replied: CAS loser whose latest row is replied gets a replayed result', async () => {
  const gateway = await setupMemory();
  const winnerAt = '2026-08-04T08:30:00.000Z';
  const rows = [rawInquiry()];
  const updates = [];
  const racing = {
    from() {
      return {
        select() {
          const filters = [];
          const query = {
            eq(field, value) { filters.push([field, value]); return query; },
            maybeSingle() {
              const row = rows.find((candidate) => filters.every(([f, v]) => candidate[f] === v));
              return Promise.resolve({ data: structuredClone(row ?? null), error: null });
            },
          };
          return query;
        },
        update(patch) {
          updates.push(structuredClone(patch));
          const query = {
            eq() { return query; },
            select() { return query; },
            maybeSingle() {
              // 另一個並行請求在我們 CAS 之前先贏了：列已被它轉為 replied，我方 CAS 不命中。
              Object.assign(rows[0], { status: 'replied', last_replied_at: winnerAt, updated_at: winnerAt });
              return Promise.resolve({ data: null, error: null });
            },
          };
          return query;
        },
      };
    },
  };
  process.env.SUPABASE_URL = 'http://example.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  __setSupabaseClientForTest(racing);

  const loser = await gateway.markMidaoInquiryRepliedDb({ inquiryId: IDS.inquiry, guideId: IDS.guide });
  assert.equal(loser.ok, true);
  assert.equal(loser.status, 200);
  assert.equal(loser.replayed, true);
  assert.equal(loser.inquiry.status, 'replied');
  assert.equal(loser.inquiry.lastRepliedAt, winnerAt);
  assert.equal(updates.length, 1);
});

test('fails closed on unsupported input and invalid state fixtures', async () => {
  const gateway = await setupMemory();

  const invalidCreate = await gateway.createMidaoInquiryDb(createInput({ questionnaireSnapshot: [] }));
  assert.deepEqual(invalidCreate, { ok: false, status: 422, code: 'INVALID_INQUIRY_INPUT', inquiry: null });
  const invalidActor = await gateway.listMidaoInquiriesDb({ actor: { role: 'admin', id: IDS.guide } });
  assert.deepEqual(invalidActor, { ok: false, status: 422, code: 'INVALID_INQUIRY_ACTOR', inquiries: [] });
  assert.throws(
    () => gateway.__seedMidaoInquiryForTest(rawInquiry({ status: 'unsupported' })),
    /fixture status is invalid/,
  );
});

test('Supabase list/detail/mark-replied stay semantically aligned with the in-memory gateway', async () => {
  const gateway = await setupMemory();
  const row = rawInquiry();
  gateway.__seedMidaoInquiryForTest(row);
  const memoryList = await gateway.listMidaoInquiriesDb({ actor: { role: 'guide', id: IDS.guide } });
  const memoryDetail = await gateway.getMidaoInquiryDetailDb({
    inquiryId: IDS.inquiry,
    actor: { role: 'traveler', id: IDS.traveler },
  });
  const memoryReply = await gateway.markMidaoInquiryRepliedDb({ inquiryId: IDS.inquiry, guideId: IDS.guide });

  const fake = createSupabaseFake([row]);
  process.env.SUPABASE_URL = 'http://example.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  __setSupabaseClientForTest(fake.supabase);

  const remoteList = await gateway.listMidaoInquiriesDb({ actor: { role: 'guide', id: IDS.guide } });
  const remoteDetail = await gateway.getMidaoInquiryDetailDb({
    inquiryId: IDS.inquiry,
    actor: { role: 'traveler', id: IDS.traveler },
  });
  const remoteReply = await gateway.markMidaoInquiryRepliedDb({ inquiryId: IDS.inquiry, guideId: IDS.guide });

  assert.deepEqual(remoteList, memoryList);
  assert.deepEqual(remoteDetail, memoryDetail);
  assert.deepEqual(remoteReply, memoryReply);
  assert.ok(fake.calls.some((call) => call.type === 'update'));
});

test('Supabase create writes the same questionnaire snapshot and answers columns', async () => {
  const gateway = await setupMemory();
  const fake = createSupabaseFake();
  process.env.SUPABASE_URL = 'http://example.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  __setSupabaseClientForTest(fake.supabase);

  const input = createInput();
  const result = await gateway.createMidaoInquiryDb(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.inquiry.questionnaireSnapshot, input.questionnaireSnapshot);
  assert.deepEqual(result.inquiry.answers, input.answers);
  const insert = fake.calls.find((call) => call.type === 'insert');
  assert.deepEqual(insert.record.questionnaire_snapshot, input.questionnaireSnapshot);
  assert.deepEqual(insert.record.answers, input.answers);
});
