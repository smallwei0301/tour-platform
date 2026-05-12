/**
 * RED tests for issue #363: Reviews UI — admin reviews page + /me/orders review form
 *
 * AC1: /admin/reviews/page.tsx exists, references /api/admin/reviews, shows approve/reject, author/rating/status
 * AC2: /me/orders/[orderId]/page.tsx shows 撰寫評價 button only for completed orders
 * AC3: Review form has star rating (1-5), textarea, submit handler POSTing /api/reviews
 * AC4: Success state shows "評價已送出，等候審核"
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

// ─── AC1: Admin reviews page ─────────────────────────────────────────────────

test('AC1: admin/reviews/page.tsx exists', async () => {
  const src = await readSource('app/admin/reviews/page.tsx');
  assert.ok(src.length > 0, 'admin reviews page must exist and be non-empty');
});

test('AC1: admin/reviews/page.tsx references /api/admin/reviews endpoint', async () => {
  const src = await readSource('app/admin/reviews/page.tsx');
  assert.match(src, /\/api\/admin\/reviews/, 'must reference /api/admin/reviews');
});

test('AC1: admin/reviews/page.tsx has approve action', async () => {
  const src = await readSource('app/admin/reviews/page.tsx');
  assert.match(src, /approved/, 'must have approve action with status approved');
});

test('AC1: admin/reviews/page.tsx has reject action', async () => {
  const src = await readSource('app/admin/reviews/page.tsx');
  assert.match(src, /rejected/, 'must have reject action with status rejected');
});

test('AC1: admin/reviews/page.tsx shows author field', async () => {
  const src = await readSource('app/admin/reviews/page.tsx');
  assert.match(src, /author/, 'must display author field');
});

test('AC1: admin/reviews/page.tsx shows rating field', async () => {
  const src = await readSource('app/admin/reviews/page.tsx');
  assert.match(src, /rating/, 'must display rating field');
});

test('AC1: admin/reviews/page.tsx shows status field', async () => {
  const src = await readSource('app/admin/reviews/page.tsx');
  assert.match(src, /status/, 'must display status field');
});

test('AC1: AdminShell NAV_ITEMS contains 評價管理 link', async () => {
  const src = await readSource('src/components/admin/AdminShell.tsx');
  assert.match(src, /評價管理/, 'AdminShell nav must have 評價管理 entry');
  assert.match(src, /\/admin\/reviews/, 'AdminShell nav must link to /admin/reviews');
});

// ─── AC2: /me/orders review button for completed orders ───────────────────────

test('AC2: orderId page has 撰寫評價 button', async () => {
  const src = await readSource('app/me/orders/[orderId]/page.tsx');
  assert.match(src, /撰寫評價/, 'must have 撰寫評價 button text');
});

test('AC2: 撰寫評價 button shown for paid, confirmed, and completed orders', async () => {
  const src = await readSource('app/me/orders/[orderId]/page.tsx');
  assert.match(
    src,
    /\[['"]paid['"],\s*['"]confirmed['"],\s*['"]completed['"]\]\.includes\(status\)/,
    'review button must be guarded by [\'paid\',\'confirmed\',\'completed\'].includes(status)'
  );
});

test('AC2: orderId page references /api/reviews for review submission', async () => {
  const src = await readSource('app/me/orders/[orderId]/page.tsx');
  assert.match(src, /\/api\/reviews/, 'must reference /api/reviews endpoint');
});

// ─── AC3: Review form structure ───────────────────────────────────────────────

test('AC3: review form has star rating input (1-5)', async () => {
  const src = await readSource('app/me/orders/[orderId]/page.tsx');
  // Must have rating state and some 1-5 mechanism
  assert.match(src, /rating/, 'must have rating input');
  assert.match(
    src,
    /[1-5][\s\S]{0,200}rating|rating[\s\S]{0,200}[1-5]/,
    'rating must involve values 1 through 5'
  );
});

test('AC3: review form has review_text textarea', async () => {
  const src = await readSource('app/me/orders/[orderId]/page.tsx');
  assert.match(src, /textarea/, 'must have textarea for review text');
  assert.match(src, /reviewText|review_text/, 'must have reviewText state or review_text field');
});

test('AC3: review form submit handler POSTs to /api/reviews', async () => {
  const src = await readSource('app/me/orders/[orderId]/page.tsx');
  assert.match(src, /POST[\s\S]{0,100}\/api\/reviews|\/api\/reviews[\s\S]{0,100}POST/,
    'submit handler must POST to /api/reviews');
});

test('AC3: review POST body includes activityId, bookingId, rating, reviewText', async () => {
  const src = await readSource('app/me/orders/[orderId]/page.tsx');
  assert.match(src, /activityId/, 'POST body must include activityId');
  assert.match(src, /bookingId/, 'POST body must include bookingId');
  assert.match(src, /rating/, 'POST body must include rating');
  assert.match(src, /reviewText/, 'POST body must include reviewText');
});

// ─── AC4: Success state ───────────────────────────────────────────────────────

test('AC4: success state shows 評價已送出，等候審核', async () => {
  const src = await readSource('app/me/orders/[orderId]/page.tsx');
  assert.match(src, /評價已送出，等候審核/, 'must show success message 評價已送出，等候審核');
});
