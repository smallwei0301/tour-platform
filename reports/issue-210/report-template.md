# Issue #210 Booking/Cancel Verification Report

- run_at:
- executor:
- branch:
- commit:
- evidence_dir: `reports/issue-210/<timestamp>/`

## Scope confirmation

- ✅ In scope: booking/cancel verification only
- ✅ Out of scope excluded: callback/payment-init/#178/#170/#197/PR#196/#171 rewrite

## Metrics snapshot

- cancelled_status_missing_cancelled_at_count:
- non_cancelled_with_cancelled_at_count:
- cancelled_bookings_missing_order_count:
- cancelled_booking_order_status_not_cancelled_count:
- cancelled_booking_paid_payment_count:

## Contract test summary

- booking-state.test.mjs:
- v2-booking-draft-checkout.test.mjs:
- issue-210-booking-cancel-contract.test.mjs:

## Decision

- GO / HOLD / STOP:
- Reason:
- Follow-up actions:
