# Issue #168 — Phase 12 FK Hardening Runbook (Docs-only)

> Status: Active runbook for rollout execution
> Scope: Operational procedure only (no schema/data modification in this issue)

## 0) Canonical active FK contract (authoritative)

Current production precheck/validation must use the following contract:

- `bookings.order_id -> orders.id`
- `orders.booking_id -> bookings.id`
- `payments.order_id -> orders.id`

And explicitly:

- `payments.booking_id` is **NOT** the current production precheck contract.

## 1) Usage boundaries

This runbook is a bounded execution guide for Phase 12 FK hardening rollout readiness.

- ✅ Includes: precheck, backfill/normalization checklist, migration apply order, post-check, rollback guidance, go/no-go gate, staging vs production notes.
- ❌ Excludes: editing SQL migration files, changing constraints directly, writing/patching production data in this issue.

## 2) Precheck (must pass before any apply)

## 2.1 Environment and artifact preconditions

- Confirm target environment: `staging` or `production`.
- Confirm latest approved migration set/tag for Phase 12 hardening.
- Confirm observability dashboards are available before change window:
  - DB error rate / lock wait / deadlock / latency panels
  - booking/order/payment write failure rates
  - API 5xx and queue retry metrics

## 2.2 Schema contract precheck

- Validate that the canonical active contract in section 0 is what operators are checking.
- Ensure no precheck step treats `payments.booking_id` as active production contract.

## 2.3 Data quality precheck (read-only)

Run read-only checks for potential FK blockers:

- Orphan `bookings.order_id` rows (order missing)
- Orphan `orders.booking_id` rows (booking missing)
- Orphan `payments.order_id` rows (order missing)
- Nullability and malformed key distribution for the above active edges

Pass criteria:

- No unresolved orphan set that would fail FK validation/apply.
- Any known exceptions are explicitly documented with approved mitigation plan.

## 3) Backfill / normalization gate (before migration apply)

If precheck surfaces inconsistent rows, perform normalization/backfill via the approved data-fix path **before** applying hardening migration.

Required controls:

- All fixes must be idempotent and auditable.
- Keep before/after counts for each affected table.
- Keep a signed change record (operator, timestamp, environment, script/version reference).

Minimum evidence to record:

- total candidates
- fixed count
- remaining unresolved count
- rationale for unresolved rows (if any)

No-go if unresolved rows can still violate active FK apply/validation.

## 4) Migration apply order (operational sequence)

Use this fixed order during change window:

1. Freeze release window / announce maintenance guardrails.
2. Re-run read-only precheck snapshot (fresh counts right before apply).
3. Apply approved Phase 12 FK-hardening migration set in designated order from release artifact.
4. Run immediate post-apply verification (section 5).
5. Release gate decision: go / hold / rollback path.

Notes:

- Do not improvise migration ordering in production.
- If any step deviates, stop and reopen decision gate before continuing.

## 5) Post-check (must pass before go)

After apply, run:

- FK presence/validity checks for active contract edges in section 0
- Referential integrity read checks (same orphan classes as precheck)
- Application-level smoke checks:
  - booking creation/update flow
  - order linkage flow
  - payment write flow (`payments.order_id` path)
- Operational health checks:
  - API error budget trend stable
  - DB lock/latency within predefined SLO guardrails

Go criteria:

- Contract checks pass
- No blocker integrity regressions
- Application smoke checks pass
- Error/latency metrics within allowed range for stabilization window

## 6) Go / No-Go decision gate

### Go

Proceed when sections 2–5 all satisfy criteria and no critical alert is active.

### No-Go

Trigger no-go when any of the below occurs:

- precheck contract mismatch
- unresolved orphan/normalization blockers
- migration apply error or partial apply uncertainty
- post-check integrity/smoke failure
- elevated production risk signal (error surge/lock contention)

No-go action:

- stop rollout
- preserve evidence snapshot
- invoke rollback/forward-fix decision (section 7)

## 7) Rollback notes (explicit, honest)

Because FK hardening may involve constraint state transitions, rollback must be handled at **constraint-level** with explicit operator approval.

Guidance:

- Prefer **forward-fix** when safe and faster-to-recover (e.g., targeted data normalization then re-validate constraints).
- If rollback is required, use approved reverse steps for constraints/migration units; do not perform ad-hoc destructive changes.
- Record exact constraint/table impacted and revert status.
- Re-run post-rollback integrity + smoke checks before declaring service recovered.

Important:

- This runbook does not authorize direct schema/data edits by itself.
- Rollback execution must reference the approved migration artifact and change-management policy.

## 8) Staging vs Production behavior

## 8.1 Staging

- Can run dry-run and repeated validation cycles.
- Expect synthetic/partial data differences; document any false positives.
- Use staging to verify runbook timing and evidence template completeness.

## 8.2 Production

- Single controlled window with explicit go/no-go owner.
- Strictly read-only precheck until approved apply step.
- Higher bar for rollback trigger and incident communication.
- No unreviewed SQL/schema/data changes during execution.

## 9) Observability checklist

During rollout, monitor at minimum:

- DB: lock waits, deadlocks, replication lag (if any), query latency p95/p99
- App/API: 4xx/5xx, timeout rate, retry queue depth
- Domain counters: booking/order/payment write success/failure

Alert thresholds should be pre-agreed before window start and attached in change ticket.

## 10) Execution record template

For each run, capture:

- environment (`staging`/`production`)
- operator + reviewer
- artifact version / commit / migration bundle id
- precheck snapshot timestamp + result summary
- backfill/normalization evidence summary
- apply start/end times
- post-check results
- go/no-go decision + reason
- rollback/forward-fix actions (if any)
- incident/ref links

---

If this runbook conflicts with newer approved release governance, follow governance and update this doc in a subsequent docs change.
