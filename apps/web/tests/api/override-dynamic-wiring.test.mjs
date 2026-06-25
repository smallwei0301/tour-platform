// Source-contract: admin conflict overrides re-open instant/request (dynamic)
// slots for travellers. Locks the wiring in available-slots (merge) and draft
// (fallback) so the mocked test path can't silently drift from production.

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

test('available-slots imports and merges override dynamic slots for non-scheduled plans', () => {
  assert.match(SLOTS_SRC, /import\s*\{\s*evaluateOverrideDynamicSlots\s*\}/);
  // Only fires for dynamic plans without a specific schedule.
  assert.match(
    SLOTS_SRC,
    /!selectedSchedule && plan\.booking_type !== 'scheduled' && conflictOverrides\.length > 0/,
  );
  // Merges with dedupe by startAt.
  assert.match(SLOTS_SRC, /evaluateOverrideDynamicSlots\(/);
  assert.match(SLOTS_SRC, /existingStarts\.has\(s\.startAt\)/);
});

test('draft falls back to override evaluation when normal validation fails', () => {
  assert.match(DRAFT_SRC, /import\s*\{\s*evaluateOverrideDynamicSlots\s*\}/);
  // Override fallback is gated to dynamic plans without a resolved schedule.
  assert.match(
    DRAFT_SRC,
    /payload\.planBookingType !== 'scheduled' &&\s*!payload\.selectedSchedule &&\s*conflictOverrides\.length > 0/,
  );
  // Matches the requested startAt and returns the override snapshot.
  assert.match(DRAFT_SRC, /overrideSlots\.find\(/);
  assert.match(DRAFT_SRC, /conflictOverride: overrideMatch\.conflictOverride/);
});

test('draft runs V2 generated validation before legacy gate and skips legacy when V2 approves', () => {
  // generatedSlotValidation must be computed before the legacy reject gate,
  // and the legacy/selected-schedule gates must be guarded by its result so an
  // override-approved slot is not rejected by the cross-plan conflict check.
  const genIdx = DRAFT_SRC.indexOf('generatedSlotValidation = await isSlotInGeneratedV2Availability');
  const legacyIdx = DRAFT_SRC.indexOf('shouldRejectDraftByLegacySlotAvailability({');
  assert.ok(genIdx > -1 && legacyIdx > -1 && genIdx < legacyIdx, 'V2 validation precedes legacy gate');
  assert.match(
    DRAFT_SRC,
    /!generatedSlotValidation\.available &&\s*shouldRejectDraftByLegacySlotAvailability/,
  );
  assert.match(
    DRAFT_SRC,
    /!generatedSlotValidation\.available &&\s*shouldRejectDraftWhenSelectedScheduleInvalid/,
  );
});
