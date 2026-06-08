/**
 * Settlement constants v1 (拍板 by Wei, 2026-05)
 * Source: docs/05-business/06-payment-plan/03-settlement-rules.md
 * Override via env: SETTLEMENT_COMMISSION_RATE, SETTLEMENT_T_DAYS, SETTLEMENT_MIN_WITHDRAWAL_TWD
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isPayoutOnHold } from './post-trip-eligibility.mjs';

export const SETTLEMENT_COMMISSION_RATE = parseFloat(process.env.SETTLEMENT_COMMISSION_RATE ?? '0.15')
export const SETTLEMENT_T_DAYS = parseInt(process.env.SETTLEMENT_T_DAYS ?? '7', 10)
export const SETTLEMENT_MIN_WITHDRAWAL_TWD = parseInt(process.env.SETTLEMENT_MIN_WITHDRAWAL_TWD ?? '5000', 10)

/**
 * Compute guide payout after platform commission.
 * @param gmvTwd - Gross merchandise value in TWD (confirmed/completed orders)
 * @returns Expected payout in TWD (floor to whole NT$)
 */
export function computeExpectedPayout(gmvTwd: number): number {
  return Math.floor(gmvTwd * (1 - SETTLEMENT_COMMISSION_RATE))
}

/**
 * Compute the next payout date as T+SETTLEMENT_T_DAYS from the last completed tour.
 * @param lastCompletedTourDate - Date of the most recent completed tour, or null if none
 * @returns Payout date, or null if no completed tours
 */
export function computeNextPayoutDate(lastCompletedTourDate: Date | null): Date | null {
  if (!lastCompletedTourDate) return null
  const d = new Date(lastCompletedTourDate)
  d.setDate(d.getDate() + SETTLEMENT_T_DAYS)
  return d
}

// ── DB-backed config (Issue #446) ──────────────────────────────────────────────

export type SettlementConfig = {
  commission_rate: number
  t_days: number
  min_withdrawal_twd: number
  fee_absorbed_by: string
  version: string
}

/**
 * Read active settlement_rules row from DB.
 * Falls back to env constants if DB is unreachable or returns no row.
 * Existing env-backed constants (SETTLEMENT_COMMISSION_RATE etc.) remain unchanged.
 */
export async function getSettlementConfig(supabase: SupabaseClient): Promise<SettlementConfig> {
  try {
    const { data } = await supabase
      .from('settlement_rules')
      .select('commission_rate, t_days, min_withdrawal_twd, fee_absorbed_by, version')
      .eq('is_active', true)
      .single()
    if (data) return data
  } catch {}
  return {
    commission_rate: SETTLEMENT_COMMISSION_RATE,
    t_days: SETTLEMENT_T_DAYS,
    min_withdrawal_twd: SETTLEMENT_MIN_WITHDRAWAL_TWD,
    fee_absorbed_by: 'platform',
    version: 'env-fallback',
  }
}

// ── Sweep payout item (Issue #847) ─────────────────────────────────────────────

export type SweepPayoutItemInput = {
  id: string
  total_twd: number
  guide_id: string
}

export type SweepPayoutItemOpsTracking = {
  refund_amount_twd?: number | null
  /**
   * #1221 — payout-hold flags. When any of these is true, the order is
   * blocked from entering the payout sweep regardless of effective gmv
   * (partial refund with no holds still produces a reduced item; any
   * hold reason produces null). Default false — existing callers that
   * pass only refund_amount_twd keep their behavior.
   */
  has_complaint?: boolean | null
  has_oversell_issue?: boolean | null
  is_disputed?: boolean | null
  is_safety_case?: boolean | null
} | null | undefined

export type SweepPayoutItem = {
  order_id: string
  guide_id: string
  gmv_twd: number
  commission_twd: number
  net_twd: number
  rules_version: string
}

// ── Guide-facing payout estimate (Issue #1284) ─────────────────────────────────

/** Privacy-safe hold reason enum (shown to guide, no PII / incident detail). */
export type GuidePayoutHoldReason =
  | 'payment_dispute'
  | 'safety_review'
  | 'complaint_under_review'
  | 'oversell_investigation'
  | null

export type GuidePayoutEstimate = {
  totalTwd: number
  refundAmountTwd: number
  effectiveTwd: number
  commissionTwd: number
  /** Net after commission. Included for transparency even when on hold. */
  netTwd: number
  /**
   * 0 when order is on hold or fully refunded.
   * Use this for totals / expectedPayout aggregation.
   */
  payableNetTwd: number
  /** Privacy-safe hold reason, or null when no hold. */
  payoutHoldReason: GuidePayoutHoldReason
  /** True when manual admin review is required before payout can be released. */
  needsManualReview: boolean
}

