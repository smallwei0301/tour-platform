import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const HELPER_URL = new URL(
  '../../src/lib/midao/public-inquiry-api-response.ts',
  import.meta.url,
);
const ROUTE_URL = new URL(
  '../../app/api/v2/public/guides/[slug]/inquiries/route.ts',
  import.meta.url,
);

const IDS = {
  traveler: '11111111-1111-4111-8111-111111111111',
  guide: '22222222-2222-4222-8222-222222222222',
  activity: '33333333-3333-4333-8333-333333333333',
  plan: '44444444-4444-4444-8444-444444444444',
};

const basePublication = {
  activity_id: IDS.activity,
  version: 3,
  snapshot: {
    activityId: IDS.activity,
    version: 3,
    guideId: IDS.guide,
    draftRevision: 7,
    publishedAt: '2026-06-01T00:00:00.000Z',
    payload: {
      questions: [
        { question_key: 'meal', type: 'single_choice', required: true, options: ['葷食', '素食'] },
        { question_key: 'needs', type: 'multi_choice', required: false, options: ['輪椅', '嬰兒車'] },
        { question_key: 'note', type: 'short_text', required: false, options: [] },
      ],
    },
  },
};

function baseRows(overrides = {}) {
  return {
    guide_profiles: [{ id: IDS.guide, slug: 'ocean-guide', verification_status: 'approved' }],
    activities: [{ id: IDS.activity, guide_slug: 'ocean-guide', status: 'published', inquiry_enabled: true }],
    activity_plans: [{ id: IDS.plan, activity_id: IDS.activity, slug: 'half-day', status: 'active', is_year_round: false }],
    activity_plan_seasons: [{ activity_plan_id: IDS.plan, start_month: 4, start_day: 1, end_month: 10, end_day: 31, is_active: true }],
    service_publication_versions: [basePublication],
    ...overrides,
  };
}

