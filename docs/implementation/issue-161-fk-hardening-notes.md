# Issue #161 Notes (Superseded for precheck by Issue #164)

This note remains for historical migration traceability only.

## Current production schema contract (authoritative for precheck)
- `bookings.order_id -> orders.id`
- `orders.booking_id -> bookings.id`
- `payments.order_id -> orders.id`
- `payments.booking_id` is **not** part of the current production precheck contract.

## What changed in Issue #164 alignment
- Precheck/verification logic no longer validates `payments.booking_id`.
- Referential checks now target only the three canonical links above.

## Use this for validation
- `supabase/scripts/precheck_issue164_schema_alignment.sql`
- `supabase/scripts/verify_issue161_fk_hardening.sql` (legacy filename, updated logic)

## Out of scope for #164
- Rewriting historical migrations.
- Reconstructing historical booking/payment linkage models.
- App/payment flow refactor.
