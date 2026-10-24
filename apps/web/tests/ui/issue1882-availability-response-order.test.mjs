import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { resolveDatePlanAvailability } from '../../src/components/activity/date-plan-availability.ts';

// Execute the actual async handler and JSX callbacks, not a reimplementation
// of the request algorithm. This is an isolated handler test, not mounted DOM QA.
const source = readFileSync(new URL('../../src/components/activity/DatePlanSection.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('DatePlanSection.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'DatePlanSection');
const request = component.body.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'ensureLiveAvailability');
assert.ok(request, 'test must execute the production request function');
const callbacks = [];
const effects = [];
function visit(node) {
  if (ts.isJsxAttribute(node) && ['onClick', 'onSelect', 'onClose'].includes(node.name.getText(ast)) && ts.isJsxExpression(node.initializer)) {
    callbacks.push({ name: node.name.getText(ast), text: node.initializer.expression.getText(ast), element: node.parent.parent.getText(ast) });
  }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') effects.push(node.arguments[0].getText(ast));
  ts.forEachChild(node, visit);
}
visit(component);
const syncSelection = effects.find(text => text.includes('setSharedSelectedPlan'));
const cleanupRequest = effects.find(text => text.includes('availabilityRequest'));
const card = callbacks.find(item => item.text.includes('if (!canBook) return;'));
const details = callbacks.find(item => item.element.includes('className="kkd-link-sm"'));
const close = callbacks.find(item => item.name === 'onClose');
assert.ok(syncSelection && card && details && close);

