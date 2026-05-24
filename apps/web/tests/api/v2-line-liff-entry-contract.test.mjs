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

test('line auth handoff route exists and preserves line source + correlation continuity', async () => {
  const src = await read('app/api/v2/line/auth/handoff/route.ts');

  assert.match(src, /export\s+async\s+function\s+GET\s*\(/);
  assert.match(src, /errorV2\('VALIDATION_ERROR', 'activityId is required'\)/);
  assert.match(src, /bookingParams\.set\('source', 'line'\)/);
  assert.match(src, /bookingParams\.set\('sourceChannel', 'line'\)/);
  assert.match(src, /bookingParams\.set\('correlationId', correlationId\)/);
  assert.match(src, /params\.get\('mode'\) === 'redirect'/);
});

test('booking line wrapper page exists and redirects into handoff path', async () => {
  const src = await read('app/booking/line/page.tsx');

  assert.match(src, /export\s+default\s+async\s+function\s+LineBookingEntryPage/);
  assert.match(src, /handoffParams\.set\('mode', 'redirect'\)/);
  assert.match(src, /redirect\(`\/api\/v2\/line\/auth\/handoff\?\$\{handoffParams\.toString\(\)\}`\)/);
});

test('booking v2 flow forwards correlation header and source channel from line entry', async () => {
  const src = await read('app/booking/[activityId]/page.tsx');

  assert.match(src, /const source = searchParams\.get\('source'\) \|\| searchParams\.get\('sourceChannel'\) \|\| 'web'/);
  assert.match(src, /const correlationId = searchParams\.get\('correlationId'\) \|\| ''/);
  assert.match(src, /const sourceChannel = source === 'line' \? 'line' : 'web'/);
  assert.match(src, /const isLineContinuation = sourceChannel === 'line'/);
  assert.match(src, /'x-correlation-id': correlationId/);
  assert.match(src, /sourceChannel,/);
});

test('line continuation fallback is explicit and testable without silently dropping to legacy flow', async () => {
  const src = await read('app/booking/[activityId]/page.tsx');

  assert.match(src, /data-testid="booking-v2-line-fallback-state"/);
  assert.match(src, /data-testid="booking-v2-line-retry-btn"/);
  assert.match(src, /LINE LIFF 延續流程維持 shared checkout\/payment-init；不切換舊版流程/);
});

test('checkout route keeps line source + correlation continuity in payment-init audit payload', async () => {
  const src = await read('app/api/v2/bookings/[bookingId]/checkout/route.ts');

  assert.match(src, /const sourceChannel = checkoutBooking\.source_channel \|\| 'web'/);
  assert.match(src, /eq\('to_status', 'draft'\)/);
  assert.match(src, /const correlationId =/);
  assert.match(src, /draftMetadata\?\.correlationId/);
  assert.match(src, /auditSignal: 'line_liff_payment_init'/);
  assert.match(src, /sourceChannel,/);
  assert.match(src, /correlationId,/);
});
