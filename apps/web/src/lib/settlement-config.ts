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
