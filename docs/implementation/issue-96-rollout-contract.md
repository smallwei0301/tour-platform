# Issue #96 — Booking V2 Rollout Contract (Implementation Artifact v2)

Status: Draft for architecture sanity-check (round 2/3)
Owner: Tracy
Related issues: #96, #103, #104, #75, #105

---

## 1) Rollout Phase Contract (B1 / B2 / B3)

### B1 — Contract Stabilization
**Goal**: Freeze API contract + state semantics before UI migration.

**In scope**
- Route-level contract for:
  - `GET /api/v2/activities/:activityId/available-slots`
  - `POST /api/v2/bookings/draft`
  - `POST /api/v2/bookings/:bookingId/checkout`
- Error envelope consistency (`VALIDATION_ERROR`, `NOT_FOUND`, `INTERNAL_ERROR`, etc.)
- Route-level smoke test guardrails

**Out of scope**
- Full booking page rewrite
- Traffic cutover

**Exit criteria**
- Contract doc + smoke tests merged
- Error code mapping stable and referenced by frontend

**B1 smoke gate checklist (explicit)**
- [ ] available-slots invalid query => `VALIDATION_ERROR` envelope
- [ ] draft invalid body => `VALIDATION_ERROR` envelope
- [ ] checkout invalid bookingId => `VALIDATION_ERROR` envelope
- [ ] success envelope shape stable for all three routes
- [ ] no route-level contract drift against documentation

---

### B2 — Controlled UI Integration Behind Flag
**Goal**: Integrate Booking V2 UI path without breaking legacy.

**In scope**
- Feature-flagged V2 entry (`NEXT_PUBLIC_BOOKING_V2_ENABLED`)
- Minimal V2 happy path:
  1. available-slots
  2. draft create
  3. checkout init
- Fallback path when V2 path errors
- **Minimum #75 subset as B2 exit gate**:
  - availability/draft/checkout loading states
  - non-silent error boundary + retry affordance
  - success/failure/submitting state distinction

**Out of scope**
- Full parity migration for every legacy edge case
- 100% traffic switch
- Full #75 hardening scope (can continue after B2 as incremental quality work)

**Exit criteria**
- Flag OFF = legacy path unchanged
- Flag ON = V2 MVP path usable
- Fallback action available and trackable
- #75 minimum subset above is merged and verified

**Critical behavior rule**
- V2 failure must **not silently fallback** to legacy.
- User must see explicit V2 error state and a deliberate fallback action.

---

### B3 — Operational Rollout Readiness
**Goal**: Make V2 observable + reversible + progressively rollable.

