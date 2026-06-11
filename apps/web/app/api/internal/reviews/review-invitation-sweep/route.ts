/**
 * POST /api/internal/reviews/review-invitation-sweep
 * Issue #1175 — Post-Trip Ops: Automate review invitation sweep after delivery log
 *
 * Internal cron sweep: finds completed orders that are eligible for a review
 * invitation (24h+ after activity ended, not cancelled/refunded/no-show/disputed),
 * skips orders already in the delivery log (idempotent), and sends invitations
 * for eligible first-time or retry-after-failure orders.
 *
 * Authentication: `x-internal-token` header must match INTERNAL_ALERT_TOKEN env var.
 * Returns 401 when header is absent or mismatched.
 *
 * Kill-switch: REVIEW_INVITATION_SWEEP_ENABLED env var must be "1" / "true" / "on".
 * Returns 200 + { status: 'disabled' } when not enabled.
 *
 * Returns privacy-safe summary: counts only, no email/PII/order_id in response.
 *
 * Risk: MEDIUM (auth, email-send, cron-safety, pii-adjacent)
 */
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  evaluateReviewInvitationSweepCandidates,
  summarizeReviewInvitationSweepRun,
  isReviewInvitationSweepEnabled,
} from '../../../../../src/lib/post-trip/review-invitation-sweep.mjs';
import { sendReviewInvitation } from '../../../../../src/lib/email';
import { fetchReturningPromoEmailBlock } from '../../../../../src/lib/returning-promo.mjs';

