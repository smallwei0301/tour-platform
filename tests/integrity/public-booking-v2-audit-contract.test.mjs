import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const auditScript = path.join(repoRoot, 'scripts/audit-public-booking-v2.mjs');
const workflowPath = path.join(repoRoot, '.github/workflows/public-booking-audit.yml');
const FORMAL_PLAN_A = '11111111-1111-4111-8111-111111111111';
const FORMAL_PLAN_B = '22222222-2222-4222-8222-222222222222';

function runAudit(baseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [auditScript], {
      cwd: repoRoot,
      env: { ...process.env, BASE_URL: baseUrl, AUDIT_DATE: '2026-09-15' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function withApi(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function catalog() {
  return { data: [{ id: 'catalog-activity-id', slug: 'published-tour' }] };
}

test('audit discovers formal plan UUIDs from public detail instead of catalog activity id', async () => {
  const seen = [];
  const result = await withApi((req, res) => {
    seen.push(req.url);
    if (req.url === '/api/activities') return json(res, 200, catalog());
    if (req.url === '/api/activities/published-tour') {
      return json(res, 200, { data: { plans: [{ id: FORMAL_PLAN_A, status: 'active' }] } });
    }
    if (req.url.startsWith('/api/v2/activities/catalog-activity-id/available-slots?')) {
      return json(res, 200, { data: { slots: [], selectedPlan: { maxParticipants: 10 } } });
    }
    return json(res, 404, { error: { code: 'NOT_FOUND' } });
  }, runAudit);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /PASS/);
  assert.deepEqual(seen.map((url) => url.split('?')[0]), [
    '/api/activities',
    '/api/activities/published-tour',
    '/api/v2/activities/catalog-activity-id/available-slots',
  ]);
  assert.equal(new URL(seen.at(-1), 'http://audit.test').searchParams.get('planId'), FORMAL_PLAN_A);
  assert.doesNotMatch(seen.at(-1), /planId=catalog-activity-id/);
});

test('audit probes every active public formal plan UUID exactly once', async () => {
  const probedPlanIds = [];
  const result = await withApi((req, res) => {
    if (req.url === '/api/activities') return json(res, 200, catalog());
    if (req.url === '/api/activities/published-tour') {
      return json(res, 200, { data: { plans: [
        { id: FORMAL_PLAN_A, status: 'active' },
        { id: FORMAL_PLAN_B, status: 'active' },
      ] } });
    }
    if (req.url.startsWith('/api/v2/activities/catalog-activity-id/available-slots?')) {
      probedPlanIds.push(new URL(req.url, 'http://audit.test').searchParams.get('planId'));
      return json(res, 200, { data: { slots: [], selectedPlan: { maxParticipants: 10 } } });
    }
    return json(res, 404, {});
  }, runAudit);

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(probedPlanIds.sort(), [FORMAL_PLAN_A, FORMAL_PLAN_B]);
});

test('audit reports NO_ACTIVE_PUBLIC_PLAN without calling available-slots and exits non-zero', async () => {
  let availableSlotsCalls = 0;
  const result = await withApi((req, res) => {
    if (req.url === '/api/activities') return json(res, 200, catalog());
    if (req.url === '/api/activities/published-tour') return json(res, 200, { data: { plans: [] } });
    if (req.url.includes('/available-slots')) availableSlotsCalls += 1;
    return json(res, 404, {});
  }, runAudit);

  assert.equal(result.code, 1);
  assert.equal(availableSlotsCalls, 0);
  assert.match(result.stdout, /NO_ACTIVE_PUBLIC_PLAN/);
  assert.doesNotMatch(result.stdout, /FAIL_500.*published-tour/);
});

test('audit classifies canonical and version-skew plan-not-found responses without FAIL_500', async () => {
  for (const error of [
    { code: 'PLAN_NOT_FOUND', message: 'Activity plan not found' },
    { code: 'NOT_FOUND', message: 'Activity plan not found' },
  ]) {
    const result = await withApi((req, res) => {
      if (req.url === '/api/activities') return json(res, 200, catalog());
      if (req.url === '/api/activities/published-tour') {
        return json(res, 200, { data: { plans: [{ id: FORMAL_PLAN_A, status: 'active' }] } });
      }
      if (req.url.includes('/available-slots')) return json(res, 404, { error });
      return json(res, 404, {});
    }, runAudit);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /GRACEFUL_PLAN_NOT_FOUND/);
    assert.doesNotMatch(result.stdout, /FAIL_500/);
  }
});

test('audit fails closed with explicit finding when activity detail is malformed or unavailable', async () => {
  for (const reply of [
    { status: 200, body: { data: { plans: 'not-an-array' } } },
    { status: 500, body: { error: { code: 'SERVER_ERROR' } } },
  ]) {
    let availableSlotsCalls = 0;
    const result = await withApi((req, res) => {
      if (req.url === '/api/activities') return json(res, 200, catalog());
      if (req.url === '/api/activities/published-tour') return json(res, reply.status, reply.body);
      if (req.url.includes('/available-slots')) availableSlotsCalls += 1;
      return json(res, 404, {});
    }, runAudit);
    assert.equal(result.code, 1);
    assert.equal(availableSlotsCalls, 0);
    assert.match(result.stdout, /FAIL_ACTIVITY_DETAIL/);
  }
});

test('workflow artifact upload uses multi-line md/json report paths rather than brace glob', () => {
  const workflow = readFileSync(workflowPath, 'utf8');
  assert.doesNotMatch(workflow, /public-booking-audit-\*\.\{md,json\}/);
  const uploadBlock = workflow.split('uses: actions/upload-artifact@v4')[1];
  assert.ok(uploadBlock, 'workflow must retain report artifact upload');
  assert.match(uploadBlock, /path:\s*\|[\s\S]*public-booking-audit-\*\.md/);
  assert.match(uploadBlock, /path:\s*\|[\s\S]*public-booking-audit-\*\.json/);
});
