# Issue #161 — Bounded FK Hardening (Upgraded DB Path)

## Delivered scope

This slice intentionally ships only:
1. `bookings.order_id -> orders(id)` explicit FK via idempotent migration-safe DDL.
2. `payments.booking_id` additive nullable column + semantic FK normalization to exactly one `payments.booking_id -> bookings(id)` FK.
3. Final `payments.booking_id` FK delete rule normalized to `ON DELETE SET NULL` (legacy CASCADE semantics removed).
4. Deterministic-only backfill from `payments.order_id` to `payments.booking_id` where `bookings.order_id` is uniquely mapped.
5. Verification SQL for FK/column existence, duplicate semantic FK absence, and final delete-rule evidence.

Out of scope in this slice:
- `order_items.ref_id` redesign
- broader FK sweep
- unrelated app-layer refactor

## Files

- Canonical migration: `supabase/migrations/20260423142000_issue_161_fk_hardening.sql`
- Follow-up slice: `supabase/migrations/20260423153000_issue161_fk_hardening_slice.sql` (intentional no-op to avoid duplicate rollout logic)
- Verification: `supabase/scripts/verify_issue161_fk_hardening.sql`

## Deterministic backfill rule

Backfill writes `payments.booking_id` only when:
- `payments.booking_id IS NULL`
- `payments.order_id IS NOT NULL`
- there is exactly **one** booking row where `bookings.order_id = payments.order_id`

If multiple bookings share the same `order_id`, row is treated as ambiguous and remains `NULL`.

## How to verify (upgraded DB)

1. Run migration on upgraded DB.
2. Run verification SQL:

```sql
\i supabase/scripts/verify_issue161_fk_hardening.sql
```

3. Acceptance interpretation:
- `has_fk_bookings_order_id = true`
- `has_fk_payments_booking_id = true`
- `has_payments_booking_id_column = true`
- `unique_mapping_wrong_booking_id = 0`
- `payments_booking_id_orphan_count = 0`
- `ambiguous_rows_kept_null` should equal `payment_rows_with_ambiguous_mapping`

`payments_with_order_id_but_booking_id_null` may be > 0 only for ambiguous or no-match cases.
