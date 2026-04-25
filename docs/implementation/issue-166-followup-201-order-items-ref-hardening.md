# Follow-up Draft (Batch 1) — order_items.ref_id hardening

## Title suggestion
`[Phase 12][FK][Batch1] Normalize and enforce order_items booking linkage`

## Problem
`order_items.ref_id` is polymorphic today and cannot be safely enforced by a single FK while still supporting non-booking item types.

## Scope (bounded)
- Introduce explicit typed linkage for booking lines (e.g. `booking_id uuid` for `item_type='activity_booking'`).
- Backfill `booking_id` from legacy `ref_id` for booking rows.
- Add bounded FK: `order_items.booking_id -> bookings.id`.
- Keep non-booking item types FK-free by design.

## Precheck SQL contract
- Count rows by `item_type`.
- For `item_type='activity_booking'`, calculate orphan count where `ref_id` does not match `bookings.id`.
- Null-rate and invalid UUID-rate report for `ref_id`.

## Migration path
1. Add new nullable `booking_id uuid`.
2. Backfill from `ref_id` for booking rows (idempotent).
3. Validate orphan count = 0 for booking rows.
4. Add FK and supporting index.
5. (Optional) add check constraint to require `booking_id` when `item_type='activity_booking'`.

## Rollback
- Drop check/FK/index/new column in reverse order.
- Preserve original `ref_id` data.

## Observability
- Monitor write-path FK violations (`23503`) on `order_items`.
- Track booking line insert/update failures and reconciliation job errors.

## Acceptance
- Booking lines always have valid `booking_id`.
- FK enforced for booking lines.
- Non-booking line types unaffected.
