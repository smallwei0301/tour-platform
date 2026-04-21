# Availability Snapshot Operations (Issue #85)

## Snapshot table
- table: `activity_availability_daily`
- source of truth for frontend availability reads (daily aggregate)
- fallback: raw `activity_schedules` when snapshot unavailable

## Update paths (explicit)
1. **Schedule changes** (insert/update/delete on `activity_schedules`)
   - trigger: `trg_refresh_activity_availability_daily`
2. **Order create / payment callback / cancel / admin order/refund flows**
   - app-level best-effort call: `tryRefreshAvailabilitySnapshotByOrderId(orderId)`
3. **Ongoing reconcile**
   - workflow: `.github/workflows/availability-snapshot-reconcile.yml`
   - command: `npm run snapshot:availability:backfill -- --from=YYYY-MM-DD --to=YYYY-MM-DD`

## Drift-proof strategy
- trigger gives near-real-time snapshot updates on schedule changes
- app-level refresh hooks reduce event-to-snapshot lag in order/payment/admin flows
- daily reconcile re-derives snapshot from schedules to self-heal drift

## Failure handling
- backfill script exits non-zero on first failure and logs activity id
- API falls back to schedule source if snapshot rows are missing

## Validation
- compare API source marker (`source=snapshot|schedule`) in runtime responses
- run reconcile manually after incident or migration
