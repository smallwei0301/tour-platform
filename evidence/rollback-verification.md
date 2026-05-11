# Rollback Verification Evidence — Issue #322/#308a

## Rollback File
`supabase/migrations/20260511000000_issue308a_guide_activity_authoring.rollback.sql`

## Verification Method
Without a local Supabase instance, rollback correctness is verified by:
1. Static analysis tests (see below)
2. Manual review of DROP statements vs CREATE statements

## What rollback drops
- `activity_plan_tiers` table (DROP TABLE IF EXISTS ... CASCADE)
  → also drops all its policies and indexes via CASCADE
- `activity_images` table (DROP TABLE IF EXISTS ... CASCADE)
  → also drops all its policies and indexes via CASCADE
- 4 guide-scoped policies on `activities` (read/insert/update/delete)
- 4 guide-scoped policies on `activity_schedules` (read/insert/update/delete)
- 4 guide-scoped policies on `activity_plans` (read/insert/update/delete)
- 6 new columns on `activities` (dismissal_point, dismissal_point_map_url,
  meeting_lat, meeting_lng, dismissal_lat, dismissal_lng)

## What rollback preserves
- "activities: public read published"
- "activities: service role full access"
- "activity_schedules: public read"
- "activity_schedules: service role full access"
- "activity_plans: public read active plans"
- "activity_plans: service role full access"
- All pre-existing guide_profiles policies
- All other tables

## Expected behavior after rollback
- AC1 tests: RED (columns gone)
- AC2 tests: RED (tables gone)
- AC3/AC4/AC6 tests: guide-owner policies gone, public read preserved
- AC5 tests: GREEN (jsonb read path unchanged)

## CI/staging verification plan
1. Apply migration: `supabase db push` or `supabase migration up`
2. Run test suite → all tests GREEN
3. Apply rollback: `psql $DATABASE_URL < 20260511000000_issue308a_guide_activity_authoring.rollback.sql`
4. Re-run AC1+AC2 tests → should be RED (columns/tables gone)
5. Re-run AC5 tests → should still be GREEN (jsonb path untouched)