/**
 * Canonical guide-facing payout estimate for a single order.
 *
 * Alignment contract (Issue #1284):
 * - Calls isPayoutOnHold with refundAmountTwd:0, exactly mirroring
 *   computeSweepPayoutItem L124-130 so hold semantics are identical.
 * - Partial refund without hold produces a reduced (non-zero) payableNetTwd
 *   — preserving Issue #847 behaviour.
 * - Any hold or full refund → payableNetTwd = 0 (excluded from totals).
 * - effective/net always computed for guide transparency, even when held.
 *
 * @param order         Object with total_twd (number|null).
 * @param opsTracking   operations_tracking row with refund + four hold flags.
 * @param config        Settlement config with commission_rate.
 */
export function computeGuidePayoutEstimate(
  order: { total_twd: number | null },
  opsTracking: SweepPayoutItemOpsTracking,
  config: Pick<SettlementConfig, 'commission_rate'>,
): GuidePayoutEstimate {
  const totalTwd = Number(order.total_twd) || 0
  const refundAmountTwd = Number(opsTracking?.refund_amount_twd ?? 0) || 0
  const effectiveTwd = Math.max(0, totalTwd - refundAmountTwd)

  // Compute commission + net for transparency even when on hold / fully refunded.
  const commissionTwd = effectiveTwd > 0
    ? Math.floor(effectiveTwd * config.commission_rate)
    : 0
  const netTwd = effectiveTwd > 0
    ? Math.floor(effectiveTwd * (1 - config.commission_rate))
    : 0

  // Full refund — not payable, but no hold reason (it's a refund, not a hold).
  if (effectiveTwd <= 0) {
    return {
      totalTwd,
      refundAmountTwd,
      effectiveTwd,
      commissionTwd: 0,
      netTwd: 0,
      payableNetTwd: 0,
      payoutHoldReason: null,
      needsManualReview: false,
    }
  }

  // #1284 — align hold check with computeSweepPayoutItem (L124-130):
  // pass refundAmountTwd:0 so refund does not double-count as refund_pending hold
  // (refund is already captured by effective-gmv; #847 partial-refund is preserved).
  const holdReason: GuidePayoutHoldReason = isPayoutOnHold({
    refundAmountTwd: 0,
    hasComplaint: opsTracking?.has_complaint === true,
    hasOversellIssue: opsTracking?.has_oversell_issue === true,
    isDisputed: opsTracking?.is_disputed === true,
    isSafetyCase: opsTracking?.is_safety_case === true,
  }) as GuidePayoutHoldReason

  if (holdReason) {
    return {
      totalTwd,
      refundAmountTwd,
      effectiveTwd,
      commissionTwd,
      netTwd,
      payableNetTwd: 0,
      payoutHoldReason: holdReason,
      needsManualReview: true,
    }
  }

  return {
    totalTwd,
    refundAmountTwd,
    effectiveTwd,
    commissionTwd,
    netTwd,
    payableNetTwd: netTwd,
    payoutHoldReason: null,
    needsManualReview: false,
  }
}

/**
 * Compute a payout-item row from an eligible order, applying the v1 policy
 * (docs/05-business/06-payment-plan/03-settlement-rules.md §4):
 * - effective gmv = total_twd - operations_tracking.refund_amount_twd
 * - commission = floor(effective_gmv * commission_rate)
 * - net = floor(effective_gmv * (1 - commission_rate))
 *
 * Returns null when the order is fully (or over-) refunded — fully refunded
 * orders MUST NOT create a payout item per docs §5.
 */
export function computeSweepPayoutItem(
  order: SweepPayoutItemInput,
  opsTracking: SweepPayoutItemOpsTracking,
  config: Pick<SettlementConfig, 'commission_rate' | 'version'>,
): SweepPayoutItem | null {
  const gross = Number(order.total_twd) || 0
  const refunded = Number(opsTracking?.refund_amount_twd ?? 0) || 0
  const effective = gross - refunded
  if (effective <= 0) return null

  // #1221 — enforce payout hold for non-refund signals (refund itself is
  // already accounted for by the effective-gmv calculation above; this
  // gate covers dispute, safety, complaint, and oversell holds that must
  // block payable state until admin explicitly releases them).
  const holdReason: string | null = isPayoutOnHold({
    refundAmountTwd: 0,
    hasComplaint: opsTracking?.has_complaint === true,
    hasOversellIssue: opsTracking?.has_oversell_issue === true,
    isDisputed: opsTracking?.is_disputed === true,
    isSafetyCase: opsTracking?.is_safety_case === true,
  })
  if (holdReason) return null

  const commission_twd = Math.floor(effective * config.commission_rate)
  const net_twd = Math.floor(effective * (1 - config.commission_rate))
  return {
    order_id: order.id,
    guide_id: order.guide_id,
    gmv_twd: effective,
    commission_twd,
    net_twd,
    rules_version: config.version ?? 'v1',
  }
}
