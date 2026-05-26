import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

test('issue787 contract: v2 available-slots supports legacy plan slug + scheduleId fallback when schedule.plan_id is null', async () => {
  const rel = 'app/api/v2/activities/[activityId]/available-slots/route.ts';
  const src = await readFile(path.join(ROOT, rel), 'utf8');

  assert.match(src, /const scheduleKey = searchParams\.get\('scheduleId'\)/, 'must read scheduleId during plan slug resolution');
  assert.match(src, /\.from\('activity_schedules'\)[\s\S]*?\.select\('id, plan_id'\)[\s\S]*?\.eq\('id', scheduleKey\)[\s\S]*?\.eq\('activity_id', resolvedActivityId\)/, 'must scope schedule fallback lookup by activity');
  assert.match(src, /legacyScheduleRow\.plan_id && isUuidLike\(legacyScheduleRow\.plan_id\)/, 'must prefer schedule.plan_id when it is UUID-like');
  assert.match(src, /\.from\('activity_plans'\)[\s\S]*?\.eq\('activity_id', resolvedActivityId\)[\s\S]*?\.eq\('status', 'active'\)[\s\S]*?\.limit\(2\)/, 'must use single-active-plan fallback for null schedule.plan_id shape');
  assert.match(src, /activePlans\.length !== 1/, 'must fail closed when active plan is ambiguous');
});

test('issue787 safety: invalid scheduleId/activity mismatch still fails safely', async () => {
  const rel = 'app/api/v2/activities/[activityId]/available-slots/route.ts';
  const src = await readFile(path.join(ROOT, rel), 'utf8');

  assert.match(
    src,
    /if \(scheduleError \|\| !scheduleData\) \{[\s\S]*?Schedule not found for this activity/,
    'must keep scheduleId + activity scope mismatch as safe NOT_FOUND response'
  );
});
