# Issue #172 — Bounded migration-safe FK rollout

## Scope (implemented)
- Add `bookings.order_id -> orders(id)` FK.
- Add `payments.booking_id` as **nullable** column if missing.
- Add `payments.booking_id -> bookings(id)` FK.
- Keep `payments.booking_id` nullable in this issue.

## Explicitly out of scope
- Historical backfill for existing payment rows.
- `payments.booking_id` `NOT NULL` enforcement.
- Guessing order↔booking mapping.
- Broader FK sweep.

## Validation SQL (rerunnable)
```sql
-- 1) bookings.order_id FK exists
SELECT conname, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'bookings'
  AND c.conname = 'fk_bookings_order_id';

-- 2) payments.booking_id column exists and is nullable
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payments'
  AND column_name = 'booking_id';

-- 3) payments.booking_id FK exists
SELECT conname, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'payments'
  AND c.conname = 'fk_payments_booking_id';

-- 4) Existing NULL booking_id rows are allowed and do not block migration
SELECT COUNT(*) AS null_booking_id_rows
FROM public.payments
WHERE booking_id IS NULL;
```

## Rollback notes
If rollback is required:
```sql
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS fk_payments_booking_id;
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS fk_bookings_order_id;
-- Keep payments.booking_id column unless a destructive rollback is explicitly approved.
```

## Observability
- Post-migration check should record:
  - FK presence for both constraints.
  - `payments.booking_id` nullability (`is_nullable = 'YES'`).
  - Count of `payments.booking_id IS NULL` rows.
- Alert condition (manual or dashboard SQL): FK missing after deploy.

## Risks
- If `bookings.order_id` has unexpected orphan values in a target environment, FK creation fails.
  - Known grounding says orphan rows = 0, null rows = 0 in prior check.
- If table/column names differ in non-standard environments, migration must be adapted.
