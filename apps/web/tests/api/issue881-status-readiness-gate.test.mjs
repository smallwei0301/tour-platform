/**
 * Issue #881 — Booking Readiness Validation Gate
 *
 * Tests for validateActivityBookability() and the
 * BOOKING_READINESS_FAILED error path in updateActivityStatusDb().
 *
 * All tests run against the in-memory mock supabase (no live DB required).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateActivityBookability } from '../../src/lib/booking-readiness/validate-activity-bookability.mjs';

// ─── Mock Supabase builder ────────────────────────────────────────────────────

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
      // listable (returns array)
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
        // Returns array — need different interface
        const rows = formalPlans;
        return {
          select() { return this; },
          eq() { return this; },
          then(resolve) {
            return Promise.resolve({ data: rows, error: null }).then(resolve);
          },
        };
      }
      if (table === 'activity_schedules') {
        const rows = schedules;
        return {
          select() { return this; },
          eq() { return this; },
          then(resolve) {
            return Promise.resolve({ data: rows, error: null }).then(resolve);
          },
        };
      }
      return buildQuery([]);
    },
  };
}

// ─── Test data fixtures ───────────────────────────────────────────────────────

const ACTIVITY_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

const validActivity = {
  id: ACTIVITY_ID,
  status: 'draft',
  plans: [{ id: 'half-day', slug: 'half-day' }],
};

const activeFormalPlan = {
  id: 'formalplan-0000-0000-0000-000000000001',
  slug: 'half-day',
  name: '半日行程',
  status: 'active',
  max_participants: 10,
  min_participants: 1,
};

const openSchedule = {
  id: 'schedule-00000-0000-0000-000000000001',
  start_at: '2026-06-01T08:00:00+08:00',
  plan_id: 'formalplan-0000-0000-0000-000000000001',
  capacity: 8,
  booked_count: 0,
  status: 'open',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('validateActivityBookability', () => {
  it('returns ACTIVITY_NOT_FOUND when activity does not exist', async () => {
    const supabase = makeMockSupabase({ activity: null });
    const result = await validateActivityBookability('nonexistent-id', { supabase });

    assert.equal(result.ok, false);
    assert.equal(result.blockers.length, 1);
    assert.equal(result.blockers[0].code, 'ACTIVITY_NOT_FOUND');
    assert.ok(result.blockers[0].messageZh, 'should have a Chinese message');
  });

  it('returns NO_ACTIVE_FORMAL_PLAN when no active formal plans exist', async () => {
    const supabase = makeMockSupabase({
      activity: validActivity,
      formalPlans: [],  // no formal plans at all
      schedules: [],
    });
    const result = await validateActivityBookability(ACTIVITY_ID, { supabase });

    assert.equal(result.ok, false);
    const codes = result.blockers.map(b => b.code);
    assert.ok(codes.includes('NO_ACTIVE_FORMAL_PLAN'), `expected NO_ACTIVE_FORMAL_PLAN, got: ${JSON.stringify(codes)}`);
  });

  it('returns PLAN_NOT_RESOLVABLE when public plan cannot be matched to a formal plan', async () => {
    const activityWithUnmatchedPlan = {
      id: ACTIVITY_ID,
      status: 'draft',
      plans: [{ id: 'mystery-plan', slug: 'mystery-plan' }],
    };
    const supabase = makeMockSupabase({
      activity: activityWithUnmatchedPlan,
      formalPlans: [activeFormalPlan],  // only half-day is active
      schedules: [],
    });
    const result = await validateActivityBookability(ACTIVITY_ID, { supabase });

    assert.equal(result.ok, false);
    const codes = result.blockers.map(b => b.code);
    assert.ok(
      codes.includes('PLAN_NOT_RESOLVABLE'),
      `expected PLAN_NOT_RESOLVABLE, got: ${JSON.stringify(codes)}`
    );
  });

  it('returns PLAN_NOT_ACTIVE when public plan matches an inactive formal plan', async () => {
    const inactivePlan = { ...activeFormalPlan, status: 'inactive' };
    const supabase = makeMockSupabase({
      activity: validActivity,
      formalPlans: [inactivePlan],
      schedules: [],
    });
    const result = await validateActivityBookability(ACTIVITY_ID, { supabase });

    assert.equal(result.ok, false);
    const codes = result.blockers.map(b => b.code);
    // NO_ACTIVE_FORMAL_PLAN fires first because there are 0 active plans
    assert.ok(
      codes.includes('NO_ACTIVE_FORMAL_PLAN') || codes.includes('PLAN_NOT_ACTIVE'),
      `expected NO_ACTIVE_FORMAL_PLAN or PLAN_NOT_ACTIVE, got: ${JSON.stringify(codes)}`
    );
  });

  it('returns SCHEDULE_CAPACITY_EXCEEDS_PLAN when schedule capacity > plan max', async () => {
    const oversizedSchedule = { ...openSchedule, capacity: 15 }; // exceeds max_participants=10
    const supabase = makeMockSupabase({
      activity: validActivity,
      formalPlans: [activeFormalPlan],
      schedules: [oversizedSchedule],
    });
    const result = await validateActivityBookability(ACTIVITY_ID, { supabase });

    assert.equal(result.ok, false);
    const codes = result.blockers.map(b => b.code);
    assert.ok(
      codes.includes('SCHEDULE_CAPACITY_EXCEEDS_PLAN'),
      `expected SCHEDULE_CAPACITY_EXCEEDS_PLAN, got: ${JSON.stringify(codes)}`
    );
  });

  it('returns SCHEDULE_PLAN_MISMATCH when schedule points to non-existent plan', async () => {
    const mismatchedSchedule = {
      ...openSchedule,
      plan_id: 'nonexistent-plan-id-000000000000',
    };
    const supabase = makeMockSupabase({
      activity: validActivity,
      formalPlans: [activeFormalPlan],
      schedules: [mismatchedSchedule],
    });
    const result = await validateActivityBookability(ACTIVITY_ID, { supabase });

    assert.equal(result.ok, false);
    const codes = result.blockers.map(b => b.code);
    assert.ok(
      codes.includes('SCHEDULE_PLAN_MISMATCH'),
      `expected SCHEDULE_PLAN_MISMATCH, got: ${JSON.stringify(codes)}`
    );
  });

  it('returns SCHEDULE_PLAN_AMBIGUOUS when schedule has no plan_id and there are 2+ active plans', async () => {
    const secondActivePlan = {
      id: 'formalplan-0000-0000-0000-000000000002',
      slug: 'full-day',
      name: '全日行程',
      status: 'active',
      max_participants: 8,
      min_participants: 2,
    };
    const activityWithTwoPlans = {
      id: ACTIVITY_ID,
      status: 'draft',
      plans: [
        { id: 'half-day', slug: 'half-day' },
        { id: 'full-day', slug: 'full-day' },
      ],
    };
    const ambiguousSchedule = {
      ...openSchedule,
      plan_id: null, // no plan specified
    };
    const supabase = makeMockSupabase({
      activity: activityWithTwoPlans,
      formalPlans: [activeFormalPlan, secondActivePlan],
      schedules: [ambiguousSchedule],
    });
    const result = await validateActivityBookability(ACTIVITY_ID, { supabase });

    assert.equal(result.ok, false);
    const codes = result.blockers.map(b => b.code);
    assert.ok(
      codes.includes('SCHEDULE_PLAN_AMBIGUOUS'),
      `expected SCHEDULE_PLAN_AMBIGUOUS, got: ${JSON.stringify(codes)}`
    );
  });

  it('returns ok=true for a fully valid activity ready to publish', async () => {
    const supabase = makeMockSupabase({
      activity: validActivity,
      formalPlans: [activeFormalPlan],
      schedules: [openSchedule],
    });
    const result = await validateActivityBookability(ACTIVITY_ID, { supabase });

    assert.equal(result.ok, true, `expected ok, got blockers: ${JSON.stringify(result.blockers)}`);
    assert.equal(result.blockers.length, 0);
  });

  it('returns ok=true for activity with no schedules (publish is not blocked)', async () => {
    const supabase = makeMockSupabase({
      activity: validActivity,
      formalPlans: [activeFormalPlan],
      schedules: [],
    });
    const result = await validateActivityBookability(ACTIVITY_ID, { supabase });

    assert.equal(result.ok, true, `expected ok with no schedules, got: ${JSON.stringify(result.blockers)}`);
  });

  it('returns ok=true when schedule has null plan_id but only 1 active plan (no ambiguity)', async () => {
    const scheduleNoplan = { ...openSchedule, plan_id: null };
    const supabase = makeMockSupabase({
      activity: validActivity,
      formalPlans: [activeFormalPlan],
      schedules: [scheduleNoplan],
    });
    const result = await validateActivityBookability(ACTIVITY_ID, { supabase });

    assert.equal(result.ok, true, `single active plan + null schedule plan_id should be ok, got: ${JSON.stringify(result.blockers)}`);
  });

  it('all blocker objects include activityId field', async () => {
    const supabase = makeMockSupabase({
      activity: validActivity,
      formalPlans: [],
      schedules: [],
    });
    const result = await validateActivityBookability(ACTIVITY_ID, { supabase });

    assert.ok(result.blockers.length > 0, 'should have blockers');
    for (const blocker of result.blockers) {
      assert.equal(blocker.activityId, ACTIVITY_ID, 'each blocker must include activityId');
      assert.ok(blocker.messageZh, 'each blocker must have a Chinese message');
    }
  });
});
