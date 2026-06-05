import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadActivityPlanWithMissingIsYearRoundFallback,
  isMissingActivityPlanIsYearRoundError,
} from '../../src/lib/activity-plan-is-year-round-fallback.mjs';

test('issue1237: missing activity_plans.is_year_round retries with fallback select and defaults the field to false', async () => {
  const calls = [];
  const result = await loadActivityPlanWithMissingIsYearRoundFallback(async ({ includeIsYearRound }) => {
    calls.push(includeIsYearRound);
    if (includeIsYearRound) {
      return {
        data: null,
        error: {
          code: '42703',
          message: 'column activity_plans.is_year_round does not exist',
        },
      };
    }

    return {
      data: {
        id: '0e975d65-6648-48e1-9c4a-a35e0f907be8',
        activity_id: 'c0000003-0000-0000-0000-000000000001',
        status: 'active',
      },
      error: null,
    };
  });

  assert.deepEqual(calls, [true, false]);
  assert.equal(result.error, null);
  assert.equal(result.schemaFallback, 'missing_is_year_round');
  assert.equal(result.data.is_year_round, false);
});

test('issue1237: non-schema errors do not trigger fallback retries', async () => {
  const calls = [];
  const transportError = { code: 'PGRST301', message: 'permission denied for table activity_plans' };
  const result = await loadActivityPlanWithMissingIsYearRoundFallback(async ({ includeIsYearRound }) => {
    calls.push(includeIsYearRound);
    return { data: null, error: transportError };
  });

  assert.deepEqual(calls, [true]);
  assert.equal(result.data, null);
  assert.equal(result.error, transportError);
  assert.equal(result.schemaFallback, null);
});

test('issue1237: missing is_year_round matcher accepts postgres and postgrest variants only for activity_plans', () => {
  assert.equal(
    isMissingActivityPlanIsYearRoundError({ message: 'column activity_plans.is_year_round does not exist' }),
    true,
  );
  assert.equal(
    isMissingActivityPlanIsYearRoundError({ message: 'Could not find the \"is_year_round\" column of \"activity_plans\" in the schema cache' }),
    true,
  );
  assert.equal(
    isMissingActivityPlanIsYearRoundError({ message: 'column guide_slot_conflict_overrides.is_year_round does not exist' }),
    false,
  );
});
