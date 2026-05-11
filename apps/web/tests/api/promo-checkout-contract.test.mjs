/**
 * Contract tests for issue #355: Promo checkout integration + createOrderDb atomic
 * AC1: createOrderDb accepts promoCode, calls fn_redeem_promo_code, updates total_twd + discount_amount
 * AC2: orders/route.ts accepts promoCode in body, passes to createOrderDb, handles EXHAUSTED/ALREADY_REDEEMED → 400/409
 * AC3: checkout/page.tsx has code input, validate trigger, discounted price, error state
 * AC4: calculateDiscount is imported/used in server-side order creation flow (db.mjs)
 * AC5: ecpay/create/route.ts reads total_twd from DB (no regression — no client-provided total)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname = apps/web/tests/api → go up 2 levels to apps/web
const APPS_WEB = resolve(__dirname, '../..');

// ── File readers ───────────────────────────────────────────────────────────────
const dbSrc = readFileSync(resolve(APPS_WEB, 'src/lib/db.mjs'), 'utf8');
const ordersRouteSrc = readFileSync(resolve(APPS_WEB, 'app/api/orders/route.ts'), 'utf8');
const checkoutPageSrc = readFileSync(resolve(APPS_WEB, 'app/checkout/page.tsx'), 'utf8');
const ecpayCreateSrc = readFileSync(resolve(APPS_WEB, 'app/api/payments/ecpay/create/route.ts'), 'utf8');

// ── AC1: createOrderDb accepts promoCode ──────────────────────────────────────

test('AC1: db.mjs imports calculateDiscount from promo-discount', () => {
  assert.match(
    dbSrc,
    /import.*calculateDiscount.*promo-discount|calculateDiscount.*from.*promo-discount/s,
    'db.mjs should import calculateDiscount from promo-discount'
  );
});

test('AC1: createOrderDb reads promoCode from input', () => {
  assert.match(
    dbSrc,
    /promoCode|promo_code/,
    'createOrderDb should reference promoCode parameter'
  );
});

test('AC1: createOrderDb calls fn_redeem_promo_code via supabase RPC', () => {
  assert.match(
    dbSrc,
    /fn_redeem_promo_code/,
    'createOrderDb should call fn_redeem_promo_code via RPC'
  );
});

test('AC1: createOrderDb writes discount_amount to orders row', () => {
  assert.match(
    dbSrc,
    /discount_amount/,
    'createOrderDb should write discount_amount to orders row'
  );
});

test('AC1: createOrderDb updates total_twd after discount', () => {
  // Should do an update after redeem (not just initial insert)
  assert.match(
    dbSrc,
    /\.update\s*\(\s*\{[^}]*total_twd|total_twd.*finalTotal|finalTotal.*total_twd/s,
    'createOrderDb should update total_twd after successful promo redemption'
  );
});

test('AC1: createOrderDb rolls back order when promo fails (delete on error)', () => {
  assert.match(
    dbSrc,
    /\.delete\(\).*\.eq\('id'|orders.*delete.*eq.*order\.id/s,
    'createOrderDb should delete/rollback order on promo redemption failure'
  );
});

// ── AC2: orders/route.ts accepts promoCode ────────────────────────────────────

test('AC2: orders route extracts promoCode from request body', () => {
  assert.match(
    ordersRouteSrc,
    /promoCode|promo_code/,
    'orders route should extract promoCode from request body'
  );
});

test('AC2: orders route handles EXHAUSTED → 409', () => {
  assert.match(
    ordersRouteSrc,
    /EXHAUSTED|409/,
    'orders route should handle EXHAUSTED → 409'
  );
});

test('AC2: orders route handles ALREADY_REDEEMED → 409', () => {
  assert.match(
    ordersRouteSrc,
    /ALREADY_REDEEMED/,
    'orders route should handle ALREADY_REDEEMED'
  );
});

// ── AC3: checkout/page.tsx has promo code UI ──────────────────────────────────

test('AC3: checkout page has promoCode state', () => {
  assert.match(
    checkoutPageSrc,
    /promoCode|promo_code|useState.*''/,
    'checkout page should have promoCode state'
  );
});

test('AC3: checkout page has promo validation state', () => {
  assert.match(
    checkoutPageSrc,
    /promoValidation|promo.*valid|validat.*promo/i,
    'checkout page should have promo validation state'
  );
});

test('AC3: checkout page has text input for promo code entry', () => {
  assert.match(
    checkoutPageSrc,
    /data-testid="promo-code-input"|promo.*input|input.*promo|promoCode.*onChange|onChange.*promoCode/s,
    'checkout page should have a text input for promo code'
  );
});

test('AC3: checkout page has button or handler to apply/validate promo', () => {
  assert.match(
    checkoutPageSrc,
    /套用|Apply|applyPromo|validatePromo|promo.*click|onClick.*promo/i,
    'checkout page should have a button or handler to apply promo'
  );
});

test('AC3: checkout page calls promo-codes/validate endpoint', () => {
  assert.match(
    checkoutPageSrc,
    /promo-codes\/validate|\/api\/promo/,
    'checkout page should call /api/promo-codes/validate'
  );
});

test('AC3: checkout page shows discounted price when valid', () => {
  assert.match(
    checkoutPageSrc,
    /discountAmount|discountedTotal|折扣|discount/i,
    'checkout page should show discounted price when code is valid'
  );
});

test('AC3: checkout page shows error message when code is invalid', () => {
  assert.match(
    checkoutPageSrc,
    /promoValidation.*valid.*false|reason.*promoError|promoError|promo.*error|invalid.*promo/i,
    'checkout page should show error when code is invalid'
  );
});

test('AC3: checkout page passes promoCode in order creation body', () => {
  assert.match(
    checkoutPageSrc,
    /promoCode.*createOrder|createOrder.*promoCode|promoCode.*fetch|fetch.*promoCode/s,
    'checkout page should pass promoCode when creating order'
  );
});

// ── AC4: calculateDiscount used in server-side order creation ─────────────────

test('AC4: calculateDiscount is imported in db.mjs (server-side recomputation)', () => {
  assert.match(
    dbSrc,
    /calculateDiscount/,
    'calculateDiscount should be imported and used in db.mjs'
  );
});

test('AC4: calculateDiscount is called with redeemResult data in db.mjs', () => {
  assert.match(
    dbSrc,
    /calculateDiscount\s*\(/,
    'calculateDiscount should be called in db.mjs'
  );
});

// ── AC5: ECPay reads total_twd from DB (no regression) ───────────────────────

test('AC5: ecpay/create reads total_twd from order record (DB source)', () => {
  assert.match(
    ecpayCreateSrc,
    /order\.totalTwd|order\[.*totalTwd|total_twd/,
    'ECPay create should read totalTwd from the DB order record'
  );
});

test('AC5: ecpay/create does NOT accept TotalAmount from request body', () => {
  // TotalAmount should come from order object, not from request body
  assert.doesNotMatch(
    ecpayCreateSrc,
    /body\.totalTwd|body\.TotalAmount|body\.total|body\['total/,
    'ECPay create should NOT read TotalAmount from client request body'
  );
});

test('AC5: ecpay/create uses getOrderDetailForPayment to fetch order', () => {
  assert.match(
    ecpayCreateSrc,
    /getOrderDetailForPayment/,
    'ECPay create should use getOrderDetailForPayment (not trust client total)'
  );
});

// ── Behavioral unit test: promoCode flows through createOrderDb ───────────────

test('Behavioral: createOrderDb function signature accepts promoCode', () => {
  // The function must reference promoCode in input destructuring or input.promoCode
  const fnMatch = dbSrc.match(/export async function createOrderDb\(input\)([\s\S]*?)^export /m);
  assert.ok(fnMatch, 'createOrderDb should exist');
  const body = fnMatch ? fnMatch[1] : '';
  assert.match(
    body,
    /promoCode|promo_code/,
    'createOrderDb function body should reference promoCode'
  );
});
