/**
 * Issue #1131 — Readiness gate: extend validateActivityBookability for
 * plan/schedule integrity checks.
 *
 * New blocker codes:
 *   LEGACY_ONLY_PLANS          — activity has legacy JSONB plans but zero activity_plans rows
 *   ALL_PLANS_INACTIVE         — all activity_plans rows are inactive/archived
 *   SCHEDULE_PLAN_CROSS_ACTIVITY — schedule plan_id belongs to a different activity
 *   NO_FUTURE_SCHEDULES        — schedules exist but all are in the past
 *
 * New warning (non-blocking):
 *   SCHEDULE_PLAN_AUTORESOLVABLE — plan_id = null, exactly 1 active plan
 *
 * Return shape extended to { ok, blockers, warnings } (additive, backward-compatible)
 *
 * All tests run against the in-memory mock supabase (no live DB required).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateActivityBookability } from '../../src/lib/booking-readiness/validate-activity-bookability.mjs';

// ─── Mock Supabase builder ────────────────────────────────────────────────────

/**
 * makeMockSupabase — extended version that supports allPlansById for cross-activity checks.
 *
 * @param {object} opts
 * @param {object|null}  opts.activity
 * @param {object[]}     opts.formalPlans      — rows for activity_plans (this activity)
 * @param {object[]}     opts.schedules         — rows for activity_schedules
 */
function makeMockSupabase({ activity = null, formalPlans = [], schedules = [] } = {}) {
  function buildQuery(rows) {
    return {
      _rows: rows,
      select() { return this; },
      eq() { return this; },
      single() {
        const row = this._rows[0] ?? null;
        const error = row ? null : { message: 'not found' };
        return Promise.resolve({ data: row, error });
      },
      maybeSingle() {
        const row = this._rows[0] ?? null;
        return Promise.resolve({ data: row, error: null });
      },
      then(resolve) {
        return Promise.resolve({ data: this._rows, error: null }).then(resolve);
      },
    };
  }

  return {
    from(table) {
      if (table === 'activities') {
        return buildQuery(activity ? [activity] : []);
      }
      if (table === 'activity_plans') {
        return {
          _rows: formalPlans,
          select() { return this; },
          eq(col, val) {
            // Support .eq('id', someId) for cross-activity plan lookup
            if (col === 'id') {
              return {
                _rows: formalPlans.filter(p => p.id === val),
                select() { return this; },
                eq() { return this; },
                maybeSingle() {
                  const row = this._rows[0] ?? null;
                  return Promise.resolve({ data: row, error: null });
                },
                then(resolve) {
                  return Promise.resolve({ data: this._rows, error: null }).then(resolve);
                },
              };
            }
            return this;
          },
          maybeSingle() {
            const row = this._rows[0] ?? null;
            return Promise.resolve({ data: row, error: null });
          },
          then(resolve) {
            return Promise.resolve({ data: this._rows, error: null }).then(resolve);
          },
        };
      }
      if (table === 'activity_schedules') {
        return {
          select() { return this; },
          eq() { return this; },
          then(resolve) {
            return Promise.resolve({ data: schedules, error: null }).then(resolve);
          },
        };
      }
      return buildQuery([]);
    },
  };
}

// ─── Test data fixtures ───────────────────────────────────────────────────────

const ACTIVITY_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER_ACTIVITY_ID = 'bbbbbbbb-0000-0000-0000-000000000002';

const PLAN_ID_A = 'formalplan-0000-0000-0000-000000000001';
const PLAN_ID_B = 'formalplan-0000-0000-0000-000000000002';
const CROSS_PLAN_ID = 'formalplan-0000-0000-0000-000000000099';

/** Activity that has legacy JSONB plans (activity.plans) but NO activity_plans rows */
const activityWithLegacyPlans = {
  id: ACTIVITY_ID,
  status: 'draft',
  plans: [{ id: 'half-day', slug: 'half-day' }],
};

/** Activity with NO legacy JSONB plans and NO activity_plans rows */
const activityNoPlansAtAll = {
  id: ACTIVITY_ID,
  status: 'draft',
  plans: null,
};

/** Activity without legacy JSONB plans (used when activity_plans rows exist) */
const activityNoLegacyPlans = {
  id: ACTIVITY_ID,
  status: 'draft',
  plans: [],
  guide_id: 'cccccccc-0000-0000-0000-000000000003',
};

const activeFormalPlan = {
  id: PLAN_ID_A,
  activity_id: ACTIVITY_ID,
  slug: 'half-day',
  name: '半日行程',
  status: 'active',
  max_participants: 10,
  min_participants: 1,
};

const inactiveFormalPlan = {
  id: PLAN_ID_A,
  activity_id: ACTIVITY_ID,
  slug: 'half-day',
  name: '半日行程',
  status: 'inactive',
  max_participants: 10,
  min_participants: 1,
};

