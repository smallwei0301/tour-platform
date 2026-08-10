// Source-contract: the V2 draft route stamps guide_approval_status on the
// booking insert and surfaces bookingType/requiresApproval in the response, and
// available-slots exposes bookingType on selectedPlan. These lock the wiring so
// the in-memory/mocked test path can't silently drift from production behaviour.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DRAFT_SRC = readFileSync(
  join(__dirname, '../../app/api/v2/bookings/draft/route.ts'),
  'utf8',
);
const SLOTS_SRC = readFileSync(
  join(
    __dirname,
    '../../app/api/v2/activities/[activityId]/available-slots/route-handler.ts',
  ),
  'utf8',
);
const ATOMIC_MIGRATION_SRC = readFileSync(
  join(
    __dirname,
    '../../../../supabase/migrations/20260810033421_issue1811_atomic_booking_order_materialization.sql',
  ),
  'utf8',
);

test('draft route imports booking-type-flow helpers', () => {
  assert.match(DRAFT_SRC, /from '.*booking-type-flow\.mjs'/);
  assert.match(DRAFT_SRC, /normalizeBookingType/);
  assert.match(DRAFT_SRC, /requiresGuideApproval/);
});

test('atomic draft RPC derives guide_approval_status from the DB plan booking_type', () => {
  assert.match(ATOMIC_MIGRATION_SRC, /SELECT[\s\S]*plan\.booking_type[\s\S]*FROM public\.activity_plans/);
  assert.match(
    ATOMIC_MIGRATION_SRC,
    /CASE WHEN v_booking_type = 'request' THEN 'pending' ELSE 'not_required' END/,
  );
  assert.match(ATOMIC_MIGRATION_SRC, /INSERT INTO public\.bookings/);
});

test('draft response exposes bookingType and requiresApproval', () => {
  assert.match(DRAFT_SRC, /bookingType:\s*normalizeBookingType\(planData\.booking_type\)/);
  assert.match(DRAFT_SRC, /requiresApproval:\s*requiresGuideApproval\(planData\.booking_type\)/);
});

test('available-slots selectedPlan exposes bookingType', () => {
  const selIdx = SLOTS_SRC.indexOf('selectedPlan: {');
  assert.ok(selIdx > -1, 'selectedPlan literal exists');
  const slice = SLOTS_SRC.slice(selIdx, SLOTS_SRC.indexOf('},', selIdx));
  assert.match(slice, /bookingType:\s*planData\.booking_type/);
});
