import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../../../supabase/migrations/20261006121148_initial_payment_admission.sql', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../../../../supabase/migrations/20261006121148_initial_payment_admission.rollback.sql', import.meta.url), 'utf8');

test('SQL source orders lock precedes eligibility, booking/payment locks and the only insert', () => {
  const orderLock = migration.indexOf('WHERE o.id = p_order_id FOR UPDATE');
  const now = migration.indexOf('v_now := clock_timestamp()');
  const bookingLock = migration.indexOf('WHERE b.id = v_order.booking_id FOR UPDATE');
  const paymentLock = migration.indexOf('WHERE pay.order_id = v_order.id FOR UPDATE');
  const insert = migration.indexOf('INSERT INTO public.payments(');
  assert.ok(orderLock > 0 && orderLock < now && now < bookingLock && bookingLock < paymentLock && paymentLock < insert);
  assert.match(migration, /payment_deadline_at <= v_now/);
  assert.match(migration, /v_item_total IS DISTINCT FROM v_order\.total_twd::bigint/);
  assert.match(migration, /v_order\.total_twd, 'TWD', 'pending'/);
  assert.match(migration, /INSERT INTO public\.payment_events/);
  assert.doesNotMatch(migration, /EXCEPTION\s+WHEN|ON CONFLICT|CREATE\s+(?:UNIQUE\s+)?INDEX/iu);
});

test('SQL source terminal/unknown/manual states hold and service-role ACL stays narrow', () => {
  for (const code of ['PAYMENT_RECONCILIATION_REQUIRED', 'PAYMENT_PROVIDER_CONFLICT', 'TRANSFER_RECONCILIATION_REQUIRED', 'MANUAL_SETTLEMENT_REQUIRED']) assert.ok(migration.includes(code));
  assert.match(migration, /SECURITY INVOKER/);
  assert.match(migration, /SET search_path = pg_catalog, public/);
  assert.match(migration, /FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /TO service_role/);
  assert.doesNotMatch(migration, /UPDATE public\.(?:orders|payments|bookings)|DELETE FROM|ALTER TABLE/iu);
  assert.match(rollback, /DROP FUNCTION public\.fn_admit_initial_payment_attempt\(uuid, text, text\)/);
  assert.doesNotMatch(rollback, /DELETE|TRUNCATE|DROP (?:TABLE|INDEX)|ALTER TABLE/iu);
});

function assertExistingRowHoldGuards(source) {
  const sql = source.replace(/^\s*--[^\n]*/gmu, '');
  const block = sql.slice(sql.indexOf('IF v_count = 1 THEN'), sql.indexOf("RETURN jsonb_build_object('outcome', 'reuse'"));
  assert.match(block, /v_trade := CASE WHEN v_existing\.provider = 'ecpay' THEN nullif\(v_existing\.merchant_trade_no, ''\)/u);
  assert.match(block, /v_existing\.paid_at IS NOT NULL/u);
  assert.match(block, /v_existing\.captured_amount_twd IS DISTINCT FROM 0/u);
  assert.match(block, /IF p_provider = 'manual' THEN\s+RETURN jsonb_build_object\('outcome', 'hold', 'code', 'MANUAL_SETTLEMENT_REQUIRED'/u);
}

test('SQL source existing-row reuse preserves merchant identity and holds manual/paid/captured contradictions', () => {
  assertExistingRowHoldGuards(migration);
});

test('SQL guard source check rejects each original unsafe variant, not just the no-row manual guard', () => {
  const mutants = [
    migration.replace(/v_trade := CASE WHEN v_existing\.provider = 'ecpay' THEN nullif\(v_existing\.merchant_trade_no, ''\)\s+ELSE coalesce\(nullif\(v_existing\.merchant_trade_no, ''\), nullif\(v_existing\.trade_no, ''\)\) END;/u,
      "v_trade := coalesce(nullif(v_existing.merchant_trade_no, ''), nullif(v_existing.trade_no, ''));"),
    migration.replace(' OR v_existing.paid_at IS NOT NULL', '').replace(/\s+OR v_existing\.captured_amount_twd IS DISTINCT FROM 0/u, ''),
    migration.replace(/    IF p_provider = 'manual' THEN\n      RETURN jsonb_build_object\('outcome', 'hold', 'code', 'MANUAL_SETTLEMENT_REQUIRED', 'id', v_existing\.id, 'provider', v_existing\.provider\);\n    END IF;\n/u, ''),
  ];
  for (const mutant of mutants) {
    assert.notEqual(mutant, migration);
    assert.throws(() => assertExistingRowHoldGuards(mutant), { code: 'ERR_ASSERTION' });
  }
});
