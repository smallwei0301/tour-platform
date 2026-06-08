# GH-1286 Production Migration Drift — Apply Runbook

> **STATUS: AWAITING OWNER APPROVAL GATE**
>
> This runbook is prepared for operator execution after the owner approval gate
> (Ava → 木村哥 approval). The canonical SQL has been reviewed by Rita.
> Do NOT execute until 木村哥 explicitly approves mutation.

## Background

7 migrations landed in `main` between 2026-05-13 and 2026-06-05 but were never
applied to production due to a deployment process gap (manual, untracked, no CI).

**Symptoms:**
- `/api/guide/activities-with-plans` → PostgreSQL error 42703 (missing `is_year_round` column) → guides see empty activity list
- Archiving a plan → CHECK constraint violation (`archived` not in constraint)

**Root cause:** No `schema_migrations` tracking, no CI migration apply/detection step.

## What was prepared (Agent task A — this PR)

| Artifact | Path | Purpose |
|---|---|---|
| Canonical apply SQL | `supabase/migrations/20260608_issue1286_canonical_drift_apply.sql` | Idempotent apply all 7 drifted migrations in order |
| Rollback SQL | `supabase/migrations/20260608_issue1286_canonical_drift_apply.rollback.sql` | Undo apply if needed |
| Verify script | `scripts/verify-migration-1286.mjs` | Read-only prod probe confirming all 7 items |
| Preflight coverage | `scripts/production-schema-drift-preflight.mjs` (expanded) | Now covers all 5 new tables/columns |
| Source-contract tests | `apps/web/tests/api/issue1286-migration-drift-source-contract.test.mjs` | 29 static tests, all pass |
| CI drift detection | `.github/workflows/migration-drift-detect.yml` | Runs on PR + daily cron |

## Pre-apply checklist (operator executes)

- [ ] Rita has approved the canonical SQL
- [ ] 木村哥 has explicitly approved production mutation
- [ ] Production database backup completed
- [ ] Rollback SQL reviewed and understood
- [ ] Maintenance window or off-peak time confirmed
- [ ] At least one engineer on standby

## Apply procedure

```bash
# 1. Verify current prod state (read-only)
SUPABASE_URL=https://pyoderxmpeyqjwkeliiu.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<key> \
node scripts/verify-migration-1286.mjs --json

# Expected: some checks FAIL (missing tables/columns) — confirms drift is real.

# 2. Apply canonical SQL via Supabase Dashboard SQL Editor
#    Copy contents of:
#    supabase/migrations/20260608_issue1286_canonical_drift_apply.sql
#    Paste into Dashboard → SQL Editor → Run (as service role)

# 3. Verify post-apply (read-only)
SUPABASE_URL=https://pyoderxmpeyqjwkeliiu.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<key> \
node scripts/verify-migration-1286.mjs --json

# Expected: ALL 7 checks PASS.

# 4. Run live API smoke
curl -s "<VERCEL_PREVIEW_URL>/api/guide/activities-with-plans" \
  -H "Cookie: guide_session=<valid_session>" | jq '.[] | .plans | length'
# Expected: non-error response with plan data
```

## Rollback procedure

```bash
# ONLY if apply caused unexpected issues
# Copy contents of:
# supabase/migrations/20260608_issue1286_canonical_drift_apply.rollback.sql
# Paste into Dashboard → SQL Editor → Run

# WARNING: Drops 4 tables + 2 columns. All post-apply data will be lost.
```

## Post-apply close-gate

After successful apply and verify, Ava should:

1. Run `scripts/verify-migration-1286.mjs --json` against prod → all PASS
2. Run `/api/guide/activities-with-plans` smoke → no 42703 error
3. Try archiving a plan in admin → no constraint violation
4. Comment on GH-1286 with verification evidence
5. Close GH-1286 as completed

## 7 Drifted Migrations (reference)

| # | File | What it does |
|---|------|-------------|
| 1 | `20260513_issue497_activity_plans_status_archived.sql` | Adds `archived` to status CHECK |
| 2 | `20260602_issue1067_activity_plan_seasons.sql` | Creates `activity_plan_seasons` table + RLS |
| 3 | `20260603_issue1067_activity_plan_seasons_anon_read.sql` | Adds anon SELECT policy |
| 4 | `20260603_issue1067_guide_slot_conflict_overrides.sql` | Creates `guide_slot_conflict_overrides` + booking audit columns |
| 5 | `20260604_issue1171_guide_trip_reports.sql` | Creates `guide_trip_reports` table |
| 6 | `20260604_issue1174_review_invitations.sql` | Creates `review_invitations` table |
| 7 | `20260605_issue1067_activity_plans_is_year_round.sql` | Adds `is_year_round` column to `activity_plans` |
