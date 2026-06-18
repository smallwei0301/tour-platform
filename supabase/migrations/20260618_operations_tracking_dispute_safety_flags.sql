-- Add payout-hold flags missing from operations_tracking.
--
-- Background: #1221 / #1284 introduced two payout-hold signals — payment
-- dispute (`is_disputed`) and safety review (`is_safety_case`) — and the code
-- already reads them (settlement-config.ts `isPayoutOnHold`, the guide dashboard
-- and the guide payout monthly JSON/CSV routes all `select` these columns).
-- The columns were never created in the schema, so on the live DB every
-- guide-facing `operations_tracking` select that includes them ERRORS
-- (PostgREST: "column is_disputed does not exist"). The route code swallows the
-- error (`data ?? []`), so refund amounts (#847 effective gmv) and holds are
-- silently dropped from the guide dashboard / payout views — the guide sees the
-- gross amount instead of the post-refund effective amount.
--
-- These mirror the existing boolean hold flags (has_complaint / has_oversell_issue)
-- and default to false, so existing rows keep their current (no-hold) behaviour.
ALTER TABLE operations_tracking
  ADD COLUMN IF NOT EXISTS is_disputed    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_safety_case boolean NOT NULL DEFAULT false;
