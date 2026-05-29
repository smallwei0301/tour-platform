/**
 * Settlement constants v1 (拍板 by Wei, 2026-05)
 * Source: docs/05-business/06-payment-plan/03-settlement-rules.md
 * Override via env: SETTLEMENT_COMMISSION_RATE, SETTLEMENT_T_DAYS, SETTLEMENT_MIN_WITHDRAWAL_TWD
 */

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
export async function getSettlementConfig(supabase: any): Promise<SettlementConfig> {
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
} | null | undefined

export type SweepPayoutItem = {
  order_id: string
  guide_id: string
  gmv_twd: number
  commission_twd: number
  net_twd: number
  rules_version: string
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
