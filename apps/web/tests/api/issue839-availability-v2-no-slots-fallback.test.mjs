/**
 * #839 — V2 availability route: legacy fallback when V2 produces zero slots.
 *
 * Bug: activity has V2 activity_plans rows but no guide_availability_rules,
 * so V2 emits status='not-open' for every plan×date. The route did not detect
 * this "unconfigured" condition and served the all-not-open V2 result, which
 * the UI then used to overwrite the open legacy snapshot.
 *
 * Fix: add v2HasGeneratedSlots() helper + route-level fallback to legacy when
 * V2 produces slotCount===0 across the whole window.
 */

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

// ── Supabase mock (sequential queue, copied from issue787 pattern) ──────────
function createSupabaseMock(results) {
  const calls = [];
  let index = 0;

  const take = (terminal, table, filters) => {
    const next = results[index++];
    assert.ok(next, `unexpected extra query (terminal=${terminal} table=${table}); exhausted after ${results.length} expected`);
    assert.equal(next.terminal, terminal, `terminal mismatch for table=${table}: expected ${next.terminal}, got ${terminal}`);
    assert.equal(next.table, table, `table mismatch for ${terminal}: expected ${next.table}, got ${table}`);
    calls.push({ terminal, table, filters: [...filters] });
    return { data: next.data ?? null, error: next.error ?? null };
  };

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
    }
    select() { return this; }
    eq(col, val) { this.filters.push(['eq', col, val]); return this; }
    gte(col, val) { this.filters.push(['gte', col, val]); return this; }
    in(col, vals) {
      this.filters.push(['in', col, vals]);
      return Promise.resolve(take('in', this.table, this.filters));
    }
    order(col, opts) { this.filters.push(['order', col, opts]); return this; }
    maybeSingle() { return Promise.resolve(take('maybeSingle', this.table, this.filters)); }
    single() { return Promise.resolve(take('single', this.table, this.filters)); }
    then(resolve, reject) {
      return Promise.resolve(take('then', this.table, this.filters)).then(resolve, reject);
    }
  }

  return {
    client: { from(table) { return new Query(table); } },
    calls,
    assertAllConsumed() {
      assert.equal(index, results.length, `not all mocked queries consumed; expected ${results.length}, consumed ${index}`);
    },
  };
}

// ── Test data constants ──────────────────────────────────────────────────────
const ACTIVITY_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const GUIDE_ID    = 'bbbbbbbb-0000-0000-0000-000000000001';
const PLAN_A_ID   = 'cccccccc-0000-0000-0000-000000000001';
const PLAN_B_ID   = 'cccccccc-0000-0000-0000-000000000002';

const { v2HasGeneratedSlots, getV2ActivityAvailability } = await import(
  path.join(ROOT, 'src/lib/availability-v2/activity-day-availability.ts')
);

// ── A. v2HasGeneratedSlots — pure function ───────────────────────────────────
describe('#839 — v2HasGeneratedSlots pure helper', () => {

  it('empty plans array → false (no slots generated)', () => {
    assert.equal(v2HasGeneratedSlots([]), false);
  });

  it('all plans have slotCount:0 → false (activity unconfigured in V2)', () => {
    assert.equal(v2HasGeneratedSlots([
      { date: '2026-05-28', planId: PLAN_A_ID, status: 'not-open', remaining: 0, bookedCount: 10, capacity: 10, firstSlotStartAt: null, slotCount: 0, timezone: 'Asia/Taipei' },
      { date: '2026-05-28', planId: PLAN_B_ID, status: 'not-open', remaining: 0, bookedCount: 10, capacity: 10, firstSlotStartAt: null, slotCount: 0, timezone: 'Asia/Taipei' },
      { date: '2026-05-29', planId: PLAN_A_ID, status: 'not-open', remaining: 0, bookedCount: 10, capacity: 10, firstSlotStartAt: null, slotCount: 0, timezone: 'Asia/Taipei' },
    ]), false);
  });

  it('at least one plan has slotCount > 0 → true (V2 is configured)', () => {
    assert.equal(v2HasGeneratedSlots([
      { date: '2026-05-28', planId: PLAN_A_ID, status: 'open', remaining: 5, bookedCount: 5, capacity: 10, firstSlotStartAt: '2026-05-28T09:00:00+08:00', slotCount: 2, timezone: 'Asia/Taipei' },
      { date: '2026-05-28', planId: PLAN_B_ID, status: 'not-open', remaining: 0, bookedCount: 10, capacity: 10, firstSlotStartAt: null, slotCount: 0, timezone: 'Asia/Taipei' },
    ]), true);
  });

  it('status:full with slotCount > 0 → true (genuinely full ≠ unconfigured, must NOT fallback)', () => {
    assert.equal(v2HasGeneratedSlots([
      { date: '2026-05-28', planId: PLAN_A_ID, status: 'full', remaining: 0, bookedCount: 10, capacity: 10, firstSlotStartAt: '2026-05-28T09:00:00+08:00', slotCount: 3, timezone: 'Asia/Taipei' },
    ]), true);
  });
});

