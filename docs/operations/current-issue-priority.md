# Current Issue Priority Queue

Updated: 2026-05-26 CST (GH-814 live-readiness refresh)

Repo: `smallwei0301/tour-platform`

## Purpose
This is a bounded routing snapshot for this run only. Agents should treat this file as a starting point and re-check live GitHub state before dispatching work.

## Live-source requirements
- Canonical launch/readiness state: `gh issue view 814 --repo smallwei0301/tour-platform`
- Issue-body intent source: open refs listed there
- Live issue state/labels source: `gh issue view <n> --repo smallwei0301/tour-platform --json number,state,title,labels`

If live checks cannot run, stop routing and ask for unblock.

## Agent routing labels vs business priority labels

- **Business priority labels (`priority:P0`, `priority:P1`, `priority:P2`)** describe triage urgency.
- **Agent routing labels (`agent:*`)** describe execution order.
- Keep these concepts separate.

- `agent:now`: first validated issue to start when scope is stable.
- `agent:next`: second issue after `agent:now`.
- `agent:queued`: ordered follow-up when prerequisites are satisfied.
- `agent:backlog`: support work.

## Current top pointer

Closed launch-blocking items are historical-only. Current live-check shows no open `priority:P0` issue in active launch blocking.

- No open `P0` remains active today.
- Historical note: `#621` was the prior top-priority open issue referenced by the original agent-routing contract, but it is now CLOSED and must not be routed as active work.
- `agent:now` should be the first validated OPEN issue in `P1`/`P2` queues.
- As of this snapshot, `#642` is the first active candidate.

## Agent Routing Invariants

- `agent:now` should be assigned to at most one OPEN issue at a time.
- Closed or historical issues must not be treated as active routing targets.
- Agents must re-check live GitHub state before dispatch because this file is a bounded snapshot.
- Business priority labels (`priority:*`) and execution routing labels (`agent:*`) are separate signals and must both be reflected accurately.

## P1 / launch-blocking and immediate-readiness queue

1. **#642 — [Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch** `agent:now`
   - State: OPEN
   - Labels: `priority:P1`, `agent:queued`
   - Routing: first candidate after live stale-check; launch-readiness evidence and safety controls are required before proceeding.
   - Done signal: observation-window monitoring is producing regular alerts and fallback coverage with no regression.

2. **#714 — [Ops] Execute production alert drill and fill evidence skeleton** `agent:next`
   - State: OPEN
   - Labels: `priority:P1`, `agent:queued`
   - Routing: run immediately after #642 is validated for the same run.
   - Done signal: alert drill evidence and sign-off attached to issue.

3. **#605 — [Ops] Finalize Andy Lee launch listing content and media before public booking** `agent:backlog`
   - State: OPEN
   - Labels: `priority:P1`, `agent:backlog`
   - Status blocker: `needs-info` in issue labels.

4. **#319 — [Ops] Run customer support SOP first-case drill follow-through** `agent:backlog`
   - State: OPEN
   - Labels: `priority:P1`, `agent:backlog`

5. **#318 — [Ops] Run Andy Lee first-guide onboarding demo and retrospective scope** `agent:backlog`
   - State: OPEN
   - Labels: `priority:P1`, `agent:backlog`

## P2 / launch support queue

1. **#320 — [Ops] Implement pre-launch readiness gate, soft-launch control, and Admin Go/No-Go dashboard** `agent:queued`
   - State: OPEN
   - Labels: `priority:P2`, `agent:queued`
   - Routing: support issue; active only after readiness blockers are under control.

2. **#594 — [Ops] Define and drill Supabase backup/restore runbook before soft launch** `snapshot-only`
   - State: OPEN
   - Labels: `priority:P2`
   - Routing: no live `agent:*` label is present. Keep as snapshot-only and re-validate live routing before assigning an active route.

3. **#724 — [Ops] Execute live Supabase restore drill and fill evidence template** `agent:backlog`
   - State: OPEN
   - Labels: `priority:P2`, `agent:backlog`, `status:blocked`
   - Routing: backlog support only until unblocked; do not queue for active execution while `status:blocked`.

4. **#685 — [Ops] Add third-party synthetic monitor after soft launch** `agent:backlog`
   - State: OPEN
   - Labels: `priority:P2`, `agent:backlog`, `status:blocked`
   - Routing: backlog support only until `status:blocked` is cleared.

5. **#797 — [Decision] Confirm incident regulatory reporting and compliance sign-off** `agent:human-decision`
   - State: OPEN
   - Labels: `priority:P2`, `owner:human-decision`, `status:needs-decision`
   - Routing: human-decision/approval gate item. Not executable backlog while `status:needs-decision`.

## Historical/archived entries (non-routing)

- #621 — `[Traveler Booking] Enable Booking/Availability V2 as primary traveler flow` *(CLOSED)*
- #639 — Verify payment callback and booking/order/payment state chain *(CLOSED)*
- #640 — Execute V2 launch blocker checklist *(CLOSED)*
- #641 — Production rollback drill / operator handoff *(CLOSED)*
- #813 — `[QA] Post-PR #805–#812 soft-launch / maintenance / SEO-a11y regression pass` *(CLOSED)*

## Stale-check protocol (repeatable)

Before dispatch, verify every issue in this doc that is marked routing-active or queued.

```bash
for n in 642 714 605 594 319 318 320 724 685 797 621 639 640 641 813
 do
   gh issue view "$n" --repo smallwei0301/tour-platform \
     --json number,state,title,labels \
     --jq '{num:.number,state:.state,title:.title,labels:(.labels|map(.name))}'
 done
```

Rule:
- If a listed issue is `CLOSED`, keep it in the historical section and remove it from active routing order.
- If a listed issue is `OPEN`, ensure its `priority:*` and `agent:*` labels are reflected in the active list before routing.

If any mapped labels/states changed since this snapshot, update this doc before dispatch.

## Rules for agents

1. `agent:now` should be at most one issue.
2. `agent:now` moves only after live stale-check passes.
3. Do not treat historical entries as active routing targets.
4. Keep this file bounded and update it when live GH state for tracked issues changes.
5. After any fix/finalize, return to Rita for independent review.
