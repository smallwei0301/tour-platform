// Issue #1307 — GET /api/guide/availability-preview without
// activityPlanId returned canonicalState='outside_season' /
// seasonGate='no_active_season' even when the guide had valid rules
// pointing at plans that were year-round or had active seasons
// covering the requested date. UI then showed 「方案尚未設定開放季節」.
//
// Fix: aggregate the season gate across every plan referenced by the
// guide's active rules in the fallback path. These tests pin:
//
//   1. aggregateFallbackSeasonGate helper unit cases (pure function).
//   2. Route source contracts:
//      - imports the helper.
//      - extends the activity_plans select with is_year_round.
//      - issues a separate activity_plan_seasons query for the
//        fallback (no-activityPlanId) path.
//      - preserves the existing plan-scoped behavior when
//        activityPlanId IS provided (no regression vs GH-1289 / #1291).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { aggregateFallbackSeasonGate } from '../../src/lib/availability-v2/aggregate-fallback-season-gate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const ROUTE_PATH = join(REPO_ROOT, 'app/api/guide/availability-preview/route.ts');

const SEASON_ALL_YEAR = {
  id: 'season-1',
  activity_plan_id: 'plan-a',
  start_month: 1,
  start_day: 1,
  end_month: 12,
  end_day: 31,
  timezone: 'Asia/Taipei',
  is_active: true,
};

// ---------- helper unit ----------

test('aggregator: any plan is_year_round=true → isYearRound:true (gate open)', () => {
  const r = aggregateFallbackSeasonGate({
    plansById: { 'plan-a': { is_year_round: true }, 'plan-b': { is_year_round: false } },
    seasons: [],
  });
  assert.equal(r.isYearRound, true);
});

test('aggregator: no plan is_year_round=true → isYearRound:false (gate depends on seasons)', () => {
  const r = aggregateFallbackSeasonGate({
    plansById: { 'plan-a': { is_year_round: false }, 'plan-b': { is_year_round: false } },
    seasons: [SEASON_ALL_YEAR],
  });
  assert.equal(r.isYearRound, false);
  assert.equal(r.seasons.length, 1);
});

test('aggregator: union of seasons across plans is preserved verbatim for resolver to filter', () => {
  const season2 = { ...SEASON_ALL_YEAR, id: 'season-2', activity_plan_id: 'plan-b' };
  const r = aggregateFallbackSeasonGate({
    plansById: { 'plan-a': {}, 'plan-b': {} },
    seasons: [SEASON_ALL_YEAR, season2],
  });
  assert.equal(r.seasons.length, 2);
});

test('aggregator: empty seasons + no year-round plans → empty union, gate closed', () => {
  const r = aggregateFallbackSeasonGate({
    plansById: { 'plan-a': { is_year_round: false } },
    seasons: [],
  });
  assert.deepEqual(r, { seasons: [], isYearRound: false });
});

test('aggregator: missing / null input safely returns empty closed gate', () => {
  assert.deepEqual(
    aggregateFallbackSeasonGate({}),
    { seasons: [], isYearRound: false },
  );
  assert.deepEqual(
    aggregateFallbackSeasonGate({ plansById: null, seasons: null }),
    { seasons: [], isYearRound: false },
  );
});

test('aggregator: truthy-but-not-=== true is_year_round values do NOT open the gate (defensive)', () => {
  const r = aggregateFallbackSeasonGate({
    plansById: {
      'plan-a': { is_year_round: 1 }, // number
      'plan-b': { is_year_round: 'true' }, // string
      'plan-c': { is_year_round: {} }, // object
    },
    seasons: [],
  });
  assert.equal(r.isYearRound, false);
});

// ---------- route source contract ----------

test('Route imports aggregateFallbackSeasonGate', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(
    src,
    /from\s+['"][^'"]*aggregate-fallback-season-gate(\.mjs)?['"]/,
    'route must import the fallback season-gate aggregator',
  );
  assert.match(src, /aggregateFallbackSeasonGate/);
});

test('Route activity_plans SELECT now includes is_year_round (needed by aggregator)', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  // The "min_participants" plans query must now also select is_year_round.
  const planSelectMatch = src.match(
    /\.from\(\s*['"]activity_plans['"]\s*\)\s*\.select\(\s*['"]([^'"]+)['"]\s*\)\s*\.in\(/,
  );
  assert.ok(planSelectMatch, 'expected .from("activity_plans").select(...).in(...) for fallback planIds');
  assert.match(
    planSelectMatch[1],
    /\bis_year_round\b/,
    'plans select must include is_year_round so the aggregator can read it',
  );
});

test('Route adds a separate activity_plan_seasons query for the fallback path', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  // The route should now query activity_plan_seasons twice: once inside
  // the `if (activityPlanId)` branch (existing), once in the fallback
  // branch keyed via .in('activity_plan_id', planIds).
  const seasonsSelectMatches = src.match(/\.from\(\s*['"]activity_plan_seasons['"]\s*\)/g);
  assert.ok(seasonsSelectMatches, 'route must query activity_plan_seasons');
  assert.ok(
    seasonsSelectMatches.length >= 2,
    `expected at least 2 activity_plan_seasons queries (plan-scoped + fallback aggregate), found ${seasonsSelectMatches.length}`,
  );
  assert.match(
    src,
    /\.in\(\s*['"]activity_plan_id['"]\s*,/,
    'fallback aggregate must filter via .in("activity_plan_id", planIds)',
  );
});

test('Route fallback path is guarded by `!activityPlanId && planIds.length > 0` (does not double-query)', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  // The fallback aggregator block must only run when the caller did
  // NOT pass an activityPlanId AND there are rule-linked planIds to
  // aggregate. Otherwise the original plan-scoped branch handles it,
  // and an empty .in('activity_plan_id', []) is wasteful.
  assert.match(
    src,
    /if\s*\(\s*!activityPlanId\s*&&\s*planIds\.length\s*>\s*0\s*\)/,
    'fallback aggregate must be guarded by !activityPlanId && planIds.length > 0',
  );
});

test('Route preserves GH-1289 plan-scoped behavior: the if (activityPlanId) branch still loads seasons + is_year_round into the preview', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  // Locate the original activityPlanId branch. It must still assign
  // previewPlanSeasons and previewIsYearRound from planData /
  // seasonsData — the fix must not delete this path.
  assert.match(src, /previewPlanSeasons\s*=\s*\(seasonsData \|\| \[\]\)/);
  assert.match(src, /previewIsYearRound\s*=\s*Boolean\(planData\.is_year_round\)/);
});

test('Route still calls resolvePreviewCanonicalReason with previewPlanSeasons + previewIsYearRound', () => {
  // The resolver contract is what UI reads. Make sure the fallback
  // fix didn't accidentally bypass it.
  const src = readFileSync(ROUTE_PATH, 'utf8');
  const callIdx = src.indexOf('resolvePreviewCanonicalReason(');
  assert.ok(callIdx > 0);
  const block = src.slice(callIdx, callIdx + 400);
  assert.match(block, /isYearRound:\s*previewIsYearRound/);
  assert.match(block, /seasons:\s*previewPlanSeasons/);
});

// ---------- helper file source contract ----------

test('Helper file has no PII / auth / secret references', () => {
  const src = readFileSync(
    join(REPO_ROOT, 'src/lib/availability-v2/aggregate-fallback-season-gate.mjs'),
    'utf8',
  );
  assert.doesNotMatch(src, /\bcontact_email\b/);
  assert.doesNotMatch(src, /\btraveler_email\b/);
  assert.doesNotMatch(src, /Authorization/i);
  assert.doesNotMatch(src, /service_role/i);
});
