import test from 'node:test';
import assert from 'node:assert/strict';

import { getAvailableSlots } from '../../app/api/v2/activities/[activityId]/available-slots/route-handler.ts';
import {
  createCanonicalAvailabilityRuleSelector,
} from '../../src/lib/availability-v2/effective-availability-resolver.ts';
import { evaluateBookingAvailability } from '../../src/lib/availability-v2/booking-availability-evaluator.ts';
import { generateAvailableSlots, getWeekdayInTimezone } from '../../src/lib/slot-generator.ts';

const GUIDE_ID = 'guide-1760-slice2b';
const PLAN_ID = 'plan-1760-slice2b';
const OTHER_PLAN_ID = 'plan-other-1760-slice2b';
const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';
const ROUTE_PLAN_ID = '22222222-2222-4222-8222-222222222222';
const TIMEZONE = 'Asia/Taipei';
const DATE = '2099-06-08';
const DATE_WEEKDAY = getWeekdayInTimezone(new Date(`${DATE}T04:00:00.000Z`), TIMEZONE);

function makeRule({
  id,
  activityPlanId = null,
  weekday = DATE_WEEKDAY,
  start = '09:00',
  end = '13:00',
  bufferBefore = 0,
  bufferAfter = 0,
  effectiveFrom = null,
  effectiveTo = null,
  timezone = TIMEZONE,
  guideId = GUIDE_ID,
  isActive = true,
} = {}) {
  return {
    id,
    guide_id: guideId,
    activity_plan_id: activityPlanId,
    weekday,
    start_time_local: start,
    end_time_local: end,
    timezone,
    slot_interval_minutes: 60,
    buffer_before_minutes: bufferBefore,
    buffer_after_minutes: bufferAfter,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    is_active: isActive,
  };
}

function makePlan(bookingType = 'instant') {
  return {
    id: PLAN_ID,
    activity_id: 'activity-1760-slice2b',
    duration_minutes: 60,
    max_participants: 8,
    booking_type: bookingType,
    is_year_round: true,
  };
}

function makeEvaluationInput(overrides = {}) {
  const rules = overrides.rules ?? [makeRule({ id: 'global-rule' })];
  return {
    guideId: GUIDE_ID,
    activityId: 'activity-1760-slice2b',
    planId: PLAN_ID,
    timezone: TIMEZONE,
    participants: 1,
    dateFrom: DATE,
    dateTo: DATE,
    minParticipants: 1,
    rules,
    blackouts: [],
    bookings: [],
    plan: makePlan(),
    ...overrides,
  };
}

function makeRuleContext({ policy = 'inherit', rules, dayRevisions = [], timezone = TIMEZONE } = {}) {
  return {
    guideId: GUIDE_ID,
    planId: PLAN_ID,
    policy,
    rules: rules ?? [makeRule({ id: 'global-rule' })],
    dayRevisions,
    timezone,
  };
}

test('Issue #1760 Slice 2b: legacy direct-rules and opt-in context have byte-identical serialized output', () => {
  const rules = [makeRule({ id: 'global-rule' })];
  const input = makeEvaluationInput({ rules });
  const legacy = evaluateBookingAvailability(input);
  const optIn = evaluateBookingAvailability({
    ...input,
    ruleContext: makeRuleContext({ rules }),
  });

  assert.equal(JSON.stringify(optIn), JSON.stringify(legacy));
});

test('Issue #1760 Slice 2b: selector policies inherit, restrict, and closed without fallback', () => {
  const globalRule = makeRule({ id: 'global-rule' });
  const planRule = makeRule({ id: 'plan-rule', activityPlanId: PLAN_ID });
  const otherPlanRule = makeRule({ id: 'other-plan-rule', activityPlanId: OTHER_PLAN_ID });
  const rules = [globalRule, planRule, otherPlanRule];

  const select = (policy) => createCanonicalAvailabilityRuleSelector({
    guideId: GUIDE_ID,
    planId: PLAN_ID,
    policy,
    rules,
    dayRevisions: [],
    timezone: TIMEZONE,
  })(DATE);

  assert.deepEqual(select('inherit').map((rule) => rule.id), ['global-rule', 'plan-rule']);
  assert.deepEqual(select('restrict').map((rule) => rule.id), ['plan-rule']);
  assert.deepEqual(select('closed'), []);
});

