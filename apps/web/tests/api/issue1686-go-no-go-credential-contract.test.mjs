import test from 'node:test';
import assert from 'node:assert/strict';

import { listCronJobsForAdmin, __resetGoNoGoTestHooks, __setGoNoGoTestHooks } from '../../src/lib/admin/go-no-go-schedules.mjs';

const ORIGINAL_ENV = {
  GITHUB_ACTIONS_ADMIN_TOKEN: process.env.GITHUB_ACTIONS_ADMIN_TOKEN,
  GH_TOKEN: process.env.GH_TOKEN,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  GITHUB_ACTIONS_REPO: process.env.GITHUB_ACTIONS_REPO,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
}

function workflow(path, state = 'active') {
  return {
    id: 101,
    name: path.split('/').pop()?.replace('.yml', '') || 'workflow',
    path,
    state,
    html_url: `https://github.com/example/${path}`,
  };
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

test.afterEach(() => {
  __resetGoNoGoTestHooks();
  restoreEnv();
});

test('missing credential keeps registry visible but disables toggles', async () => {
  delete process.env.GITHUB_ACTIONS_ADMIN_TOKEN;
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
  process.env.GITHUB_ACTIONS_REPO = 'smallwei0301/tour-platform';

  let fetchCalls = 0;
  __setGoNoGoTestHooks({
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('fetch should not run when token is missing');
    },
  });

  const result = await listCronJobsForAdmin();
  assert.equal(fetchCalls, 0);
  assert.equal(result.hasGithubToken, false);
  assert.equal(result.githubConnection.status, 'missing');
  assert.equal(result.githubConnection.canWrite, false);
  assert.ok(result.jobs.every((job) => job.github.canToggle === false));
});

test('401 from GitHub is classified as invalid_or_revoked and redacts raw body', async () => {
  process.env.GITHUB_ACTIONS_ADMIN_TOKEN = 'ghs_test_token';
  process.env.GITHUB_ACTIONS_REPO = 'smallwei0301/tour-platform';

  const marker = 'RAW_SECRET_MARKER';
  __setGoNoGoTestHooks({
    fetchImpl: async () => jsonResponse({ message: marker }, 401),
  });

  const result = await listCronJobsForAdmin();
  assert.equal(result.hasGithubToken, true);
  assert.equal(result.githubConnection.status, 'invalid_or_revoked');
  assert.equal(result.githubConnection.operatorAction, 'rotate_credential');
  assert.doesNotMatch(JSON.stringify(result), new RegExp(marker));
});

test('403 without rate-limit headers is classified as insufficient_permission', async () => {
  process.env.GITHUB_ACTIONS_ADMIN_TOKEN = 'ghs_test_token';

  __setGoNoGoTestHooks({
    fetchImpl: async () => jsonResponse({ message: 'forbidden' }, 403),
  });

  const result = await listCronJobsForAdmin();
  assert.equal(result.githubConnection.status, 'insufficient_permission');
  assert.equal(result.githubConnection.operatorAction, 'grant_actions_write');
  assert.ok(result.jobs.every((job) => job.github.canToggle === false));
});

test('403 with x-ratelimit-remaining=0 is classified as rate_limited with retryAfterSeconds', async () => {
  process.env.GITHUB_ACTIONS_ADMIN_TOKEN = 'ghs_test_token';

  __setGoNoGoTestHooks({
    fetchImpl: async () => jsonResponse(
      { message: 'slow down' },
      403,
      { 'x-ratelimit-remaining': '0', 'retry-after': '60' },
    ),
  });

  const result = await listCronJobsForAdmin();
  assert.equal(result.githubConnection.status, 'rate_limited');
  assert.equal(result.githubConnection.retryable, true);
  assert.equal(result.githubConnection.retryAfterSeconds, 60);
});

test('404 is classified as repo_mismatch instead of workflow_unmatched', async () => {
  process.env.GITHUB_ACTIONS_ADMIN_TOKEN = 'ghs_test_token';

  __setGoNoGoTestHooks({
    fetchImpl: async () => jsonResponse({ message: 'not found' }, 404),
  });

  const result = await listCronJobsForAdmin();
  assert.equal(result.githubConnection.status, 'repo_mismatch');
  assert.ok(result.jobs.every((job) => job.github.state === 'unknown'));
});

test('ready connection keeps matched rows toggleable while unmatched rows stay disabled', async () => {
  process.env.GITHUB_ACTIONS_ADMIN_TOKEN = 'ghs_test_token';
  process.env.GITHUB_ACTIONS_REPO = 'smallwei0301/tour-platform';

  __setGoNoGoTestHooks({
    fetchImpl: async () => jsonResponse({
      workflows: [
        workflow('.github/workflows/refund-reconcile.yml', 'active'),
      ],
    }),
  });

  const result = await listCronJobsForAdmin();
  const matched = result.jobs.find((job) => job.workflowPath === '.github/workflows/refund-reconcile.yml');
  const unmatched = result.jobs.find((job) => job.workflowPath === '.github/workflows/booking-v2-daily-go-no-go.yml');

  assert.equal(result.githubConnection.status, 'ready');
  assert.equal(matched?.github.canToggle, true);
  assert.equal(unmatched?.github.state, 'workflow_unmatched');
  assert.equal(unmatched?.github.canToggle, false);
});
