// Source-contract: scheduled (排程預約) plans must only be bookable via pre-set
// activity_schedules. These lock the wiring across the available-slots listing
// and the draft enforcement so the mocked test path can't drift from production.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SLOTS_SRC = readFileSync(
  join(
    __dirname,
    '../../app/api/v2/activities/[activityId]/available-slots/route-handler.ts',
  ),
  'utf8',
);
const DRAFT_SRC = readFileSync(
  join(__dirname, '../../app/api/v2/bookings/draft/route.ts'),
  'utf8',
);
const SLOT_GEN_SRC = readFileSync(
  join(__dirname, '../../src/lib/slot-generator.ts'),
  'utf8',
);

test('SerializedSlot carries scheduleId for fixed-session threading', () => {
  const idx = SLOT_GEN_SRC.indexOf('export interface SerializedSlot');
  assert.ok(idx > -1, 'SerializedSlot interface exists');
  const block = SLOT_GEN_SRC.slice(idx, SLOT_GEN_SRC.indexOf('}', idx));
  assert.match(block, /scheduleId\?:\s*string\s*\|\s*null/);
});

test('available-slots lists scheduled plan schedules via evaluateScheduledPlanSlots', () => {
  assert.match(SLOTS_SRC, /import\s*\{\s*evaluateScheduledPlanSlots\s*\}/);
  // The listing branch fires only for scheduled plans without an explicit scheduleId.
  assert.match(
    SLOTS_SRC,
    /plan\.booking_type === 'scheduled' && !selectedSchedule/,
  );
  // Scheduled plans ignore dynamic availability rules (fixed sessions authoritative).
  assert.match(
    SLOTS_SRC,
    /plan\.booking_type === 'scheduled' \? \[\] : rules/,
  );
  // It loads the plan's open schedules from activity_schedules.
  const branchIdx = SLOTS_SRC.indexOf('isScheduledListing');
  assert.ok(branchIdx > -1, 'isScheduledListing branch exists');
  assert.match(SLOTS_SRC, /\.from\('activity_schedules'\)/);
});

test('draft rejects scheduled bookings without a resolved schedule (SCHEDULE_REQUIRED)', () => {
  assert.match(DRAFT_SRC, /booking_type === 'scheduled'/);
  assert.match(DRAFT_SRC, /SCHEDULE_REQUIRED/);
  // The enforcement must run before the booking insert.
  const enforceIdx = DRAFT_SRC.indexOf('SCHEDULE_REQUIRED');
  const insertIdx = DRAFT_SRC.indexOf('const bookingInsertPayload');
  assert.ok(enforceIdx > -1 && insertIdx > -1 && enforceIdx < insertIdx, 'enforcement precedes insert');
});

test('draft availability re-check skips rules for scheduled (consistent with listing)', () => {
  assert.match(
    DRAFT_SRC,
    /payload\.planBookingType === 'scheduled' \? \[\] : rules/,
  );
});
