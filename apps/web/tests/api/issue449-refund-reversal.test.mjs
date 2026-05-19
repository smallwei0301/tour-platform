/**
 * Contract tests for issue #449: Refund reversal in settlements (carry-forward)
 *
 * Strategy:
 *   - Structural: check migration file exists with correct SQL
 *   - Export: recordRefundReversalDb exported from db.mjs
 *   - Behavioral (mock): pre-settlement returns skipped, post-settlement creates reversal + debits balance
 *   - Behavioral (mock): idempotency — already reversed returns skipped
 *   - Structural: refund-execute.ts contains postRefundHook wiring
 *
 * Run: node --test tests/api/issue449-refund-reversal.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATION = join(
  __dirname,
  '../../../../supabase/migrations/20260513_issue449_payout_items_reversal.sql'
);
const DB_LIB = join(__dirname, '../../src/lib/db.mjs');
const REFUND_EXECUTE = join(__dirname, '../../src/lib/refund-execute.ts');
const ADMIN_ROUTE = join(
  __dirname,
  '../../app/api/admin/orders/[orderId]/refund-execute/route.ts'
);

let migrationSrc;
try { migrationSrc = readFileSync(MIGRATION, 'utf8'); } catch { migrationSrc = null; }

let dbSrc;
try { dbSrc = readFileSync(DB_LIB, 'utf8'); } catch { dbSrc = null; }

let refundExecuteSrc;
try { refundExecuteSrc = readFileSync(REFUND_EXECUTE, 'utf8'); } catch { refundExecuteSrc = null; }

let adminRouteSrc;
try { adminRouteSrc = readFileSync(ADMIN_ROUTE, 'utf8'); } catch { adminRouteSrc = null; }

// ── Migration structural checks ───────────────────────────────────────────────

test('migration file exists', () => {
  assert.ok(migrationSrc !== null, `migration should exist at ${MIGRATION}`);
});

test('migration adds settlement_kind column', () => {
  assert.ok(migrationSrc !== null, 'migration must be readable');
  assert.match(migrationSrc, /ADD COLUMN IF NOT EXISTS settlement_kind/);
});

test('migration has CHECK constraint for settlement|reversal', () => {
  assert.ok(migrationSrc !== null, 'migration must be readable');
  assert.match(migrationSrc, /CHECK.*settlement_kind.*IN.*settlement.*reversal/s);
});

test('migration drops old single-column unique constraint', () => {
  assert.ok(migrationSrc !== null, 'migration must be readable');
  assert.match(migrationSrc, /DROP CONSTRAINT IF EXISTS payout_items_order_unique/);
});

test('migration creates compound unique index on (order_id, settlement_kind)', () => {
  assert.ok(migrationSrc !== null, 'migration must be readable');
  assert.match(migrationSrc, /CREATE UNIQUE INDEX IF NOT EXISTS payout_items_order_kind_unique/);
  assert.match(migrationSrc, /ON public\.payout_items \(order_id, settlement_kind\)/);
});

// ── DB lib export check ───────────────────────────────────────────────────────

test('recordRefundReversalDb is exported from db.mjs', () => {
  assert.ok(dbSrc !== null, 'db.mjs must be readable');
  assert.match(dbSrc, /export async function recordRefundReversalDb/);
});

test('recordRefundReversalDb checks for existing settlement row', () => {
  assert.ok(dbSrc !== null, 'db.mjs must be readable');
  assert.match(dbSrc, /settlement_kind.*settlement/);
  assert.match(dbSrc, /skipped.*pre_settlement/);
});

test('recordRefundReversalDb returns already_reversed on duplicate', () => {
  assert.ok(dbSrc !== null, 'db.mjs must be readable');
  assert.match(dbSrc, /skipped.*already_reversed/);
});

test('recordRefundReversalDb uses ignoreDuplicates for idempotency', () => {
  assert.ok(dbSrc !== null, 'db.mjs must be readable');
  assert.match(dbSrc, /ignoreDuplicates.*true/);
});

test('recordRefundReversalDb debits guide_balances (carry-forward, can go negative)', () => {
  assert.ok(dbSrc !== null, 'db.mjs must be readable');
  // Must compute newBalance = beforeBalance - debit (can be negative)
  assert.match(dbSrc, /newBalance = beforeBalance - debit/);
});

test('recordRefundReversalDb writes payout_reversal_created audit log', () => {
  assert.ok(dbSrc !== null, 'db.mjs must be readable');
  assert.match(dbSrc, /payout_reversal_created/);
});

test('recordRefundReversalDb writes guide_balance_debited_reversal audit log', () => {
  assert.ok(dbSrc !== null, 'db.mjs must be readable');
  assert.match(dbSrc, /guide_balance_debited_reversal/);
});

// ── refund-execute.ts structural checks ───────────────────────────────────────

test('refund-execute.ts defines postRefundHook in ExecuteRefundInput', () => {
  assert.ok(refundExecuteSrc !== null, 'refund-execute.ts must be readable');
  assert.match(refundExecuteSrc, /postRefundHook/);
});

test('refund-execute.ts calls postRefundHook after successful refund with try/catch', () => {
  assert.ok(refundExecuteSrc !== null, 'refund-execute.ts must be readable');
  assert.match(refundExecuteSrc, /postRefundHook.*order\.id/s);
  assert.match(refundExecuteSrc, /catch.*reversalErr/s);
  assert.match(refundExecuteSrc, /settlement reversal failed/);
});

// ── Admin route wiring ────────────────────────────────────────────────────────

test('admin refund-execute route imports recordRefundReversalDb', () => {
  assert.ok(adminRouteSrc !== null, 'admin route must be readable');
  assert.match(adminRouteSrc, /recordRefundReversalDb/);
});

test('admin refund-execute route passes postRefundHook to executeRefund', () => {
  assert.ok(adminRouteSrc !== null, 'admin route must be readable');
  assert.match(adminRouteSrc, /postRefundHook.*recordRefundReversalDb/s);
});

// ── Behavioral mock tests ─────────────────────────────────────────────────────

test('pre-settlement: recordRefundReversalDb returns {skipped: "pre_settlement"} when no settlement row', async () => {
  const { recordRefundReversalDb } = await import('../../src/lib/db.mjs');

  // Mock supabase: no settlement row found
  const supabase = {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
      upsert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      insert: async () => ({ error: null }),
    }),
  };

  const result = await recordRefundReversalDb(supabase, { orderId: 'order-123', actor: 'test' });
  assert.deepEqual(result, { skipped: 'pre_settlement' });
});

test('post-settlement: creates reversal row, debits balance (carry-forward allowed)', async () => {
  const { recordRefundReversalDb } = await import('../../src/lib/db.mjs');

  const settlement = {
    id: 'settle-1',
    order_id: 'order-abc',
    guide_id: 'guide-1',
    gmv_twd: 3000,
    commission_twd: 300,
    net_twd: 2700,
    rules_version: 'v1',
    settlement_kind: 'settlement',
  };

  const reversal = {
    id: 'reversal-1',
    order_id: 'order-abc',
    guide_id: 'guide-1',
    gmv_twd: -3000,
    commission_twd: -300,
    net_twd: -2700,
    rules_version: 'v1',
    settlement_kind: 'reversal',
  };

  let upsertedBalance = null;
  const auditRows = [];

  let callCount = 0;
  const supabase = {
    from: (table) => {
      if (table === 'payout_items') {
        return {
          select: (cols) => ({
            eq: (col, val) => ({
              eq: (col2, val2) => ({
                maybeSingle: async () => {
                  // First call: check settlement existence → return settlement
                  // Second call (upsert select): return reversal
                  return { data: settlement, error: null };
                },
              }),
            }),
          }),
          upsert: (row, opts) => ({
            select: () => ({
              maybeSingle: async () => {
                // Return reversal (new row created)
                return { data: reversal, error: null };
              },
            }),
          }),
        };
      }
      if (table === 'guide_balances') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { balance_twd: 5000 }, error: null }),
            }),
          }),
          upsert: (row, opts) => {
            upsertedBalance = row.balance_twd;
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === 'audit_logs') {
        return {
          insert: async (rows) => {
            if (Array.isArray(rows)) {
              auditRows.push(...rows);
            } else {
              auditRows.push(rows);
            }
            return { error: null };
          },
        };
      }
    },
  };

  const result = await recordRefundReversalDb(supabase, { orderId: 'order-abc', actor: 'test' });

  assert.equal(result.reversed, true);
  assert.equal(result.reversal_id, 'reversal-1');
  assert.equal(result.before_balance, 5000);
  // 5000 - 2700 = 2300
  assert.equal(result.after_balance, 2300);
  assert.equal(upsertedBalance, 2300);
  assert.ok(Array.isArray(auditRows) && auditRows.length === 2, 'should write 2 audit entries');
  assert.equal(auditRows[0].action, 'payout_reversal_created');
  assert.equal(auditRows[1].action, 'guide_balance_debited_reversal');
});

test('carry-forward: balance goes negative when debit exceeds current balance', async () => {
  const { recordRefundReversalDb } = await import('../../src/lib/db.mjs');

  const settlement = {
    id: 'settle-2',
    order_id: 'order-xyz',
    guide_id: 'guide-2',
    gmv_twd: 10000,
    commission_twd: 1000,
    net_twd: 9000,
    rules_version: 'v1',
    settlement_kind: 'settlement',
  };

  const reversal = { id: 'reversal-2', ...settlement, net_twd: -9000, settlement_kind: 'reversal' };

  let upsertedBalance = null;

  const supabase = {
    from: (table) => {
      if (table === 'payout_items') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: settlement, error: null }),
              }),
            }),
          }),
          upsert: () => ({
            select: () => ({ maybeSingle: async () => ({ data: reversal, error: null }) }),
          }),
        };
      }
      if (table === 'guide_balances') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { balance_twd: 3000 }, error: null }),
            }),
          }),
          upsert: (row) => {
            upsertedBalance = row.balance_twd;
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === 'audit_logs') {
        return { insert: async () => ({ error: null }) };
      }
    },
  };

  const result = await recordRefundReversalDb(supabase, { orderId: 'order-xyz', actor: 'test' });

  assert.equal(result.reversed, true);
  // 3000 - 9000 = -6000 (carry-forward, balance goes negative)
  assert.equal(result.after_balance, -6000);
  assert.equal(upsertedBalance, -6000);
});

test('idempotency: already reversed returns {skipped: "already_reversed"}', async () => {
  const { recordRefundReversalDb } = await import('../../src/lib/db.mjs');

  const settlement = {
    id: 'settle-3',
    order_id: 'order-dup',
    guide_id: 'guide-3',
    gmv_twd: 2000,
    commission_twd: 200,
    net_twd: 1800,
    rules_version: 'v1',
    settlement_kind: 'settlement',
  };

  const supabase = {
    from: (table) => {
      if (table === 'payout_items') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: settlement, error: null }),
              }),
            }),
          }),
          // upsert returns null (ignoreDuplicates: duplicate silently ignored)
          upsert: () => ({
            select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), insert: async () => ({}) };
    },
  };

  const result = await recordRefundReversalDb(supabase, { orderId: 'order-dup', actor: 'test' });
  assert.deepEqual(result, { skipped: 'already_reversed' });
});

test('postRefundHook failure does not propagate in executeRefund', async () => {
  const { executeRefund } = await import('../../src/lib/refund-execute.ts');

  let hookCalled = false;
  const outcome = await executeRefund({
    order: {
      id: 'order-hook-test',
      total_twd: 1000,
      trade_no: null,
      merchant_trade_no: null,
      ecpay_refund_trade_no: null,
    },
    body: { reason: 'test refund' },
    requestAllRefund: async () => ({ ok: true, rtnCode: '1', rtnMsg: 'ok', ecpayTradeNo: null }),
    updateOrder: async () => ({ data: [{ id: 'order-hook-test' }], error: null, count: 1 }),
    postRefundHook: async () => {
      hookCalled = true;
      throw new Error('simulated reversal failure');
    },
  });

  // Refund should succeed even though hook threw
  assert.equal(outcome.status, 200);
  assert.equal(hookCalled, true);
  assert.equal(outcome.body?.data?.cashOrder, true);
});