**In scope**
- Metrics dashboard contract and data source (#103)
- Rollback switch and drill runbook (#104)
- Progressive rollout policy (canary -> 25% -> 50% -> 100%)
- Optional daily go/no-go report automation (#105)

**Out of scope**
- Unrelated optimization tracks (#82/#83/#84/#85)

**Exit criteria**
- On-call can decide GO/HOLD/ROLLBACK with shared metrics
- Rollback drill proven repeatable in non-prod
- Cutover policy documented and executable

---

## 2) Feature Flag Boundary + Rollout Control Plane

## Binary gate flag (runtime switch)
- `NEXT_PUBLIC_BOOKING_V2_ENABLED`

## Rollout dimension (traffic split)
- `rollout_variant`: `legacy | v2`

## Control plane decision source
- Server-side assigner (or edge middleware) decides variant by deterministic key (user/session hash).
- Assignment persisted for session consistency.
- Dashboard reads `rollout_variant` from telemetry.

## Rollout stages (B3)
- Stage 0: canary (0~5%)
- Stage 1: 25%
- Stage 2: 50%
- Stage 3: 100%

## Entry points
- Booking route: `/booking/[activityId]`
  - `flag=false` -> `BookingInnerLegacy`
  - `flag=true` + `rollout_variant=legacy` -> legacy path
  - `flag=true` + `rollout_variant=v2` -> V2 path

## Exit points / fallback boundaries
- Missing `plan` in V2 path -> explicit fallback CTA to legacy
- available-slots failure in V2 -> explicit fallback CTA to legacy
- draft/checkout reject in V2 -> stay on V2 with actionable error + optional fallback

## Rollback precedence (must be deterministic)
1. Emergency rollback: set `NEXT_PUBLIC_BOOKING_V2_ENABLED=false` (global hard override)
2. Stage rollback: reduce rollout stage percentage (100->50->25->canary)
3. V2 local fallback: user-triggered CTA on explicit error state

## Non-negotiable boundary rule
- Flag OFF must preserve existing legacy behavior contract.
- Flag ON must not remove rollback path.

---

## 3) Acceptance Matrix

| Gate | B1 | B2 | B3 |
|---|---|---|---|
| **Callback safety** (`/api/payments/ecpay/callback`) | No behavior change allowed | No behavior change allowed | Monitored + rollback threshold bound |
| **Oversell protection** (`insufficient_capacity` / `schedule_not_open`) | Semantics unchanged | Semantics unchanged under flag-on path | Monitored + rollback threshold bound |
| **Smoke gate** (route/UI) | Route contract smoke pass | Flag-off legacy smoke + flag-on MVP smoke + #75 minimum subset | Rollout smoke + rollback drill pass |
| **Error contract consistency** | Required | Required | Required + monitored |
| **Fallback availability** | N/A | Required (explicit CTA + event) | Required and monitored |

### Release-blocking invariants
- Callback behavior cannot regress.
- Oversell protection semantics cannot regress.
- If either invariant regresses, rollout is blocked (no phase advance).

### Hard blockers (cannot advance phase)
- Any callback/oversell semantic regression
- Smoke gate red
- Flag-off legacy behavior changed
- Missing explicit fallback (silent fallback is blocker)

---

## 4) Execution Checklist (Definition of Done by Phase)

### DoD — B1
- [ ] API contract doc merged
- [ ] Route-level smoke tests merged
- [ ] Error code mapping frozen for frontend consumption
- [ ] B1 smoke checklist all pass
- [ ] No unresolved contract ambiguity in issue thread

### DoD — B2
- [ ] Flag boundary implemented and verified (`OFF` legacy / `ON` V2 MVP)
- [ ] V2 fallback path implemented for missing plan + API failure (explicit UI action)
- [ ] Loading/error UX minimum subset (#75) merged for availability/draft/checkout
- [ ] Event instrumentation present for:
  - `booking_page_view` (+ `rollout_variant`)
  - `booking_v2_fallback_clicked`
- [ ] No silent fallback behavior

### DoD — B3
- [ ] Dashboard contract and first data source script merged (#103)
- [ ] Rollback runbook + one non-prod drill evidence merged (#104)
- [ ] Rollout control-plane policy merged (stage assignment + rollback precedence)
- [ ] (Optional) daily go/no-go report skeleton merged (#105)

---

## 5) Sequencing Rule (Enforced)
1. #96 contract artifact (this doc)
2. #103 metrics/dashboard
3. #104 rollback/drill
4. #75 minimum subset as B2 gate (full #75 hardening can continue after B2)
5. #105 daily report automation (only after 2+3 are stable)

No side-track work on availability optimization issues in this execution lane unless escalated as blocker.


---

## #96 Unified Rollout Gate (2026-04-20)

This document follows the same decision gate for #96 switch-over:

- **GO**
  - booking V2 happy path pass (slots -> draft -> checkout)
  - no regression on payment callback / oversell protections
  - smoke + manual evidence complete and reproducible
- **HOLD**
  - evidence incomplete, or KPI/QA data inconclusive
  - non-blocking defects exist without rollback trigger
- **ROLLBACK**
  - checkout/payment critical failure, or oversell/integrity risk
  - security/compliance blocker impacting booking conversion path
- **Legacy cleanup preconditions**
  - GO decision sustained for at least one full observation window
  - rollback runbook drill + go/no-go packet confirmed
  - legacy path removal has explicit owner + rollback fallback
