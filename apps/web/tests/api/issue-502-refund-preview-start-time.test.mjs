import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function readRefundPreviewRoute() {
  const full = path.join(ROOT, 'app/api/v2/orders/[orderId]/refund-preview/route.ts');
  return readFile(full, 'utf8');
}

test('refund-preview route must not select orders.tour_start_at directly from orders', async () => {
  const src = await readRefundPreviewRoute();

  assert.doesNotMatch(
    src,
    /\.from\('orders'\)[\s\S]*?\.select\([^)]*tour_start_at[^)]*\)/,
    'orders select should not include tour_start_at because production schema lacks this column'
  );
});

test('refund-preview route derives start time from schedule relation and keeps missing-date non-404 behavior', async () => {
  const src = await readRefundPreviewRoute();

  assert.match(src, /schedule_id/, 'route should read schedule_id from orders');
  assert.match(
    src,
    /activity_schedules\s*\(\s*start_at\s*\)/,
    'route should fetch start_at from activity_schedules relation'
  );
  assert.match(src, /if \(!tourStartAt\)\s*\{[\s\S]*successV2\(\{[\s\S]*reason:\s*'tour start date not set'/, 'missing start date should stay business ineligible reason');
});

test('refund-preview route keeps uuid validation, not-found, and non-owner guards', async () => {
  const src = await readRefundPreviewRoute();

  assert.match(src, /errorV2\('VALIDATION_ERROR',\s*'Invalid orderId'\)[\s\S]*status:\s*400/);
  assert.match(src, /errorV2\('NOT_FOUND',\s*'Order not found'\)[\s\S]*status:\s*404/);
  assert.match(src, /errorV2\('FORBIDDEN',\s*'You are not allowed to access this order'\)[\s\S]*status:\s*403/);
});
