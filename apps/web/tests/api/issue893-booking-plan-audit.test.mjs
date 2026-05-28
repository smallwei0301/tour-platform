/**
 * Issue #893 — Booking plan repair DRY_RUN audit skeleton
 *
 * Tests the classification logic in scripts/admin/audit-or-repair-booking-plans.mjs
 * All tests are in-memory (no Supabase connection needed).
 *
 * Verifies:
 * 1. OK — active formal plan with matching slug
 * 2. MISSING_FORMAL_PLAN — no activity_plans row matches the public plan id
 * 3. INACTIVE_FORMAL_PLAN — matched but status != 'active'
 * 4. CAPACITY_MISMATCH — schedule.capacity > plan.max_participants
 * 5. NEEDS_HUMAN_REVIEW — price/duration/maxParticipants differs between public and formal
 * 6. TEST_FIXTURE — activity slug contains 'e2e', 'playwright', 'test'
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import the exported classification functions from the script
const scriptPath = path.resolve(
  __dirname,
  '../../../../scripts/admin/audit-or-repair-booking-plans.mjs'
);
const { classifyPublicPlan, isTestFixture } = await import(scriptPath);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACTIVE_FORMAL_PLAN = {
  id: 'fp-uuid-001',
  slug: 'standard-tour',
  status: 'active',
  max_participants: 10,
  min_participants: 1,
  base_price: 1500,
  duration_minutes: 120,
};

const PUBLIC_PLAN_OK = {
  id: 'standard-tour',
  price: 1500,
  duration: 120,
  maxParticipants: 10,
};

const SCHEDULES_WITHIN_CAPACITY = [
  { id: 'sched-1', plan_id: 'fp-uuid-001', capacity: 8 },
];

// ── isTestFixture ─────────────────────────────────────────────────────────────

describe('isTestFixture', () => {
  it('returns true for slug containing "e2e"', () => {
    assert.equal(isTestFixture('activity-e2e-taipei'), true);
  });

  it('returns true for slug containing "playwright"', () => {
    assert.equal(isTestFixture('playwright-smoke-tour'), true);
  });

  it('returns true for slug containing "test"', () => {
    assert.equal(isTestFixture('test-activity-123'), true);
  });

  it('is case-insensitive', () => {
    assert.equal(isTestFixture('E2E-Activity'), true);
    assert.equal(isTestFixture('Playwright-Tour'), true);
  });

  it('returns false for normal activity slugs', () => {
    assert.equal(isTestFixture('taipei-night-market'), false);
    assert.equal(isTestFixture('jiufen-half-day'), false);
  });

  it('returns false for empty string', () => {
    assert.equal(isTestFixture(''), false);
  });

  it('returns false for null/undefined', () => {
    assert.equal(isTestFixture(null), false);
    assert.equal(isTestFixture(undefined), false);
  });
});

// ── classifyPublicPlan ────────────────────────────────────────────────────────

describe('classifyPublicPlan: OK', () => {
  it('returns OK when active formal plan matches public plan slug and all fields agree', () => {
    const result = classifyPublicPlan(
      PUBLIC_PLAN_OK,
      [ACTIVE_FORMAL_PLAN],
      SCHEDULES_WITHIN_CAPACITY,
      'taipei-night-market'
    );
    assert.equal(result, 'OK');
  });

  it('returns OK when matched by formal plan id instead of slug', () => {
    const publicPlan = { id: 'fp-uuid-001' }; // matches by id field
    const result = classifyPublicPlan(
      publicPlan,
      [ACTIVE_FORMAL_PLAN],
      [],
      'normal-activity'
    );
    assert.equal(result, 'OK');
  });

  it('returns OK when no schedules exist (no capacity to violate)', () => {
    const result = classifyPublicPlan(
      PUBLIC_PLAN_OK,
      [ACTIVE_FORMAL_PLAN],
      [], // no schedules
      'normal-activity'
    );
    assert.equal(result, 'OK');
  });
});

describe('classifyPublicPlan: MISSING_FORMAL_PLAN', () => {
  it('returns MISSING_FORMAL_PLAN when formalPlans is empty', () => {
    const result = classifyPublicPlan(
      PUBLIC_PLAN_OK,
      [], // no formal plans
      [],
      'normal-activity'
    );
    assert.equal(result, 'MISSING_FORMAL_PLAN');
  });

  it('returns MISSING_FORMAL_PLAN when no formal plan slug or id matches', () => {
    const formalPlan = { ...ACTIVE_FORMAL_PLAN, slug: 'different-slug', id: 'different-id' };
    const result = classifyPublicPlan(
      PUBLIC_PLAN_OK,
      [formalPlan],
      [],
      'normal-activity'
    );
    assert.equal(result, 'MISSING_FORMAL_PLAN');
  });

  it('returns MISSING_FORMAL_PLAN when publicPlan has no id or slug', () => {
    const result = classifyPublicPlan(
      { price: 1500 }, // no id or slug
      [ACTIVE_FORMAL_PLAN],
      [],
      'normal-activity'
    );
    assert.equal(result, 'MISSING_FORMAL_PLAN');
  });

  it('returns MISSING_FORMAL_PLAN when formalPlans is null', () => {
    const result = classifyPublicPlan(
      PUBLIC_PLAN_OK,
      null,
      [],
      'normal-activity'
    );
    assert.equal(result, 'MISSING_FORMAL_PLAN');
  });
});

describe('classifyPublicPlan: INACTIVE_FORMAL_PLAN', () => {
  it('returns INACTIVE_FORMAL_PLAN when formal plan status is inactive', () => {
    const inactivePlan = { ...ACTIVE_FORMAL_PLAN, status: 'inactive' };
    const result = classifyPublicPlan(
      PUBLIC_PLAN_OK,
      [inactivePlan],
      [],
      'normal-activity'
    );
    assert.equal(result, 'INACTIVE_FORMAL_PLAN');
  });

  it('returns INACTIVE_FORMAL_PLAN when formal plan status is archived', () => {
    const archivedPlan = { ...ACTIVE_FORMAL_PLAN, status: 'archived' };
    const result = classifyPublicPlan(
      PUBLIC_PLAN_OK,
      [archivedPlan],
      [],
      'normal-activity'
    );
    assert.equal(result, 'INACTIVE_FORMAL_PLAN');
  });

  it('returns INACTIVE_FORMAL_PLAN when formal plan status is draft', () => {
    const draftPlan = { ...ACTIVE_FORMAL_PLAN, status: 'draft' };
    const result = classifyPublicPlan(
      PUBLIC_PLAN_OK,
      [draftPlan],
      [],
      'normal-activity'
    );
    assert.equal(result, 'INACTIVE_FORMAL_PLAN');
  });
});

describe('classifyPublicPlan: CAPACITY_MISMATCH', () => {
  it('returns CAPACITY_MISMATCH when schedule capacity exceeds plan max_participants', () => {
    const overCapacitySchedule = [
      { id: 'sched-1', plan_id: 'fp-uuid-001', capacity: 20 }, // > max_participants=10
    ];
    const result = classifyPublicPlan(
      PUBLIC_PLAN_OK,
      [ACTIVE_FORMAL_PLAN],
      overCapacitySchedule,
      'normal-activity'
    );
    assert.equal(result, 'CAPACITY_MISMATCH');
  });

  it('returns CAPACITY_MISMATCH when matching by activity_plan_id column', () => {
    const schedules = [
      { id: 'sched-1', activity_plan_id: 'fp-uuid-001', capacity: 15 }, // > max_participants=10
    ];
    const result = classifyPublicPlan(
      PUBLIC_PLAN_OK,
      [ACTIVE_FORMAL_PLAN],
      schedules,
      'normal-activity'
    );
    assert.equal(result, 'CAPACITY_MISMATCH');
  });

  it('returns OK when schedule capacity equals max_participants (boundary)', () => {
    const equalCapacitySchedule = [
      { id: 'sched-1', plan_id: 'fp-uuid-001', capacity: 10 }, // == max_participants=10
    ];
    const result = classifyPublicPlan(
      PUBLIC_PLAN_OK,
      [ACTIVE_FORMAL_PLAN],
      equalCapacitySchedule,
      'normal-activity'
    );
    assert.equal(result, 'OK');
  });
});

describe('classifyPublicPlan: NEEDS_HUMAN_REVIEW', () => {
  it('returns NEEDS_HUMAN_REVIEW when public plan price differs from formal base_price', () => {
    const publicPlan = { ...PUBLIC_PLAN_OK, price: 999 }; // formal has 1500
    const result = classifyPublicPlan(
      publicPlan,
      [ACTIVE_FORMAL_PLAN],
      [],
      'normal-activity'
    );
    assert.equal(result, 'NEEDS_HUMAN_REVIEW');
  });

  it('returns NEEDS_HUMAN_REVIEW when public plan duration differs from formal duration_minutes', () => {
    const publicPlan = { ...PUBLIC_PLAN_OK, duration: 60 }; // formal has 120
    const result = classifyPublicPlan(
      publicPlan,
      [ACTIVE_FORMAL_PLAN],
      [],
      'normal-activity'
    );
    assert.equal(result, 'NEEDS_HUMAN_REVIEW');
  });

  it('returns NEEDS_HUMAN_REVIEW when public plan maxParticipants differs from formal max_participants', () => {
    const publicPlan = { ...PUBLIC_PLAN_OK, maxParticipants: 5 }; // formal has 10
    const result = classifyPublicPlan(
      publicPlan,
      [ACTIVE_FORMAL_PLAN],
      [],
      'normal-activity'
    );
    assert.equal(result, 'NEEDS_HUMAN_REVIEW');
  });
});

describe('classifyPublicPlan: TEST_FIXTURE', () => {
  it('returns TEST_FIXTURE for activity slug containing e2e', () => {
    const result = classifyPublicPlan(
      PUBLIC_PLAN_OK,
      [], // even with missing formal plan, TEST_FIXTURE takes priority
      [],
      'e2e-smoke-tour'
    );
    assert.equal(result, 'TEST_FIXTURE');
  });

  it('returns TEST_FIXTURE for activity slug containing playwright', () => {
    const result = classifyPublicPlan(
      PUBLIC_PLAN_OK,
      [],
      [],
      'playwright-test-activity'
    );
    assert.equal(result, 'TEST_FIXTURE');
  });

  it('returns TEST_FIXTURE for activity slug containing test', () => {
    const result = classifyPublicPlan(
      PUBLIC_PLAN_OK,
      [ACTIVE_FORMAL_PLAN],
      [],
      'test-activity-taipei'
    );
    assert.equal(result, 'TEST_FIXTURE');
  });

  it('TEST_FIXTURE takes priority over MISSING_FORMAL_PLAN', () => {
    const result = classifyPublicPlan(
      { id: 'nonexistent-plan' },
      [], // no formal plans
      [],
      'e2e-activity'
    );
    assert.equal(result, 'TEST_FIXTURE');
  });
});

describe('classifyPublicPlan: edge cases', () => {
  it('handles null schedules gracefully', () => {
    const result = classifyPublicPlan(
      PUBLIC_PLAN_OK,
      [ACTIVE_FORMAL_PLAN],
      null,
      'normal-activity'
    );
    assert.equal(result, 'OK');
  });

  it('handles undefined schedules gracefully', () => {
    const result = classifyPublicPlan(
      PUBLIC_PLAN_OK,
      [ACTIVE_FORMAL_PLAN],
      undefined,
      'normal-activity'
    );
    assert.equal(result, 'OK');
  });

  it('ignores schedules from different plan ids', () => {
    // Schedule belongs to a different plan, should not trigger CAPACITY_MISMATCH
    const unrelatedSchedule = [
      { id: 'sched-1', plan_id: 'different-plan-id', capacity: 99 },
    ];
    const result = classifyPublicPlan(
      PUBLIC_PLAN_OK,
      [ACTIVE_FORMAL_PLAN],
      unrelatedSchedule,
      'normal-activity'
    );
    assert.equal(result, 'OK');
  });

  it('matches multiple formal plans and returns OK for the matching active one', () => {
    const otherPlan = { ...ACTIVE_FORMAL_PLAN, id: 'fp-uuid-002', slug: 'premium-tour' };
    const result = classifyPublicPlan(
      PUBLIC_PLAN_OK,
      [otherPlan, ACTIVE_FORMAL_PLAN], // ACTIVE_FORMAL_PLAN has slug 'standard-tour' which matches
      [],
      'normal-activity'
    );
    assert.equal(result, 'OK');
  });
});