// ── B. getV2ActivityAvailability: activity with plans but no rules ────────────
describe('#839 — getV2ActivityAvailability: no availability rules → all not-open, v2HasGeneratedSlots false', () => {

  // Simulate the real bug: 2 active V2 plans, zero guide_availability_rules
  it('activity with 2 active plans but zero rules → all slotCount:0, v2HasGeneratedSlots false', async () => {
    const supabase = createSupabaseMock([
      // 1. activities lookup
      { terminal: 'maybeSingle', table: 'activities', data: { id: ACTIVITY_ID, guide_id: GUIDE_ID } },
      // 2. activity_plans → 2 active plans (the V2 UUIDs)
      { terminal: 'then', table: 'activity_plans', data: [
        { id: PLAN_A_ID, activity_id: ACTIVITY_ID, duration_minutes: 240, max_participants: 10, booking_type: 'scheduled', status: 'active' },
        { id: PLAN_B_ID, activity_id: ACTIVITY_ID, duration_minutes: 480, max_participants: 8, booking_type: 'scheduled', status: 'active' },
      ]},
      // 3. guide_availability_rules → empty (the bug scenario)
      { terminal: 'then', table: 'guide_availability_rules', data: [] },
      // 4. guide_blackout_dates → empty
      { terminal: 'then', table: 'guide_blackout_dates', data: [] },
      // 5. bookings → empty
      { terminal: 'in', table: 'bookings', data: [] },
    ]);

    const result = await getV2ActivityAvailability(supabase.client, ACTIVITY_ID, {
      timezone: 'Asia/Taipei',
      dateFrom: '2026-05-28',
      dateTo: '2026-05-30',
    });

    supabase.assertAllConsumed();

    // All plan×date rows should be not-open with slotCount=0
    assert.ok(result.plans.length > 0, 'should have plan×date rows (2 plans × 3 days = 6)');
    assert.equal(result.plans.length, 6, 'expected 2 plans × 3 dates');
    const allNotOpen = result.plans.every((p) => p.status === 'not-open' && p.slotCount === 0);
    assert.ok(allNotOpen, 'all rows should be not-open with slotCount=0');

    // v2HasGeneratedSlots must return false → this is the trigger for route-level fallback
    assert.equal(v2HasGeneratedSlots(result.plans), false, 'v2HasGeneratedSlots should be false when all slotCount=0');
  });
});

// ── C. route.ts wiring assertions ────────────────────────────────────────────
describe('#839 — route.ts wiring: v2HasGeneratedSlots + fallback-reason header', () => {
  it('route.ts imports and calls v2HasGeneratedSlots', async () => {
    const src = await readSource('app/api/activities/[slug]/availability/route.ts');
    assert.match(src, /v2HasGeneratedSlots/, 'route must call v2HasGeneratedSlots');
  });

  it('route.ts emits x-availability-fallback-reason header when falling back for no-generated-slots', async () => {
    const src = await readSource('app/api/activities/[slug]/availability/route.ts');
    assert.match(src, /x-availability-fallback-reason/, 'route must emit fallback-reason header for observability');
    assert.match(src, /v2-no-generated-slots/, 'fallback-reason value must identify the no-generated-slots condition');
  });
});
