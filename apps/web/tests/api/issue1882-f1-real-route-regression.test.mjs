import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NOW = '2026-10-01T11:00:00+08:00';
const RealDate = globalThis.Date;
class FixedDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return new RealDate(NOW).getTime(); }
}

// Compile source in memory using the repository's TypeScript transpile pattern.
// Only service I/O seams are mocked; route, API helpers, V2 engine and every
// relative engine dependency execute their exact, unmodified source bytes.
function loadRoute(database) {
  const cache = new Map();
  const loaded = [];
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    loaded.push(path.relative(ROOT, filename));
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    function mockedRequire(specifier) {
      if (specifier === '@supabase/supabase-js') {
        return { createClient: () => database };
      }
      if (specifier.endsWith('/config/supabase-service-env.mjs')) {
        return { getSupabaseUrl: () => 'https://offline.invalid', getSupabaseServiceRoleKey: () => 'offline-fixture-only' };
      }
      assert.ok(specifier.startsWith('.'), `unexpected service/module import: ${specifier}`);
      const resolved = path.resolve(path.dirname(filename), specifier);
      const target = [resolved, `${resolved}.ts`, `${resolved}.mjs`].find(existsSync);
      assert.ok(target, `unresolved import: ${specifier}`);
      assert.ok(target.startsWith(`${ROOT}/`), 'source import must stay inside snapshot');
      return load(target);
    }
    new Function('require', 'module', 'exports', compiled)(mockedRequire, module, module.exports);
    return module.exports;
  }
  return {
    route: load(path.join(ROOT, 'app/api/activities/[slug]/availability/route.ts')),
    engine: load(path.join(ROOT, 'src/lib/availability-v2/activity-day-availability.ts')),
    loaded,
  };
}

function database(configured, options = {}) {
  const calls = [];
  const rows = {
    activities: { id: 'activity', slug: 'fixture', guide_id: 'guide' },
    activity_plans: options.noPlans ? [] : [{ id: 'p', activity_id: 'activity', duration_minutes: options.duration ?? 60, max_participants: 8, booking_type: 'scheduled', status: options.inactivePlan ? 'inactive' : 'active' }],
    guide_availability_rules: configured ? [{ id: 'rule', guide_id: 'guide', activity_plan_id: 'p', weekday: 4, start_time_local: '09:00', end_time_local: '12:00', timezone: 'Asia/Taipei', slot_interval_minutes: 60, buffer_before_minutes: 0, buffer_after_minutes: 0, effective_from: '2026-10-01', effective_to: '2026-10-01', is_active: true, ...options.rule }] : [],
    guide_blackout_dates: options.blackouts ?? [], bookings: options.bookings ?? [],
    activity_availability_daily: [{ activity_id: 'activity', date: '2026-10-02', plan_id: 'p', total_capacity: 8, total_booked: 0, remaining: 8, is_open: true }],
  };
  return { calls, from(table) {
    assert.ok(Object.hasOwn(rows, table), `unexpected database table: ${table}`);
    const filters = [];
    let consumed = false;
    const finish = () => {
      assert.equal(consumed, false, 'query consumed twice');
      consumed = true;
      calls.push({ table, filters });
      if (options.engineError && table === 'guide_availability_rules') {
        return { data: null, error: { message: 'offline fixture engine failure' } };
      }
      const data = Array.isArray(rows[table]) ? rows[table].filter((row) =>
        filters.every(([op, col, value]) => op !== 'eq' || row[col] === value)
      ) : rows[table];
      return { data, error: null };
    };
    const query = { select() { return query; },
      eq(...args) { filters.push(['eq', ...args]); return query; },
      gte(...args) { filters.push(['gte', ...args]); return query; },
      order(...args) { filters.push(['order', ...args]); return query; },
      in(...args) { filters.push(['in', ...args]); return query; },
      maybeSingle() { return Promise.resolve(finish()); },
      then(resolve, reject) { return Promise.resolve(finish()).then(resolve, reject); },
    };
    return query;
  } };
}

