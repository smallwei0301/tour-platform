/**
 * POST /api/internal/reminders/pre-tour-sweep
 * Issue #341 — Tour Platform (302a)
 *
 * Internal cron sweep: finds orders with tours starting in the h24 or h1 window,
 * sends reminder email + admin LINE notify, logs to tour_reminder_log (idempotent).
 *
 * Authentication: `x-internal-token` header must match INTERNAL_ALERT_TOKEN env var.
 * Returns 401 when the header is absent or mismatched.
 *
 * Time windows:
 *   h24 → start_at in [now+23h, now+25h)
 *   h1  → start_at in [now+30min, now+90min)
 *
 * Idempotency: UNIQUE(order_id, reminder_kind, channel) + ON CONFLICT DO NOTHING
 *
 * Risk: HIGH (auth, db-migration, pii, cron-safety)
 */
import { NextRequest, NextResponse } from 'next/server';
import { recordIncident } from '../../../../../src/lib/incidents';
import {
  composePreTourReminder,
  sendReminder,
  type ReminderKind,
  type ReminderChannel,
} from '../../../../../src/lib/pre-tour-reminder';
import {
  isOrderInReminderWindow,
  resolveReminderActivityAndStart,
  type SweepReminderRow,
} from '../../../../../src/lib/internal-sweep-time-source';
import { isLinePushEnabled } from '../../../../../src/config/feature-flags.mjs';
import { getLineUserIdForOrder } from '../../../../../src/lib/line-binding.mjs';
import { isCronJobEnabled, recordCronRun } from '../../../../../src/lib/cron-job-controls.mjs';

// ── Auth guard ────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const token = req.headers.get('x-internal-token');
  const expected = process.env.INTERNAL_ALERT_TOKEN;
  if (!token || !expected) return false;
  return token === expected;
}

// ── Window helpers ────────────────────────────────────────────────────────────

