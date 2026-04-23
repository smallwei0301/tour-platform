# Issue #173 — Batch 1 truth-first FK hardening (booking-critical)

## Identity
- workflow_id: ghloop-ava-20260423T100225Z-issue-173
- repo: smallwei0301/tour-platform
- issue_number: 173
- pr_number: null

## Scope (bounded)
This slice hardens only Batch 1 booking-critical FK constraints that can be missing on upgraded paths:
1. `orders.booking_id -> bookings(id)`
2. `orders.handled_by -> users(id)`

### Explicitly out of scope
- Any new-column or dual-write redesign.
- Any payment-booking model redesign.
- Any assumption that `payments.booking_id` exists (already handled in Issue #161 scope).

## Files
- Migration: `supabase/migrations/20260423183000_issue_173_fk_batch1_truth_first.sql`
- Verification SQL: `supabase/scripts/verify_issue173_fk_batch1.sql`

## Truth-first execution checklist

### 1) Precheck
Run these checks first (migration also enforces them and will fail closed):
```sql
SELECT COUNT(*) AS orphan_orders_booking_id
FROM public.orders o
LEFT JOIN public.bookings b ON b.id = o.booking_id
WHERE o.booking_id IS NOT NULL
  AND b.id IS NULL;

SELECT COUNT(*) AS orphan_orders_handled_by
FROM public.orders o
LEFT JOIN public.users u ON u.id = o.handled_by
WHERE o.handled_by IS NOT NULL
  AND u.id IS NULL;
```
Expected: both counts = `0`.

### 2) Backfill / cleanup (only if precheck fails)
- `orders.booking_id` orphans:
  - either nullify invalid `booking_id`
  - or fix to valid `bookings.id`
- `orders.handled_by` orphans:
  - either nullify invalid `handled_by`
  - or fix to valid `users.id`

### 3) Migration
Apply migration:
```bash
supabase db push
```
or via SQL editor in controlled deploy flow.

### 4) Post-check
Run:
```sql
\i supabase/scripts/verify_issue173_fk_batch1.sql
```
Expected:
- `orphan_orders_booking_id = 0`
- `orphan_orders_handled_by = 0`
- `booking_fk_count >= 1`
- `handled_by_fk_count >= 1`

## Rollback
If emergency rollback is required:
```sql
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS fk_orders_booking_id;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS fk_orders_handled_by;
```

## Observability
- Add deployment SQL check to release checklist:
  - run `supabase/scripts/verify_issue173_fk_batch1.sql`
- Alert condition:
  - `booking_fk_count = 0` or `handled_by_fk_count = 0`
  - or any precheck orphan count > 0

## Risks
1. **Dirty upgraded data** can block FK creation (intentional fail-closed behavior).
2. **Constraint name variation** across environments:
   - migration uses semantic FK checks (column mapping), avoiding duplicate-equivalent FK creation.
3. **Booking flow regression risk** minimized by bounded scope (no model redesign, no write-path behavior changes).

## QA handoff scope (for Judy)
Please verify:
1. Migration applies cleanly on upgraded DB snapshot.
2. `verify_issue173_fk_batch1.sql` passes with expected counts.
3. Booking/order admin paths still work (create booking, attach order, update `handled_by`).
4. No unexpected FK violation appears in booking-critical write paths.
