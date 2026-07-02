/**
 * POST /api/internal/settlement/generate-payouts
 * Issue #448 — Tour Platform (Leaf C of #310)
 *
 * Internal cron: creates pending payout rows for guides whose balance >= min_withdrawal_twd.
 * Skips guides that already have a pending payout (idempotent via partial UNIQUE index).
 *
 * Authentication: `x-internal-token` header must match INTERNAL_ALERT_TOKEN env var.
 * Returns 401 when the header is absent or mismatched.
 *
 * Risk: HIGH (auth, db-write, financial, cron-safety)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSettlementConfig } from '../../../../../src/lib/settlement-config';
import { isCronJobEnabled, recordCronRun } from '../../../../../src/lib/cron-job-controls.mjs';

// ── Auth guard ─────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const token = req.headers.get('x-internal-token');
  const expected = process.env.INTERNAL_ALERT_TOKEN;
  if (!token || !expected) return false;
  return token === expected;
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth guard — x-internal-token must match INTERNAL_ALERT_TOKEN
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Admin kill-switch (#go-no-go) — no-op when the job is disabled in back office
  const cronGate = await isCronJobEnabled('settlement_generate_payouts');
  if (!cronGate.enabled) {
    void recordCronRun({ jobKey: 'settlement_generate_payouts', outcome: 'skipped_by_admin' });
    return NextResponse.json({ ok: true, skipped_by_admin: true });
  }
  const cronStartedAt = new Date().toISOString();

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { getGuideBalancesAboveThresholdDb, createPayoutDb } = await import(
      '../../../../../src/lib/db.mjs'
    );

    // Read active settlement config from DB (falls back to env constants)
    const config = await getSettlementConfig(supabase);
    const minTwd = config.min_withdrawal_twd;

    // Get all guides with balance >= min_withdrawal_twd
    const eligibleGuides = await getGuideBalancesAboveThresholdDb(supabase, minTwd);

    if (!eligibleGuides || eligibleGuides.length === 0) {
      void recordCronRun({ jobKey: 'settlement_generate_payouts', outcome: 'success', summary: { generated: 0, skipped: 0 }, startedAt: cronStartedAt });
      return NextResponse.json({ ok: true, generated: 0, skipped: 0, message: 'no eligible guides' });
    }

    let generated = 0;
    let skipped = 0;

    for (const guide of eligibleGuides) {
      const result = await createPayoutDb(supabase, guide.guide_id, guide.balance_twd);
      if (result.skipped) {
        skipped++;
      } else {
        generated++;
      }
    }

    void recordCronRun({ jobKey: 'settlement_generate_payouts', outcome: 'success', summary: { generated, skipped }, startedAt: cronStartedAt });
    return NextResponse.json({ ok: true, generated, skipped });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    void recordCronRun({ jobKey: 'settlement_generate_payouts', outcome: 'error', summary: { error: message.slice(0, 200) }, startedAt: cronStartedAt });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
