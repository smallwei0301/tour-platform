import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const AVAILABLE_SLOTS_ROUTE = join(
  REPO_ROOT,
  'app/api/v2/activities/[activityId]/available-slots/route-handler.ts',
);
const DRAFT_ROUTE = join(REPO_ROOT, 'app/api/v2/bookings/draft/route.ts');

test('GH-1067 RED: available-slots route selects activity_plans.is_year_round', () => {
  const src = readFileSync(AVAILABLE_SLOTS_ROUTE, 'utf8');
  assert.match(
    src,
    /activity_plans'[\s\S]*?select\([\s\S]*?\bis_year_round\b/,
    'available-slots route must fetch activity_plans.is_year_round from Supabase before evaluator wiring',
  );
});

test('GH-1067 RED: available-slots route passes is_year_round into ActivityPlan', () => {
  const src = readFileSync(AVAILABLE_SLOTS_ROUTE, 'utf8');
  assert.match(
    src,
    /const\s+plan\s*:\s*ActivityPlan\s*=\s*\{[\s\S]*?is_year_round\s*:\s*Boolean\(planData\.is_year_round\)/,
    'available-slots route must propagate planData.is_year_round into the ActivityPlan passed to evaluateBookingAvailability',
  );
});

test('GH-1067 RED: draft route selects activity_plans.is_year_round', () => {
  const src = readFileSync(DRAFT_ROUTE, 'utf8');
  assert.match(
    src,
    /activity_plans'[\s\S]*?select\([\s\S]*?\bis_year_round\b/,
    'draft route must fetch activity_plans.is_year_round from Supabase before booking validation',
  );
});

test('GH-1067 RED: draft route forwards is_year_round through helper payload into ActivityPlan', () => {
  const src = readFileSync(DRAFT_ROUTE, 'utf8');
  assert.match(
    src,
    /planIsYearRound\??:\s*boolean/,
    'draft availability helper payload should declare planIsYearRound',
  );
  assert.match(
    src,
    /planIsYearRound\s*:\s*Boolean\(planData\.is_year_round\)/,
    'draft route must pass planData.is_year_round into the generated availability helper payload',
  );
  assert.match(
    src,
    /const\s+plan\s*:\s*ActivityPlan\s*=\s*\{[\s\S]*?is_year_round\s*:\s*payload\.planIsYearRound/,
    'draft generated-availability helper must propagate payload.planIsYearRound into the ActivityPlan passed to evaluateEffectiveBookingAvailability',
  );
});
