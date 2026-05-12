-- Add policy_snapshot to refund_requests to capture the quoted refund amount at submission time
ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS policy_snapshot JSONB;

COMMENT ON COLUMN public.refund_requests.policy_snapshot IS
  'Snapshot of calculateRefundAmount() result at submission time (refund_pct, refundable_amount, breakdown, policy.version). Used by downstream automation to honor the quoted amount.';