function getWindowBounds(kind: ReminderKind, now: number): { from: string; to: string } {
  if (kind === 'h24') {
    // h24 window: [now+23h, now+25h)
    const from = new Date(now + 23 * 60 * 60 * 1000).toISOString();
    const to   = new Date(now + 25 * 60 * 60 * 1000).toISOString();
    return { from, to };
  }
  // h1 window: [now+30min, now+90min)
  const from = new Date(now + 30 * 60 * 1000).toISOString();
  const to   = new Date(now + 90 * 60 * 1000).toISOString();
  return { from, to };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 🔐 Auth guard — x-internal-token must match INTERNAL_ALERT_TOKEN
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Admin kill-switch (#go-no-go) — no-op when the job is disabled in back office
  const cronGate = await isCronJobEnabled('pre_tour_reminder_sweep');
  if (!cronGate.enabled) {
    void recordCronRun({ jobKey: 'pre_tour_reminder_sweep', outcome: 'skipped_by_admin' });
    return NextResponse.json({ ok: true, skipped_by_admin: true });
  }
  const cronStartedAt = new Date().toISOString();

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const now = Date.now();
    // line_push is opt-in: only swept when the per-traveler push flag is on.
    const CHANNELS: ReminderChannel[] = isLinePushEnabled()
      ? ['email', 'line_notify_admin', 'line_push']
      : ['email', 'line_notify_admin'];
    const KINDS: ReminderKind[] = ['h24', 'h1'];

    let totalSent = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    const timeSourcePolicy = 'booking_v2_then_legacy_fallback';

    for (const kind of KINDS) {
      const { from, to } = getWindowBounds(kind, now);

      // Query: orders JOIN bookings + activity_schedules + activities.
      // Eligibility window is computed in runtime by preferring bookings.start_at,
      // then falling back to activity_schedules.start_at for legacy rows.
      // bookings 嵌入必須指名 fk_bookings_order_id：#1560 後 orders↔bookings 有兩條
      // FK，未指名時 PostgREST 回 PGRST201 歧義，查詢錯誤會被 continue 吃掉、提醒靜默漏發。
      const { data: rows, error: queryError } = await supabase
        .from('orders')
        .select(`
          id,
          booking_id,
          contact_name,
          contact_email,
          user_id,
          status,
          bookings!fk_bookings_order_id (
            id,
            start_at,
            end_at,
            activity_plan_id,
            activity_id,
            guide_id,
            activities (
              title,
              meeting_point,
              meeting_point_map_url,
              notices
            )
          ),
          activity_schedules (
            id,
            start_at,
            activities (
              title,
              meeting_point,
              meeting_point_map_url,
              notices
            )
          )
        `)
        .in('status', ['paid', 'confirmed']);

      if (queryError) {
        void recordIncident({
          source: 'pre_tour_reminder_sweep',
          severity: 'error',
          category: 'reminder',
          message: `Pre-tour sweep DB query error (${kind}): ${queryError.message}`,
          metadata: { kind, sweep_time: new Date(now).toISOString(), error: queryError.message },
        });
        continue;
      }

      for (const order of (rows ?? [])) {
        const { effectiveStartAt, activity, scheduleId } = resolveReminderActivityAndStart(order as SweepReminderRow);
        if (!isOrderInReminderWindow(effectiveStartAt, from, to)) continue;
        if (!effectiveStartAt || !activity) continue;

        // AC7: Skip orders with missing contact_email for email channel
        const hasEmail = !!order.contact_email;

        for (const channel of CHANNELS) {
          // AC7: Skip email channel if no contact_email
          if (channel === 'email' && !hasEmail) {
            totalSkipped++;
            // Log skip — ON CONFLICT DO NOTHING (upsert ignoreDuplicates=true)
            await supabase.from('tour_reminder_log').upsert(
              {
                order_id: order.id,
                schedule_id: scheduleId,
                reminder_kind: kind,
                channel,
                status: 'skipped',
                error: 'no_contact_email',
                created_at: new Date(now).toISOString(),
              },
              { onConflict: 'order_id, reminder_kind, channel', ignoreDuplicates: true }
            ).then(({ error }) => {
              if (error && !error.message?.includes('duplicate')) {
                console.error('[pre-tour-sweep] skip log error:', error.message);
              }
            });
            continue;
          }

          // line_push: resolve a LINE binding; skip (no_line_binding) when unbound.
          let lineUserId: string | null = null;
          if (channel === 'line_push') {
            lineUserId = await getLineUserIdForOrder({
              userId: (order as { user_id?: string }).user_id,
              contactEmail: order.contact_email ?? undefined,
            });
            if (!lineUserId) {
              totalSkipped++;
              await supabase.from('tour_reminder_log').upsert(
                {
                  order_id: order.id,
                  schedule_id: scheduleId,
                  reminder_kind: kind,
                  channel,
                  status: 'skipped',
                  error: 'no_line_binding',
                  created_at: new Date(now).toISOString(),
                },
                { onConflict: 'order_id, reminder_kind, channel', ignoreDuplicates: true }
              ).then(({ error }) => {
                if (error && !error.message?.includes('duplicate')) {
                  console.error('[pre-tour-sweep] line_push skip log error:', error.message);
                }
              });
              continue;
            }
          }

          // AC4: Idempotency — check tour_reminder_log before sending
          // ON CONFLICT DO NOTHING handles race conditions; we pre-check to avoid wasted sends
          const { data: existing } = await supabase
            .from('tour_reminder_log')
            .select('id')
            .eq('order_id', order.id)
            .eq('reminder_kind', kind)
            .eq('channel', channel)
            .eq('status', 'sent')
            .maybeSingle();

          if (existing) {
            totalSkipped++;
            continue;
          }

          // Compose message
          const body = composePreTourReminder(
            { contact_name: order.contact_name, contact_email: order.contact_email },
            activity,
            { start_at: effectiveStartAt },
            kind
          );

          let status: 'sent' | 'failed' = 'sent';
          let errorMsg: string | null = null;

          try {
            await sendReminder(channel, {
              to: channel === 'email' ? order.contact_email! : undefined,
              lineUserId: lineUserId ?? undefined,
              subject: kind === 'h24'
                ? `【明日出發提醒】${activity.title}`
                : `【即將出發】${activity.title}`,
              body,
            });
            totalSent++;
          } catch (sendErr) {
            status = 'failed';
            errorMsg = sendErr instanceof Error ? sendErr.message.slice(0, 500) : String(sendErr).slice(0, 500);
            totalFailed++;
          }

          // AC4: Insert to tour_reminder_log — ON CONFLICT DO NOTHING (idempotency via UNIQUE constraint)
          // Supabase upsert with ignoreDuplicates=true maps to ON CONFLICT DO NOTHING in PostgREST
          const { error: logError } = await supabase
            .from('tour_reminder_log')
            .upsert(
              {
                order_id: order.id,
                schedule_id: scheduleId,
                reminder_kind: kind,
                channel,
                status,
                sent_at: status === 'sent' ? new Date(now).toISOString() : null,
                error: errorMsg,
                created_at: new Date(now).toISOString(),
              },
              { onConflict: 'order_id, reminder_kind, channel', ignoreDuplicates: true }
            );

          if (logError && !logError.message?.includes('duplicate') && !logError.message?.includes('unique')) {
            console.error('[pre-tour-sweep] log insert error:', logError.message);
          }
        }
      }
    }

    void recordCronRun({
      jobKey: 'pre_tour_reminder_sweep',
      outcome: 'success',
      summary: { sent: totalSent, skipped: totalSkipped, failed: totalFailed },
      startedAt: cronStartedAt,
    });
    return NextResponse.json({
      ok: true,
      sent: totalSent,
      skipped: totalSkipped,
      failed: totalFailed,
      reminder_source: 'legacy_fallback',
      time_source_policy: timeSourcePolicy,
      sweep_time: new Date(now).toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    void recordIncident({
      source: 'pre_tour_reminder_sweep',
      severity: 'error',
      category: 'reminder',
      message: `Pre-tour reminder sweep unexpected error: ${message}`,
      metadata: { sweep_time: new Date().toISOString() },
    });
    void recordCronRun({ jobKey: 'pre_tour_reminder_sweep', outcome: 'error', summary: { error: message.slice(0, 200) }, startedAt: cronStartedAt });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
