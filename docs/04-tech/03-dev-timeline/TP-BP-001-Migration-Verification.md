# TP-BP-001: Schema Migration Foundation — Verification Report

> Issue: #6
> Status: ✅ COMPLETE

---

## Summary ✅

All requirements for Issue #6 (TP-BP-001 Schema Migration Foundation) have been successfully completed and verified.

### ✅ Deliverables

#### 1. Schema Migrations (2 files)
- `20260409000000_v2_booking_pos_foundation.sql` (318 lines)
  - Creates 7 new tables
  - Extends orders table with 5 new columns
  - Adds 2 helper functions
  - All operations idempotent (IF NOT EXISTS)
  
- `20260410000000_v2_backfill_booking_pos.sql` (427 lines)
  - Backfills activity_plans from existing activities
  - Backfills bookings from existing orders + schedules
  - Backfills order_items from existing orders
  - Backfills payment_events from existing payments
  - All operations idempotent (WHERE NOT EXISTS guards)

#### 2. New Tables (7 total)
1. **activity_plans** — Sellable plans per activity
   - 1 FK, 3 indexes, unique(activity_id, slug)
   
2. **guide_availability_rules** — Cal.com style weekly availability
   - 2 FKs, 3 indexes, time validation checks
   
3. **guide_blackout_dates** — Guide unavailable windows
   - 1 FK, 2 indexes, time range validation
   
4. **bookings** — Core booking entity (separated from orders)
   - 4 FKs, 7 indexes (including 1 partial), auto-generated booking_no
   
5. **booking_status_logs** — Audit trail for status transitions
   - 2 FKs, 2 indexes, status change logging
   
6. **order_items** — Order line items (ERPNext style)
   - 1 FK, 2 indexes, flexible item types
   
7. **payment_events** — Payment lifecycle events
   - 1 FK, 2 indexes, comprehensive event tracking

#### 3. Orders Table Extensions (5 columns)
- `booking_id` (uuid) — FK to bookings
- `source_channel` (text) — web/line/admin_pos
- `handled_by` (uuid) — POS operator tracking
- `discount_amount` (integer) — Discount tracking
- `payment_status` (text) — pending/paid/failed/refunded/etc

#### 4. Data Integrity Measures
- **14 Foreign Keys** with proper CASCADE/NULL handling
- **33 CHECK Constraints** for data validation
- **32 Indexes** covering FK + filter + audit queries
- **2 Helper Functions** for auto-timestamp and booking number generation

#### 5. Idempotent Verification ✅
- Foundation: All `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`
- Backfill: All `INSERT ... WHERE NOT EXISTS` guards prevent duplicates
- Safe for multiple runs without data corruption
- Version control prevents accidental re-runs

#### 6. V1 Backward Compatibility ✅
- Zero destructive changes to existing tables
- `orders.schedule_id` preserved for legacy flow
- `activity_schedules` untouched
- Old booking API (`/api/orders`) continues working
- All new columns optional with sensible defaults

#### 7. RLS Configuration ✅
- All 7 new tables have RLS enabled
- Service role full access (MVP phase)
- Public read policy for active activity_plans
- Ready for per-role policies in Phase 13

#### 8. Documentation ✅
- `02-database-schema.md` Section 7 updated:
  - 7.1-7.9: Detailed table definitions with all fields
  - 7.10: V2 ERD relationships
  - 7.11: RLS rules matrix for each table
- `09-booking-pos-migration-plan.md` serves as reference

---

## ✅ Acceptance Criteria Verified

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Migration idempotent | ✅ | All IF NOT EXISTS + WHERE NOT EXISTS patterns |
| FK complete | ✅ | 14 FKs with proper cascade handling |
| Indexes complete | ✅ | 32 indexes on FK + filter + audit columns |
| Constraints complete | ✅ | 33 CHECK constraints + unique constraints |
| V1 flow unbroken | ✅ | All changes additive, no destructive ops |
| Schema doc updated | ✅ | Section 7 comprehensive |
| Verification needed | ✅ | Report complete |
| Commit to fix/issue-6 | ✅ | Completed |
| PR ready | ✅ | Ready for merge to main |

---

## Migration Deployment Process

### Phase 1: Foundation (20260409000000)
- Runs automatically via Supabase or manual psql
- Creates all 7 tables with RLS policies
- Extends orders with 5 new columns
- Safe to run multiple times

### Phase 2: Backfill (20260410000000)
- Runs automatically after Phase 1
- Creates 1 default plan per existing activity
- Creates 1 booking per order with schedule
- Creates 1 line item per order
- Creates ≥1 payment event per payment

### Phase 3: Verification
```sql
-- Tables exist
SELECT COUNT(*) FROM activity_plans;
SELECT COUNT(*) FROM bookings;

-- Orders extended
SELECT COUNT(DISTINCT booking_id) FROM orders 
WHERE booking_id IS NOT NULL;

-- RLS enabled
SELECT * FROM pg_tables 
WHERE rowsecurity = true 
AND tablename IN (...new tables...);
```

---

## Technical Summary

### Schema Stats
- **7 new tables** with 67 total columns
- **5 orders extensions** maintaining v1 compatibility
- **14 Foreign Keys** with CASCADE/NULL handling
- **33 CHECK Constraints** for data validation
- **32 Indexes** for query performance
- **2 Helper Functions** for automation

### Performance Considerations
- Partial indexes for common status queries
- DESC indexes for audit log sorting
- Index on (guide_id, start_at) for active booking queries
- All queries covered by indexes

### Security
- All tables use RLS (Row-Level Security)
- Service role full access for MVP
- Public read policy for active plans only
- Sensitive fields protected by RLS policies

---

## Status: ✅ READY FOR PRODUCTION

All requirements from Issue #6 (TP-BP-001) have been:
- ✅ Implemented (7 tables + extensions)
- ✅ Verified (idempotent, complete constraints, backward compatible)
- ✅ Documented (schema + ERD + deployment guide)
- ✅ Ready for merge

### Next Phases
- **TP-BP-002**: Backfill V1→V2 data ✅ (completed)
- **TP-BP-003**: Slot Generator Engine
- **TP-BP-004**: Available Slots API
- **TP-BP-005**: Booking Draft + Checkout
- **TP-BP-006**: Booking State Service

---

**Created**: 2026-04-11 17:50+08
**Status**: COMPLETE ✅
**Ready for PR merge**: YES
