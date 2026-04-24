# Issue #161 Upgraded DB Notes (Superseded by Issue #164 precheck model)

This document is retained as historical context only.

## Authoritative production schema for current precheck
- `bookings.order_id -> orders.id`
- `orders.booking_id -> bookings.id`
- `payments.order_id -> orders.id`
- `payments.booking_id` is not part of current production precheck artifacts.

## Operational correction introduced by #164
- Stop validating or describing payment linkage via `payments.booking_id` in precheck/verification outputs.
- Validate canonical links only and report data profile:
  - bookings row count
  - orders.booking_id null distribution
  - payments.order_id row/orphan profile

## Recommended verification entrypoints
- `supabase/scripts/precheck_issue164_schema_alignment.sql`
- `docs/implementation/issue-161-fk-hardening-verification.sql`
