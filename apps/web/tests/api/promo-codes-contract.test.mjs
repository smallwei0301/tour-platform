/**
 * Contract tests for issue #353: Promo codes backend
 * AC1: Migration creates promo_codes + promo_redemptions tables with correct schema + RLS
 * AC2: Admin CRUD route (GET list + POST create) with isAdminAuthorized pattern
 * AC3: Validate API route (POST) with auth + rate-limit + discount response shape
 * AC4: fn_redeem_promo_code function or equivalent atomic increment in migration
 * AC5: Admin [id] route with PATCH + DELETE
 * Unit: calculateDiscount pure function (percentage + fixed)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname = apps/web/tests/api → go up 4 levels to repo root
const REPO_ROOT = resolve(__dirname, '../../../..');
const APPS_WEB = resolve(__dirname, '../..');

// ── File readers ───────────────────────────────────────────────────────────────
const migrationSrc = readFileSync(
  resolve(REPO_ROOT, 'supabase/migrations/20260511_issue353_promo_codes.sql'),
  'utf8'
);

const adminRouteSrc = readFileSync(
  resolve(APPS_WEB, 'app/api/admin/promo-codes/route.ts'),
  'utf8'
);

const adminIdRouteSrc = readFileSync(
  resolve(APPS_WEB, 'app/api/admin/promo-codes/[id]/route.ts'),
  'utf8'
);

const validateRouteSrc = readFileSync(
  resolve(APPS_WEB, 'app/api/promo-codes/validate/route.ts'),
  'utf8'
);

// ── AC1: Migration schema ─────────────────────────────────────────────────────

test('AC1: migration creates promo_codes table', () => {
  assert.match(migrationSrc, /CREATE TABLE IF NOT EXISTS.*promo_codes/s, 'should create promo_codes table');
});

test('AC1: promo_codes has code UNIQUE constraint', () => {
  assert.match(migrationSrc, /UNIQUE.*code|code.*UNIQUE|promo_codes_code_unique/s, 'should have UNIQUE constraint on code');
});

test('AC1: promo_codes has discount_type CHECK constraint', () => {
  assert.match(migrationSrc, /discount_type.*CHECK|CHECK.*percentage.*fixed/s, 'should have CHECK for percentage/fixed');
});

test('AC1: promo_codes has discount_value, max_uses, used_count, expires_at, active, per_user_limit, created_at fields', () => {
  assert.match(migrationSrc, /discount_value/, 'should have discount_value');
  assert.match(migrationSrc, /max_uses/, 'should have max_uses');
  assert.match(migrationSrc, /used_count/, 'should have used_count');
  assert.match(migrationSrc, /expires_at/, 'should have expires_at');
  assert.match(migrationSrc, /active/, 'should have active');
  assert.match(migrationSrc, /per_user_limit/, 'should have per_user_limit');
  assert.match(migrationSrc, /created_at/, 'should have created_at');
});

test('AC1: migration creates promo_redemptions table with user_id, promo_code_id FK, order_id, redeemed_at', () => {
  assert.match(migrationSrc, /CREATE TABLE IF NOT EXISTS.*promo_redemptions/s, 'should create promo_redemptions table');
  assert.match(migrationSrc, /user_id/, 'should have user_id');
  assert.match(migrationSrc, /promo_code_id.*REFERENCES|REFERENCES.*promo_codes/s, 'should have promo_code_id FK');
  assert.match(migrationSrc, /order_id/, 'should have order_id');
  assert.match(migrationSrc, /redeemed_at/, 'should have redeemed_at');
});

test('AC1: promo_redemptions has UNIQUE(user_id, promo_code_id)', () => {
  assert.match(migrationSrc, /UNIQUE.*user_id.*promo_code_id|UNIQUE \(user_id, promo_code_id\)/s, 'should have UNIQUE constraint on (user_id, promo_code_id)');
});

test('AC1: RLS enabled on both tables', () => {
  assert.match(migrationSrc, /ENABLE ROW LEVEL SECURITY/, 'should enable RLS');
  const rls = (migrationSrc.match(/ENABLE ROW LEVEL SECURITY/g) || []).length;
  assert.ok(rls >= 2, `should enable RLS on at least 2 tables, found: ${rls}`);
});

test('AC1: service_role full access policy on promo_codes', () => {
  assert.match(migrationSrc, /promo_codes.*service role full access|service role full access.*promo_codes/s, 'should have service_role policy on promo_codes');
});

test('AC1: service_role full access policy on promo_redemptions', () => {
  assert.match(migrationSrc, /promo_redemptions.*service role full access|service role full access.*promo_redemptions/s, 'should have service_role policy on promo_redemptions');
});

// ── AC2: Admin CRUD route ─────────────────────────────────────────────────────

test('AC2: admin route imports isAdminAuthorized pattern', () => {
  assert.match(adminRouteSrc, /isAdminAuthorized|admin-auth|parseCookie|admin_token/, 'admin route should check admin auth');
});

test('AC2: admin route returns 401 for invalid/missing token', () => {
  assert.match(adminRouteSrc, /401/, 'admin route should return 401 for unauthorized');
});

test('AC2: admin GET route returns list of promo_codes', () => {
  assert.match(adminRouteSrc, /GET/, 'admin route should have GET handler');
  assert.match(adminRouteSrc, /promo_codes|listPromoCodesDb|list_promo|promo.codes/i, 'GET should query promo_codes');
});

test('AC2: admin POST route creates new code with UPPER+TRIM normalization', () => {
  assert.match(adminRouteSrc, /POST/, 'admin route should have POST handler');
  assert.match(adminRouteSrc, /upper|toUpperCase|UPPER/i, 'POST should normalize code to uppercase');
  assert.match(adminRouteSrc, /trim|TRIM/i, 'POST should trim code');
});

// ── AC3: Validate API route ───────────────────────────────────────────────────

test('AC3: validate route returns 401 when user not authenticated', () => {
  assert.match(validateRouteSrc, /401/, 'validate route should return 401 for unauthenticated');
});

test('AC3: validate route checks active, expires_at, used_count < max_uses', () => {
  assert.match(validateRouteSrc, /active/, 'should check active field');
  assert.match(validateRouteSrc, /expires_at/, 'should check expires_at');
  assert.match(validateRouteSrc, /used_count|max_uses/, 'should check used_count vs max_uses');
});

test('AC3: validate route returns {valid, reason, discountAmount, discountedTotal} shape', () => {
  assert.match(validateRouteSrc, /valid/, 'should have valid in response');
  assert.match(validateRouteSrc, /discountAmount/, 'should have discountAmount in response');
  assert.match(validateRouteSrc, /discountedTotal/, 'should have discountedTotal in response');
  assert.match(validateRouteSrc, /reason/, 'should have reason in response');
});

test('AC3: validate route has rate limiting', () => {
  assert.match(validateRouteSrc, /RateLimiter|rateLimiter|rate.limit|limiters/i, 'should reference rate limiter');
});

// ── AC4: fn_redeem_promo_code function ────────────────────────────────────────

test('AC4: migration contains fn_redeem_promo_code or equivalent atomic increment', () => {
  assert.match(
    migrationSrc,
    /fn_redeem_promo_code|FOR UPDATE|used_count.*\+.*1|used_count = used_count \+ 1/s,
    'migration should contain atomic increment or row-lock function'
  );
});

// ── AC5: Admin [id] route ─────────────────────────────────────────────────────

test('AC5: admin [id] route has PATCH handler', () => {
  assert.match(adminIdRouteSrc, /PATCH/, 'should have PATCH handler');
});

test('AC5: admin [id] route has DELETE handler', () => {
  assert.match(adminIdRouteSrc, /DELETE/, 'should have DELETE handler');
});

test('AC5: admin [id] PATCH normalizes code to UPPER+TRIM if code provided', () => {
  assert.match(adminIdRouteSrc, /upper|toUpperCase|UPPER/i, 'PATCH should normalize code');
});

// ── Unit tests: calculateDiscount pure function ───────────────────────────────

// Import the pure utility function (no Next.js dependencies)
const { calculateDiscount } = await import(resolve(APPS_WEB, 'src/lib/promo-discount.ts'));

test('Unit: percentage discount = Math.floor(originalTotal * discountValue / 100)', () => {
  assert.strictEqual(calculateDiscount('percentage', 10, 1000), 100, '10% of 1000 = 100');
  assert.strictEqual(calculateDiscount('percentage', 15, 333), 49, '15% of 333 = 49.95 → floor = 49');
  assert.strictEqual(calculateDiscount('percentage', 100, 500), 500, '100% of 500 = 500');
});

test('Unit: fixed discount = Math.min(discountValue, originalTotal) — cap at original', () => {
  assert.strictEqual(calculateDiscount('fixed', 200, 1000), 200, 'fixed 200 off 1000 = 200');
  assert.strictEqual(calculateDiscount('fixed', 1500, 1000), 1000, 'fixed 1500 off 1000 = capped at 1000');
  assert.strictEqual(calculateDiscount('fixed', 50, 50), 50, 'fixed 50 off 50 = 50');
});

test('Unit: discountedTotal = originalTotal - discountAmount', () => {
  const discount = calculateDiscount('percentage', 20, 500);
  const discountedTotal = 500 - discount;
  assert.strictEqual(discountedTotal, 400, '20% off 500 = 400');
});