const archivedFormalPlan = {
  id: PLAN_ID_B,
  activity_id: ACTIVITY_ID,
  slug: 'full-day',
  name: '全日行程',
  status: 'archived',
  max_participants: 8,
  min_participants: 2,
};

/** Plan that belongs to a DIFFERENT activity — used for cross-activity detection */
const crossActivityPlan = {
  id: CROSS_PLAN_ID,
  activity_id: OTHER_ACTIVITY_ID,
  slug: 'other-tour',
  name: '另一行程',
  status: 'active',
  max_participants: 6,
  min_participants: 1,
};

const FUTURE_DATE  = '2099-01-01T08:00:00+08:00';
const PAST_DATE    = '2020-01-01T08:00:00+08:00';

const futureSchedule = {
  id: 'schedule-00000-0000-0000-000000000010',
  start_at: FUTURE_DATE,
  end_at:   '2099-01-01T17:00:00+08:00',
  plan_id: PLAN_ID_A,
  capacity: 8,
  booked_count: 0,
  status: 'open',
};

const pastSchedule = {
  id: 'schedule-00000-0000-0000-000000000011',
  start_at: PAST_DATE,
  end_at:   '2020-01-01T17:00:00+08:00',
  plan_id: PLAN_ID_A,
  capacity: 8,
  booked_count: 0,
  status: 'open',
};

const crossActivitySchedule = {
  id: 'schedule-00000-0000-0000-000000000020',
  start_at: FUTURE_DATE,
  end_at:   '2099-01-01T17:00:00+08:00',
  plan_id: CROSS_PLAN_ID,       // points to a plan on a DIFFERENT activity
  capacity: 6,
  booked_count: 0,
  status: 'open',
};