async function invoke(configured, diagnostic, options = {}) {
  const replacements = [];
  let observed;
  let networkAttempts = 0;
  const deny = () => { networkAttempts++; throw new Error('F1 fixture forbids network/listen'); };
  function replace(object, key, value) {
    replacements.push(() => { object[key] = original; });
    const original = object[key];
    object[key] = value;
  }
  replace(globalThis, 'Date', FixedDate);
  replace(globalThis, 'fetch', deny);
  for (const object of [http, https]) for (const key of ['request', 'get']) replace(object, key, deny);
  for (const key of ['connect', 'createConnection']) replace(net, key, deny);
  replace(tls, 'connect', deny);
  replace(net.Server.prototype, 'listen', deny);
  try {
    const db = database(configured, options);
    const { route, engine, loaded } = loadRoute(db);
    // Request/Response are in-process objects; no HTTP server or real client.
    const response = await route.GET(new Request('https://offline.invalid/api/activities/fixture/availability?dateFrom=2026-10-01&dateTo=2026-10-01'), { params: Promise.resolve({ slug: 'fixture' }) });
    const body = await response.json();
    const legacyCalls = db.calls.filter(({ table }) => table.startsWith('activity_availability_') || table === 'activity_schedules');
    // Independently execute the same real engine to expose metadata/slotCount;
    // its separate mocked client keeps route call evidence unambiguous.
    const engineResult = options.engineError ? null : await engine.getV2ActivityAvailability(
      database(configured, options), 'activity', { dateFrom: '2026-10-01', dateTo: '2026-10-01', timezone: 'Asia/Taipei' }
    );
    observed = JSON.stringify({ configured, options, fixedNow: NOW, status: response.status, source: response.headers.get('x-availability-source'), fallbackReason: response.headers.get('x-availability-fallback-reason'), body, engineResult, legacyCalls, allCalls: db.calls, loaded, networkAttempts });
    assert.equal(networkAttempts, 0, 'network tripwire must never fire');
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.ok(loaded.includes('src/lib/availability-v2/activity-day-availability.ts'));
    assert.ok(loaded.includes('src/lib/slot-generator.ts'));
    const expectedTables = options.noPlans || options.inactivePlan
      ? ['activities', 'activities', 'activity_plans', 'activity_plans']
      : options.engineError
        ? ['activities', 'activities', 'activity_plans', 'guide_availability_rules']
        : ['activities', 'activities', 'activity_plans', 'guide_availability_rules', 'guide_blackout_dates', 'bookings'];
    assert.deepEqual(db.calls.slice(0, expectedTables.length).map(({ table }) => table), expectedTables);
    return { response, body, legacyCalls, engineResult, hasGeneratedSlots: engineResult ? engine.v2HasGeneratedSlots(engineResult.plans) : null };
  } finally {
    for (const restore of replacements.reverse()) restore();
    // Emit diagnostics after restoring process-wide clock and I/O tripwires.
    if (observed) diagnostic(observed);
  }
}

test('configured V2 all-started window stays v2/not-open and never returns future legacy sentinel', async (t) => {
  const { response, body, legacyCalls, engineResult, hasGeneratedSlots } = await invoke(true, t.diagnostic.bind(t));
  assert.equal(response.headers.get('x-availability-source'), 'v2');
  assert.equal(body.data.source, 'v2');
  assert.deepEqual(body.data.schedules, [{ id: null, startAt: '2026-10-01T00:00:00+08:00', capacity: 8, bookedCount: 8, status: 'not-open', planId: 'p' }]);
  assert.equal(legacyCalls.length, 0);
  assert.ok(!JSON.stringify(body).includes('2026-10-02'), 'future legacy sentinel must be absent');
  assert.equal(engineResult.hasCandidatesRemovedByNowCutoff, true);
  assert.equal(engineResult.plans[0].slotCount, 0);
  assert.equal(hasGeneratedSlots, false, 'slot helper must keep its original count contract');
});

test('truly unconfigured V2 with no rules preserves open legacy snapshot fallback', async (t) => {
  const { response, body, legacyCalls, engineResult } = await invoke(false, t.diagnostic.bind(t));
  assert.equal(response.headers.get('x-availability-source'), 'legacy-fallback');
  assert.equal(body.data.source, 'legacy_fallback');
  assert.deepEqual(body.data.schedules, [{ id: null, startAt: '2026-10-02T00:00:00+08:00', capacity: 8, bookedCount: 0, status: 'open', planId: 'p' }]);
  assert.equal(legacyCalls.length, 1);
  assert.equal(engineResult.hasCandidatesRemovedByNowCutoff, false);
});

