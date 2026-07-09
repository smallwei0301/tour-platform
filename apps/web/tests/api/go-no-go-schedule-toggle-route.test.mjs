import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routePath = new URL('../../app/api/admin/cron-jobs/route.ts', import.meta.url);

test('Cron jobs admin API exposes live schedule payload and shared registry merge', async () => {
  const src = await readFile(routePath, 'utf8');

  assert.match(src, /export\s+async\s+function\s+GET/, 'route must export GET handler');
  assert.match(src, /export\s+async\s+function\s+PATCH/, 'route must export PATCH handler');
  assert.match(src, /jobs/, 'route must include jobs payload');
  assert.match(src, /enabled/, 'route must accept enabled flag');
  assert.match(src, /buildScheduleViewModels|listCronJobsForAdmin/, 'route should use shared schedule registry/helper');
  assert.match(src, /setGithubWorkflowEnabled|enable|disable/, 'route must map to GitHub enable\/disable operations');
});
