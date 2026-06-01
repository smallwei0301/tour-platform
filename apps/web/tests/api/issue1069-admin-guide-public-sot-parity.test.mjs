import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '../../');

const guideAvailabilityPreviewRoute = resolve(appRoot, 'app/api/guide/availability-preview/route.ts');
const guideActivitiesWithPlansRoute = resolve(appRoot, 'app/api/guide/activities-with-plans/route.ts');
const travelerAvailableSlotsRoute = resolve(appRoot, 'app/api/v2/activities/[activityId]/available-slots/route-handler.ts');
const bookingDraftRoute = resolve(appRoot, 'app/api/v2/bookings/draft/route.ts');

test('GH-1069 RED: guide availability preview must disclose local preview source/reason contract', () => {
  const source = readFileSync(guideAvailabilityPreviewRoute, 'utf8');

  assert.match(source, /availabilitySource/, 'guide preview response must expose availabilitySource for SOT parity auditing');
  assert.match(source, /previewReasonCode|reasonCode/, 'guide preview response must expose reason code contract');
  assert.match(source, /legacy_local_preview|effective_booking_availability/, 'guide preview source should explicitly identify local legacy preview vs effective evaluator');
});

test('GH-1069: guide/public traveler bookable plan filters are canonical activity_plans only', () => {
  const guideSource = readFileSync(guideActivitiesWithPlansRoute, 'utf8');
  const travelerSource = readFileSync(travelerAvailableSlotsRoute, 'utf8');

  assert.match(guideSource, /from\('activity_plans'\)/, 'guide plan list must read from canonical activity_plans');
  assert.match(guideSource, /\.in\('status',\s*\[['"]active['"],\s*['"]published['"]\]\)/, 'guide must not expose inactive/archived plans as selectable');

  assert.match(travelerSource, /normalizedPlanStatus[^\n]*!==\s*'active'/, 'traveler slots must reject non-active plan status');
  assert.doesNotMatch(travelerSource, /DEFAULT_PLANS/, 'traveler slots route must not treat DEFAULT_PLANS fallback as bookable source');
});

test('GH-1069: booking create SOT stays at POST /api/v2/bookings/draft with effective availability recheck', () => {
  const source = readFileSync(bookingDraftRoute, 'utf8');

  assert.match(source, /export\s+async\s+function\s+POST/, 'draft route must be POST create entrypoint');
  assert.match(source, /evaluateEffectiveBookingAvailability/, 'draft create must recheck effective availability semantics');
  assert.match(source, /shouldRejectDraftByEffectiveAvailability/, 'draft create must reject stale/contradictory payload by effective availability guard');
});
