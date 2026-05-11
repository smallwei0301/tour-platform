/**
 * POST /api/internal/alerts/ecpay-failure-sweep
 * Phase 13 — Tour Platform (Issue #327)
 *
 * Internal sweep endpoint: queries payment_callback_audit (via audit_logs)
 * for recent ECPay failures and fires an incident if the failure rate exceeds threshold.
 *
 * Authentication: `x-internal-token` header must match INTERNAL_ALERT_TOKEN env var.
 * Returns 401 when the header is absent or mismatched.
 *
 * Risk: HIGH (payment_correctness, secrets)
 */
import { NextRequest, NextResponse } from 'next/server';
import { recordIncident } from '../../../../src/lib/incidents';
import { shouldAlertEcpayFailures } from '../../../../src/lib/alerting/thresholds';

// ── Auth guard ────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const token = req.headers.get('x-internal-token');
  const expected = process.env.INTERNAL_ALERT_TOKEN;
  if (!token || !expected) return false;
  return token === expected;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 🔐 Auth guard — x-internal-token must match INTERNAL_ALERT_TOKEN
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Query audit_logs for recent ECPay payment_callback_audit failures
    // Dynamically import supabase to avoid bundling issues in test environments
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Look back 60 minutes for ECPay callback failures recorded in payment_callback_audit
    const windowMs = 60 * 60 * 1000; // 60 min
    const since = new Date(Date.now() - windowMs).toISOString();

    // Query audit_logs for payment_callback_audit failure events
    const { data: failureRows, error: queryError } = await supabase
      .from('audit_logs')
      .select('created_at, metadata')
      .gte('created_at', since)
      .eq('actor', 'system')
      .in('action', ['payment_callback_audit', 'payment_callback_failed']);

    if (queryError) {
      void recordIncident({
        source: 'ecpay_callback_sweep',
        severity: 'error',
        category: 'alerting',
        message: `ECPay failure sweep DB query error: ${queryError.message}`,
        metadata: { sweep_time: new Date().toISOString(), error: queryError.message },
      });
      return NextResponse.json({ ok: false, error: 'db_query_failed' }, { status: 500 });
    }

    const now = Date.now();
    const events = (failureRows ?? []).map((row) => ({
      timestamp: new Date(row.created_at as string).getTime(),
      status: 'failed' as const,
    }));

    const FAILURE_THRESHOLD = 3;
    const shouldAlert = shouldAlertEcpayFailures(events, windowMs, FAILURE_THRESHOLD);

    if (shouldAlert) {
      void recordIncident({
        source: 'ecpay_callback_sweep',
        severity: 'warn',
        category: 'payment',
        message: `ECPay callback failure rate exceeded threshold: ${events.length} failures in last 60 minutes (threshold=${FAILURE_THRESHOLD})`,
        metadata: {
          sweep_time: new Date(now).toISOString(),
          failure_count: events.length,
          window_minutes: 60,
          threshold: FAILURE_THRESHOLD,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      failure_count: events.length,
      alerted: shouldAlert,
      sweep_time: new Date(now).toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    void recordIncident({
      source: 'ecpay_callback_sweep',
      severity: 'error',
      category: 'alerting',
      message: `ECPay failure sweep unexpected error: ${message}`,
      metadata: { sweep_time: new Date().toISOString() },
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
