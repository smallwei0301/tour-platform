/**
 * Draft v1 settlement constants
 * Source: docs/05-business/06-payment-plan/03-settlement-rules.md
 * Override via env: SETTLEMENT_COMMISSION_RATE, SETTLEMENT_T_DAYS, SETTLEMENT_MIN_WITHDRAWAL_TWD
 */

export const SETTLEMENT_COMMISSION_RATE = parseFloat(process.env.SETTLEMENT_COMMISSION_RATE ?? '0.15')
export const SETTLEMENT_T_DAYS = parseInt(process.env.SETTLEMENT_T_DAYS ?? '7', 10)
export const SETTLEMENT_MIN_WITHDRAWAL_TWD = parseInt(process.env.SETTLEMENT_MIN_WITHDRAWAL_TWD ?? '1000', 10)

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