function createSupabaseFake(rows = baseRows()) {
  const calls = [];
  return {
    calls,
    from(table) {
      const filters = [];
      const query = {
        select(columns) { calls.push({ type: 'select', table, columns }); return query; },
        eq(field, value) { filters.push([field, value]); calls.push({ type: 'eq', table, field, value }); return query; },
        order(field, options) { calls.push({ type: 'order', table, field, options }); return query; },
        limit(value) { calls.push({ type: 'limit', table, value }); return query; },
        maybeSingle() {
          const values = filteredRows(rows[table] ?? [], filters);
          return Promise.resolve({ data: structuredClone(values[0] ?? null), error: null });
        },
        then(resolve, reject) {
          return Promise.resolve({ data: structuredClone(filteredRows(rows[table] ?? [], filters)), error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

function filteredRows(rows, filters) {
  return rows.filter((row) => filters.every(([field, value]) => row[field] === value));
}

function body(overrides = {}) {
  return {
    activity_id: IDS.activity,
    preferred_date: '2026-06-10',
    plan_selector: { slug: 'half-day' },
    questionnaire_version: 3,
    answers: [
      { question_id: 'meal', value: '素食' },
      { question_id: 'needs', value: ['輪椅'] },
      { question_id: 'note', value: '  需要慢走  ' },
    ],
    party_size: 2,
    language: 'zh-TW',
    pickup_required: false,
    traveler_note: '請用 email 聯絡',
    ...overrides,
  };
}

function requestFor(payload = body()) {
  return new Request('https://example.test/api/v2/public/guides/ocean-guide/inquiries', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'tp_csrf=csrf-token', 'x-csrf-token': 'csrf-token', 'x-forwarded-for': '203.0.113.8' },
    body: JSON.stringify(payload),
  });
}

async function loadRoute() {
  return import(`${ROUTE_URL.href}?test=${Math.random()}`);
}

async function setup({ rows = baseRows(), identity = { id: IDS.traveler }, csrf = null, rateLimit = { allowed: true, resetAt: Date.now() + 60_000 }, gateway = null, gatewayError = null } = {}) {
  const route = await loadRoute();
  const fake = createSupabaseFake(rows);
  const gatewayCalls = [];
  route.__setPublicInquiryDependenciesForTest({
    getTravelerIdentity: async () => identity,
    validateCsrf: () => csrf,
    getClientIp: () => '203.0.113.8',
    checkRateLimit: () => rateLimit,
    getSupabase: async () => fake,
    createMidaoInquiryDb: async (input) => {
      gatewayCalls.push(structuredClone(input));
      if (gatewayError) throw gatewayError;
      return gateway ?? {
        ok: true,
        status: 201,
        code: 'CREATED',
        inquiry: { id: '55555555-5555-4555-8555-555555555555', inquiryNo: 'INQ-0001', status: 'new' },
      };
    },
  });
  return { route, fake, gatewayCalls };
}

async function responseOf(response) {
  return { status: response.status, headers: response.headers, body: await response.json() };
}

function assertEnvelope(payload, { status, code, retryable = false }) {
  assert.equal(payload.status, status);
  assert.deepEqual(payload.body, {
    status: 'error',
    code,
    message: payload.body.message,
    retryable,
  });
  assert.equal(typeof payload.body.message, 'string');
}

test('public inquiry route exports a POST handler', async () => {
  const route = await loadRoute();
  assert.equal(typeof route.POST, 'function');
});

test('domain public-inquiry helper preserves exact success/error envelopes and route wiring', async () => {
  const helper = await import(`${HELPER_URL.href}?test=${Math.random()}`);
  assert.deepEqual(Object.keys(helper).sort(), ['publicInquiryJsonError', 'publicInquiryJsonSuccess']);

  const success = helper.publicInquiryJsonSuccess(
    { inquiry_id: '55555555-5555-4555-8555-555555555555', inquiry_no: 'INQ-0001', status: 'new' },
    { status: 201 },
  );
  assert.equal(success.status, 201);
  assert.deepEqual(await success.json(), {
    status: 'success',
    data: { inquiry_id: '55555555-5555-4555-8555-555555555555', inquiry_no: 'INQ-0001', status: 'new' },
  });

  const error = helper.publicInquiryJsonError(
    'RATE_LIMITED',
    '送出次數過多，請稍後再試。',
    true,
    429,
    { status: 500, headers: { 'Retry-After': '3' } },
  );
  assert.equal(error.status, 429);
  assert.equal(error.headers.get('Retry-After'), '3');
  assert.deepEqual(await error.json(), {
    status: 'error',
    code: 'RATE_LIMITED',
    message: '送出次數過多，請稍後再試。',
    retryable: true,
  });

  const routeSource = await readFile(ROUTE_URL, 'utf8');
  assert.ok(routeSource.includes("from '../../../../../../../src/lib/midao/public-inquiry-api-response.ts';"));
  assert.doesNotMatch(routeSource, /src\/lib\/public-inquiry-api-response\.ts/u);
});

test('unexpected route errors report only the fixed public route label before preserving the O3 envelope', async () => {
  const routeSource = await readFile(ROUTE_URL, 'utf8');
  assert.match(routeSource, /import \{ reportRouteError \} from '\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/src\/lib\/route-error\.ts';/u);
  assert.match(routeSource, /catch \(error\) \{\s+await reportRouteError\(error, \{ route: 'v2\/public\/guides\/\[slug\]\/inquiries' \}\);\s+return errorResponse\(503, 'INQUIRY_UNAVAILABLE', UNAVAILABLE_MESSAGE, true\);/u);
});

test('missing traveler identity returns AUTH_REQUIRED before CSRF or resolver work', async () => {
  const { route, fake } = await setup({ identity: { id: null } });
  const payload = await responseOf(await route.POST(requestFor(), { params: Promise.resolve({ slug: 'ocean-guide' }) }));
  assertEnvelope(payload, { status: 401, code: 'AUTH_REQUIRED' });
  assert.equal(fake.calls.length, 0);
});

test('invalid traveler session returns SESSION_INVALID without resolver work', async () => {
  const { route, fake } = await setup({ identity: { id: null, invalid: true } });
  const payload = await responseOf(await route.POST(requestFor(), { params: Promise.resolve({ slug: 'ocean-guide' }) }));
  assertEnvelope(payload, { status: 401, code: 'SESSION_INVALID' });
  assert.equal(fake.calls.length, 0);
});

test('csrf rejection is normalized to the V2 public envelope before resolver work', async () => {
  const csrf = new Response(JSON.stringify({ ok: false }), { status: 403 });
  const { route, fake } = await setup({ csrf });
  const payload = await responseOf(await route.POST(requestFor(), { params: Promise.resolve({ slug: 'ocean-guide' }) }));
  assertEnvelope(payload, { status: 403, code: 'CSRF_INVALID' });
  assert.equal(fake.calls.length, 0);
});

test('rate limit returns retryable V2 envelope and Retry-After before resolver work', async () => {
  const { route, fake } = await setup({ rateLimit: { allowed: false, resetAt: Date.now() + 2_100 } });
  const payload = await responseOf(await route.POST(requestFor(), { params: Promise.resolve({ slug: 'ocean-guide' }) }));
  assertEnvelope(payload, { status: 429, code: 'RATE_LIMITED', retryable: true });
  assert.equal(payload.headers.get('Retry-After'), '3');
  assert.equal(fake.calls.length, 0);
});

test('missing or non-owned guide and activity collapse to RESOURCE_NOT_FOUND', async () => {
  for (const rows of [
    baseRows({ guide_profiles: [] }),
    baseRows({ activities: [] }),
    baseRows({ activities: [{ id: IDS.activity, guide_slug: 'another-guide', status: 'published', inquiry_enabled: true }] }),
    baseRows({ activities: [{ id: IDS.activity, guide_slug: 'ocean-guide', status: 'draft', inquiry_enabled: true }] }),
    baseRows({ activities: [{ id: IDS.activity, guide_slug: 'ocean-guide', status: 'published', inquiry_enabled: false }] }),
  ]) {
    const { route, gatewayCalls } = await setup({ rows });
    const payload = await responseOf(await route.POST(requestFor(), { params: Promise.resolve({ slug: 'ocean-guide' }) }));
    assert.deepEqual(payload.body, { status: 'error', code: 'RESOURCE_NOT_FOUND', message: '找不到可用的詢問資源。', retryable: false });
    assert.equal(payload.status, 404);
    assert.equal(gatewayCalls.length, 0);
  }
});

test('plan lookup is activity scoped and only server-resolved internal plan reaches the gateway', async () => {
  const { route, fake, gatewayCalls } = await setup();
  const rawActivityId = `  ${IDS.activity}  `;
  const payload = await responseOf(await route.POST(requestFor(body({ activity_id: rawActivityId })), { params: Promise.resolve({ slug: 'ocean-guide' }) }));
  assert.equal(payload.status, 201);
  assert.equal(gatewayCalls.length, 1);
  assert.equal(gatewayCalls[0].activityId, IDS.activity);
  assert.equal(gatewayCalls[0].activityPlanId, IDS.plan);
  assert.equal(gatewayCalls[0].guideId, IDS.guide);
  assert.equal(gatewayCalls[0].travelerUserId, IDS.traveler);
  assert.equal(fake.calls.some((call) => call.table === 'activities' && call.field === 'id' && call.value === IDS.activity), true);
  assert.equal(fake.calls.some((call) => call.table === 'activities' && call.field === 'id' && call.value === rawActivityId), false);
  assert.equal(fake.calls.some((call) => call.table === 'activity_plans' && call.field === 'activity_id' && call.value === IDS.activity), true);
  assert.equal(fake.calls.some((call) => call.table === 'activity_plans' && call.field === 'slug' && call.value === 'half-day'), true);
});

test('unknown plan and duplicate scoped plans fail closed without gateway call', async () => {
  for (const rows of [baseRows({ activity_plans: [] }), baseRows({ activity_plans: [
    { id: IDS.plan, activity_id: IDS.activity, slug: 'half-day', status: 'active', is_year_round: false },
    { id: '66666666-6666-4666-8666-666666666666', activity_id: IDS.activity, slug: 'half-day', status: 'active', is_year_round: false },
  ] })]) {
    const { route, gatewayCalls } = await setup({ rows });
    const payload = await responseOf(await route.POST(requestFor(), { params: Promise.resolve({ slug: 'ocean-guide' }) }));
    assertEnvelope(payload, { status: 404, code: 'RESOURCE_NOT_FOUND' });
    assert.equal(gatewayCalls.length, 0);
  }
});

test('ordinary inclusive season accepts the traveler preferred date', async () => {
  const { route, gatewayCalls } = await setup();
  const payload = await responseOf(await route.POST(requestFor({ ...body(), preferred_date: '2026-04-01' }), { params: Promise.resolve({ slug: 'ocean-guide' }) }));
  assert.equal(payload.status, 201);
  assert.equal(gatewayCalls[0].preferredDate, '2026-04-01');
});

test('year-wrapping season accepts dates on either side of year end', async () => {
  const rows = baseRows({ activity_plan_seasons: [{ activity_plan_id: IDS.plan, start_month: 11, start_day: 1, end_month: 2, end_day: 28, is_active: true }] });
  for (const preferred_date of ['2026-11-01', '2026-02-28']) {
    const { route, gatewayCalls } = await setup({ rows });
    const payload = await responseOf(await route.POST(requestFor({ ...body(), preferred_date }), { params: Promise.resolve({ slug: 'ocean-guide' }) }));
    assert.equal(payload.status, 201);
    assert.equal(gatewayCalls.length, 1);
  }
});

test('year-round plans bypass season rows', async () => {
  const rows = baseRows({ activity_plans: [{ id: IDS.plan, activity_id: IDS.activity, slug: 'half-day', status: 'active', is_year_round: true }], activity_plan_seasons: [] });
  const { route, gatewayCalls } = await setup({ rows });
  const payload = await responseOf(await route.POST(requestFor({ ...body(), preferred_date: '2026-01-15' }), { params: Promise.resolve({ slug: 'ocean-guide' }) }));
  assert.equal(payload.status, 201);
  assert.equal(gatewayCalls.length, 1);
});

test('outside, invalid, or no-season preferred date returns the exact season error without writes', async () => {
  for (const options of [
    { rows: baseRows(), payload: { ...body(), preferred_date: '2026-12-01' } },
    { rows: baseRows(), payload: { ...body(), preferred_date: '2026-02-30' } },
    { rows: baseRows({ activity_plan_seasons: [] }), payload: body() },
  ]) {
    const { route, gatewayCalls } = await setup({ rows: options.rows });
    const result = await responseOf(await route.POST(requestFor(options.payload), { params: Promise.resolve({ slug: 'ocean-guide' }) }));
    assert.deepEqual(result, {
      status: 422,
      headers: result.headers,
      body: { status: 'error', code: 'PREFERRED_DATE_OUTSIDE_PLAN_SEASON', message: '你選擇的旅遊日期不在這個方案的適用季節，請調整旅遊日期後再送出詢問。', retryable: false },
    });
    assert.equal(gatewayCalls.length, 0);
  }
});

test('published questionnaire version mismatch returns exact conflict without writes', async () => {
  const { route, gatewayCalls } = await setup();
  const payload = await responseOf(await route.POST(requestFor({ ...body(), questionnaire_version: 2 }), { params: Promise.resolve({ slug: 'ocean-guide' }) }));
  assert.deepEqual(payload.body, { status: 'error', code: 'QUESTIONNAIRE_VERSION_MISMATCH', message: '這份問題表已更新，請重新確認並填寫後再送出詢問。', retryable: false });
  assert.equal(payload.status, 409);
  assert.equal(gatewayCalls.length, 0);
});

test('missing publication collapses to RESOURCE_NOT_FOUND without writes', async () => {
  const { route, gatewayCalls } = await setup({ rows: baseRows({ service_publication_versions: [] }) });
  const payload = await responseOf(await route.POST(requestFor(), { params: Promise.resolve({ slug: 'ocean-guide' }) }));
  assertEnvelope(payload, { status: 404, code: 'RESOURCE_NOT_FOUND' });
  assert.equal(gatewayCalls.length, 0);
});

test('malformed canonical questionnaire payload collapses to RESOURCE_NOT_FOUND without writes', async () => {
  for (const snapshot of [
    { ...basePublication.snapshot, payload: undefined },
    { ...basePublication.snapshot, payload: null },
    { ...basePublication.snapshot, payload: [] },
    { ...basePublication.snapshot, payload: 'not-an-object' },
  ]) {
    const publication = { ...basePublication, snapshot };
    const { route, gatewayCalls } = await setup({ rows: baseRows({ service_publication_versions: [publication] }) });
    const payload = await responseOf(await route.POST(requestFor(), { params: Promise.resolve({ slug: 'ocean-guide' }) }));
    assertEnvelope(payload, { status: 404, code: 'RESOURCE_NOT_FOUND' });
    assert.equal(gatewayCalls.length, 0);
  }
});

test('duplicate and unknown question ids reject the complete request before mapping or writing', async () => {
  for (const answers of [
    [...body().answers, { question_id: 'meal', value: '葷食' }],
    [{ question_id: 'other', value: 'x' }],
  ]) {
    const { route, gatewayCalls } = await setup();
    const payload = await responseOf(await route.POST(requestFor({ ...body(), answers }), { params: Promise.resolve({ slug: 'ocean-guide' }) }));
    assertEnvelope(payload, { status: 422, code: 'INVALID_ANSWERS' });
    assert.equal(gatewayCalls.length, 0);
  }
});

test('required, choice, multi-choice, text, and missing answer validation reject before writes', async () => {
  const invalidAnswers = [
    body().answers.filter((answer) => answer.question_id !== 'meal'),
    [{ question_id: 'meal', value: '' }, { question_id: 'needs', value: [] }, { question_id: 'note', value: 'x' }],
    [{ question_id: 'meal', value: '肉' }, { question_id: 'needs', value: [] }, { question_id: 'note', value: 'x' }],
    [{ question_id: 'meal', value: '葷食' }, { question_id: 'needs', value: ['輪椅', '輪椅'] }, { question_id: 'note', value: 'x' }],
    [{ question_id: 'meal', value: '葷食' }, { question_id: 'needs', value: [] }, { question_id: 'note', value: '   ' }],
  ];
  for (const answers of invalidAnswers) {
    const { route, gatewayCalls } = await setup();
    const payload = await responseOf(await route.POST(requestFor({ ...body(), answers }), { params: Promise.resolve({ slug: 'ocean-guide' }) }));
    assertEnvelope(payload, { status: 422, code: 'INVALID_ANSWERS' });
    assert.equal(gatewayCalls.length, 0);
  }
});

test('valid answers are mapped only after validation and gateway is called exactly once', async () => {
  const { route, gatewayCalls } = await setup();
  const payload = await responseOf(await route.POST(requestFor(), { params: Promise.resolve({ slug: 'ocean-guide' }) }));
  assert.equal(payload.status, 201);
  assert.deepEqual(payload.body, { status: 'success', data: { inquiry_id: '55555555-5555-4555-8555-555555555555', inquiry_no: 'INQ-0001', status: 'new' } });
  assert.equal(gatewayCalls.length, 1);
  assert.deepEqual(gatewayCalls[0].answers, { meal: '素食', needs: ['輪椅'], note: '需要慢走' });
  assert.deepEqual(gatewayCalls[0].questionnaireSnapshot, basePublication.snapshot);
});

test('dangerous question keys and forbidden client identity or internal plan fields fail closed', async () => {
  const dangerous = structuredClone(basePublication);
  dangerous.snapshot.payload.questions[0].question_key = '__proto__';
  for (const options of [
    { rows: baseRows({ service_publication_versions: [dangerous] }), payload: { ...body(), answers: [{ question_id: '__proto__', value: '葷食' }, ...body().answers.slice(1)] } },
    { rows: baseRows(), payload: { ...body(), traveler_user_id: 'attacker' } },
    { rows: baseRows(), payload: { ...body(), activity_plan_id: IDS.plan } },
  ]) {
    const { route, gatewayCalls } = await setup({ rows: options.rows });
    const payload = await responseOf(await route.POST(requestFor(options.payload), { params: Promise.resolve({ slug: 'ocean-guide' }) }));
    assertEnvelope(payload, { status: 422, code: 'INVALID_ANSWERS' });
    assert.equal(gatewayCalls.length, 0);
  }
});

test('malformed JSON or non-object body returns INVALID_ANSWERS without writes', async () => {
  const { route, gatewayCalls } = await setup();
  const malformed = new Request('https://example.test/inquiries', { method: 'POST', headers: { cookie: 'tp_csrf=x', 'x-csrf-token': 'x' }, body: '{' });
  for (const request of [malformed, requestFor([])]) {
    const payload = await responseOf(await route.POST(request, { params: Promise.resolve({ slug: 'ocean-guide' }) }));
    assertEnvelope(payload, { status: 422, code: 'INVALID_ANSWERS' });
  }
  assert.equal(gatewayCalls.length, 0);

  for (const activity_id of [123, null, '', '   ']) {
    const { route: activityRoute, fake, gatewayCalls: activityGatewayCalls } = await setup();
    const payload = await responseOf(await activityRoute.POST(requestFor(body({ activity_id })), { params: Promise.resolve({ slug: 'ocean-guide' }) }));
    assert.deepEqual(payload, {
      status: 400,
      headers: payload.headers,
      body: {
        status: 'error',
        code: 'INVALID_REQUEST',
        message: 'activity_id must be a non-empty string',
        retryable: false,
      },
    });
    assert.equal(fake.calls.length, 0);
    assert.equal(activityGatewayCalls.length, 0);
  }
});

test('unexpected resolver or gateway errors are masked as retryable INQUIRY_UNAVAILABLE', async () => {
  const { route, gatewayCalls } = await setup({ gatewayError: new Error('database password traveler@example.test') });
  const payload = await responseOf(await route.POST(requestFor(), { params: Promise.resolve({ slug: 'ocean-guide' }) }));
  assertEnvelope(payload, { status: 503, code: 'INQUIRY_UNAVAILABLE', retryable: true });
  assert.doesNotMatch(JSON.stringify(payload.body), /password|example\.test/u);
  assert.equal(gatewayCalls.length, 1);
});