test('Issue #1760 Slice 2b: open, closed, tombstone, and timezone-mismatched day revisions are deterministic', () => {
  const recurring = makeRule({ id: 'recurring-global' });
  const exact = makeRule({
    id: 'exact-global',
    effectiveFrom: DATE,
    effectiveTo: DATE,
  });

  const select = (dayRevisions) => createCanonicalAvailabilityRuleSelector({
    guideId: GUIDE_ID,
    planId: PLAN_ID,
    policy: 'inherit',
    rules: [recurring, exact],
    dayRevisions,
    timezone: TIMEZONE,
  })(DATE);

  assert.deepEqual(
    select([{ guide_id: GUIDE_ID, local_date: DATE, timezone: TIMEZONE, revision: 1, is_closed: false }]).map(
      (rule) => rule.id,
    ),
    ['exact-global'],
  );
  assert.deepEqual(
    select([{ guide_id: GUIDE_ID, local_date: DATE, timezone: TIMEZONE, revision: 2, is_closed: true }]),
    [],
  );
  assert.deepEqual(
    select([{ guide_id: GUIDE_ID, local_date: DATE, timezone: TIMEZONE, revision: 3, is_closed: true }]),
    [],
  );
  assert.deepEqual(
    select([{ guide_id: GUIDE_ID, local_date: DATE, timezone: 'UTC', revision: 4, is_closed: true }]).map(
      (rule) => rule.id,
    ),
    ['recurring-global', 'exact-global'],
  );
});

test('Issue #1760 Slice 2b: context presence enforces generated-slot presence even when raw rules are empty', () => {
  const selectedSchedule = {
    id: 'schedule-1760-slice2b',
    activity_id: 'activity-1760-slice2b',
    plan_id: PLAN_ID,
    start_at: `${DATE}T01:00:00.000Z`,
    end_at: `${DATE}T02:00:00.000Z`,
    capacity: 8,
    booked_count: 0,
    status: 'open',
  };

  const result = evaluateBookingAvailability({
    ...makeEvaluationInput({ rules: [] }),
    selectedSchedule,
    selectedScheduleAuthority: 'authoritative',
    ruleContext: makeRuleContext({ policy: 'closed', rules: [] }),
  });

  assert.deepEqual(result.slots, []);
  assert.equal(result.diagnostics.schedulePresentInGeneratedSlots, false);
  assert.equal(result.canonicalReasonState, 'outside_rule');
});

test('Issue #1760 Slice 2b: selector-selected plan buffer prevents a false allow', () => {
  const excludedGlobal = makeRule({ id: 'excluded-global', bufferAfter: 0 });
  const selectedPlan = makeRule({
    id: 'selected-plan',
    activityPlanId: PLAN_ID,
    bufferAfter: 60,
  });
  const result = generateAvailableSlots(
    {
      guideId: GUIDE_ID,
      activityPlanId: PLAN_ID,
      dateFrom: DATE,
      dateTo: DATE,
      timezone: TIMEZONE,
      participants: 1,
    },
    {
      rules: [excludedGlobal, selectedPlan],
      blackouts: [],
      bookings: [
        {
          id: 'booking-before-candidate',
          guide_id: GUIDE_ID,
          start_at: `${DATE}T03:00:00.000Z`,
          end_at: `${DATE}T04:00:00.000Z`,
          status: 'confirmed',
          buffer_before_minutes: 0,
          buffer_after_minutes: 0,
        },
      ],
      plan: makePlan(),
      ruleSelector: createCanonicalAvailabilityRuleSelector(makeRuleContext({
        policy: 'restrict',
        rules: [excludedGlobal, selectedPlan],
      })),
    },
  );

  assert.equal(
    result.slots.some((slot) => slot.startAt === `${DATE}T12:00:00+08:00`),
    false,
    'the selected plan buffer must block the 12:00 candidate before the 13:00 booking',
  );
});