// ── Auth guard ────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const token = req.headers.get('x-internal-token');
  const expected = process.env.INTERNAL_ALERT_TOKEN;
  if (!token || !expected) return false;
  return token === expected;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth guard — x-internal-token must match INTERNAL_ALERT_TOKEN
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Kill-switch — feature flag must be explicitly enabled
  if (!isReviewInvitationSweepEnabled()) {
    return NextResponse.json({ ok: true, status: 'disabled' });
  }

  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

    // Build Supabase service-role client when env is configured
    let srClient: SupabaseClient | null = null;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const { createClient } = await import('@supabase/supabase-js');
      srClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // ── Fetch candidate orders from Supabase ──────────────────────────────────
    // Candidates: paid / confirmed / completed orders with a schedule end time.
    // We over-fetch slightly and let the decision engine filter — this is safe
    // because evaluateReviewInvitationSweepCandidates re-checks eligibility.
    type OrderRow = {
      id: string;
      status: string;
      contact_email: string | null;
      contact_name: string | null;
      user_id: string | null;
      activity_schedules:
        | { end_at: string | null; start_at: string | null }[]
        | { end_at: string | null; start_at: string | null }
        | null;
      activities:
        | { title: string | null }[]
        | { title: string | null }
        | null;
      operations_tracking:
        | { has_complaint: boolean | null }[]
        | { has_complaint: boolean | null }
        | null;
    };

    let orders: OrderRow[] = [];
    if (srClient) {
      const { data, error } = await srClient
        .from('orders')
        .select(`
          id,
          status,
          contact_email,
          contact_name,
          user_id,
          activity_schedules(end_at, start_at),
          activities(title),
          operations_tracking(has_complaint)
        `)
        .in('status', ['paid', 'confirmed', 'completed']);

      if (error) {
        return NextResponse.json(
          { ok: false, error: `DB query failed: ${error.message}` },
          { status: 500 }
        );
      }
      orders = (data ?? []) as unknown as OrderRow[];
    }

    // ── Fetch existing delivery log rows keyed by order_id ────────────────────
    const existingInvitationsByOrderId: Record<string, Array<{ status: string }>> = {};
    if (srClient && orders.length > 0) {
      const orderIds = orders.map((o) => o.id);
      const { data: logRows } = await srClient
        .from('review_invitations')
        .select('order_id, status')
        .in('order_id', orderIds);

      for (const row of logRows ?? []) {
        const existing = existingInvitationsByOrderId[row.order_id] ?? [];
        existing.push({ status: row.status });
        existingInvitationsByOrderId[row.order_id] = existing;
      }
    }

    // ── Build sweep input — map Supabase rows to decision engine shape ─────────
    const sweepOrders = orders.map((order) => {
      const schedule = Array.isArray(order.activity_schedules)
        ? order.activity_schedules[0]
        : order.activity_schedules;
      const ops = Array.isArray(order.operations_tracking)
        ? order.operations_tracking[0]
        : order.operations_tracking;
      return {
        id: order.id,
        status: order.status,
        scheduleEndAt: schedule?.end_at ?? schedule?.start_at ?? null,
        hasDispute: ops?.has_complaint === true,
        // Keep PII fields here only — they do NOT flow into decisions/summary
        _contactEmail: order.contact_email,
        _contactName: order.contact_name,
        _userId: order.user_id,
        _activityTitle: (
          Array.isArray(order.activities)
            ? order.activities[0]?.title
            : order.activities?.title
        ) ?? '您的行程',
      };
    });

    // ── Run decision engine ───────────────────────────────────────────────────
    const { decisions, featureEnabled } = evaluateReviewInvitationSweepCandidates({
      orders: sweepOrders,
      existingInvitationsByOrderId,
      now: nowIso,
      featureEnabled: true,
    });

    // ── Execute sends and record delivery log ─────────────────────────────────
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tour-platform-nine.vercel.app';

    let sentCount = 0;
    let failedCount = 0;

    for (const decision of decisions) {
      if (decision.action !== 'send') continue;

      const order = sweepOrders.find((o) => o.id === decision.orderId);
      if (!order || !order._contactEmail) continue;

      const reviewUrl = `${siteUrl}/me/orders/${decision.orderId}?review=1`;

      // #1408 — 老客專屬碼區塊（env RETURNING_CUSTOMER_PROMO_CODE 控制；fail-safe null）
      const returningPromo = srClient
        ? await fetchReturningPromoEmailBlock(srClient, {
            userId: order._userId ?? null,
            configuredCode: process.env.RETURNING_CUSTOMER_PROMO_CODE,
          })
        : null;

      try {
        await sendReviewInvitation({
          contactEmail: order._contactEmail,
          contactName: order._contactName ?? undefined,
          activityTitle: order._activityTitle,
          orderId: decision.orderId,
          reviewUrl,
          returningPromoHtml: returningPromo?.html,
        });

        sentCount += 1;

        // Record 'sent' delivery log — ignore unique violations (23505)
        if (srClient) {
          const { error: insertError } = await srClient.from('review_invitations').insert({
            order_id: decision.orderId,
            status: 'sent',
            initiated_by: 'sweep_cron',
            sent_at: nowIso,
          });
          if (insertError && insertError.code !== '23505') {
            console.error('[review-invitation-sweep] log insert error:', insertError.code);
          }
        }
      } catch (sendErr) {
        failedCount += 1;
        const errorCode =
          sendErr instanceof Error ? sendErr.message.slice(0, 200) : String(sendErr).slice(0, 200);

        // Record 'failed' delivery log
        if (srClient) {
          await srClient.from('review_invitations').insert({
            order_id: decision.orderId,
            status: 'failed',
            initiated_by: 'sweep_cron',
            failed_at: nowIso,
            failure_reason: errorCode,
          });
        }
      }
    }

    // ── Build privacy-safe summary ────────────────────────────────────────────
    const summary = summarizeReviewInvitationSweepRun({ decisions, featureEnabled });

    return NextResponse.json({
      ok: true,
      status: 'completed',
      sweep_time: nowIso,
      total: summary.total,
      sendCount: sentCount + failedCount, // evaluated for send
      sent: sentCount,
      failed: failedCount,
      skipCount: summary.skipCount,
      skipReasonCounts: summary.skipReasonCounts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
