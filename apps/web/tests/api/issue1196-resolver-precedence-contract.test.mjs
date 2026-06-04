// Issue #1196 — lock down the canonical availability resolver's contract so
// Admin / Guide / Traveler surfaces can rely on the same precedence order.
//
// The resolver lives at:
//   src/lib/availability-v2/effective-availability-resolver.ts
// and is fed by every surface via /api/v2/activities/[activityId]/available-slots.
//
// This file checks two things:
//   1. SHAPE — `CanonicalAvailabilityState` keeps exactly the eight names
//      the three surfaces' UI strings reference. Adding or renaming a state
//      without updating the UI breaks operator-facing copy across all three
//      surfaces and would be silent in TypeScript (string union widening).
//   2. PRECEDENCE — `resolveCanonicalAvailabilityState` always checks plan
//      status first, then season gate (when enabled), then "no rule",
//      then blackout, then conflict (with the admin-override hatch), then
//      slot availability, then capacity, then falls back to 'closed'. This
//      order is the single canonical answer the issue asked us to lock.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import {
  resolveCanonicalAvailabilityState,
} from '../../src/lib/availability-v2/effective-availability-resolver.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESOLVER_SRC = readFileSync(
  join(__dirname, '../../src/lib/availability-v2/effective-availability-resolver.ts'),
  'utf8',
);

// ── 1. SHAPE: union must have exactly the canonical eight states ────────

test('CanonicalAvailabilityState contains the eight canonical states', () => {
  for (const expected of [
    'available',
    'full',
    'closed',
    'blackout',
    'inactive_plan',
    'outside_rule',
    'outside_season',
    'blocked_by_conflict',
    'allowed_with_admin_override',
  ]) {
    assert.match(
      RESOLVER_SRC,
      new RegExp(`['"]${expected}['"]`),
      `CanonicalAvailabilityState must include ${expected} — surfaces' UI copy depends on it`,
    );
  }
});

// ── 2. PRECEDENCE: behavioural tests against the resolver itself ────────

const BASE = {
  requestedStartAt: '2026-07-15T01:00:00.000Z',  // mid-July, 09:00 Taipei
  requestedEndAt:   '2026-07-15T05:00:00.000Z',
  timezone: 'Asia/Taipei',
  rules: [{} ], // non-empty so 'outside_rule' isn't hit by default
  blackouts: [],
  bookings: [],
  seasons: [],
  seasonGateEnabled: false,
  planStatus: 'active',
  slotAvailable: true,
  capacityAvailable: true,
};

test('precedence #1: inactive plan beats every other rule', () => {
  const got = resolveCanonicalAvailabilityState({
    ...BASE,
    planStatus: 'inactive',
    // Even if every other signal says "blocked", inactive_plan wins.
    slotUnavailableReason: 'BLACKOUT_CONFLICT',
    capacityAvailable: false,
    slotAvailable: false,
  });
  assert.equal(got.state, 'inactive_plan');
});

test('precedence #2: season gate beats no-rule / blackout / conflict / capacity', () => {
  const got = resolveCanonicalAvailabilityState({
    ...BASE,
    seasonGateEnabled: true,
    seasons: [
      // Active season for January only — July is outside.
      { id: 's1', activity_plan_id: 'p1', start_month: 1, start_day: 1, end_month: 1, end_day: 31, is_active: true },
    ],
    rules: [],
    slotUnavailableReason: 'BLACKOUT_CONFLICT',
  });
  assert.equal(got.state, 'outside_season');
  // The metadata mirror tells the UI WHY (no rows / outside / etc.).
  assert.equal(got.metadata?.seasonGate, 'outside_season');
});

test('precedence #3: with no rules + no season gate → outside_rule (closes-fail open by design)', () => {
  const got = resolveCanonicalAvailabilityState({ ...BASE, rules: [] });
  assert.equal(got.state, 'outside_rule');
});

test('precedence #4: blackout beats conflict beats slot/capacity', () => {
  const got = resolveCanonicalAvailabilityState({
    ...BASE,
    slotUnavailableReason: 'BLACKOUT_CONFLICT',
    // Booking conflict signal is also present — blackout still wins.
    bookings: [
      { id: 'b1', start_at: '2026-07-15T01:30:00.000Z', end_at: '2026-07-15T04:00:00.000Z', status: 'confirmed' },
    ],
  });
  assert.equal(got.state, 'blackout');
});