test('Issue #1760 Slice 2b: selector-selected plan buffer prevents a false block', () => {
  const excludedGlobal = makeRule({ id: 'excluded-global', bufferAfter: 60 });
  const selectedPlan = makeRule({
    id: 'selected-plan',
    activityPlanId: PLAN_ID,
    bufferAfter: 0,
  });
  const result = generateAvailableSlots(
    {
      guideId: GUIDE_ID,
      activityPlanId: PLAN_ID,
      dateFrom: DATE,
      dateTo: DATE,
      timezone: TIMEZONE,
      participants: 1,
    },
    {
      rules: [excludedGlobal, selectedPlan],
      blackouts: [],
      bookings: [
        {
          id: 'booking-before-candidate',
          guide_id: GUIDE_ID,
          start_at: `${DATE}T03:00:00.000Z`,
          end_at: `${DATE}T04:00:00.000Z`,
          status: 'confirmed',
          buffer_before_minutes: 0,
          buffer_after_minutes: 0,
        },
      ],
      plan: makePlan(),
      ruleSelector: createCanonicalAvailabilityRuleSelector(makeRuleContext({
        policy: 'restrict',
        rules: [excludedGlobal, selectedPlan],
      })),
    },
  );

  assert.equal(
    result.slots.some((slot) => slot.startAt === `${DATE}T12:00:00+08:00`),
    true,
    'the excluded global buffer must not block the selected plan candidate',
  );
});

function createMockClient(seed) {
  const calls = [];

  function buildQuery(table) {
    let rows = [...(seed[table] ?? [])];
    const filters = [];
    let selectColumns = null;

    const record = (terminal) => {
      calls.push({ table, terminal, filters: [...filters], select: selectColumns });
      return { data: rows, error: null };
    };

    const query = {
      select(columns = '*') {
        selectColumns = columns;
        return this;
      },
      eq(column, value) {
        filters.push(['eq', column, value]);
        rows = rows.filter((row) => row[column] === value);
        return this;
      },
      gte(column, value) {
        filters.push(['gte', column, value]);
        rows = rows.filter((row) => String(row[column]) >= String(value));
        return this;
      },
      lte(column, value) {
        filters.push(['lte', column, value]);
        rows = rows.filter((row) => String(row[column]) <= String(value));
        return this;
      },
      in(column, values) {
        filters.push(['in', column, values]);
        const allowed = new Set(values);
        rows = rows.filter((row) => allowed.has(row[column]));
        return this;
      },
      or(expression) {
        filters.push(['or', expression]);
        const planMatch = expression.match(/^(?:activity_plan_id|plan_id)\.is\.null,(?:activity_plan_id|plan_id)\.eq\.(.+)$/);
        if (planMatch) {
          const column = expression.startsWith('plan_id') ? 'plan_id' : 'activity_plan_id';
          rows = rows.filter((row) => row[column] == null || row[column] === planMatch[1]);
        }
        return this;
      },
      limit(count) {
        rows = rows.slice(0, count);
        return this;
      },
      maybeSingle() {
        const response = record('maybeSingle');
        return Promise.resolve({ data: response.data[0] ?? null, error: response.error });
      },
      single() {
        const response = record('single');
        return Promise.resolve({
          data: response.data[0] ?? null,
          error: response.data[0] ? response.error : { message: 'not found' },
        });
      },
      then(resolve, reject) {
        return Promise.resolve(record('then')).then(resolve, reject);
      },
    };

    return query;
  }

  return {
    client: {
      from(table) {
        return buildQuery(table);
      },
    },
    calls,
  };
}

function routeRequest({ bookingType, date = DATE } = {}) {
  return {
    nextUrl: new URL(
      `https://example.test/api/v2/activities/${ACTIVITY_ID}/available-slots?planId=${ROUTE_PLAN_ID}&dateFrom=${date}&dateTo=${date}&timezone=${encodeURIComponent(TIMEZONE)}&participants=1`,
    ),
  };
}

