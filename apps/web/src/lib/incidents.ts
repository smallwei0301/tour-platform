/**
 * Centralized Alerting Bus — incident recording
 * Phase 13 — Tour Platform (Issue #325, fixed #326/#330)
 *
 * Fire-and-forget: recordIncident never throws.
 * Sentry, Telegram Alert, and DB insert are all best-effort.
 */
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@supabase/supabase-js';
import { notifySystemError } from './telegram-notify';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../src/config/supabase-service-env.mjs';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IncidentOpts {
  severity: 'info' | 'warn' | 'error' | 'critical';
  source: string;
  category?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// ── PII redaction ─────────────────────────────────────────────────────────────

const PII_KEYS = new Set([
  'email', 'phone', 'contact_email', 'contact_phone', 'contactEmail', 'contactPhone',
]);

export function redactPii(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).map(([k, v]) =>
      PII_KEYS.has(k) ? [k, '***'] : [k, v]
    )
  );
}

// ── DB helper ─────────────────────────────────────────────────────────────────

function getSupabaseForIncidents() {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key);
}

// ── Core ──────────────────────────────────────────────────────────────────────

export async function recordIncident(opts: IncidentOpts): Promise<void> {
  const safeMetadata = opts.metadata ? redactPii(opts.metadata) : {};

  const sentryLevel =
    opts.severity === 'critical' ? 'fatal'
    : opts.severity === 'error'  ? 'error'
    : opts.severity === 'warn'   ? 'warning'
    : 'info';

  // Sentry — fire-and-forget
  try {
    Sentry.captureMessage(opts.message, {
      level: sentryLevel as Sentry.SeverityLevel,
      extra: { source: opts.source, category: opts.category, ...safeMetadata },
    });
  } catch { /* fire-and-forget */ }

  // Telegram Alert — fire-and-forget
  try {
    await notifySystemError(
      opts.source,
      `[${opts.severity.toUpperCase()}] ${opts.message}`,
      safeMetadata
    );
  } catch { /* fire-and-forget */ }

  // DB insert to incidents table — fire-and-forget
  try {
    const supabase = getSupabaseForIncidents();
    if (supabase) {
      await supabase.from('incidents').insert({
        severity: opts.severity,
        source: opts.source,
        category: opts.category ?? null,
        message: opts.message,
        metadata: safeMetadata,
        created_at: new Date().toISOString(),
      });
    }
  } catch { /* fire-and-forget — no DB in test/CI env */ }
}
