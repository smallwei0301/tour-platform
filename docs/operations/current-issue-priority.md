# Current Issue Priority Queue

Updated: 2026-05-22 CST (agent routing label audit — issue #657)
Repo: `smallwei0301/tour-platform`

Purpose: make the current execution order obvious to Ava/Pandora/Anna/Una/Fiora/Rita and any GitHub/Kanban agent. When agents inspect an issue, they should treat GitHub comments/labels plus this file as the current routing hint. The canonical product/launch evidence still lives in each issue body, PRs, and QA reports.

## Agent routing labels

- `agent:now`: the single issue that should be pulled first by default.
- `agent:next`: high-priority issue that can be prepared next, but should not overtake `agent:now` unless explicitly assigned or it is independent QA/evidence work.
- `agent:queued`: ordered launch/readiness queue; start only when prerequisites are satisfied or Ava explicitly routes it.
- `agent:backlog`: important but not the current launch-blocking path.

## Current top pointer

**Do #621 first.**

Reason: #619 (Unify V2 availability source of truth) is now CLOSED. #621 is the next V2 launch item — enabling Booking/Availability V2 as the primary traveler flow. Prerequisites (#619) are satisfied.

> Note: Agent routing labels (`agent:now`/`agent:next`) should only be on open issues. When an issue is closed, the label must be moved to the next intended open issue. If you see `agent:now` on a closed issue, that is a stale label — remove it and act on the live open state instead.

## P0 / launch-blocking queue

1. **#619 — Unify V2 availability source of truth** ✓ CLOSED
   - Previous label: `agent:now` (removed — issue is closed)
   - Done signal met: public activity availability, V2 booking slots, guide rules/blackouts, and admin schedule planning no longer drift.

2. **#621 — Enable Booking/Availability V2 as primary traveler flow**
   - Current label: `agent:now` (promoted; was `agent:next` — #619 prerequisite is now closed)
   - Prerequisites: #619 CLOSED ✓; #639 should have at least safe callback/state evidence or an explicit accepted blocker.
   - Preferred routing: Pandora if rollout plan needs tightening; Una for traveler flow / flag / UX; Anna for API/fallback contract; Rita review.
   - Done signal: production/preview default traveler path uses V2 with explicit legacy fallback.

3. **#639 — Verify payment callback and booking/order/payment state chain**
   - Current label: `agent:next`
   - Can run in parallel with #621 if a QA/backend agent has a safe V2 fixture.
   - Preferred routing: Anna for payment/state/API verification; Rita for evidence review.
   - Done signal: callback happy path, idempotency, failed/invalid callback safety, and booking/order/payment state transitions have reproducible evidence.

4. **#640 — Execute V2 launch QA blocker checklist**
   - Current label: `agent:queued`
   - Prerequisites: #619, #639, and #621 implementation evidence.
   - Preferred routing: Rita/QA first; Fiora only for narrow fixes found by QA; then Rita re-review.
   - Done signal: launch QA report under `docs/qa/reports/` says GO or PASS with accepted non-blocking risks.

5. **#320 — Admin Go/No-Go dashboard and soft-launch control**
   - Current label: `agent:queued`
   - Prerequisite: launch-blocker evidence from #619/#639/#640.
   - Preferred routing: Pandora for readiness gate shape; Una/Admin UI; Anna for data aggregation; Rita review.
   - Done signal: Admin shows Go/Hold/No-Go state with clear readiness items and operator decision path.

6. **#641 — Production rollback drill / operator handoff**
   - Current label: `agent:queued`
   - Prerequisite: V2 primary path is ready enough for rollback drill to be meaningful.
   - Preferred routing: Pandora/Ops plan; Rita evidence review.
   - Done signal: rollback runbook/evidence proves operator can execute within target and knows escalation.

7. **#642 — Post-launch observation window and legacy fallback guard**
   - Current label: `agent:queued`
   - Prerequisite: V2 default launch has happened.
   - Preferred routing: Ava/Rita monitoring and evidence review.
   - Done signal: 7-day observation report and legacy fallback cleanup gate.

## P1 supporting readiness queue

These are important, but should not replace #621 as the default next issue unless the user or Ava explicitly switches focus.

1. **#602 — Sensitive-table RLS/grants preflight**
   - Security gate; can run in parallel if Anna has capacity.
2. **#607 — Production alert drill evidence**
   - Ops readiness gate; can run in parallel if it does not require destructive production actions.
3. **#630 — Refresh ECPay production runbooks after #627**
   - Supports #639 and production ops.
4. **#605 — Finalize Andy Lee launch listing content/media**
   - Launch content readiness.
5. **#604 — Align public activity payment/refund copy**
   - Traveler trust/legal copy; relatively bounded UI/docs fix.
6. **#637 — SEO/GEO/AEO optimization**
   - High-value launch optimization, but after core booking/payment readiness.
7. **#644 / #633 / #500 — QA checklist consolidation**
   - #644 is the current delta after the 2026-05-20 cutoff.
   - #633 is the broader daily QA window.
   - #500 is the older regression index; use it as historical context, not the default next work item.

## Agent Routing Invariants

1. `agent:now` should be on at most one OPEN issue at a time.
2. When an issue with `agent:now` closes, the label must be moved to the next intended open issue.
3. If no open issue has `agent:now`, the agent should look for `agent:next` or use issue priority/labels.
4. The live-state snapshot (`npm run readiness:snapshot`) should be checked before acting on stale priority docs.

## Rules for agents

- If no explicit issue is assigned, start from `agent:now` (#621).
- Do not start queued issues just because they are open; check prerequisites above.
- If a later issue is independently safe and small, report why it is parallel-safe before starting.
- Use Pandora when issue scope or split is unclear.
- Use Anna for backend/API/payment/data work.
- Use Una for frontend/UI/admin/traveler flow work.
- Use Fiora for narrow bugfix/finalize/salvage only.
- Use Rita for independent review before claiming completion.
- After Fiora/Anna/Una changes, return to Rita; do not self-approve.
