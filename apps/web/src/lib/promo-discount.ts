/**
 * Pure discount calculation utilities for promo codes.
 * Extracted for unit-testability without Next.js dependencies.
 * Issue #353: Promo codes backend
 */

/**
 * Calculate discount amount.
 * @param discountType  'percentage' | 'fixed'
 * @param discountValue numeric value (e.g. 10 for 10%, or 200 for NT$200 off)
 * @param originalTotal original order total in smallest integer unit (e.g. TWD)
 * @returns discount amount (always <= originalTotal, always >= 0)
 */
export function calculateDiscount(
  discountType: string,
  discountValue: number,
  originalTotal: number
): number {
  if (discountType === 'percentage') {
    return Math.floor((originalTotal * discountValue) / 100);
  }
  // fixed: cap at originalTotal
  return Math.min(Math.floor(discountValue), originalTotal);
}