const nullPlanSchedule = {
  id: 'schedule-00000-0000-0000-000000000030',
  start_at: FUTURE_DATE,
  end_at:   '2099-01-01T17:00:00+08:00',
  plan_id: null,
  capacity: 8,
  booked_count: 0,
  status: 'open',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('validateActivityBookability — plan/schedule integrity (issue #1131)', () => {

  // ── Test 1: LEGACY_ONLY_PLANS ──────────────────────────────────────────────
  it('blocks LEGACY_ONLY_PLANS when activity has legacy JSONB plans but zero activity_plans rows', async () => {
    const supabase = makeMockSupabase({
      activity: activityWithLegacyPlans,
      formalPlans: [],   // zero activity_plans rows
      schedules: [],
    });
    const result = await validateActivityBookability(ACTIVITY_ID, { supabase });

    assert.equal(result.ok, false, 'should be blocked');
    const codes = result.blockers.map(b => b.code);
    assert.ok(
      codes.includes('LEGACY_ONLY_PLANS'),
      `expected LEGACY_ONLY_PLANS, got: ${JSON.stringify(codes)}`
    );
  });

  // ── Test 2: ALL_PLANS_INACTIVE ─────────────────────────────────────────────
  it('blocks ALL_PLANS_INACTIVE when all activity_plans rows are inactive/archived', async () => {
    const supabase = makeMockSupabase({
      activity: activityNoLegacyPlans,
      formalPlans: [inactiveFormalPlan, archivedFormalPlan],  // both inactive/archived
      schedules: [],
    });
    const result = await validateActivityBookability(ACTIVITY_ID, { supabase });

    assert.equal(result.ok, false, 'should be blocked');
    const codes = result.blockers.map(b => b.code);
    assert.ok(
      codes.includes('ALL_PLANS_INACTIVE'),
      `expected ALL_PLANS_INACTIVE, got: ${JSON.stringify(codes)}`
    );
    assert.ok(
      !codes.includes('LEGACY_ONLY_PLANS'),
      `should not include LEGACY_ONLY_PLANS (formalPlans rows exist), got: ${JSON.stringify(codes)}`
    );
  });

  // ── Test 3: SCHEDULE_PLAN_CROSS_ACTIVITY ───────────────────────────────────
  it('blocks SCHEDULE_PLAN_CROSS_ACTIVITY when schedule plan_id belongs to a different activity', async () => {
    // allPlansById includes the cross-activity plan keyed by id
    const allPlansById = {
      [CROSS_PLAN_ID]: crossActivityPlan,
    };

    const supabase = makeMockSupabase({
      activity: activityNoLegacyPlans,
      formalPlans: [activeFormalPlan],
      schedules: [crossActivitySchedule],
    });
    const result = await validateActivityBookability(ACTIVITY_ID, { supabase, allPlansById });

    assert.equal(result.ok, false, 'should be blocked');
    const codes = result.blockers.map(b => b.code);
    assert.ok(
      codes.includes('SCHEDULE_PLAN_CROSS_ACTIVITY'),
      `expected SCHEDULE_PLAN_CROSS_ACTIVITY, got: ${JSON.stringify(codes)}`
    );
  });

  // ── Test 4: NO_FUTURE_SCHEDULES with past schedules only ──────────────────
  it('blocks NO_FUTURE_SCHEDULES when all schedules are in the past', async () => {
    const now = '2030-06-01T00:00:00Z'; // all schedules are before this

    const supabase = makeMockSupabase({
      activity: activityNoLegacyPlans,
      formalPlans: [activeFormalPlan],
      schedules: [pastSchedule],
    });
    const result = await validateActivityBookability(ACTIVITY_ID, { supabase, now });

    assert.equal(result.ok, false, 'should be blocked');
    const codes = result.blockers.map(b => b.code);
    assert.ok(
      codes.includes('NO_FUTURE_SCHEDULES'),
      `expected NO_FUTURE_SCHEDULES, got: ${JSON.stringify(codes)}`
    );
  });

  // ── Test 5: NO_FUTURE_SCHEDULES does NOT fire with a future schedule ───────
  it('does NOT block NO_FUTURE_SCHEDULES when at least one future schedule exists', async () => {
    const now = '2030-06-01T00:00:00Z'; // futureSchedule is 2099, so still in future

    const supabase = makeMockSupabase({
      activity: activityNoLegacyPlans,
      formalPlans: [activeFormalPlan],
      schedules: [futureSchedule],
    });
    const result = await validateActivityBookability(ACTIVITY_ID, { supabase, now });

    assert.equal(result.ok, true, `expected ok, got blockers: ${JSON.stringify(result.blockers)}`);
    const codes = result.blockers.map(b => b.code);
    assert.ok(
      !codes.includes('NO_FUTURE_SCHEDULES'),
      `should NOT include NO_FUTURE_SCHEDULES, got: ${JSON.stringify(codes)}`
    );
  });

  // ── Test 6: SCHEDULE_PLAN_AUTORESOLVABLE warning (non-blocking) ────────────
  it('emits SCHEDULE_PLAN_AUTORESOLVABLE warning (non-blocking) when plan_id=null and exactly 1 active plan', async () => {
    const supabase = makeMockSupabase({
      activity: activityNoLegacyPlans,
      formalPlans: [activeFormalPlan],
      schedules: [nullPlanSchedule],
    });
    const result = await validateActivityBookability(ACTIVITY_ID, { supabase });

    assert.equal(result.ok, true, `expected ok (warning is non-blocking), got blockers: ${JSON.stringify(result.blockers)}`);
    assert.ok(Array.isArray(result.warnings), 'result.warnings must be an array');
    assert.ok(
      result.warnings.includes('SCHEDULE_PLAN_AUTORESOLVABLE'),
      `expected SCHEDULE_PLAN_AUTORESOLVABLE in warnings, got: ${JSON.stringify(result.warnings)}`
    );
    assert.equal(result.blockers.length, 0, 'should have zero blockers');
  });

  // ── Test 7: Regression — NO_FUTURE_SCHEDULES must NOT fire when zero schedules ──
  it('regression: does NOT block NO_FUTURE_SCHEDULES when there are zero schedules', async () => {
    const now = '2030-06-01T00:00:00Z';

    const supabase = makeMockSupabase({
      activity: activityNoLegacyPlans,
      formalPlans: [activeFormalPlan],
      schedules: [],  // zero schedules
    });
    const result = await validateActivityBookability(ACTIVITY_ID, { supabase, now });

    assert.equal(result.ok, true, `expected ok with no schedules, got: ${JSON.stringify(result.blockers)}`);
    const codes = result.blockers.map(b => b.code);
    assert.ok(
      !codes.includes('NO_FUTURE_SCHEDULES'),
      `should NOT include NO_FUTURE_SCHEDULES when no schedules exist, got: ${JSON.stringify(codes)}`
    );
  });

  // ── Test 8: Regression — result always includes warnings array ────────────
  it('regression: result always includes a warnings array (even if empty)', async () => {
    const supabase = makeMockSupabase({
      activity: activityNoLegacyPlans,
      formalPlans: [activeFormalPlan],
      schedules: [],
    });
    const result = await validateActivityBookability(ACTIVITY_ID, { supabase });

    assert.ok(Array.isArray(result.warnings), 'result.warnings must always be an array');
  });

  // ── Test 9: ALL_PLANS_INACTIVE does not fire when at least one is active ───
  it('regression: ALL_PLANS_INACTIVE does NOT fire when there is at least one active plan', async () => {
    const supabase = makeMockSupabase({
      activity: activityNoLegacyPlans,
      formalPlans: [activeFormalPlan, inactiveFormalPlan],
      schedules: [],
    });
    const result = await validateActivityBookability(ACTIVITY_ID, { supabase });

    const codes = result.blockers.map(b => b.code);
    assert.ok(
      !codes.includes('ALL_PLANS_INACTIVE'),
      `should NOT include ALL_PLANS_INACTIVE when at least one active plan exists, got: ${JSON.stringify(codes)}`
    );
  });
});
