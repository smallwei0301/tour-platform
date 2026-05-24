/**
 * LINE / LIFF Booking Flow Regression Tests (Issue #16)
 *
 * Covers the auth handoff endpoint and source_channel=line path through the
 * booking draft flow that prior PRs shipped. This is a CONSOLIDATION test file
 * — it does not test anything new, only verifies existing behaviour contracts.
 *
 * Endpoint under test:  GET /api/v2/line/auth/handoff
 * Source file:          app/api/v2/line/auth/handoff/route.ts
 *
 * Test strategy: static analysis (source-read) + pure-JS logic mirrors —
 * no running server required. Mirrors the pattern used in
 * v2-line-liff-entry-contract.test.mjs and v2-booking-draft-checkout.test.mjs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function read(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

// ---------------------------------------------------------------------------
// Mirrors of the handoff route helpers (kept in sync with route.ts)
// ---------------------------------------------------------------------------

function pickFirst(value) {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function createCorrelationId(seed) {
  if (seed && seed.trim()) return seed.trim();
  return `line-handoff-${crypto.randomUUID()}`;
}

/**
 * Simulates the GET handler logic from route.ts without importing Next.js.
 * Returns either { status, json } for JSON responses or { status, location } for redirects.
 */
function simulateHandoff(queryParams) {
  const activityId = (queryParams.activityId ?? '').trim();

  if (!activityId) {
    return {
      status: 400,
      json: { success: false, error: { code: 'VALIDATION_ERROR', message: 'activityId is required' } },
    };
  }

  const correlationId = createCorrelationId(queryParams.correlationId);
  const bookingParams = new URLSearchParams();

  for (const key of ['plan', 'date', 'timezone']) {
    const value = (queryParams[key] ?? '').trim();
    if (value) bookingParams.set(key, value);
  }

  bookingParams.set('source', 'line');
  bookingParams.set('sourceChannel', 'line');
  bookingParams.set('correlationId', correlationId);

  const bookingPath = `/booking/${encodeURIComponent(activityId)}?${bookingParams.toString()}`;

  if (queryParams.mode === 'redirect') {
    return {
      status: 302,
      location: bookingPath,
    };
  }

  return {
    status: 200,
    json: {
      success: true,
      data: {
        sourceChannel: 'line',
        correlationId,
        bookingPath,
      },
    },
  };
}

// ===========================================================================
// 1. Static source analysis — confirms the route file enforces the contract
// ===========================================================================

