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
import { composePreTourReminder, sendReminder, type ReminderKind } from '../../../../../src/lib/pre-tour-reminder';
import { isOrderInReminderWindow, pickEffectiveStartAt } from '../../../../../src/lib/internal-sweep-time-source';

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

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const now = Date.now();
    const CHANNELS = ['email', 'line_notify_admin'] as const;
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
      const { data: rows, error: queryError } = await supabase
        .from('orders')
        .select(`
          id,
          booking_id,
          contact_name,
          contact_email,
          status,
          bookings (
            id,
            start_at,
            end_at,
            activity_plan_id,
            activity_id,
            guide_id
          ),
          activity_schedules (
            id,
            start_at,
            activities!inner (
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
        const booking = (order.bookings as unknown as { start_at?: string | null } | null) ?? null;
        // Type coercion for nested Supabase join result
        const schedule = (order.activity_schedules as unknown as { id: string; start_at: string; activities: { title: string; meeting_point: string; meeting_point_map_url: string; notices?: unknown } }[])?.[0];

        const effectiveStartAt = pickEffectiveStartAt(booking?.start_at ?? null, schedule?.start_at ?? null);
        if (!isOrderInReminderWindow(effectiveStartAt, from, to)) continue;

        const activity = schedule?.activities;
        if (!activity) continue;

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
                schedule_id: schedule?.id,
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
                schedule_id: schedule?.id,
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
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
