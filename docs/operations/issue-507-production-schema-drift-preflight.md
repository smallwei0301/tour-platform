# Issue 507 - Production schema drift preflight

## Purpose
Provide a repeatable read-only preflight that validates required production schema contracts before booking or settlement-sensitive work is released.

## Scope (bounded)
- Script: `scripts/production-schema-drift-preflight.mjs`
- Contract test: `apps/web/tests/api/issue507-schema-drift-preflight-contract.test.mjs`
- Script entry in root `package.json`: `preflight:schema-drift`
- No application/runtime changes, no migrations, no DB writes.

## Probe inventory

- Public activities: `activities` + `guide_profiles!activities_guide_id_fkey`
- Activity availability: `activities` fallback `activity_availability_daily` / `activity_schedules`
- Guide availability + plan reads: `activity_plans`, `guide_availability_rules`, `guide_blackout_dates`, `bookings`
- Settlement rules: `settlement_rules`
- Payouts/guide balances: `payouts`, `guide_profiles`, `guide_balances`
- Refund requests: `refund_requests`
- Payment events: `payment_events`

Each probe result should include:
- `feature_area`
- `table` and `relation`
- `required_columns`
- `status` (`pass` / `fail` / `blocked`)
- `missing_table` / `missing_column` / `missing_relation` when available
- `impacted_feature`
- `error_classification` (redacted)

## Expected behavior
- `--help`: print usage and exit 0
- `--json`: emit JSON structure
- `--markdown`: emit readable markdown summary
- Missing env (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`): non-zero exit, `error_classification: no_db_env`, all checks blocked

## Commands

From repo root:

```bash
node --check scripts/production-schema-drift-preflight.mjs
npm run preflight:schema-drift -- --help
cd apps/web && node --test tests/api/issue507-schema-drift-preflight-contract.test.mjs
node scripts/production-schema-drift-preflight.mjs --json
```

## Output contract
- Must never print database URLs, service keys, or raw rows.
- JSON output is machine-readable and suitable for CI preflight checks.
