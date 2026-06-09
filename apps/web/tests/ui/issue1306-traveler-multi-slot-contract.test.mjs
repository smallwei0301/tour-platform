// Issue #1306 — source-contract guards against the booking page silently
// re-collapsing multiple `selectedDateSlots` into a single canonical slot
// (the old line `const nextSlots = canonicalSelectedSlot ? [canonicalSelectedSlot] : []`).
// Behavioural coverage lives in `e2e/issue1306-traveler-multi-slot-picker.spec.ts`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE = join(__dirname, '../../app/booking/[activityId]/page.tsx');
const src = readFileSync(PAGE, 'utf8');

test('setSlots no longer collapses to [canonicalSelectedSlot] — preserves selectedDateSlots when non-empty', () => {
  // The fixed assignment keeps all `selectedDateSlots` when there are any,
  // and only falls back to a single entry when the API gave us nothing.
  assert.match(
    src,
    /nextSlots\s*=\s*selectedDateSlots\.length\s*>\s*0\s*\?\s*selectedDateSlots/,
    'multi-slot fix expected: `selectedDateSlots.length > 0 ? selectedDateSlots : …`',
  );

  // The old single-slot collapse must be gone (excluding fallback line).
  assert.doesNotMatch(
    src,
    /nextSlots\s*=\s*canonicalSelectedSlot\s*\?\s*\[\s*canonicalSelectedSlot\s*\]\s*:\s*\[\s*\]\s*;/,
    'old collapse pattern is back — multi-slot regression',
  );
});

test('booking page renders a multi-slot picker (role=radiogroup) when slots.length > 1', () => {
  // Existence + role contract. The picker's data-testid is referenced by
  // the e2e spec — keep them in sync.
  assert.match(src, /role=["']radiogroup["']/);
  assert.match(src, /data-testid=["']traveler-slot-picker["']/);
  assert.match(src, /data-testid=["']traveler-slot-option["']/);
});

test('multi-slot picker only renders when slots.length > 1 (single-slot day stays unchanged)', () => {
  // Make sure the guard is exactly `slots.length > 1` so a single-slot
  // day still shows the existing summary line without the extra picker.
  assert.match(
    src,
    /slots\.length\s*>\s*1\s*&&\s*\(/,
    'picker must be gated by `slots.length > 1` so single-slot days do not regress',
  );
});

test('slot button onClick updates selectedSlotStartAt (not just visual state)', () => {
  // Selection has to propagate back into the form state that downstream
  // booking-draft creation reads, otherwise picking a slot does nothing.
  assert.match(
    src,
    /setSelectedSlotStartAt\(slot\.startAt\)/,
    'slot button must call setSelectedSlotStartAt(slot.startAt) so the picked time is what goes into the booking draft',
  );
});

test('picker times honour the page timezone (no Asia/Taipei vs UTC mismatch — #1288 guard)', () => {
  // Both startAt and endAt formatting must thread `timezone` through so
  // multi-slot rows display in the same TZ as the rest of the booking
  // flow and the guide preview (#1288 was a similar TZ-drift bug).
  const tzMatches = src.match(/timeZone:\s*timezone\b/g) || [];
  assert.ok(
    tzMatches.length >= 2,
    `expected the slot picker to thread timezone into BOTH start and end formatting; saw ${tzMatches.length} occurrences`,
  );
});

// Issue #1306 acceptance #2 — the slot the traveler picks must end up in the
// booking-draft request body verbatim. Without this contract a future refactor
// that decoupled `selectedSlotStartAt` from the draft POST would silently
// re-introduce the original bug: "picker shows N options but checkout always
// uses the first one".
test('selectedSlotStartAt is the value passed to /api/v2/bookings/draft (#1306 acceptance #2)', () => {
  // The POST body must spell `startAt: selectedSlotStartAt` — using a
  // different field name, or hard-coding `slots[0].startAt`, would let the
  // picker selection drift away from what the server actually books.
  assert.match(
    src,
    /fetch\(\s*['"]\/api\/v2\/bookings\/draft['"][\s\S]*?startAt:\s*selectedSlotStartAt/,
    'draft POST body must include `startAt: selectedSlotStartAt` so the picker choice survives into the draft',
  );
});

// Issue #1306 acceptance #5 — the picker must keep #1289's fixed-candidate
// conflict filtering intact. Server pre-filters slots, but the client also
// filters `slot.isAvailable` so a future server bug can't slip a stale,
// already-conflicting slot into the picker.
test('client also filters slot.isAvailable before populating the picker (#1306 acceptance #5)', () => {
  // The slots populated into the picker must come from a chain that filters
  // by `slot.isAvailable` — otherwise a regression in the server could
  // surface unavailable times as selectable picker entries.
  assert.match(
    src,
    /\.filter\(\(slot\)\s*=>\s*slot\.isAvailable\)/,
    'client must double-check slot.isAvailable so stale/conflicting slots cannot reach the picker',
  );
});