function routeSeed({ bookingType, policy = 'restrict', dayRevisions = [], date = DATE } = {}) {
  const weekday = getWeekdayInTimezone(new Date(`${date}T04:00:00.000Z`), TIMEZONE);
  return {
    activities: [{ id: ACTIVITY_ID }],
    activity_plans: [
      {
        id: ROUTE_PLAN_ID,
        activity_id: ACTIVITY_ID,
        duration_minutes: 60,
        min_participants: 1,
        max_participants: 8,
        booking_type: bookingType,
        status: 'active',
        name: `Issue 1760 ${bookingType}`,
        price_type: 'per_person',
        base_price: 1000,
        availability_policy: policy,
        activities: { id: ACTIVITY_ID, guide_id: GUIDE_ID },
      },
    ],
    guide_availability_rules: [
      {
        id: 'route-plan-rule',
        guide_id: GUIDE_ID,
        activity_plan_id: ROUTE_PLAN_ID,
        weekday,
        start_time_local: '09:00',
        end_time_local: '10:00',
        timezone: TIMEZONE,
        slot_interval_minutes: 60,
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        effective_from: null,
        effective_to: null,
        is_active: true,
      },
    ],
    guide_availability_day_revisions: dayRevisions,
    guide_blackout_dates: [],
    bookings: [],
    activity_plan_seasons: [],
    guide_slot_conflict_overrides: [],
  };
}

async function callRoute(seed, request = routeRequest({ bookingType: seed.activity_plans[0].booking_type })) {
  const db = createMockClient(seed);
  const response = await getAvailableSlots(
    request,
    { params: Promise.resolve({ activityId: ACTIVITY_ID }) },
    {
      createClient: async () => db.client,
      getProtectedReadClient: async () => db.client,
    },
  );
  return { db, response, body: await response.json() };
}

test('Issue #1760 Slice 2b: instant and request routes wire policy/day revisions with guide/date bounds', async () => {
  for (const bookingType of ['instant', 'request']) {
    const { db, response, body } = await callRoute(routeSeed({
      bookingType,
      dayRevisions: [
        {
          guide_id: GUIDE_ID,
          local_date: DATE,
          timezone: TIMEZONE,
          revision: 4,
          is_closed: true,
        },
      ],
    }));

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.deepEqual(body.data.slots, []);

    const dayRevisionCalls = db.calls.filter((call) => call.table === 'guide_availability_day_revisions');
    assert.equal(dayRevisionCalls.length, 1, `${bookingType} must read exactly one bounded day-revision query`);
    assert.deepEqual(dayRevisionCalls[0].filters, [
      ['eq', 'guide_id', GUIDE_ID],
      ['gte', 'local_date', DATE],
      ['lte', 'local_date', DATE],
    ]);
  }
});

test('Issue #1760 Slice 2b: missing/null policy fails closed instead of falling back', async () => {
  const seed = routeSeed({ bookingType: 'instant', policy: undefined });
  delete seed.activity_plans[0].availability_policy;
  const { db, response } = await callRoute(seed);

  assert.equal(response.status, 500);
  assert.equal(db.calls.some((call) => call.table === 'guide_availability_day_revisions'), false);
});

test('Issue #1760 Slice 2b: scheduled listing keeps fixed-schedule path and does not query day revisions', async () => {
  const seed = routeSeed({ bookingType: 'scheduled' });
  seed.activity_schedules = [
    {
      id: 'scheduled-1760-slice2b',
      activity_id: ACTIVITY_ID,
      plan_id: ROUTE_PLAN_ID,
      start_at: `${DATE}T01:00:00.000Z`,
      end_at: `${DATE}T02:00:00.000Z`,
      capacity: 8,
      booked_count: 0,
      status: 'open',
    },
  ];
  delete seed.activity_plans[0].availability_policy;

  const { db, response, body } = await callRoute(seed);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.slots.length, 1);
  assert.equal(db.calls.some((call) => call.table === 'guide_availability_day_revisions'), false);
  assert.equal(body.data.slots[0].scheduleId, 'scheduled-1760-slice2b');
});
