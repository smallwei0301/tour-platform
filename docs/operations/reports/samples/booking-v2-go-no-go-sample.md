# Booking V2 Daily Decision — 2026-04-18

Decision: **GO**

## Inputs (core)
- booking_page_view: 200
- payment_callback_received: 30
- payment_success_rate_pct: 96.7%
- checkout_init_success_rate_pct: 93.5%
- fallback_rate_vs_v2_page_view_pct: 5%
- error_rate_vs_page_view_pct: 2.1%

## v2 vs legacy conversion deltas
- begin_checkout_rate_legacy_pct: 41.67%
- begin_checkout_rate_v2_pct: 57.5%
- begin_checkout_rate_delta_pct: 37.99%
- purchase_intent_rate_legacy_pct: 68%
- purchase_intent_rate_v2_pct: 78.26%
- purchase_intent_rate_delta_pct: 15.09%

## v2 vs legacy error-rate deltas
- error_rate_legacy_pct: 1.2%
- error_rate_v2_pct: 3.4%
- error_rate_delta_pct: 183.33%

## Threshold Config
- min_page_view: 20 (default)
- min_callback: 5 (default)
- payment_success_min_pct: 95 (default)
- checkout_success_min_pct: 90 (default)
- fallback_warn_pct: 10 (default)
- error_warn_pct: 5 (default)

## Decision Reasons
- rollback_reasons: none
- hold_reasons: none
- warnings: none

## Policy Alignment
- Uses #103 metrics snapshot as source-of-truth input
- Decision labels aligned with #96/#104 (GO/HOLD/ROLLBACK WATCH)
- If callback/oversell invariants breach externally, override to not-GO regardless of this report
