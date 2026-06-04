/**
 * Issue #1175 — Review-invitation sweep helpers (backend slice).
 *
 * The future automated sweep (CRON / scheduled job) will consume these:
 *
 *   1. evaluateReviewInvitationSweepCandidates(input) — given a batch of
 *      candidate orders + the existing delivery log (keyed by order_id),
 *      run #1174's per-order eligibility and idempotency checks and
 *      return a structured send/skip decision per order.
 *
 *   2. summarizeReviewInvitationSweepRun(decisions) — collapse the
 *      per-order decisions into a privacy-safe run summary (counts only,
 *      no email / PII / order_id leaks).
 *
 *   3. isReviewInvitationSweepEnabled({ env }) — feature-flag check. The
 *      sweep stays OFF unless an operator explicitly sets the env var,
 *      so a deploy that lands the cron wiring cannot start sending
 *      until someone consciously enables it.
 *
 * The actual cron schedule / endpoint / batch fetch / email transport
 * are intentionally out of scope; this slice gives the future PR a
 * fully testable decision engine to plug into.
 */

import {
  evaluateReviewInvitationEligibility,
  evaluateReviewInvitationIdempotency,
} from './review-invitation.mjs';

export const REVIEW_INVITATION_SWEEP_ENV_VAR = 'REVIEW_INVITATION_SWEEP_ENABLED';

/**
 * Feature-flag gate. Default OFF: the sweep does nothing unless an
 * operator explicitly opts in via env var.
 */
export function isReviewInvitationSweepEnabled({ env } = {}) {
  const source = env && typeof env === 'object' ? env : (globalThis?.process?.env ?? {});
  const raw = source[REVIEW_INVITATION_SWEEP_ENV_VAR];
  if (typeof raw !== 'string') return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on';
}

/**
 * @returns {{
 *   decisions: Array<{ orderId, action: 'send'|'skip', reason: string, code?: string }>,
 *   featureEnabled: boolean
 * }}
 *
 * When featureEnabled=false, every order resolves to action='skip' with
 * reason='FEATURE_FLAG_OFF' (no eligibility/idempotency lookup needed).
 */
export function evaluateReviewInvitationSweepCandidates(input) {
  const orders = Array.isArray(input?.orders) ? input.orders.filter(Boolean) : [];
  const existingByOrderId =
    input?.existingInvitationsByOrderId && typeof input.existingInvitationsByOrderId === 'object'
      ? input.existingInvitationsByOrderId
      : {};
  const now = input?.now;
  const featureEnabled = input?.featureEnabled === true;

  if (!featureEnabled) {
    return {
      featureEnabled: false,
      decisions: orders.map((order) => ({
        orderId: order?.id ?? null,
        action: 'skip',
        reason: 'FEATURE_FLAG_OFF',
      })),
    };
  }

  const decisions = orders.map((order) => {
    const orderId = order?.id ?? null;

    const eligibility = evaluateReviewInvitationEligibility({
      orderStatus: order?.status,
      scheduleEndAt: order?.scheduleEndAt,
      now,
      hasDispute: order?.hasDispute === true,
    });
    if (!eligibility.eligible) {
      return { orderId, action: 'skip', reason: eligibility.reason };
    }

    const existing = Array.isArray(existingByOrderId[orderId])
      ? existingByOrderId[orderId]
      : [];
    const idem = evaluateReviewInvitationIdempotency({ existingInvitations: existing });
    if (!idem.allowSend) {
      return { orderId, action: 'skip', reason: 'IDEMPOTENCY', code: idem.code };
    }

    return { orderId, action: 'send', reason: 'ELIGIBLE', code: idem.code };
  });

  return { featureEnabled: true, decisions };
}

/**
 * Collapse per-order decisions into a privacy-safe summary suitable for
 * logs / metrics / operator dashboards. Counts and reason codes only;
 * does not include order ids, traveler emails, or any free-text fields.
 *
 * @returns {{
 *   total: number,
 *   sendCount: number,
 *   skipCount: number,
 *   skipReasonCounts: Record<string, number>,
 *   featureEnabled: boolean
 * }}
 */
export function summarizeReviewInvitationSweepRun(input) {
  const decisions = Array.isArray(input?.decisions) ? input.decisions.filter(Boolean) : [];
  const featureEnabled = input?.featureEnabled === true;

  let sendCount = 0;
  let skipCount = 0;
  const skipReasonCounts = {};

  for (const d of decisions) {
    if (d.action === 'send') {
      sendCount += 1;
    } else {
      skipCount += 1;
      const reason = typeof d.reason === 'string' && d.reason.length > 0 ? d.reason : 'UNKNOWN';
      skipReasonCounts[reason] = (skipReasonCounts[reason] ?? 0) + 1;
    }
  }

  return {
    total: decisions.length,
    sendCount,
    skipCount,
    skipReasonCounts,
    featureEnabled,
  };
}
