# Supabase Restore Drill — [OPERATOR TO FILL: Date Asia/Taipei ISO8601]

**Drill type:** [PITR / Logical Dump / Single-Table]
**Operator:** Wei
**Environment:** staging-restore (NOT production direct)
**Backup point:** [OPERATOR TO FILL: timestamp]
**Commit SHA at drill time:** [OPERATOR TO FILL: from /api/health or git rev-parse HEAD]

## Pre-drill checklist
- [ ] Maintenance mode enabled (no new writes during restore)
- [ ] Staging project provisioned
- [ ] Backup point selected and reason noted
- [ ] No production traffic impacted

## Drill execution log

| Step | Command/Action | Start time | End time | Result |
|------|---------------|------------|----------|--------|
| 1. Stop traffic | Set MAINTENANCE_MODE=1 | [TIME] | [TIME] | [PASS/FAIL] |
| 2. Identify backup | Dashboard → Backups | [TIME] | [TIME] | [PASS/FAIL] |
| 3. Trigger restore | Dashboard → Restore | [TIME] | [TIME] | [PASS/FAIL] |
| 4. Verify migrations | supabase db push | [TIME] | [TIME] | [PASS/FAIL] |
| 5. Smoke checklist | See §4 of runbook | [TIME] | [TIME] | [PASS/FAIL] |

## Smoke results (redacted)

[OPERATOR TO FILL: paste query results with row counts only, no PII, no payment data]

Example:
- activities (active): N rows ✅
- orders: N rows, latest at [date only, no time] ✅
- No orphan order_items: 0 ✅

## Total restore time
[OPERATOR TO FILL: minutes from Step 1 start to smoke checklist complete]

**Within RTO target (≤ 4 hours):** YES / NO / HOLD

## Blockers encountered
[OPERATOR TO FILL: any blockers, missing permissions, unexpected errors]

## Verdict
- [ ] Smoke checklist passed
- [ ] RTO met (≤ 4 hours)
- [ ] No secrets/PII/payment data in this document
- [ ] Runbook followed without deviation (or deviations noted above)

**GO / HOLD / FAIL**

## Sign-off
Operator: Wei
Date: [OPERATOR TO FILL]
