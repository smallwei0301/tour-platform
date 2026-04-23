# Issue #172 FK Rollout Notes (Historical)

This file is historical and **not** the active precheck source for current production schema.

## Current authoritative schema for precheck (Issue #164)
- `bookings.order_id -> orders.id`
- `orders.booking_id -> bookings.id`
- `payments.order_id -> orders.id`
- `payments.booking_id` is not part of current production precheck artifacts.

## Operational instruction
- Do not use this note to validate present-day production referential checks.
- Use issue #164 aligned scripts/docs instead.

## Active verification references
- `supabase/scripts/precheck_issue164_schema_alignment.sql`
- `supabase/scripts/verify_issue161_fk_hardening.sql` (legacy filename, updated logic)
- `docs/implementation/issue-161-fk-hardening-verification.sql`

## Out of scope
- No historical migration rewriting in #164.
- No payment-domain architecture refactor in #164.
