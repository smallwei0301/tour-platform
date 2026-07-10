import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';

import { GET, PATCH } from '../../app/api/admin/cron-jobs/route.ts';
import { __resetGoNoGoTestHooks, __setGoNoGoTestHooks } from '../../src/lib/admin/go-no-go-schedules.mjs';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGINAL_ENV = {
  ADMIN_ACCESS_TOKEN: process.env.ADMIN_ACCESS_TOKEN,
  ADMIN_EMAIL_ALLOWLIST: process.env.ADMIN_EMAIL_ALLOWLIST,
  GITHUB_ACTIONS_ADMIN_TOKEN: process.env.GITHUB_ACTIONS_ADMIN_TOKEN,
  GITHUB_ACTIONS_REPO: process.env.GITHUB_ACTIONS_REPO,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function workflow(pathname, state = 'active') {
  return {
    id: 101,
    name: pathname.split('/').pop()?.replace('.yml', '') || 'workflow',
    path: pathname,
    state,
    html_url: `https://github.com/example/${pathname}`,
  };
}

function authHeaders(extra = {}) {
  return {
    'content-type': 'application/json',
    'x-admin-token': 'admin-secret',
    'x-admin-email': 'ops@example.com',
    ...extra,
  };
}

test.beforeEach(() => {
  process.env.ADMIN_ACCESS_TOKEN = 'admin-secret';
  process.env.ADMIN_EMAIL_ALLOWLIST = 'ops@example.com';
  process.env.GITHUB_ACTIONS_ADMIN_TOKEN = 'ghs_api_secret';
  process.env.GITHUB_ACTIONS_REPO = 'smallwei0301/tour-platform';
});

test.afterEach(() => {
  __resetGoNoGoTestHooks();
  restoreEnv();
});

test('exact middleware route keeps CSRF negative and positive gate semantics', async () => {
  const loaderPath = path.join(os.tmpdir(), 'issue1686-next-intl-loader.mjs');
  const scriptPath = path.join(os.tmpdir(), 'issue1686-middleware-check.mjs');
  const middlewarePath = path.join(WEB_ROOT, 'middleware.ts');
  const nextServerPath = require.resolve('next/server.js');

  await import('node:fs/promises').then(({ writeFile }) => Promise.all([
    writeFile(loaderPath, `
export async function resolve(specifier, context, defaultResolve) {
  if (specifier === 'next-intl/routing') {
    return { shortCircuit: true, url: 'data:text/javascript,export const defineRouting = (config) => config;' };
  }
  if (specifier === 'next-intl/middleware') {
    return { shortCircuit: true, url: 'data:text/javascript,export default function create(){ return function(){ return { status: 200 }; }; }' };
  }
  return defaultResolve(specifier, context, defaultResolve);
}
`, 'utf8'),
    writeFile(scriptPath, `
process.env.ADMIN_ACCESS_TOKEN = 'admin-secret';
process.env.ADMIN_EMAIL_ALLOWLIST = 'ops@example.com';
const { NextRequest } = await import(${JSON.stringify(nextServerPath)});
const { middleware } = await import(${JSON.stringify(middlewarePath)});

function makeRequest(headers) {
  return new NextRequest('https://example.com/api/admin/cron-jobs', {
    method: 'PATCH',
    headers,
  });
}

const authCookie = [
  'admin_token=admin-secret',
  'admin_email=ops%40example.com',
  'admin_session_version=1',
  'admin_session_expires_at=2099-01-01T00%3A00%3A00.000Z',
].join('; ');

const negative = await middleware(makeRequest(new Headers({ cookie: authCookie })));
const positive = await middleware(makeRequest(new Headers({
  cookie: authCookie + '; tp_csrf=csrf-token',
  'x-csrf-token': 'csrf-token',
})));

console.log(JSON.stringify({ negativeStatus: negative.status, positiveStatus: positive.status }));
process.exit(0);
`, 'utf8'),
  ]));

  const { stdout } = await execFileAsync('node', ['--experimental-loader', loaderPath, scriptPath], {
    cwd: process.cwd(),
    env: process.env,
  });

  const result = JSON.parse(stdout.trim());
  assert.equal(result.negativeStatus, 403);
  assert.equal(result.positiveStatus, 200);
});

test('GET route restores defense-in-depth admin auth', async () => {
  const response = await GET(new Request('https://example.com/api/admin/cron-jobs'));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'UNAUTHORIZED');
});

