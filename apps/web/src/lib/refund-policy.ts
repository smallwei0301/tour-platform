export interface RefundTier {
  cutoff_hours: number;
  label: string;
  refund_pct: number;
}

export interface RefundPolicy {
  version: string;
  tiers: RefundTier[];
}

export interface RefundResult {
  eligible: boolean;
  refundable_amount: number;
  refund_pct: number;
  breakdown: { tier: string; percent: number; amount: number };
  reason: string;
}

export function calculateRefundAmount(
  originalAmount: number,
  tourStartAt: Date,
  policy: RefundPolicy,
  now: Date = new Date()
): RefundResult {
  const hoursUntilTour = (tourStartAt.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Sort tiers descending by cutoff_hours (longest first)
  const sorted = [...policy.tiers].sort((a, b) => b.cutoff_hours - a.cutoff_hours);

  for (const tier of sorted) {
    if (hoursUntilTour >= tier.cutoff_hours) {
      const refundable = Math.round(originalAmount * tier.refund_pct / 100);
      return {
        eligible: tier.refund_pct > 0,
        refundable_amount: refundable,
        refund_pct: tier.refund_pct,
        breakdown: { tier: tier.label, percent: tier.refund_pct, amount: refundable },
        reason: `${tier.label} window: ${tier.refund_pct}% refund`,
      };
    }
  }

  // Fallback — should not happen with well-formed policy (last tier has cutoff_hours=0)
  return {
    eligible: false,
    refundable_amount: 0,
    refund_pct: 0,
    breakdown: { tier: 'out-of-window', percent: 0, amount: 0 },
    reason: 'no matching refund tier',
  };
}
