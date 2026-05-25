# Current Issue Priority Queue

Updated: 2026-05-26 CST (freshness-first routing refresh for GH-814)
Repo: `smallwei0301/tour-platform`

Purpose: make the current execution order obvious to Ava/Pandora/Anna/Una/Fiora/Rita and any GitHub/Kanban agent. When agents inspect an issue, they should combine this doc with GitHub labels and issue state. The canonical product/launch evidence still lives in each issue body, PRs, and QA reports.

## Agent routing labels vs business priority labels

- **Business priority labels (`priority:*`)** describe problem urgency in issue triage.
- **Agent routing labels (`agent:*`)** describe execution order in this doc and should never be treated as priority labels.
- Keep these concepts separate to avoid stale routing decisions.

- `priority:p0`: launch-blocking work.
- `priority:p1`: supporting readiness work.
- `agent:now`: the single issue that should be pulled first by default.
- `agent:next`: high-priority issue that can be prepared next.
- `agent:queued`: ordered launch/readiness queue; start only when prerequisites are satisfied.
- `agent:backlog`: important but not on current launch path.

## Current top pointer

**No hardcoded "Do #621 first" rule anymore.**

Before selecting work, run the stale-check below and only keep **OPEN** issues in the active path.

- If the open top candidate is `#621`, run it as `agent:now`.
- If `#621` is `CLOSED`, skip it and promote the next OPEN candidate from P0 to `agent:now`.
- Never treat closed issues (`#621`, `#639`, `#640`, `#641`) as active routing targets.

Current snapshot guidance: after this manual check, the next recommended `agent:now` is the first OPEN issue in the active P0 list (currently **`#642`** if still OPEN), with `agent:next` as the remaining active candidate.

## P0 / launch-blocking queue

1. **#619 — Unify V2 availability source of truth** ✅ `CLOSED` *(historical)*
   - Historical marker: this issue is complete and should stay read-only reference.

2. **#621 — Enable Booking/Availability V2 as primary traveler flow** ✅ `CLOSED` *(historical — do not route active agents)*
   - Historical marker: referenced as milestone history only; no active routing.

3. **#639 — Verify payment callback and booking/order/payment state chain** ✅ `CLOSED` *(historical — do not route active agents)*
   - Historical marker: referenced for rollback knowledge, not active execution.

4. **#640 — Execute V2 launch blocker checklist** ✅ `CLOSED` *(historical — do not route active agents)*
   - Historical marker: QA checklist updates moved to post-closure references only.

5. **#641 — Production rollback drill / operator handoff** ✅ `CLOSED` *(historical — do not route active agents)*
   - Historical marker: used for training/archive context; not active routing.

6. **#642 — Admin Go/No-Go dashboard and soft-launch control** `agent:now` *(OPEN — first active P0 candidate after stale-check)*
   - Prerequisite: launch-blocker evidence available and operator visibility is aligned.
   - Preferred routing: Pandora for readiness gate shape; Una/Admin UI; Anna for data aggregation; Rita for evidence review.
   - Done signal: Admin shows Go/Hold/No-Go state and operator decision path.

7. **#320 — Admin dashboard and soft-launch control** `agent:queued`
   - Prerequisite: P0 launch-blocking evidence from #642 and related launch checks.
   - Preferred routing: Pandora for readiness gate shape; Una/Admin UI; Anna for data aggregation; Rita review.
   - Done signal: Admin control panel reflects a clear go/no-go operator decision.


## P1 supporting readiness queue

These are important, but should not replace the active P0 pointer unless user or Ava explicitly switches focus.

1. **#602 — Sensitive-table RLS/grants preflight**
   - Security gate; can run in parallel if Anna has capacity.
2. **#607 — Production alert drill evidence**
   - Ops readiness gate; can run in parallel if it does not require destructive production actions.
3. **#630 — Refresh ECPay production runbooks after #627**
   - Supports #639 lineage and production ops.
4. **#605 — Finalize Andy Lee launch listing content/media**
   - Launch content readiness.
5. **#604 — Align public activity payment/refund copy**
   - Traveler trust/legal copy; bounded UI/docs fix.
6. **#637 — SEO/GEO/AEO optimization**
   - High-value launch optimization, after core booking/payment readiness.
7. **#644 / #633 / #500 — QA checklist consolidation**
   - #644 is the current delta after the 2026-05-20 cutoff.
   - #633 is the broader daily QA window.
   - #500 is the older regression index; use as historical context, not the default next issue.

## Stale-check protocol (repeatable)

Before starting any P0/P1 item, run this read-only check on all currently labeled queue entries:

```bash
for n in 619 621 639 640 641 642 320
do
  gh issue view "$n" --repo smallwei0301/tour-platform --json number,state,title,labels --jq '.number, .state, .title'
  # Fallback if gh auth is unavailable:
  # curl -fsSL "https://api.github.com/repos/smallwei0301/tour-platform/issues/$n"
done
```

Rule: if a listed issue is `CLOSED`, remove it from the active queue and move it into historical-marked context before dispatch.

## Snapshot freshness rule

- Any generated readiness snapshot (`npm run readiness:snapshot`) is an **input**, not ground truth.
- Always regenerate the snapshot and compare issue states before trusting top-pointer text.
- Never copy forward stale entries from prior snapshots without re-validating each `agent:*` item.
- If no active OPEN issue survives the stale-check, pause and escalate for explicit reroute.

## Rules for agents

1. `agent:now` should be on at most one OPEN issue at a time.
2. When an issue with `agent:now` closes, move `agent:now` to the next validated OPEN issue.
3. If no OPEN issue has `agent:now`, use `agent:next` or explicit priority+readiness validation first.
4. Keep this doc as a bounded snapshot. If stale-check fails, stop and update this file before starting.
5. Use Pandora when issue scope or split is unclear.
6. Use Anna for backend/API/payment/data work.
7. Use Una for frontend/UI/admin/traveler flow work.
8. Use Fiora for narrow bugfix/finalize/salvage only.
9. Use Rita for independent review before claiming completion.
10. After Fiora/Anna/Una changes, return to Rita; do not self-approve.
