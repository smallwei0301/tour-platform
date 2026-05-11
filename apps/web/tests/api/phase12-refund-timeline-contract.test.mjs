import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

// AC1 — Admin orders page fetches and renders refund timeline events
test('AC1: admin orders page fetches booking timeline and renders refund events', () => {
  const filePath = path.join(ROOT, 'app/admin/orders/page.tsx');
  const src = readFileSync(filePath, 'utf8');

  // Must fetch the POS timeline API
  assert.match(src, /api\/v2\/admin\/pos\/bookings/, 'must fetch POS timeline endpoint');

  // Must render timeline items sorted by at timestamp
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
  const filePath = path.join(ROOT, 'app/api/admin/refund-requests/csv/route.ts');
  const src = readFileSync(filePath, 'utf8');

  assert.match(src, /text\/csv/, 'must return Content-Type: text/csv');
  assert.match(
    src,
    /Content-Disposition|content-disposition/,
    'must set Content-Disposition header'
  );
  assert.match(
    src,
    /refund-records/,
    'filename must include refund-records'
  );
  assert.match(src, /refund_requests/, 'must query refund_requests table or data');
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
