import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const moduleUrl = new URL(
  '../../src/lib/midao/midao-request-inquiry-adapter.ts',
  import.meta.url,
);

let adapterModule;
let importError = null;
try {
  adapterModule = await import(moduleUrl);
} catch (error) {
  importError = error;
}

function adapt(input) {
  assert.equal(
    importError,
    null,
    `adapter module/export is absent: ${importError?.message ?? 'unknown import error'}`,
  );
  assert.equal(
    typeof adapterModule?.adaptMidaoRequestToInquiryDraft,
    'function',
    'adapter module/export is absent: adaptMidaoRequestToInquiryDraft',
  );
  return adapterModule.adaptMidaoRequestToInquiryDraft(input);
}

const IDS = {
  request: 'mreq_000001',
  inquiry: '88888888-8888-4888-8888-888888888888',
  guide: '11111111-1111-4111-8111-111111111111',
  otherGuide: '22222222-2222-4222-8222-222222222222',
  activity: '33333333-3333-4333-8333-333333333333',
  otherActivity: '44444444-4444-4444-8444-444444444444',
  plan: '55555555-5555-4555-8555-555555555555',
  otherPlan: '66666666-6666-4666-8666-666666666666',
  traveler: '77777777-7777-4777-8777-777777777777',
};

const CONTACT = {
  displayName: '王小明',
  lineId: 'midao-traveler',
  email: 'traveler@example.com',
};

function validRequest(overrides = {}) {
  return {
    id: IDS.request,
    requestRef: 'R20260901001',
    preferredDate: '2026-09-01',
    backupDate: '2026-09-02',
    preferredPeriod: 'morning',
    startTime: '09:00',
    endTime: '12:00',
    participantsCount: 3,
    answers: [
      { questionId: 'pace', label: '偏好的步調', answer: '慢慢走' },
      { questionId: 'diet', label: '飲食需求', answer: '無' },
    ],
    contactSnapshot: CONTACT,
    ...overrides,
  };
}

function validResolved(overrides = {}) {
  return {
    activity: {
      id: IDS.activity,
      guideId: IDS.guide,
    },
    plan: {
      id: IDS.plan,
      activityId: IDS.activity,
      bookingType: 'request',
      status: 'active',
    },
    traveler: {
      userId: IDS.traveler,
      contactSnapshot: CONTACT,
    },
    existingSource: null,
    ...overrides,
  };
}

function validInput(overrides = {}) {
  return {
    midaoRequest: {
      ...validRequest(),
      ...(overrides.midaoRequest ?? {}),
    },
    guideActor: {
      guideId: IDS.guide,
      ...(overrides.guideActor ?? {}),
    },
    resolved: {
      ...validResolved(),
      ...(overrides.resolved ?? {}),
    },
  };
}

function violationCodes(result) {
  return result.violations.map((violation) => violation.code);
}

function assertViolation(result, code) {
  assert.equal(result.valid, false);
  assert.ok(
    violationCodes(result).includes(code),
    `expected ${code}, got ${JSON.stringify(violationCodes(result))}`,
  );
}

function assertNoPiiInViolations(result) {
  assert.equal(result.valid, false);
  const serialized = JSON.stringify(result.violations);
  for (const secret of [
    IDS.guide,
    IDS.otherGuide,
    IDS.activity,
    IDS.plan,
    IDS.traveler,
    CONTACT.displayName,
    CONTACT.lineId,
    CONTACT.email,
    '<script>',
  ]) {
    assert.equal(serialized.includes(secret), false, `violation leaked ${secret}`);
  }
  for (const violation of result.violations) {
    assert.deepEqual(Object.keys(violation).sort(), ['code', 'field', 'messageZh']);
    assert.equal(typeof violation.messageZh, 'string');
    assert.ok(violation.messageZh.length > 0);
  }
}

test('projects a deterministic draft from authoritative activity, plan, guide, and traveler context', () => {
  const input = validInput({
    midaoRequest: {
      guideId: IDS.otherGuide,
      activityId: IDS.otherActivity,
      planId: IDS.otherPlan,
      contactSnapshot: {
        displayName: '不可信來源',
        lineId: 'untrusted-line',
        email: 'untrusted@example.com',
      },
    },
  });
  const before = structuredClone(input);

  const first = adapt(input);
  const second = adapt(input);

  assert.equal(first.valid, true);
  assert.equal(first.replayed, false);
  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.match(first.draft.source.payloadHash, /^[0-9a-f]{64}$/u);
  assert.deepEqual(first.draft, {
    source: {
      kind: 'midao_request',
      id: IDS.request,
      requestRef: 'R20260901001',
      payloadHash: first.draft.source.payloadHash,
    },
    guideId: IDS.guide,
    activityId: IDS.activity,
    activityPlanId: IDS.plan,
    travelerUserId: IDS.traveler,
    preferredDate: '2026-09-01',
    backupDate: '2026-09-02',
    preferredPeriod: 'morning',
    startTimeLocal: '09:00',
    endTimeLocal: '12:00',
    partySize: 3,
    questionnaire: [
      { questionId: 'pace', label: '偏好的步調', answer: '慢慢走' },
      { questionId: 'diet', label: '飲食需求', answer: '無' },
    ],
    contactSnapshot: CONTACT,
  });
});

