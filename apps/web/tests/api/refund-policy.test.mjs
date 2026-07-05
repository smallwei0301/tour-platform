/**
 * Tests for issue #309: Refund Policy v2 — calculateRefundAmount + refund-override route contract
 *
 * Run: node --test tests/api/refund-policy.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { calculateRefundAmount } from '../../src/lib/refund-policy.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const OVERRIDE_ROUTE = join(
  __dirname,
  '../../app/api/admin/orders/[orderId]/refund-override/route.ts'
);

let routeSrc;
try {
  routeSrc = readFileSync(OVERRIDE_ROUTE, 'utf8');
} catch {
  routeSrc = null;
}

/** v2 policy as seeded in migration */
const V2_POLICY = {
  version: 'v2',
  tiers: [
    { cutoff_hours: 168, label: '7d+',   refund_pct: 100 },
    { cutoff_hours: 72,  label: '3-7d',  refund_pct: 70  },
    { cutoff_hours: 0,   label: '<=72h', refund_pct: 0   },
  ],
};

function hoursFromNow(hours) {
  const now = new Date();
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

// ── calculateRefundAmount unit tests ─────────────────────────────────────────

test('8+ days before tour → 100% refund', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const tourStart = new Date('2026-06-10T00:00:00Z'); // 216 hours away
  const result = calculateRefundAmount(10000, tourStart, V2_POLICY, now);
  assert.strictEqual(result.refund_pct, 100);
  assert.strictEqual(result.refundable_amount, 10000);
  assert.strictEqual(result.eligible, true);
  assert.strictEqual(result.breakdown.tier, '7d+');
});

test('5 days before tour → 70% refund', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const tourStart = new Date('2026-06-06T00:00:00Z'); // 120 hours away
  const result = calculateRefundAmount(10000, tourStart, V2_POLICY, now);
  assert.strictEqual(result.refund_pct, 70);
  assert.strictEqual(result.refundable_amount, 7000);
  assert.strictEqual(result.eligible, true);
  assert.strictEqual(result.breakdown.tier, '3-7d');
});

test('24h before tour → 0% refund, not eligible', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const tourStart = new Date('2026-06-02T00:00:00Z'); // 24 hours away
  const result = calculateRefundAmount(10000, tourStart, V2_POLICY, now);
  assert.strictEqual(result.refund_pct, 0);
  assert.strictEqual(result.refundable_amount, 0);
  assert.strictEqual(result.eligible, false);
  assert.strictEqual(result.breakdown.tier, '<=72h');
});

test('exactly at 72h boundary → 0% refund', () => {
  // At exactly 72h: hoursUntilTour = 72
  // expected rule: <=72h -> 0%
  const now = new Date('2026-06-01T00:00:00Z');
  const tourStart = new Date(now.getTime() + 72 * 60 * 60 * 1000); // exactly 72h
  const result = calculateRefundAmount(10000, tourStart, V2_POLICY, now);
  assert.strictEqual(result.refund_pct, 0);
  assert.strictEqual(result.refundable_amount, 0);
  assert.strictEqual(result.eligible, false);
  assert.strictEqual(result.breakdown.tier, '<=72h');
});

test('exactly at 168h boundary → 100% refund', () => {
  // At exactly 168h: hoursUntilTour = 168
  // sorted: 168, 72, 0
  // 168 >= 168? Yes → 7d+ tier (100%)
  const now = new Date('2026-06-01T00:00:00Z');
  const tourStart = new Date(now.getTime() + 168 * 60 * 60 * 1000); // exactly 168h
  const result = calculateRefundAmount(10000, tourStart, V2_POLICY, now);
  assert.strictEqual(result.refund_pct, 100);
  assert.strictEqual(result.refundable_amount, 10000);
  assert.strictEqual(result.eligible, true);
  assert.strictEqual(result.breakdown.tier, '7d+');
});

// ── refund-override route contract tests ──────────────────────────────────────

test('refund-override route file exists', () => {
  assert.ok(routeSrc !== null, `refund-override route should exist at ${OVERRIDE_ROUTE}`);
});

test('refund-override route source contains audit_log write', () => {
  assert.ok(routeSrc, 'route must exist');
  assert.match(routeSrc, /audit_logs/, 'must write to audit_logs table');
  assert.match(routeSrc, /refund_override/, "must use action='refund_override'");
  assert.match(routeSrc, /override_amount/, 'metadata must include override_amount');
});

test('refund-override route source validates amount and reason', () => {
  assert.ok(routeSrc, 'route must exist');
  assert.match(routeSrc, /amount/, 'must validate amount field');
  assert.match(routeSrc, /reason/, 'must validate reason field');
  assert.match(routeSrc, /400/, 'must return 400 for validation errors');
  assert.match(routeSrc, /404/, 'must return 404 for not-found order');
});

test('refund-override route uses SUPABASE_URL (not NEXT_PUBLIC_SUPABASE_URL)', () => {
  assert.ok(routeSrc, 'route must exist');
  assert.ok(
    !routeSrc.includes('NEXT_PUBLIC_SUPABASE_URL'),
    'must not use NEXT_PUBLIC_SUPABASE_URL'
  );
  assert.match(routeSrc, /getSupabaseUrl\(\)/, 'must reference Supabase URL via config getter (#1616)');
  assert.match(routeSrc, /getSupabaseServiceRoleKey\(\)/, 'must reference service-role key via config getter (#1616)');
});

test('refund-override route exports POST handler', () => {
  assert.ok(routeSrc, 'route must exist');
  assert.match(routeSrc, /export async function POST/, 'must export async POST handler');
});
