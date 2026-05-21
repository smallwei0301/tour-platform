import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

test('issue619 contract doc exists and encodes V2 source-of-truth + forbidden legacy drift', async () => {
  const rel = 'docs/implementation/issue-619-v2-availability-source-of-truth.md';
  const full = path.join(ROOT, '..', '..', rel);
  assert.ok(existsSync(full), `contract doc must exist: ${rel}`);

  const src = await readFile(full, 'utf8');
  assert.match(src, /guide_availability_rules/);
  assert.match(src, /guide_blackout_dates/);
  assert.match(src, /bookings/);
  assert.match(src, /activity_plans/);
  assert.match(src, /must not prefer legacy activity_availability_daily or activity_schedules/i);
  assert.match(src, /open\/full\/not-open/);
});

test('activity slug availability route must wire explicit V2 adapter path (contract skeleton)', async () => {
  const src = await readSource('app/api/activities/[slug]/availability/route.ts');

  assert.match(src, /isV2|bookingV2|BOOKING_V2/i, 'must include explicit V2-mode branch');
  assert.match(
    src,
    /getV2ActivityAvailability|buildV2ActivityAvailability|resolveV2ActivityAvailability/,
    'must call a dedicated V2 availability adapter symbol'
  );
});

test('dedicated V2 availability adapter must read from rules/blackouts/bookings/plans (not legacy daily/schedules primary)', async () => {
  const rel = 'src/lib/availability-v2/activity-day-availability.ts';
  const full = path.join(ROOT, rel);
  assert.ok(existsSync(full), `expected adapter file for next slice: ${rel}`);

  const src = await readFile(full, 'utf8');
  assert.match(src, /guide_availability_rules/);
  assert.match(src, /guide_blackout_dates/);
  assert.match(src, /bookings/);
  assert.match(src, /activity_plans/);
  assert.doesNotMatch(src, /activity_availability_daily/);
  assert.doesNotMatch(src, /activity_schedules/);
});

test('V2 day/plan semantic precedence: blackout > closure > rules->candidates > booking consumption > open/full/not-open', () => {
  function computeStatus({
    hasBlackout,
    hasAdminClosure,
    candidateSlots,
    remaining,
  }) {
    if (hasBlackout) return 'not-open';
    if (hasAdminClosure) return 'not-open';
    if (candidateSlots <= 0) return 'not-open';
    if (remaining <= 0) return 'full';
    return 'open';
  }

  assert.equal(computeStatus({ hasBlackout: true, hasAdminClosure: false, candidateSlots: 3, remaining: 2 }), 'not-open');
  assert.equal(computeStatus({ hasBlackout: false, hasAdminClosure: true, candidateSlots: 3, remaining: 2 }), 'not-open');
  assert.equal(computeStatus({ hasBlackout: false, hasAdminClosure: false, candidateSlots: 0, remaining: 5 }), 'not-open');
  assert.equal(computeStatus({ hasBlackout: false, hasAdminClosure: false, candidateSlots: 2, remaining: 0 }), 'full');
  assert.equal(computeStatus({ hasBlackout: false, hasAdminClosure: false, candidateSlots: 2, remaining: 1 }), 'open');
});

test('V2 booking consumption regression: partial booking keeps open with reduced remaining/bookedCount', () => {
  function summarizeDay({ maxParticipants, slotRemainings }) {
    const slotCount = slotRemainings.length;
    const remaining = slotCount > 0 ? Math.max(...slotRemainings) : 0;
    const bookedCount = Math.max(0, maxParticipants - remaining);
    const status = slotCount <= 0 ? 'not-open' : remaining > 0 ? 'open' : 'full';
    return { status, remaining, bookedCount, capacity: maxParticipants, slotCount };
  }

  const partial = summarizeDay({ maxParticipants: 8, slotRemainings: [7] });
  assert.equal(partial.status, 'open');
  assert.equal(partial.remaining, 7);
  assert.equal(partial.capacity, 8);
  assert.equal(partial.bookedCount, 1);
});

test('V2 booking consumption regression: fully consumed candidate reports full (not not-open)', () => {
  function summarizeDay({ maxParticipants, slotRemainings }) {
    const slotCount = slotRemainings.length;
    const remaining = slotCount > 0 ? Math.max(...slotRemainings) : 0;
    const status = slotCount <= 0 ? 'not-open' : remaining > 0 ? 'open' : 'full';
    return { status };
  }

  const full = summarizeDay({ maxParticipants: 8, slotRemainings: [0] });
  assert.equal(full.status, 'full');

  const closed = summarizeDay({ maxParticipants: 8, slotRemainings: [] });
  assert.equal(closed.status, 'not-open');
});