test('rejects a guide actor that does not own the resolved activity', () => {
  const result = adapt(validInput({ guideActor: { guideId: IDS.otherGuide } }));
  assertViolation(result, 'GUIDE_MISMATCH');
  assertNoPiiInViolations(result);
});

test('rejects a missing or malformed resolved activity before projecting any plan', () => {
  for (const activity of [null, { id: '', guideId: IDS.guide }]) {
    const result = adapt(validInput({ resolved: { activity } }));
    assertViolation(result, 'ACTIVITY_NOT_FOUND');
    assertNoPiiInViolations(result);
  }
});

test('rejects missing, inactive, mismatched, and non-request plans', () => {
  const cases = [
    { plan: null, code: 'PLAN_NOT_FOUND' },
    { plan: { id: IDS.plan, activityId: IDS.otherActivity }, code: 'PLAN_ACTIVITY_MISMATCH' },
    { plan: { id: IDS.plan, status: 'inactive' }, code: 'PLAN_INACTIVE' },
    { plan: { id: IDS.plan, bookingType: 'instant' }, code: 'PLAN_BOOKING_TYPE_NOT_REQUEST' },
  ];

  for (const { plan, code } of cases) {
    const result = adapt(validInput({ resolved: { plan } }));
    assertViolation(result, code);
    assertNoPiiInViolations(result);
  }
});

test('rejects a missing canonical traveler identity without trusting request contact fields', () => {
  const result = adapt(validInput({ resolved: { traveler: null } }));
  assertViolation(result, 'TRAVELER_IDENTITY_MISSING');
  assertNoPiiInViolations(result);
});

test('rejects malformed, hostile, and oversized questionnaire answers without echoing them', () => {
  const malformed = adapt(validInput({
    midaoRequest: {
      answers: [{ questionId: 'pace', label: '步調', answer: { html: '<script>alert(1)</script>' } }],
    },
  }));
  assertViolation(malformed, 'ANSWERS_INVALID');
  assertNoPiiInViolations(malformed);

  const oversized = adapt(validInput({
    midaoRequest: {
      answers: Array.from({ length: 21 }, (_, index) => ({
        questionId: `question_${index}`,
        label: '題目',
        answer: '回答',
      })),
    },
  }));
  assertViolation(oversized, 'ANSWERS_TOO_LARGE');
  assertNoPiiInViolations(oversized);
});

test('returns the same canonical draft as a replay when source and hash match', () => {
  const first = adapt(validInput());
  assert.equal(first.valid, true);

  const replay = adapt(validInput({
    resolved: {
      existingSource: {
        kind: 'midao_request',
        id: IDS.request,
        payloadHash: first.draft.source.payloadHash,
        inquiryId: IDS.inquiry,
      },
    },
  }));

  assert.equal(replay.valid, true);
  assert.equal(replay.replayed, true);
  assert.equal(replay.existingInquiryId, IDS.inquiry);
  assert.deepEqual(replay.draft, first.draft);
});

test('rejects a same-source payload hash conflict without exposing source details', () => {
  const result = adapt(validInput({
    resolved: {
      existingSource: {
        kind: 'midao_request',
        id: IDS.request,
        payloadHash: '0'.repeat(64),
        inquiryId: IDS.inquiry,
      },
    },
  }));

  assertViolation(result, 'SOURCE_HASH_CONFLICT');
  assertNoPiiInViolations(result);
});

test('returns stable non-PII violations for invalid source identity and contact snapshot', () => {
  const result = adapt(validInput({
    midaoRequest: {
      id: '',
      contactSnapshot: {
        displayName: '',
        email: 'private@example.com',
      },
    },
  }));

  assertViolation(result, 'SOURCE_INVALID');
  assertNoPiiInViolations(result);
});

test('adapter source is pure and has no database, HTTP, clock, or environment access', () => {
  const source = readFileSync(moduleUrl, 'utf8');
  for (const forbidden of [
    'midao_requests',
    'guide_inquiries',
    'bookings',
    'orders',
    'fetch(',
    'process.env',
    'new Date(',
    'Date.now(',
    'Math.random(',
  ]) {
    assert.equal(source.includes(forbidden), false, `adapter contains ${forbidden}`);
  }
});