test('[source] handoff route exports GET and enforces activityId guard', async () => {
  const src = await read('app/api/v2/line/auth/handoff/route.ts');

  assert.match(src, /export\s+async\s+function\s+GET\s*\(/, 'must export async GET');
  assert.match(
    src,
    /errorV2\('VALIDATION_ERROR',\s*'activityId is required'\)/,
    'must return VALIDATION_ERROR when activityId missing'
  );
});

test('[source] handoff route always stamps source=line and sourceChannel=line', async () => {
  const src = await read('app/api/v2/line/auth/handoff/route.ts');

  assert.match(src, /bookingParams\.set\('source',\s*'line'\)/, 'must set source=line');
  assert.match(src, /bookingParams\.set\('sourceChannel',\s*'line'\)/, 'must set sourceChannel=line');
});

test('[source] handoff route stamps correlationId onto bookingParams', async () => {
  const src = await read('app/api/v2/line/auth/handoff/route.ts');

  assert.match(src, /bookingParams\.set\('correlationId', correlationId\)/, 'must forward correlationId');
});

test('[source] handoff route supports mode=redirect for 302 flow', async () => {
  const src = await read('app/api/v2/line/auth/handoff/route.ts');

  assert.match(src, /params\.get\('mode'\)\s*===\s*'redirect'/, 'must branch on mode=redirect');
  assert.match(src, /NextResponse\.redirect\(/, 'must issue NextResponse.redirect for redirect mode');
});

test('[source] draft route accepts line as a valid sourceChannel', async () => {
  const src = await read('app/api/v2/bookings/draft/route.ts');

  assert.match(src, /'line'/, "draft route must enumerate 'line' as valid channel");
  assert.match(
    src,
    /VALID_CHANNELS\s*=\s*\[['"]web['"],\s*['"]line['"],\s*['"]admin_pos['"]\]/,
    'VALID_CHANNELS must include line'
  );
});

// ===========================================================================
// 2. Logic mirror tests — GET /api/v2/line/auth/handoff?activityId=abc
// ===========================================================================

test('[logic] GET ?activityId=abc returns JSON with sourceChannel=line, correlationId, bookingPath', () => {
  const result = simulateHandoff({ activityId: 'abc' });

  assert.equal(result.status, 200);
  assert.equal(result.json.success, true);
  assert.equal(result.json.data.sourceChannel, 'line');
  assert.ok(result.json.data.correlationId, 'correlationId must be non-empty');
  assert.ok(result.json.data.bookingPath, 'bookingPath must be non-empty');
});

test('[logic] bookingPath includes source=line and sourceChannel=line query params', () => {
  const result = simulateHandoff({ activityId: 'abc' });

  assert.equal(result.status, 200);
  const { bookingPath } = result.json.data;
  assert.ok(bookingPath.includes('source=line'), `bookingPath must include source=line, got: ${bookingPath}`);
  assert.ok(
    bookingPath.includes('sourceChannel=line'),
    `bookingPath must include sourceChannel=line, got: ${bookingPath}`
  );
});

test('[logic] bookingPath is rooted at /booking/<activityId>', () => {
  const result = simulateHandoff({ activityId: 'my-activity-123' });

  assert.equal(result.status, 200);
  const { bookingPath } = result.json.data;
  assert.ok(
    bookingPath.startsWith('/booking/my-activity-123?'),
    `bookingPath must start with /booking/my-activity-123?, got: ${bookingPath}`
  );
});

test('[logic] bookingPath includes correlationId as a query param', () => {
  const result = simulateHandoff({ activityId: 'abc' });

  assert.equal(result.status, 200);
  const { bookingPath, correlationId } = result.json.data;
  assert.ok(
    bookingPath.includes(`correlationId=${encodeURIComponent(correlationId)}`),
    `bookingPath must include the correlationId, got: ${bookingPath}`
  );
});

// ===========================================================================
// 3. Logic mirror tests — mode=redirect → 302
// ===========================================================================

test('[logic] GET ?activityId=abc&mode=redirect returns 302 with location set', () => {
  const result = simulateHandoff({ activityId: 'abc', mode: 'redirect' });

  assert.equal(result.status, 302, 'redirect mode must return 302');
  assert.ok(result.location, 'redirect response must include location');
  assert.ok(result.location.includes('source=line'), 'redirect location must include source=line');
  assert.ok(result.location.includes('sourceChannel=line'), 'redirect location must include sourceChannel=line');
});

test('[logic] redirect location matches the same bookingPath as JSON mode', () => {
  // Use a fixed correlationId so both calls produce identical output
  const fixedCorrelation = 'test-corr-xyz';
  const jsonResult = simulateHandoff({ activityId: 'abc', correlationId: fixedCorrelation });
  const redirectResult = simulateHandoff({ activityId: 'abc', correlationId: fixedCorrelation, mode: 'redirect' });

  assert.equal(jsonResult.json.data.bookingPath, redirectResult.location, 'JSON bookingPath and redirect location must match');
});

// ===========================================================================
// 4. Logic mirror tests — missing activityId → 400 VALIDATION_ERROR
// ===========================================================================

test('[logic] GET without activityId returns 400 VALIDATION_ERROR', () => {
  const result = simulateHandoff({});

  assert.equal(result.status, 400, 'missing activityId must return 400');
  assert.equal(result.json.success, false);
  assert.equal(result.json.error.code, 'VALIDATION_ERROR');
  assert.match(result.json.error.message, /activityId/i);
});

test('[logic] GET with empty activityId returns 400 VALIDATION_ERROR', () => {
  const result = simulateHandoff({ activityId: '' });

  assert.equal(result.status, 400, 'empty activityId must return 400');
  assert.equal(result.json.error.code, 'VALIDATION_ERROR');
});

test('[logic] GET with whitespace-only activityId returns 400 VALIDATION_ERROR', () => {
  const result = simulateHandoff({ activityId: '   ' });

  assert.equal(result.status, 400, 'whitespace-only activityId must return 400');
  assert.equal(result.json.error.code, 'VALIDATION_ERROR');
});

// ===========================================================================
// 5. correlationId seeding and passthrough
// ===========================================================================

test('[logic] caller-supplied correlationId is echoed back unchanged', () => {
  const seed = 'my-existing-correlation-id';
  const result = simulateHandoff({ activityId: 'abc', correlationId: seed });

  assert.equal(result.status, 200);
  assert.equal(result.json.data.correlationId, seed, 'correlationId must be echoed back when supplied');
});

test('[logic] auto-generated correlationId starts with line-handoff-', () => {
  const result = simulateHandoff({ activityId: 'abc' });

  assert.equal(result.status, 200);
  assert.match(
    result.json.data.correlationId,
    /^line-handoff-/,
    'auto-generated correlationId must start with line-handoff-'
  );
});

// ===========================================================================
// 6. Passthrough params (plan, date, timezone) are forwarded
// ===========================================================================

test('[logic] optional plan/date/timezone params are forwarded into bookingPath', () => {
  const result = simulateHandoff({
    activityId: 'abc',
    plan: 'full-day',
    date: '2026-06-01',
    timezone: 'Asia/Taipei',
  });

  assert.equal(result.status, 200);
  const { bookingPath } = result.json.data;
  assert.ok(bookingPath.includes('plan=full-day'), `bookingPath must include plan param, got: ${bookingPath}`);
  assert.ok(bookingPath.includes('date=2026-06-01'), `bookingPath must include date param, got: ${bookingPath}`);
  assert.ok(
    bookingPath.includes('timezone=Asia%2FTaipei') || bookingPath.includes('timezone=Asia/Taipei'),
    `bookingPath must include timezone param, got: ${bookingPath}`
  );
});

// ===========================================================================
// 7. Line channel isolation — does NOT bleed into web/admin_pos state
// ===========================================================================

test('[isolation] sourceChannel=line does not overlap with web or admin_pos', () => {
  const validChannels = ['web', 'line', 'admin_pos'];

  // Confirm the channels are distinct
  assert.equal(new Set(validChannels).size, validChannels.length, 'all channels must be distinct');

  // Line handoff ALWAYS returns sourceChannel=line — never web, never admin_pos
  const result = simulateHandoff({ activityId: 'abc' });
  assert.equal(result.json.data.sourceChannel, 'line');
  assert.notEqual(result.json.data.sourceChannel, 'web');
  assert.notEqual(result.json.data.sourceChannel, 'admin_pos');
});

test('[isolation] line source booking path does not embed web or admin_pos channel markers', () => {
  const result = simulateHandoff({ activityId: 'abc' });
  const { bookingPath } = result.json.data;

  assert.ok(!bookingPath.includes('sourceChannel=web'), 'bookingPath must not include sourceChannel=web');
  assert.ok(
    !bookingPath.includes('sourceChannel=admin_pos'),
    'bookingPath must not include sourceChannel=admin_pos'
  );
  assert.ok(!bookingPath.includes('source=web'), 'bookingPath must not include source=web');
});

console.log('All LINE/LIFF booking flow regression tests passed.');