function assertLegacyFallback(result, { engineError = false } = {}) {
  assert.equal(result.response.headers.get('x-availability-source'), 'legacy-fallback');
  assert.equal(result.body.data.source, 'legacy_fallback');
  assert.deepEqual(result.body.data.schedules, [{ id: null, startAt: '2026-10-02T00:00:00+08:00', capacity: 8, bookedCount: 0, status: 'open', planId: 'p' }]);
  assert.equal(result.legacyCalls.length, 1);
  if (!engineError) {
    assert.equal(result.engineResult.hasCandidatesRemovedByNowCutoff, false);
    assert.equal(result.engineResult.plans[0].slotCount, 0);
    assert.equal(result.hasGeneratedSlots, false);
    assert.equal(result.response.headers.get('x-availability-fallback-reason'), 'v2-no-generated-slots');
  }
}

for (const [name, options] of [
  ['weekday mismatch', { rule: { weekday: 5 } }],
  ['expired effective window', { rule: { effective_from: '2026-09-01', effective_to: '2026-09-30' } }],
  ['future effective window', { rule: { effective_from: '2026-10-02', effective_to: '2026-10-31' } }],
  ['duration exceeds rule window', { duration: 240 }],
  ['all started candidates blacked out', { blackouts: [{ id: 'blackout', guide_id: 'guide', starts_at: '2026-10-01T08:00:00+08:00', ends_at: '2026-10-01T13:00:00+08:00' }] }],
  ['all future candidates blacked out', { rule: { start_time_local: '12:00', end_time_local: '14:00' }, blackouts: [{ id: 'blackout', guide_id: 'guide', starts_at: '2026-10-01T11:00:00+08:00', ends_at: '2026-10-01T15:00:00+08:00' }] }],
]) {
  test(`${name} preserves zero-generated legacy fallback`, async (t) => {
    assertLegacyFallback(await invoke(true, t.diagnostic.bind(t), options));
  });
}

test('future candidate stays V2/open with no cutoff metadata', async (t) => {
  const result = await invoke(true, t.diagnostic.bind(t), { rule: { start_time_local: '12:00', end_time_local: '13:00' } });
  assert.equal(result.response.headers.get('x-availability-source'), 'v2');
  assert.equal(result.body.data.source, 'v2');
  assert.deepEqual(result.body.data.schedules, [{ id: null, startAt: '2026-10-01T12:00:00+08:00', capacity: 8, bookedCount: 0, status: 'open', planId: 'p' }]);
  assert.equal(result.engineResult.hasCandidatesRemovedByNowCutoff, false);
  assert.equal(result.engineResult.plans[0].slotCount, 1);
  assert.equal(result.hasGeneratedSlots, true);
  assert.equal(result.legacyCalls.length, 0);
});

test('candidate exactly at now is removed while route stays V2/not-open', async (t) => {
  const result = await invoke(true, t.diagnostic.bind(t), { rule: { start_time_local: '11:00', end_time_local: '12:00' } });
  assert.equal(result.response.headers.get('x-availability-source'), 'v2');
  assert.deepEqual(result.body.data.schedules, [{ id: null, startAt: '2026-10-01T00:00:00+08:00', capacity: 8, bookedCount: 8, status: 'not-open', planId: 'p' }]);
  assert.equal(result.engineResult.hasCandidatesRemovedByNowCutoff, true);
  assert.equal(result.engineResult.plans[0].slotCount, 0);
  assert.equal(result.hasGeneratedSlots, false);
  assert.equal(result.legacyCalls.length, 0);
});

for (const [state, options] of [
  ['no_plans', { noPlans: true }],
  ['no_active_plans', { inactivePlan: true }],
]) {
  test(`${state} preserves explicit V2 unavailability without legacy reads`, async (t) => {
    const result = await invoke(true, t.diagnostic.bind(t), options);
    assert.equal(result.response.headers.get('x-availability-source'), 'v2');
    assert.equal(result.body.data.source, 'v2');
    assert.equal(result.body.data.planConfigState, state);
    assert.deepEqual(result.body.data.schedules, []);
    assert.deepEqual(result.body.data.days, []);
    assert.equal(result.legacyCalls.length, 0);
    assert.equal(result.engineResult.hasCandidatesRemovedByNowCutoff, undefined);
  });
}

test('engine service-query error preserves legacy fallback', async (t) => {
  const result = await invoke(true, t.diagnostic.bind(t), { engineError: true });
  assertLegacyFallback(result, { engineError: true });
  assert.equal(result.response.headers.get('x-availability-fallback-reason'), null);
});
