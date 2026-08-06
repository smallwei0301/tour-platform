/**
 * #1759 Package 4／Task 37：inquiry conversion 純函式輸入驗證。
 *
 * 契約來源（唯一權威）：
 * docs/operations/session-handoffs/2026-08-06-issue1759-task37-inquiry-conversion-validation-plan.md
 * §2.1 型別契約、§2.2 十二步固定檢查順序、§2.3 七大類測試矩陣。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const {
  CONVERSION_CONFIRMATION_TTL_MIN_HOURS,
  CONVERSION_CONFIRMATION_TTL_MAX_HOURS,
  CONVERSION_TARGET_INQUIRY_STATE,
  validateInquiryConversion,
} = await import('../../src/lib/midao/inquiry-conversion.ts');

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = resolve(__dirname, '../../src/lib/midao/inquiry-conversion.ts');

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;
const EMAIL_REGEX = /[^\s@]+@[^\s@]+\.[^\s@]+/u;

const GUIDE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_GUIDE_ID = '22222222-2222-4222-8222-222222222222';
const ACTIVITY_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_ACTIVITY_ID = '44444444-4444-4444-8444-444444444444';
const PLAN_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_PLAN_ID = '66666666-6666-4666-8666-666666666666';
const INQUIRY_ID = '77777777-7777-4777-8777-777777777777';
const BOOKING_ID = '88888888-8888-4888-8888-888888888888';

function validInquiry(overrides = {}) {
  return {
    id: INQUIRY_ID,
    guideId: GUIDE_ID,
    activityId: ACTIVITY_ID,
    status: 'replied',
    convertedBookingId: null,
    ...overrides,
  };
}

function validPlan(overrides = {}) {
  return {
    id: PLAN_ID,
    activityId: ACTIVITY_ID,
    guideId: GUIDE_ID,
    bookingType: 'request',
    status: 'active',
    minParticipants: 2,
    maxParticipants: 6,
    ...overrides,
  };
}

function validCommand(overrides = {}) {
  return {
    activityPlanId: PLAN_ID,
    startAt: '2026-09-01T02:00:00.000Z',
    endAt: '2026-09-01T06:00:00.000Z',
    participants: 3,
    quotedTotalTwd: 3600,
    guideNote: null,
    confirmationTtlHours: 24,
    ...overrides,
  };
}

function validInput(overrides = {}) {
  const { inquiry, plan, command, ...rest } = overrides;
  return {
    inquiry: validInquiry(inquiry),
    plan: plan === null ? null : validPlan(plan),
    command: validCommand(command),
    actorGuideId: GUIDE_ID,
    ...rest,
  };
}

function codesOf(result) {
  return result.violations.map((violation) => violation.code);
}

function assertValid(result) {
  assert.equal(result.valid, true);
  assert.deepStrictEqual([...result.violations], []);
}

function assertHasCode(result, code) {
  assert.equal(result.valid, false);
  assert.ok(
    codesOf(result).includes(code),
    `expected violation ${code}, got ${JSON.stringify(codesOf(result))}`,
  );
}

// ---------------------------------------------------------------------------
// 常數契約
// ---------------------------------------------------------------------------

test('exports the planned TTL bounds and conversion target state', () => {
  assert.equal(CONVERSION_CONFIRMATION_TTL_MIN_HOURS, 1);
  assert.equal(CONVERSION_CONFIRMATION_TTL_MAX_HOURS, 24);
  assert.equal(CONVERSION_TARGET_INQUIRY_STATE, 'converted');
});

test('accepts a fully valid conversion input', () => {
  assertValid(validInquiryConversionResult());
});

function validInquiryConversionResult() {
  return validateInquiryConversion(validInput());
}

// ---------------------------------------------------------------------------
// 1) 輸入形狀（唯一短路點）
// ---------------------------------------------------------------------------

test('short-circuits on non-object input with a single INVALID_INPUT_SHAPE', () => {
  for (const bad of [null, undefined, 'x', 42, []]) {
    const result = validateInquiryConversion(bad);
    assert.equal(result.valid, false);
    assert.deepStrictEqual(codesOf(result), ['INVALID_INPUT_SHAPE']);
  }
});

test('short-circuits when inquiry or command is not an object', () => {
  for (const patch of [{ inquiry: null }, { command: null }, { inquiry: 'x' }, { command: 7 }]) {
    const result = validateInquiryConversion({ ...validInput(), ...patch });
    assert.deepStrictEqual(codesOf(result), ['INVALID_INPUT_SHAPE']);
  }
});

// ---------------------------------------------------------------------------
// 2) state legality
// ---------------------------------------------------------------------------

test('accepts the two convertible inquiry states', () => {
  for (const status of ['replied', 'ready_to_convert']) {
    assertValid(validateInquiryConversion(validInput({ inquiry: { status } })));
  }
});

test('rejects inquiry states that cannot transition to converted', () => {
  for (const status of ['new', 'opened', 'closed', 'expired', 'converted']) {
    const result = validateInquiryConversion(validInput({ inquiry: { status } }));
    assertHasCode(result, 'INQUIRY_STATE_NOT_CONVERTIBLE');
  }
});

test('rejects an inquiry that already has a converted booking even when state is legal', () => {
  const result = validateInquiryConversion(
    validInput({ inquiry: { status: 'replied', convertedBookingId: BOOKING_ID } }),
  );
  assertHasCode(result, 'INQUIRY_ALREADY_CONVERTED');
  assert.ok(!codesOf(result).includes('INQUIRY_STATE_NOT_CONVERTIBLE'));
});

// ---------------------------------------------------------------------------
// 3) plan ownership / actor
// ---------------------------------------------------------------------------

test('rejects when the acting guide does not own the inquiry', () => {
  const result = validateInquiryConversion({ ...validInput(), actorGuideId: OTHER_GUIDE_ID });
  assertHasCode(result, 'INQUIRY_GUIDE_MISMATCH');
});

test('rejects a missing plan and skips plan-derived checks', () => {
  const result = validateInquiryConversion(validInput({ plan: null }));
  assertHasCode(result, 'PLAN_NOT_FOUND_IN_INPUT');
  for (const skipped of [
    'PLAN_ACTIVITY_MISMATCH',
    'PLAN_GUIDE_MISMATCH',
    'PLAN_INACTIVE',
    'PLAN_BOOKING_TYPE_NOT_REQUEST',
    'PARTICIPANTS_BELOW_PLAN_MIN',
    'PARTICIPANTS_ABOVE_PLAN_MAX',
  ]) {
    assert.ok(!codesOf(result).includes(skipped), `should not emit ${skipped} without a plan`);
  }
});

test('rejects when the supplied plan is not the one the command targets', () => {
  const result = validateInquiryConversion(
    validInput({ command: { activityPlanId: OTHER_PLAN_ID } }),
  );
  assertHasCode(result, 'PLAN_NOT_FOUND_IN_INPUT');
});

test('rejects a plan belonging to a different activity', () => {
  const result = validateInquiryConversion(
    validInput({ plan: { activityId: OTHER_ACTIVITY_ID } }),
  );
  assertHasCode(result, 'PLAN_ACTIVITY_MISMATCH');
});

test('rejects a plan owned by another guide', () => {
  const result = validateInquiryConversion(validInput({ plan: { guideId: OTHER_GUIDE_ID } }));
  assertHasCode(result, 'PLAN_GUIDE_MISMATCH');
});

test('rejects an inactive plan', () => {
  const result = validateInquiryConversion(validInput({ plan: { status: 'inactive' } }));
  assertHasCode(result, 'PLAN_INACTIVE');
});

// ---------------------------------------------------------------------------
// 4) booking type
// ---------------------------------------------------------------------------

test('accepts only the request booking type', () => {
  assertValid(validateInquiryConversion(validInput({ plan: { bookingType: 'request' } })));
});

test('rejects non-request and unknown booking types with the same code', () => {
  for (const bookingType of ['instant', 'scheduled', 'weird', '', null, undefined]) {
    const result = validateInquiryConversion(validInput({ plan: { bookingType } }));
    assertHasCode(result, 'PLAN_BOOKING_TYPE_NOT_REQUEST');
  }
});

// ---------------------------------------------------------------------------
// 5) start / end
// ---------------------------------------------------------------------------

test('rejects an unparsable startAt', () => {
  const result = validateInquiryConversion(validInput({ command: { startAt: 'not-a-date' } }));
  assertHasCode(result, 'INVALID_START_AT');
  assert.ok(!codesOf(result).includes('END_NOT_AFTER_START'));
});

test('rejects an unparsable or non-string endAt', () => {
  for (const endAt of ['not-a-date', 12345, null]) {
    const result = validateInquiryConversion(validInput({ command: { endAt } }));
    assertHasCode(result, 'INVALID_END_AT');
  }
});

test('rejects an endAt that is earlier than startAt', () => {
  const result = validateInquiryConversion(
    validInput({ command: { endAt: '2026-09-01T01:00:00.000Z' } }),
  );
  assertHasCode(result, 'END_NOT_AFTER_START');
});

test('rejects an endAt equal to startAt (DB CHECK end_at > start_at is strict)', () => {
  const result = validateInquiryConversion(
    validInput({ command: { startAt: '2026-09-01T02:00:00.000Z', endAt: '2026-09-01T02:00:00.000Z' } }),
  );
  assertHasCode(result, 'END_NOT_AFTER_START');
});

test('accepts an endAt strictly after startAt', () => {
  assertValid(
    validateInquiryConversion(
      validInput({
        command: { startAt: '2026-09-01T02:00:00.000Z', endAt: '2026-09-01T02:00:01.000Z' },
      }),
    ),
  );
});

// ---------------------------------------------------------------------------
// 6) participants
// ---------------------------------------------------------------------------

test('rejects non-positive or non-integer participants', () => {
  for (const participants of [0, -1, 2.5, '3', null]) {
    const result = validateInquiryConversion(validInput({ command: { participants } }));
    assertHasCode(result, 'INVALID_PARTICIPANTS');
    assert.ok(!codesOf(result).includes('PARTICIPANTS_BELOW_PLAN_MIN'));
    assert.ok(!codesOf(result).includes('PARTICIPANTS_ABOVE_PLAN_MAX'));
  }
});

test('rejects participants below the plan minimum', () => {
  const result = validateInquiryConversion(validInput({ command: { participants: 1 } }));
  assertHasCode(result, 'PARTICIPANTS_BELOW_PLAN_MIN');
});

test('rejects participants above the plan maximum', () => {
  const result = validateInquiryConversion(validInput({ command: { participants: 7 } }));
  assertHasCode(result, 'PARTICIPANTS_ABOVE_PLAN_MAX');
});

test('accepts participants exactly at the plan min and max boundaries', () => {
  assertValid(validateInquiryConversion(validInput({ command: { participants: 2 } })));
  assertValid(validateInquiryConversion(validInput({ command: { participants: 6 } })));
});

// ---------------------------------------------------------------------------
// 7) quoted total
// ---------------------------------------------------------------------------

test('rejects negative, fractional or non-number quoted totals', () => {
  for (const quotedTotalTwd of [-1, 1000.5, '1000', null, Number.NaN]) {
    const result = validateInquiryConversion(validInput({ command: { quotedTotalTwd } }));
    assertHasCode(result, 'INVALID_QUOTED_TOTAL');
  }
});

test('accepts a zero quoted total (aligns with DB CHECK quoted_total_twd >= 0)', () => {
  assertValid(validateInquiryConversion(validInput({ command: { quotedTotalTwd: 0 } })));
});

// ---------------------------------------------------------------------------
// 8) confirmation TTL bounds
// ---------------------------------------------------------------------------

test('rejects a non-integer confirmation TTL', () => {
  for (const confirmationTtlHours of [24.5, '24', null, Number.NaN]) {
    const result = validateInquiryConversion(validInput({ command: { confirmationTtlHours } }));
    assertHasCode(result, 'INVALID_TTL');
    assert.ok(!codesOf(result).includes('TTL_OUT_OF_BOUNDS'));
  }
});

test('rejects integer TTLs outside the closed [1, 24] hour interval', () => {
  for (const confirmationTtlHours of [0, -1, 25, 48]) {
    const result = validateInquiryConversion(validInput({ command: { confirmationTtlHours } }));
    assertHasCode(result, 'TTL_OUT_OF_BOUNDS');
  }
});

test('accepts both TTL boundaries (1 and 24 hours)', () => {
  assertValid(validateInquiryConversion(validInput({ command: { confirmationTtlHours: 1 } })));
  assertValid(validateInquiryConversion(validInput({ command: { confirmationTtlHours: 24 } })));
});

// ---------------------------------------------------------------------------
// 9) guide note
// ---------------------------------------------------------------------------

test('accepts a null or string guide note (empty string counts as no note)', () => {
  for (const guideNote of [null, '', '請自備雨具']) {
    assertValid(validateInquiryConversion(validInput({ command: { guideNote } })));
  }
});

test('rejects a guide note that is neither null nor string', () => {
  for (const guideNote of [42, {}, [], undefined]) {
    const result = validateInquiryConversion(validInput({ command: { guideNote } }));
    assertHasCode(result, 'INVALID_GUIDE_NOTE');
  }
});

// ---------------------------------------------------------------------------
// 不變式守門
// ---------------------------------------------------------------------------

test('is pure: the same input yields deeply equal results across calls', () => {
  const input = validInput({ command: { participants: 99, quotedTotalTwd: -5 } });
  const first = validateInquiryConversion(input);
  const second = validateInquiryConversion(input);
  assert.deepStrictEqual(first, second);

  const validFirst = validateInquiryConversion(validInput());
  const validSecond = validateInquiryConversion(validInput());
  assert.deepStrictEqual(validFirst, validSecond);
});

test('accumulates every violation instead of short-circuiting', () => {
  const result = validateInquiryConversion(
    validInput({
      command: { participants: 0, quotedTotalTwd: -1, confirmationTtlHours: 25 },
    }),
  );
  assert.equal(result.valid, false);
  assert.equal(result.violations.length, 3);
  for (const code of ['INVALID_PARTICIPANTS', 'INVALID_QUOTED_TOTAL', 'TTL_OUT_OF_BOUNDS']) {
    assert.ok(codesOf(result).includes(code), `missing ${code}`);
  }
});

test('keeps violation ordering stable and follows the fixed check order', () => {
  const result = validateInquiryConversion(
    validInput({
      inquiry: { status: 'closed' },
      plan: { status: 'inactive' },
      command: { quotedTotalTwd: -1 },
    }),
  );
  assert.deepStrictEqual(codesOf(result), [
    'INQUIRY_STATE_NOT_CONVERTIBLE',
    'PLAN_INACTIVE',
    'INVALID_QUOTED_TOTAL',
  ]);
});

test('never leaks UUIDs or emails through messageZh', () => {
  const cases = [
    validInput({ plan: null }),
    { ...validInput(), actorGuideId: OTHER_GUIDE_ID },
    validInput({ plan: { guideId: OTHER_GUIDE_ID, activityId: OTHER_ACTIVITY_ID } }),
    validInput({ plan: { status: 'inactive', bookingType: 'instant' } }),
    validInput({ inquiry: { status: 'closed', convertedBookingId: BOOKING_ID } }),
    validInput({ command: { activityPlanId: OTHER_PLAN_ID } }),
    validInput({
      command: {
        startAt: 'not-a-date',
        endAt: 'nope',
        participants: 0,
        quotedTotalTwd: -1,
        confirmationTtlHours: 99,
        guideNote: 42,
      },
    }),
    'not-an-object',
  ];

  let inspected = 0;
  for (const input of cases) {
    const result = validateInquiryConversion(input);
    assert.equal(result.valid, false);
    for (const violation of result.violations) {
      assert.equal(typeof violation.code, 'string');
      assert.equal(typeof violation.field, 'string');
      assert.equal(typeof violation.messageZh, 'string');
      assert.ok(violation.messageZh.length > 0);
      UUID_REGEX.lastIndex = 0;
      assert.equal(
        UUID_REGEX.test(violation.messageZh),
        false,
        `messageZh leaked a UUID: ${violation.messageZh}`,
      );
      assert.equal(
        EMAIL_REGEX.test(violation.messageZh),
        false,
        `messageZh leaked an email: ${violation.messageZh}`,
      );
      inspected += 1;
    }
  }
  assert.ok(inspected >= 10, `expected to inspect several violations, saw ${inspected}`);
});

test('source contains no clock reads and no environment variable reads', () => {
  const source = readFileSync(SOURCE_PATH, 'utf8');
  assert.equal(source.includes('new Date()'), false);
  assert.equal(source.includes('Date.now('), false);
  assert.equal(source.includes(['process', 'env'].join('.')), false);
  assert.equal(/from ['"][^'"]*db-[^'"]*['"]/u.test(source), false);
  assert.equal(source.includes('fetch('), false);
});
