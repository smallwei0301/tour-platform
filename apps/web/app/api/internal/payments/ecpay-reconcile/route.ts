import { NextRequest, NextResponse } from 'next/server';
import { reconcileEcpayPendingPayments } from '../../../../../src/lib/payment-reconciliation';
import { isCronJobEnabled, recordCronRun } from '../../../../../src/lib/cron-job-controls.mjs';

function isAuthorized(req: NextRequest): boolean {
  const token = req.headers.get('x-internal-token');
  const expected = process.env.INTERNAL_ALERT_TOKEN;
  if (!token || !expected) return false;
  return token === expected;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Admin kill-switch (#go-no-go) — no-op when the job is disabled in back office
  const cronGate = await isCronJobEnabled('ecpay_reconcile');
  if (!cronGate.enabled) {
    void recordCronRun({ jobKey: 'ecpay_reconcile', outcome: 'skipped_by_admin' });
    return NextResponse.json({ ok: true, skipped_by_admin: true });
  }
  const cronStartedAt = new Date().toISOString();

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Number(body?.limit || 20);
    const results = await reconcileEcpayPendingPayments(limit);

    const summary = results.reduce(
      (acc, item) => {
        acc[item.outcome] = (acc[item.outcome] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    void recordCronRun({
      jobKey: 'ecpay_reconcile',
      outcome: 'success',
      summary: { processed: results.length, outcome_counts: summary },
      startedAt: cronStartedAt,
    });
    return NextResponse.json({
      ok: true,
      processed: results.length,
      summary,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    void recordCronRun({ jobKey: 'ecpay_reconcile', outcome: 'error', summary: { error: message.slice(0, 200) }, startedAt: cronStartedAt });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
