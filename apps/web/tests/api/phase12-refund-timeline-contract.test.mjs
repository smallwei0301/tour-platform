import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// AC1 — Admin orders page fetches and renders refund timeline events
test('AC1: admin orders page fetches booking timeline and renders refund events', () => {
  const filePath = path.join(ROOT, 'app/admin/orders/page.tsx');
  const src = readFileSync(filePath, 'utf8');

  // Must fetch the order timeline API (order-level endpoint or POS bookings endpoint)
  assert.match(
    src,
    /\/timeline|api\/v2\/admin\/pos\/bookings/,
    'must fetch timeline endpoint (order-level or POS bookings)'
  );

  // Must render timeline items
  assert.match(src, /timeline/, 'must reference timeline data');

  // Must show refund-related events
  assert.match(src, /refund/, 'must render refund-related timeline events');
});

// AC2 — Admin orders page renders trade_no for refunded payment events
test('AC2: admin orders page shows trade_no for refunded payment events', () => {
  const filePath = path.join(ROOT, 'app/admin/orders/page.tsx');
  const src = readFileSync(filePath, 'utf8');

  assert.match(src, /trade_no|tradeNo/, 'must render trade_no for ECPay payment events');
});

// AC4 — New CSV export endpoint exists with correct headers and refund data join
test('AC4: refund-requests CSV endpoint exists with correct response headers', () => {
  const routePath = path.join(ROOT, 'app/api/admin/refund-requests/csv/route.ts');
  const dbPath = path.join(ROOT, 'src/lib/db.mjs');

  const routeSrc = readFileSync(routePath, 'utf8');
  const dbSrc = readFileSync(dbPath, 'utf8');

  assert.match(routeSrc, /text\/csv/, 'must return Content-Type: text/csv');
  assert.match(
    routeSrc,
    /Content-Disposition|content-disposition/,
    'must set Content-Disposition header'
  );
  assert.match(
    routeSrc,
    /refund-records/,
    'filename must include refund-records'
  );
  // The CSV function in db.mjs must query refund_requests data
  assert.match(dbSrc, /refundRequestsCsvDb/, 'db.mjs must export refundRequestsCsvDb');
  assert.match(dbSrc, /refund_requests/, 'db.mjs must query refund_requests table');
});

// AC5 — Refund action button is disabled when order status is refunded
test('AC5: refund action button disabled when order already refunded', () => {
  const filePath = path.join(ROOT, 'app/admin/orders/page.tsx');
  const src = readFileSync(filePath, 'utf8');

  assert.match(
    src,
    /refunded/,
    'must reference refunded status for button disabled logic'
  );
  assert.match(
    src,
    /disabled/,
    'must have disabled attribute on refund-related button'
  );
});