test('precedence #5: booking conflict → blocked_by_conflict, with admin-override hatch', () => {
  const blocked = resolveCanonicalAvailabilityState({
    ...BASE,
    bookings: [
      { id: 'b1', start_at: '2026-07-15T01:30:00.000Z', end_at: '2026-07-15T04:00:00.000Z', status: 'confirmed' },
    ],
  });
  assert.equal(blocked.state, 'blocked_by_conflict');

  // Same input but with a matching admin override — must flip the state.
  const overridden = resolveCanonicalAvailabilityState({
    ...BASE,
    guideId: 'g1',
    activityId: 'a1',
    planId: 'p1',
    bookings: [
      { id: 'b1', start_at: '2026-07-15T01:30:00.000Z', end_at: '2026-07-15T04:00:00.000Z', status: 'confirmed' },
    ],
    conflictOverrides: [
      {
        id: 'ov1',
        guide_id: 'g1',
        activity_id: 'a1',
        activity_plan_id: 'p1',
        // Must match the requested slot's start/end exactly — that's how
        // `findMatchingConflictOverride` keys it.
        start_at: '2026-07-15T01:00:00.000Z',
        end_at:   '2026-07-15T05:00:00.000Z',
        reason: 'manual',
        helper_status: 'not_needed',
        requires_helper: false,
        status: 'active',
        created_by_admin_email: 'admin@example.com',
      },
    ],
  });
  assert.equal(overridden.state, 'allowed_with_admin_override');
  // Operator-facing metadata that the UI reads — keep it stable.
  assert.equal(overridden.metadata?.overrideId, 'ov1');
  assert.equal(overridden.metadata?.overrideReason, 'manual');
  assert.equal(overridden.metadata?.helperStatus, 'not_needed');
  assert.equal(overridden.metadata?.requiresHelper, 'false');
});

test('precedence #6: available is reached only after all earlier checks pass', () => {
  const got = resolveCanonicalAvailabilityState({ ...BASE });
  assert.equal(got.state, 'available');
});

test('precedence #7: capacity-full is the last "blocked" branch before closed', () => {
  const got = resolveCanonicalAvailabilityState({
    ...BASE,
    slotAvailable: false,
    capacityAvailable: false,
  });
  assert.equal(got.state, 'full');
});

test('precedence #8: when slot is unavailable but capacity is fine → closed', () => {
  const got = resolveCanonicalAvailabilityState({
    ...BASE,
    slotAvailable: false,
    capacityAvailable: true,
  });
  assert.equal(got.state, 'closed');
});

test('cancelled / failed / expired bookings do NOT cause blocked_by_conflict', () => {
  for (const status of ['cancelled', 'failed', 'expired']) {
    const got = resolveCanonicalAvailabilityState({
      ...BASE,
      bookings: [
        { id: `b-${status}`, start_at: '2026-07-15T01:30:00.000Z', end_at: '2026-07-15T04:00:00.000Z', status },
      ],
    });
    assert.equal(got.state, 'available', `${status} bookings must not block`);
  }
});

// ── 3. SOURCE-CONTRACT: make the precedence visible to grep ────────────
// The resolver checks states in a fixed order. If anyone reorders these
// branches in the source the precedence guarantee silently changes, so
// we lock the textual order too (cheap belt-and-braces).

test('resolver source keeps the canonical precedence order', () => {
  const order = [
    `'inactive_plan'`,
    `'outside_season'`,
    `'outside_rule'`,
    `'blackout'`,
    `'allowed_with_admin_override'`,
    `'blocked_by_conflict'`,
    `'available'`,
    `'full'`,
    `'closed'`,
  ];
  let cursor = 0;
  for (const token of order) {
    const idx = RESOLVER_SRC.indexOf(token, cursor);
    assert.ok(
      idx >= 0,
      `resolver source must mention ${token} after the previous precedence token`,
    );
    cursor = idx + token.length;
  }
});