const now = Date.parse('2026-04-07T04:00:00Z');
const date = '2026-04-10';
const A = { id: 'a', label: 'A', confirmByDays: 0, price: 100 };
const B = { id: 'b', label: 'B', confirmByDays: 7, price: 200 };
const row = (id, changes = {}) => ({ id, startAt: `${date}T01:00:00Z`, capacity: 8, bookedCount: 0, status: 'open', planId: A.id, ...changes });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function response(schedules, data = {}) { return { ok: true, json: async () => ({ ok: true, data: { schedules, source: 'v2', ...data } }) }; }
function evaluate(text, sandbox) {
  const js = ts.transpileModule(`const handler = ${text};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return vm.runInNewContext(`(() => { ${js}\nreturn handler; })()`, sandbox);
}
function fixture() {
  const state = { availabilityLoaded: false, availabilityFetching: false, availabilityNotice: null, planConfigState: null,
    liveSchedules: null, selectedPlan: A.id, requestedDate: date, shared: null, modal: null };
  const calls = [], writes = [];
  const availabilityRequest = { current: 0 };
  const schedules = [row('ssr')];
  const activity = { slug: 'fixture-tour', price: 100, plans: [A, B] };
  const setters = Object.fromEntries(['availabilityLoaded', 'availabilityFetching', 'availabilityNotice', 'planConfigState', 'liveSchedules'].map(key => [
    `set${key[0].toUpperCase()}${key.slice(1)}`, value => { state[key] = value; writes.push([key, value]); },
  ]));
  function render(plan = A) {
    const currentPlan = state.planConfigState ? undefined : activity.plans.find(item => item.id === state.selectedPlan);
    const selection = resolveDatePlanAvailability({ schedules, liveSchedules: state.liveSchedules, date: state.requestedDate,
      planId: currentPlan?.id ?? null, knownPlanIds: [A.id, B.id], now });
    const sandbox = { ...state, ...setters, ...selection, activity, schedules, availabilityRequest, currentPlan,
      plan, canBook: true, planPrice: plan.price, dateChosen: state.selectedPlan === plan.id && selection.selectedDate,
      t: key => key, resolvePlanPrice: item => item.price,
      setSelectedDate: value => { state.requestedDate = value; },
      setSelectedPlan: value => { state.selectedPlan = value; },
      setSharedSelectedPlan: value => { state.shared = value; },
      setModalPlan: value => { state.modal = value; },
      fetch: url => { const pending = deferred(); calls.push({ url, ...pending }); return pending.promise; },
    };
    const ensure = evaluate(request.getText(ast), sandbox);
    sandbox.ensureLiveAvailability = ensure;
    return { ensure, selection, sync: evaluate(syncSelection, sandbox), card: evaluate(card.text, sandbox),
      details: evaluate(details.text, sandbox), close: evaluate(close.text, sandbox),
      unmount: cleanupRequest ? evaluate(cleanupRequest, sandbox)() : () => {} };
  }
  function sync() { const view = render(); view.sync(); return view.selection; }
  return { state, calls, writes, render, sync };
}

test('reverse responses: newer successful empty remains empty and clears SSR date/booking identity', async () => {
  const f = fixture(), view = f.render();
  const older = view.ensure(), newer = view.ensure(); // same render: Link click then bubbling card click
  assert.equal(f.calls.length, 2, 'exercise both real pending responses');
  f.calls[1].resolve(response([])); await newer;
  assert.deepEqual(f.state.liveSchedules, []);
  f.calls[0].resolve(response([row('stale')])); await older;
  assert.deepEqual(f.state.liveSchedules, [], 'late older response must not resurrect SSR/live dates');
  assert.equal(f.sync().scheduleId, undefined);
  assert.equal(f.state.requestedDate, null);
  assert.equal(f.state.shared.date, undefined);
  assert.equal(f.state.shared.scheduleId, undefined);
});

test('reverse replacement responses keep latest future same-plan date and booking identity', async () => {
  const f = fixture(), view = f.render();
  const older = view.ensure(), newer = view.ensure();
  const latest = [row('past', { startAt: '2026-04-07T03:59:59Z' }), row('full', { bookedCount: 8 }), row('other', { planId: B.id }), row('latest')];
  f.calls[1].resolve(response(latest)); await newer;
  f.calls[0].resolve(response([row('stale')])); await older;
  assert.equal(f.sync().scheduleId, 'latest');
  assert.equal(f.state.shared.id, A.id);
  assert.equal(f.state.shared.date, date);
  assert.equal(f.state.shared.scheduleId, 'latest');
  assert.equal(f.state.shared.confirmByDays, 0);
  assert.deepEqual(f.render().selection.effectiveSchedules.map(item => item.id), ['full', 'other', 'latest']);
});

for (const kind of ['success', 'rejection', 'invalid-json']) {
  test(`stale ${kind} cannot clear latest loading state or write notice/data`, async () => {
    const f = fixture(), view = f.render();
    const older = view.ensure(), newer = view.ensure();
    const before = f.writes.length;
    if (kind === 'rejection') f.calls[0].reject(new Error('stale network error'));
    else if (kind === 'invalid-json') f.calls[0].resolve({ ok: false, json: async () => { throw new Error('bad JSON'); } });
    else f.calls[0].resolve(response([row('stale')]));
    await older;
    assert.equal(f.state.availabilityFetching, true, 'only current request may finish loading');
    assert.equal(f.writes.length, before, 'all old completion writes must be ignored');
    f.calls[1].resolve(response([])); await newer;
    assert.equal(f.state.availabilityFetching, false);
    assert.equal(f.state.availabilityNotice, null);
  });
}

test('ordering is checked after JSON parsing, not just after fetch headers', async () => {
  const f = fixture(), view = f.render(), body = deferred(), parsing = deferred();
  const older = view.ensure(), newer = view.ensure();
  f.calls[0].resolve({ ok: true, json: () => { parsing.resolve(); return body.promise; } });
  await parsing.promise;
  f.calls[1].resolve(response([])); await newer;
  body.resolve({ ok: true, data: { schedules: [row('late-body')], source: 'v2' } }); await older;
  assert.deepEqual(f.state.liveSchedules, []);
});

test('latest failure stays retryable despite old success; next intent succeeds and then stays cached', async () => {
  const f = fixture(), view = f.render();
  const older = view.ensure(), newer = view.ensure();
  f.calls[1].reject(new Error('latest error')); await newer;
  f.calls[0].resolve(response([row('stale')])); await older;
  assert.equal(f.state.liveSchedules, null);
  assert.equal(f.state.availabilityLoaded, false);
  assert.equal(f.state.availabilityNotice, 'availabilityNoticeV2LoadFail');
  const retry = f.render().ensure();
  assert.equal(f.calls.length, 3);
  f.calls[2].resolve(response([row('retried')])); await retry;
  assert.equal(f.sync().scheduleId, 'retried');
  assert.equal(f.state.availabilityLoaded, true);
  assert.equal(f.state.availabilityNotice, null);
  await f.render().ensure();
  assert.equal(f.calls.length, 3, 'normal successful intent fetch remains cached');
});

for (const planConfigState of ['no_active_plans', 'no_plans']) {
  test(`newest ${planConfigState} cannot be undone by older valid schedules`, async () => {
    const f = fixture(), view = f.render();
    const older = view.ensure(), newer = view.ensure();
    f.calls[1].resolve(response([], { planConfigState, availabilityNotice: 'closed' })); await newer;
    f.calls[0].resolve(response([row('stale')])); await older;
    assert.equal(f.state.planConfigState, planConfigState);
    assert.equal(f.state.availabilityNotice, 'closed');
    assert.deepEqual(Array.from(f.state.liveSchedules), []);
    f.sync();
    assert.equal(f.state.shared, null);
  });
}

test('real plan switch, detail cancel and repeated selection preserve latest identity while pending', async () => {
  const f = fixture(), first = f.render();
  const older = first.ensure(), newer = first.ensure();
  f.render(B).card(); // rendered loaded=true: do not start another request
  assert.equal(f.state.selectedPlan, B.id);
  assert.equal(f.state.requestedDate, null);
  const preview = f.render(A);
  let stopped = false;
  preview.details({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  preview.close();
  assert.equal(f.state.modal, null);
  assert.equal(f.state.selectedPlan, B.id);
  assert.equal(f.calls.length, 2);
  f.calls[1].resolve(response([row('latest-b', { planId: B.id })])); await newer;
  f.calls[0].resolve(response([row('stale-a')])); await older;
  f.state.requestedDate = date;
  assert.equal(f.sync().scheduleId, 'latest-b');
  f.render(B).card(); f.sync();
  assert.equal(f.state.shared.id, B.id);
  assert.equal(f.state.shared.confirmByDays, 7);
  assert.equal(f.state.shared.scheduleId, 'latest-b');
  assert.equal(f.state.shared.date, date);
});

for (const outcome of ['success', 'error']) {
  test(`unmount invalidates pending ${outcome} before any completion state writes`, async () => {
    const f = fixture(), view = f.render(), pending = view.ensure();
    view.unmount();
    const before = f.writes.length;
    if (outcome === 'success') f.calls[0].resolve(response([row('late')]));
    else f.calls[0].reject(new Error('late rejection'));
    await pending;
    assert.equal(f.writes.length, before);
  });
}
