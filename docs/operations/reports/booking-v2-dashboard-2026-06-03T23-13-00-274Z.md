# Booking V2 Rollout Dashboard Snapshot

Generated: 2026-06-03T23:13:00.274Z
Window: last 24h (2026-06-02T23:13:00.274Z ~ 2026-06-03T23:13:00.274Z)

## Funnel
- booking_page_view: 0
  - legacy: 0
  - v2: 0
- begin_checkout: 0 (0%)
  - legacy: 0
  - v2: 0
- purchase_intent: 0 (0%)
  - legacy: 0
  - v2: 0
- payment_callback_received: 0
- payment_succeeded: 0 (0%)
- booking_v2_fallback_clicked: 0 (0% of v2 page views)
- checkout_init_success: 0/0 (N/A — no begin_checkout events)

## Orders / Bookings
- orders.paid: 0
- orders.failed: 0
- bookings.completed: 0
- bookings.cancelled: 0

## Errors
- events.error: 0
- error_rate_vs_page_view: 0%
  - legacy: N/A — no legacy page views
  - v2: N/A — no v2 page views

## Latency (from events.properties.latency_ms)
- available-slots: N/A
- draft-create: N/A
- checkout-init: N/A

## Notes
- booking_page_view and booking_v2_fallback_clicked are now first-class events.
- rollout_variant=legacy|v2 is read from events.properties.rollout_variant.
- latency metrics require event.properties.latency_ms instrumentation to be present.
- checkoutInitiated/checkoutInitSucceeded use begin_checkout→purchase_intent as a proxy; a dedicated checkout_initiated event would give a more precise signal.
- beginCheckoutLegacy/V2 and purchaseIntentLegacy/V2 are counted from events.properties.rollout_variant on begin_checkout and purchase_intent events respectively (issue #965).
- errorRateVsPageViewLegacyPct/V2 are null when the corresponding page-view count is 0 — missing-delta warnings in go-no-go remain WARNINGs, not false-GO (issue #965).
