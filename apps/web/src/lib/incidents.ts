/**
 * Centralized Alerting Bus — incident recording
 * Phase 13 — Tour Platform (Issue #325)
 *
 * Fire-and-forget: recordIncident never throws.
 * Both Sentry and LINE Notify are best-effort; failures are silently swallowed.
 */
import * as Sentry from '@sentry/nextjs';
import { notifySystemError } from './line-notify';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IncidentOpts {
  severity: 'info' | 'warn' | 'error' | 'critical';
  source: string;
  category?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// ── PII redaction ─────────────────────────────────────────────────────────────

/** Keys whose values contain personally identifiable information and must be masked. */
const PII_KEYS = new Set([
  'email',
  'phone',
  'contact_email',
  'contact_phone',
  'contactEmail',
  'contactPhone',
]);

/**
 * Redact PII fields from a metadata object.
 * Non-PII fields (e.g. amount, orderId) are preserved as-is.
 *
 * @example
 * redactPii({ email: 'test@example.com', phone: '0912345678', amount: 100 })
 * // => { email: '***', phone: '***', amount: 100 }
 */
export function redactPii(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).map(([k, v]) =>
      PII_KEYS.has(k) ? [k, '***'] : [k, v]
    )
  );
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Record an incident to Sentry and LINE Notify.
 *
 * Both calls are fire-and-forget — this function never throws.
 * If LINE_NOTIFY_ACCESS_TOKEN is absent, the LINE call is silently skipped.
 */
export async function recordIncident(opts: IncidentOpts): Promise<void> {
  const safeMetadata = opts.metadata ? redactPii(opts.metadata) : {};

  // Map severity to Sentry level
  const sentryLevel =
    opts.severity === 'critical' ? 'fatal'
    : opts.severity === 'error'  ? 'error'
    : opts.severity === 'warn'   ? 'warning'
    : 'info';

  // Sentry — fire-and-forget
  try {
    Sentry.captureMessage(opts.message, {
      level: sentryLevel as Sentry.SeverityLevel,
      extra: {
        source:   opts.source,
        category: opts.category,
        ...safeMetadata,
      },
    });
  } catch {
    // intentionally swallowed — fire-and-forget
  }

  // LINE Notify — fire-and-forget
  try {
    await notifySystemError(
      opts.source,
      `[${opts.severity.toUpperCase()}] ${opts.message}`,
      safeMetadata
    );
  } catch {
    // intentionally swallowed — fire-and-forget
  }
}
