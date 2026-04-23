# Issue #161 — Bounded FK hardening (upgraded DB path)

## Scope completed

1. Added idempotent upgrade migration to ensure `bookings.order_id -> orders(id)` FK (`fk_bookings_order_id`).
2. Added `payments.booking_id` as nullable additive column (if missing), then normalized semantic FK wiring so only one canonical FK remains on `payments.booking_id -> bookings(id)` (`fk_payments_booking_id`).
3. Added deterministic backfill from `payments.order_id` to `payments.booking_id` via `bookings.order_id`:
   - backfills only when exactly one booking matches (`HAVING COUNT(b.id) = 1`)
   - keeps ambiguous rows `NULL` by design.

## Why migration-safe

- Uses `ADD COLUMN IF NOT EXISTS` for additive schema change.
- Uses guarded/idempotent DDL and semantic FK normalization for `payments.booking_id` (drops legacy equivalent FK variants before adding canonical named FK).
- Keeps `payments.booking_id` nullable (`DROP NOT NULL`) to avoid upgrade failures on historical rows.
- Normalizes final `payments.booking_id` delete behavior to `ON DELETE SET NULL` (removes legacy CASCADE drift).
- Backfill is deterministic-only and idempotent (`WHERE p.booking_id IS NULL`).

## Verification

Use:
- `docs/implementation/issue-161-fk-hardening-verification.sql`

Expected outcomes:
- FK list includes both `fk_bookings_order_id` and `fk_payments_booking_id`.
- `payments.booking_id` column exists and is nullable.
- `unresolved_non_ambiguous_should_be_zero` = `0`.
- `unresolved_due_to_ambiguous_mapping` may be `> 0` and is acceptable by design.
- `payment_booking_fk_mismatch` = `0`.
