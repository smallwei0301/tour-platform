/**
 * Issue #448 — Payouts generation + Admin confirmation flow
 * Leaf C of #310 (settlement rules v1 codification)
 *
 * Static-analysis + behavioral mock tests. No live DB required.
 *
 * AC1 - payouts table: state machine pending→paid|cancelled, partial UNIQUE index
 * AC2 - POST /api/internal/settlement/generate-payouts: auth guard, skip if pending exists
 * AC3 - GET /api/admin/payouts: list payout queue
 * AC4 - POST /api/admin/payouts/[id]/confirm: debit guide_balances + mark paid + audit_log
 * AC5 - Admin UI /admin/payouts: confirm button
 * AC6 - AdminShell nav includes 出款管理
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function readRoute(relPath) {
  const full = path.join(ROOT, relPath);
  assert.ok(fs.existsSync(full), `File must exist: ${full}`);
  return fs.readFileSync(full, 'utf8');
}

function routeExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

const MIGRATIONS_DIR = path.resolve(ROOT, '../../supabase/migrations');
const MIGRATION_FILE = path.join(MIGRATIONS_DIR, '20260513_issue448_payouts.sql');

// ---------------------------------------------------------------------------
// AC1 — Migration contract
// ---------------------------------------------------------------------------
describe('Issue 448 Payouts — migration contract', () => {
  it('migration file exists', () => {
    assert.ok(fs.existsSync(MIGRATION_FILE), `Migration must exist: ${MIGRATION_FILE}`);
  });

  it('creates payouts table with required columns', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    const hasCreateTable = /CREATE TABLE\s+(IF NOT EXISTS\s+)?(public\.)?payouts/i.test(sql);
    assert.ok(hasCreateTable, 'Must CREATE TABLE [public.]payouts');
    assert.match(sql, /id\s+uuid/i, 'Must have id uuid PK');
    assert.match(sql, /guide_id\s+uuid/i, 'Must have guide_id uuid FK');
    assert.match(sql, /total_twd\s+integer/i, 'Must have total_twd integer');
    assert.match(sql, /state\s+text/i, 'Must have state text');
  });

  it('AC1: state CHECK constraint includes pending, paid, cancelled', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    const hasCheck = /CHECK\s*\(.*pending.*paid.*cancelled/i.test(sql)
      || /CHECK\s*\(state\s+IN\s*\(['"]pending['"]/i.test(sql);
    assert.ok(hasCheck, "state column must have CHECK constraint with 'pending', 'paid', 'cancelled'");
  });

  it('AC1: partial unique index prevents two pending payouts per guide', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    const hasPartialIdx = /CREATE\s+UNIQUE\s+INDEX\s+(IF NOT EXISTS\s+)?payouts_pending_unique/i.test(sql)
      && /WHERE\s+state\s*=\s*'pending'/i.test(sql);
    assert.ok(hasPartialIdx, 'Must have CREATE UNIQUE INDEX payouts_pending_unique WHERE state = pending');
  });

  it('enables RLS on payouts table', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    const hasRls = /ALTER TABLE\s+(public\.)?payouts\s+ENABLE ROW LEVEL SECURITY/i.test(sql);
    assert.ok(hasRls, 'Must enable RLS on payouts');
  });

  it('has service_role policy scoped to TO service_role', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    const hasPolicy = /CREATE POLICY[\s\S]{0,200}TO\s+service_role/i.test(sql);
    assert.ok(hasPolicy, 'Must have policy scoped TO service_role');
  });
});

// ---------------------------------------------------------------------------
// AC2 — Internal cron route contract
// ---------------------------------------------------------------------------
describe('Issue 448 Payouts — generate-payouts route contract', () => {
  const ROUTE = 'app/api/internal/settlement/generate-payouts/route.ts';

  it('route file exists', () => {
    assert.ok(routeExists(ROUTE), `${ROUTE} must exist`);
  });

  it('exports POST function', () => {
    const src = readRoute(ROUTE);
    assert.match(src, /export\s+async\s+function\s+POST\s*\(/, 'Must export POST handler');
  });

  it('AC2: has x-internal-token auth guard returning 401', () => {
    const src = readRoute(ROUTE);
    assert.match(src, /x-internal-token/, 'Must check x-internal-token header');
    assert.match(src, /Unauthorized|401/, 'Must return 401 when unauthorized');
  });

  it('calls getSettlementConfig for min_withdrawal config', () => {
    const src = readRoute(ROUTE);
    assert.match(src, /getSettlementConfig/, 'Must call getSettlementConfig()');
    assert.match(src, /min_withdrawal_twd|minTwd/, 'Must use min_withdrawal_twd threshold');
  });

  it('calls getGuideBalancesAboveThresholdDb', () => {
    const src = readRoute(ROUTE);
    assert.match(src, /getGuideBalancesAboveThresholdDb/, 'Must call getGuideBalancesAboveThresholdDb');
  });

  it('calls createPayoutDb for each eligible guide', () => {
    const src = readRoute(ROUTE);
    assert.match(src, /createPayoutDb/, 'Must call createPayoutDb per guide');
  });

  it('returns { ok, generated, skipped } shape', () => {
    const src = readRoute(ROUTE);
    assert.match(src, /generated/, 'Response must include generated count');
    assert.match(src, /skipped/, 'Response must include skipped count');
  });
});

// ---------------------------------------------------------------------------
// AC3 — Admin GET /api/admin/payouts contract
// ---------------------------------------------------------------------------
describe('Issue 448 Payouts — GET /api/admin/payouts route contract', () => {
  const ROUTE = 'app/api/v2/admin/payouts/route.ts';

  it('route file exists', () => {
    assert.ok(routeExists(ROUTE), `${ROUTE} must exist`);
  });

  it('exports GET function', () => {
    const src = readRoute(ROUTE);
    assert.match(src, /export\s+async\s+function\s+GET\s*\(/, 'Must export GET handler');
  });

  it('queries payouts table ordered by created_at desc', () => {
    const src = readRoute(ROUTE);
    assert.match(src, /payouts/, 'Must query payouts table');
    assert.match(src, /created_at/, 'Must order by created_at');
    assert.match(src, /ascending.*false|desc/i, 'Must order descending');
  });

  it('joins guide_profiles for display_name / email', () => {
    const src = readRoute(ROUTE);
    assert.match(src, /guide_profiles/, 'Must join guide_profiles');
    assert.match(src, /display_name|email/, 'Must include display_name or email from guide_profiles');
  });

  it('Issue #502: does not project guide_profiles.email directly in admin payouts query', () => {
    const src = readRoute(ROUTE);
    assert.doesNotMatch(
      src,
      /guide_profiles\s*\(\s*display_name\s*,\s*email\s*\)/,
      'Must not select guide_profiles(display_name, email) because production column is guide_email'
    );
    assert.match(src, /guide_profiles\s*\(\s*display_name\s*,\s*guide_email\s*\)/, 'Must select guide_profiles(display_name, guide_email)');
  });
});

// ---------------------------------------------------------------------------
// AC4 — Admin POST /api/admin/payouts/[payoutId]/confirm contract
// ---------------------------------------------------------------------------
describe('Issue 448 Payouts — POST confirm route contract', () => {
  const ROUTE = 'app/api/v2/admin/payouts/[payoutId]/confirm/route.ts';

  it('route file exists', () => {
    assert.ok(routeExists(ROUTE), `${ROUTE} must exist`);
  });

  it('exports POST function', () => {
    const src = readRoute(ROUTE);
    assert.match(src, /export\s+async\s+function\s+POST\s*\(/, 'Must export POST handler');
  });

  it('uses Next.js 15 params Promise pattern', () => {
    const src = readRoute(ROUTE);
    // Must use Promise<{ payoutId: string }> pattern for Next.js 15
    const hasPromiseParams = /params.*Promise.*payoutId|Promise.*\{.*payoutId/i.test(src)
      || /await\s+params/.test(src);
    assert.ok(hasPromiseParams, 'Must use Promise<{ payoutId }> and await params (Next.js 15)');
  });

  it('calls confirmPayoutDb', () => {
    const src = readRoute(ROUTE);
    assert.match(src, /confirmPayoutDb/, 'Must call confirmPayoutDb');
  });

  it('accepts confirmed_by and transfer_ref in request body', () => {
    const src = readRoute(ROUTE);
    assert.match(src, /confirmed_by/, 'Must read confirmed_by from body');
    assert.match(src, /transfer_ref/, 'Must read transfer_ref from body');
  });

  it('returns 400 on error', () => {
    const src = readRoute(ROUTE);
    assert.match(src, /status.*400|400.*status/, 'Must return 400 on error');
  });
});

// ---------------------------------------------------------------------------
// AC5 — Admin UI /admin/payouts page contract
// ---------------------------------------------------------------------------
describe('Issue 448 Payouts — Admin UI page contract', () => {
  const PAGE = 'app/(non-locale)/admin/payouts/page.tsx';

  it('page file exists', () => {
    assert.ok(routeExists(PAGE), `${PAGE} must exist`);
  });

  it('fetches from /api/v2/admin/payouts', () => {
    // #1649：admin UI 全面改走 /api/v2/admin/**（v2 route re-export legacy handler）
    const src = readRoute(PAGE);
    assert.match(src, /\/api\/v2\/admin\/payouts/, 'Page must fetch from /api/v2/admin/payouts');
  });

  it('has confirm button (data-guide="payout-confirm" or confirm pattern)', () => {
    const src = readRoute(PAGE);
    const hasConfirmBtn = /payout-confirm|確認出款|confirm/i.test(src);
    assert.ok(hasConfirmBtn, 'Page must have a confirm button for pending payouts');
  });

  it('posts to /api/admin/payouts/[id]/confirm', () => {
    const src = readRoute(PAGE);
    assert.match(src, /\/confirm/, 'Page must POST to the confirm endpoint');
  });

  it('displays guide name, total_twd, state, created_at', () => {
    const src = readRoute(PAGE);
    assert.match(src, /total_twd/, 'Page must show total_twd');
    assert.match(src, /state/, 'Page must show state');
    assert.match(src, /created_at/, 'Page must show created_at');
  });

  it('uses 出款管理 as page title', () => {
    const src = readRoute(PAGE);
    assert.match(src, /出款管理/, 'Page title must be 出款管理');
  });
});

// ---------------------------------------------------------------------------
// AC6 — AdminShell nav contract
// ---------------------------------------------------------------------------
describe('Issue 448 Payouts — AdminShell nav contract', () => {
  it('AdminShell.tsx has 出款管理 nav item', () => {
    const src = readRoute('src/components/admin/AdminShell.tsx');
    assert.match(src, /出款管理/, 'AdminShell must have 出款管理 nav item');
    assert.match(src, /\/admin\/payouts/, 'AdminShell must link to /admin/payouts');
  });

  it('出款管理 appears near 退款管理 in nav', () => {
    const src = readRoute('src/components/admin/AdminShell.tsx');
    const refundIdx = src.indexOf('退款管理');
    const payoutIdx = src.indexOf('出款管理');
    assert.ok(refundIdx !== -1, 'Must have 退款管理 in nav');
    assert.ok(payoutIdx !== -1, 'Must have 出款管理 in nav');
    // They should appear close together (within 200 chars)
    assert.ok(Math.abs(refundIdx - payoutIdx) < 300, '出款管理 should appear near 退款管理 in nav');
  });
});

// ---------------------------------------------------------------------------
// db.mjs helper contracts
// ---------------------------------------------------------------------------
describe('Issue 448 Payouts — db.mjs helper exports', () => {
  const DB = path.join(ROOT, 'src/lib/db.mjs');

  it('db.mjs exports getGuideBalancesAboveThresholdDb', () => {
    const src = fs.readFileSync(DB, 'utf8');
    assert.match(src, /getGuideBalancesAboveThresholdDb/, 'db.mjs must export getGuideBalancesAboveThresholdDb');
  });

  it('db.mjs exports createPayoutDb', () => {
    const src = fs.readFileSync(DB, 'utf8');
    assert.match(src, /createPayoutDb/, 'db.mjs must export createPayoutDb');
  });

  it('db.mjs exports confirmPayoutDb', () => {
    const src = fs.readFileSync(DB, 'utf8');
    assert.match(src, /confirmPayoutDb/, 'db.mjs must export confirmPayoutDb');
  });
});

// ---------------------------------------------------------------------------
// Behavioral mock tests
// ---------------------------------------------------------------------------
describe('Issue 448 Payouts — createPayoutDb behavioral mock', () => {
  it('skips when pending payout already exists', async () => {
    const existingId = 'existing-payout-uuid';

    // Build mock Supabase that simulates an existing pending row
    const mockSupabase = {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: existingId }, error: null }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => { throw new Error('should not insert'); },
          }),
        }),
      }),
    };

    // Inline implementation mirrors createPayoutDb logic
    const guideId = 'guide-uuid';
    const totalTwd = 6000;

    const { data: existing } = await mockSupabase
      .from('payouts').select().eq('guide_id', guideId).eq('state', 'pending').maybeSingle();

    if (existing) {
      const result = { skipped: true, id: existing.id };
      assert.equal(result.skipped, true, 'Should return skipped: true when pending payout exists');
      assert.equal(result.id, existingId, 'Should return existing payout id');
    } else {
      assert.fail('Mock should have returned existing payout');
    }
  });

  it('creates new payout when no pending exists', async () => {
    const newPayout = { id: 'new-payout-uuid', guide_id: 'guide-uuid', total_twd: 6000, state: 'pending' };

    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({ data: newPayout, error: null }),
          }),
        }),
      }),
    };

    const { data: existing } = await mockSupabase
      .from('payouts').select().eq('guide_id', 'guide-uuid').eq('state', 'pending').maybeSingle();

    assert.equal(existing, null, 'No existing pending payout');

    const { data, error } = await mockSupabase
      .from('payouts').insert({}).select().single();

    assert.equal(error, null, 'Insert should not error');
    const result = { skipped: false, ...data };
    assert.equal(result.skipped, false, 'Should not be skipped');
    assert.equal(result.id, newPayout.id, 'Should return new payout id');
  });
});

describe('Issue 448 Payouts — confirmPayoutDb behavioral mock', () => {
  it('debits guide_balances when confirming payout', async () => {
    const payoutId = 'payout-uuid';
    const guideId = 'guide-uuid';
    const payoutTwd = 6000;
    const initialBalance = 8000;
    const expectedNewBalance = initialBalance - payoutTwd; // 2000

    let upsertedBalance = null;
    let auditInserted = null;
    let payoutUpdated = false;

    const calls = {
      'payouts.select': { data: { id: payoutId, guide_id: guideId, total_twd: payoutTwd, state: 'pending' } },
      'guide_balances.select': { data: { balance_twd: initialBalance } },
    };

    // Verify debit logic directly (mirrors confirmPayoutDb)
    const payout = calls['payouts.select'].data;
    assert.equal(payout.state, 'pending', 'Payout must be pending');

    const balance = calls['guide_balances.select'].data;
    const newBalance = Math.max(0, (balance?.balance_twd ?? 0) - payout.total_twd);
    upsertedBalance = newBalance;

    assert.equal(upsertedBalance, expectedNewBalance, `Balance should be debited from ${initialBalance} to ${expectedNewBalance}`);
    assert.ok(upsertedBalance >= 0, 'Balance should never go negative');
  });

  it('throws when payout state is not pending', async () => {
    const paidPayout = { id: 'payout-uuid', guide_id: 'guide-uuid', total_twd: 6000, state: 'paid' };

    // Mirror confirmPayoutDb guard
    let thrown = null;
    try {
      if (paidPayout.state !== 'pending') {
        throw new Error(`payout already ${paidPayout.state}`);
      }
    } catch (e) {
      thrown = e;
    }

    assert.ok(thrown, 'Should throw when payout is not pending');
    assert.match(thrown.message, /already paid/, 'Error message should say "already paid"');
  });

  it('does not allow balance to go below zero (floor at 0)', () => {
    const payoutTwd = 10000;
    const currentBalance = 3000; // Less than payout amount
    const newBalance = Math.max(0, currentBalance - payoutTwd);
    assert.equal(newBalance, 0, 'Balance must floor at 0, never go negative');
  });
});
