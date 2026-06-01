# Booking V2 Daily Decision — 2026-06-01

Decision: **HOLD**

## Inputs (core)
- booking_page_view: 50
- payment_callback_received: 20
- payment_success_rate_pct: 95%
- checkout_init_success_rate_pct: N/A
- fallback_rate_vs_v2_page_view_pct: 4%
- error_rate_vs_page_view_pct: 2%

## v2 vs legacy conversion deltas
- begin_checkout_rate_legacy_pct: N/A
- begin_checkout_rate_v2_pct: N/A
- begin_checkout_rate_delta_pct: N/A
- purchase_intent_rate_legacy_pct: N/A
- purchase_intent_rate_v2_pct: N/A
- purchase_intent_rate_delta_pct: N/A

## v2 vs legacy error-rate deltas
- error_rate_legacy_pct: N/A
- error_rate_v2_pct: N/A
- error_rate_delta_pct: N/A

## Threshold Config
- min_page_view: 20 (default)
- min_callback: 5 (default)
- payment_success_min_pct: 95 (default)
- checkout_success_min_pct: 90 (default)
- fallback_warn_pct: 10 (default)
- error_warn_pct: 5 (default)

## Decision Reasons
- rollback_reasons: none
- hold_reasons: MISSING_REQUIRED_METRIC(funnel.checkoutInitSuccessRatePct)
- warnings: MISSING_DELTA_INPUT(begin_checkout_rate); MISSING_DELTA_INPUT(purchase_intent_rate); MISSING_DELTA_INPUT(error_rate)

## Policy Alignment
- Uses #103 metrics snapshot as source-of-truth input
- Decision labels aligned with #96/#104 (GO/HOLD/ROLLBACK WATCH)
- If callback/oversell invariants breach externally, override to not-GO regardless of this report
