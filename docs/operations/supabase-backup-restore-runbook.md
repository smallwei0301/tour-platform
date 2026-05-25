# Supabase Backup & Restore Runbook

**Owner:** Wei (Supabase project owner)
**Last updated:** 2026-05-25
**Applies to:** Production Supabase project (tour-platform)

> Guardrail: agents may prepare docs/templates/preflight only. Any restore or PITR action requires Wei/operator and must target non-production first.

## RTO / RPO Targets (Soft-Launch Phase)

| Metric | Target | Notes |
|--------|--------|-------|
| RPO (Recovery Point Objective) | ≤ 1 hour | Supabase PITR default interval |
| RTO (Recovery Time Objective) | ≤ 4 hours | Full restore to staging verification + cutover |
| Acceptable data loss | 0 bookings/payments | Payment transactions: zero tolerance |
| Acceptable data loss | ≤ 1 hour activity/slot config | Guide availability rules: low-risk soft-launch |

## Backup Sources

| Type | Location | Retention | Access |
|------|----------|-----------|--------|
| Supabase PITR (Point-in-Time Recovery) | Supabase Dashboard → Backups | 7 days (Free/Pro tier varies) | Project Owner |
| Supabase daily logical dump | Supabase Dashboard → Backups | 7 days | Project Owner |
| Manual pg_dump | Run locally with service_role | As scheduled | DBA (Wei) |

⚠️ PITR and logical backups require Supabase Pro plan or higher. Verify plan before relying on PITR.

## Restore Decision Tree

```
Incident detected
├── Data corrupted / accidentally deleted (rows)?
│   ├── < 1 table, < 100 rows → FORWARD FIX (INSERT/UPDATE, no restore needed)
│   └── ≥ 1 table or critical booking/payment rows → RESTORE (see §3)
├── Migration failed mid-way?
│   ├── Reversible (has rollback SQL) → RUN ROLLBACK, not restore
│   └── Irreversible / data destroyed → RESTORE (see §3)
└── Data drift (gradual inconsistency)?
    └── Identify root cause first → BACKFILL if bounded, RESTORE if unbounded
```

## Restore Procedure

### Full Database Restore (PITR)

0. **Run non-production preflight** — `node scripts/ops/restore-drill-preflight.mjs --dry-run` for agent validation, then operator reruns without `--dry-run` using non-production target env/URL/ref.
1. **Stop application traffic** — set `MAINTENANCE_MODE=1` on Vercel (prevents new writes)
2. **Identify restore point** — Supabase Dashboard → Backups → select point in time
3. **Create restore target** — provision new Supabase project (staging-restore) or use existing staging
4. **Trigger restore** — Supabase Dashboard → restore to selected point
5. **Verify migrations** — after restore, run: `supabase db push --project-ref <staging-ref>` (idempotent)
6. **Run smoke checklist** (see §4) — compare row counts and spot-check data
7. **Cutover decision** — if smoke passes, update DNS/env vars; if fails, investigate
8. **Resume traffic** — unset `MAINTENANCE_MODE`

### Single-Table Restore

1. Dump table from backup: `pg_dump -t <table_name> --data-only`
2. Apply to production with transaction: `BEGIN; TRUNCATE <table>; COPY FROM ...; COMMIT;`
3. Verify with spot-check queries

### Forbidden Actions

- ❌ NEVER run restore directly against production DB without staging verification
- ❌ NEVER skip the preflight confirmation that target env/project is non-production
- ❌ NEVER share service_role key or DB URL in issues, PRs, logs, or artifacts
- ❌ NEVER include real traveler/guide PII, payment data, or connection strings in drill evidence
- ❌ NEVER treat agent dry-run/prep work as completion of #724; live drill remains operator-owned

## Post-Restore Smoke Checklist

### Schema verification
```sql
-- All expected tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
-- Should include: activities, activity_plans, activity_schedules, bookings, booking_status_logs,
-- guide_availability_rules, guide_blackout_dates, guide_balances, incidents, order_items,
-- orders, payment_events, payouts, refund_requests, soft_launch_controls
```

### Row count spot-checks
```sql
-- Activities (must be > 0)
SELECT count(*) FROM activities WHERE status = 'active';
-- Orders (should match pre-restore count ± expected new orders)
SELECT count(*), max(created_at) FROM orders;
-- Payments (most recent should be before restore point)
SELECT count(*), max(created_at) FROM payments;
-- Booking V2 (no orphan bookings)
SELECT count(*) FROM bookings WHERE order_id IS NULL AND status != 'abandoned';
-- Soft launch controls (flag states intact)
SELECT * FROM soft_launch_controls ORDER BY created_at DESC LIMIT 5;
```

### Integrity checks
```sql
-- No orphan order_items
SELECT count(*) FROM order_items oi LEFT JOIN orders o ON oi.order_id = o.id WHERE o.id IS NULL;
-- No orphan bookings
SELECT count(*) FROM bookings b LEFT JOIN orders o ON b.order_id = o.id WHERE o.id IS NULL AND b.status != 'abandoned';
-- Payment events reference valid payments
SELECT count(*) FROM payment_events pe LEFT JOIN payments p ON pe.payment_id = p.id WHERE p.id IS NULL;
```

### Verdict
- [ ] All expected tables present
- [ ] Activities count > 0
- [ ] Orders count matches expectation
- [ ] No orphan order_items
- [ ] No orphan bookings
- [ ] Payment events all reference valid payments
- [ ] soft_launch_controls intact

## When to Escalate

- Restore takes > 2 hours → page Wei immediately
- Smoke checks fail after restore → do NOT cut over, investigate delta
- Payment data missing → treat as P0, page Wei + Wei's bank contact

## Related

- Incident response: docs/05-business/07-operations-plan/04-incident-response.md
- Migration history: supabase/migrations/
- Drill template: docs/operations/drills/2026-05-24-supabase-restore-drill-template.md
- Dry-run preflight: scripts/ops/restore-drill-preflight.mjs
- References: #724, #594, #320, #529
