# Supabase Restore Drill — [OPERATOR TO FILL: Date Asia/Taipei ISO8601]

**Parent issue:** #724 (operator-owned live drill)
**Prep issue:** #793 (agent-safe docs/templates/preflight only)
**Drill type:** [PITR / Logical Dump / Single-Table]
**Operator:** Wei
**Environment:** staging-restore (NOT production direct)
**Backup point:** [OPERATOR TO FILL: timestamp]
**Commit SHA at drill time:** [OPERATOR TO FILL: from /api/health or git rev-parse HEAD]

## Agent-filled prep status
- Preflight script present: `scripts/ops/restore-drill-preflight.mjs`
- Agent validation allowed: `node scripts/ops/restore-drill-preflight.mjs --dry-run`
- Live restore execution: `[OPERATOR TO FILL ONLY]`
- No live production restore executed as part of #793.

## Pre-drill checklist
- [ ] Confirm this run is for #724 live operator drill, not #793 prep
- [ ] Run `node scripts/ops/restore-drill-preflight.mjs` with non-production env/ref/url supplied by operator
- [ ] Maintenance mode enabled (no new writes during restore)
- [ ] Staging project provisioned
- [ ] Backup point selected and reason noted
- [ ] No production traffic impacted
- [ ] Target project/env explicitly confirmed non-production

## Drill execution log

| Step | Command/Action | Start time | End time | Result |
|------|---------------|------------|----------|--------|
| 1. Stop traffic | Set MAINTENANCE_MODE=1 | [TIME] | [TIME] | [PASS/FAIL] |
| 2. Identify backup | Dashboard → Backups | [TIME] | [TIME] | [PASS/FAIL] |
| 3. Trigger restore | Dashboard → Restore | [TIME] | [TIME] | [PASS/FAIL] |
| 4. Verify migrations | supabase db push | [TIME] | [TIME] | [PASS/FAIL] |
| 5. Smoke checklist | See §4 of runbook | [TIME] | [TIME] | [PASS/FAIL] |

## Smoke results (redacted)

[OPERATOR TO FILL: paste query results with row counts only, no PII, no payment data, no connection strings, no full transaction identifiers]

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
- [ ] Preflight confirmed non-production target before restore-like actions
- [ ] Runbook followed without deviation (or deviations noted above)

**GO / HOLD / FAIL**

## Sign-off
Operator: Wei
Date: [OPERATOR TO FILL]