test('PATCH route restores defense-in-depth admin auth', async () => {
  const response = await PATCH(new Request('https://example.com/api/admin/cron-jobs', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jobKey: 'refund-reconcile', enabled: false }),
  }));

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'UNAUTHORIZED');
});

test('PATCH invalid payload returns 400 before touching upstream', async () => {
  let upstreamCalls = 0;
  __setGoNoGoTestHooks({
    fetchImpl: async () => {
      upstreamCalls += 1;
      throw new Error('upstream should not run');
    },
  });

  const response = await PATCH(new Request('https://example.com/api/admin/cron-jobs', {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ jobKey: 'refund-reconcile', enabled: 'nope' }),
  }));

  assert.equal(response.status, 400);
  assert.equal(upstreamCalls, 0);
});

test('unknown jobKey returns 400 and never issues GitHub requests', async () => {
  const calls = [];
  __setGoNoGoTestHooks({
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method || 'GET' });
      return jsonResponse({ workflows: [] });
    },
  });

  const response = await PATCH(new Request('https://example.com/api/admin/cron-jobs', {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ jobKey: 'not-real', enabled: false }),
  }));

  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'BAD_REQUEST');
  assert.deepEqual(calls, []);
});

test('PATCH performs before -> PUT -> after verified round-trip and writes redacted durable audit records', async () => {
  const upstreamCalls = [];
  const audits = [];
  const secretMarker = 'SHOULD_NOT_LEAK';
  let getCount = 0;

  __setGoNoGoTestHooks({
    fetchImpl: async (url, init = {}) => {
      const method = init.method || 'GET';
      upstreamCalls.push({ url: String(url), method });
      if (method === 'PUT') return new Response(null, { status: 204 });
      getCount += 1;
      return jsonResponse({
        workflows: [
          workflow('.github/workflows/refund-reconcile.yml', getCount === 1 ? 'active' : 'disabled_manually'),
        ],
        marker: secretMarker,
      });
    },
    auditLogger: (entry) => {
      audits.push(entry);
      return { id: `aud_${audits.length}` };
    },
    now: () => '2026-07-10T00:00:00.000Z',
  });

  const response = await PATCH(new Request('https://example.com/api/admin/cron-jobs', {
    method: 'PATCH',
    headers: authHeaders({ 'x-request-id': 'req-1686' }),
    body: JSON.stringify({ jobKey: 'refund-reconcile', enabled: false }),
  }));

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.beforeState, 'active');
  assert.equal(body.data.afterState, 'disabled_manually');
  assert.equal(upstreamCalls.filter((call) => call.method === 'GET').length, 2);
  assert.equal(upstreamCalls.filter((call) => call.method === 'PUT').length, 1);
  assert.equal(audits.length, 2);
  assert.equal(audits[0].metadata.phase, 'intent');
  assert.equal(audits[1].metadata.phase, 'final');
  assert.equal(audits[1].metadata.outcome, 'success');
  assert.doesNotMatch(JSON.stringify(audits), new RegExp(`${secretMarker}|ghs_api_secret`, 'i'));
});

test('audit intent write failure prevents PUT mutation (PUT=0) and normalizes to 500', async () => {
  const upstreamCalls = [];

  __setGoNoGoTestHooks({
    fetchImpl: async (url, init = {}) => {
      const method = init.method || 'GET';
      upstreamCalls.push({ url: String(url), method });
      return jsonResponse({
        workflows: [workflow('.github/workflows/refund-reconcile.yml', 'active')],
      });
    },
    auditLogger: () => {
      throw new Error('audit unavailable');
    },
  });

  const response = await PATCH(new Request('https://example.com/api/admin/cron-jobs', {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ jobKey: 'refund-reconcile', enabled: false }),
  }));

  const body = await response.json();
  assert.equal(response.status, 500);
  assert.equal(body.error.code, 'AUDIT_WRITE_FAILED');
  assert.equal(upstreamCalls.filter((call) => call.method === 'PUT').length, 0);
  assert.equal(upstreamCalls.filter((call) => call.method === 'GET').length, 1);
});
