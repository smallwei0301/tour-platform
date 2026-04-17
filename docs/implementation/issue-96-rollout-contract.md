# Issue #96 — Booking V2 Rollout Contract (Implementation Artifact v1)

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

---

### B2 — Controlled UI Integration Behind Flag
**Goal**: Integrate Booking V2 UI path without breaking legacy.

**In scope**
- Feature-flagged V2 entry (`NEXT_PUBLIC_BOOKING_V2_ENABLED`)
- Minimal V2 happy path:
  1. available-slots
  2. draft create
  3. checkout init
- Fallback path to legacy when V2 path errors
- Loading/error UX guardrails for key async steps (#75 scope subset)

**Out of scope**
- Full parity migration for every legacy edge case
- 100% traffic switch

**Exit criteria**
- Flag OFF = legacy path unchanged
- Flag ON = V2 MVP path usable
- Fallback action available and trackable

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

## 2) Feature Flag Boundary (Legacy/V2 Entry-Exit Points)

## Flag
- `NEXT_PUBLIC_BOOKING_V2_ENABLED`

## Entry points
- Booking route: `/booking/[activityId]`
  - `flag=false` -> `BookingInnerLegacy`
  - `flag=true` -> `BookingInnerV2...`

## Exit points / fallback boundaries
- Missing `plan` parameter in V2 path -> fallback CTA to legacy
- available-slots failure in V2 -> fallback CTA to legacy
- draft/checkout reject in V2 -> stay on V2 with actionable error + optional fallback to legacy

## Non-negotiable boundary rule
- Flag OFF must preserve existing legacy behavior contract.
- Flag ON must not remove rollback path.

---

## 3) Acceptance Matrix

| Gate | B1 | B2 | B3 |
|---|---|---|---|
| **Callback safety** (`/api/payments/ecpay/callback`) | No behavior change allowed | No behavior change allowed | Monitored in rollout dashboard |
| **Oversell protection** (`insufficient_capacity` / `schedule_not_open`) | Must remain semantically unchanged | Must remain semantically unchanged under flag-on path | Alert + rollback trigger thresholds defined |
| **Smoke gate** (route/UI) | Route contract smoke pass | Flag-off legacy smoke pass + flag-on MVP smoke pass | Rollout smoke + rollback drill pass |
| **Error contract consistency** | Required | Required | Required + monitored |
| **Fallback availability** | N/A | Required (UI fallback button + event) | Required and monitored |

### Hard blockers (cannot advance phase)
- Any callback/oversell semantic regression
- Smoke gate red
- Flag-off legacy behavior changed

---

## 4) Execution Checklist (Definition of Done by Phase)

### DoD — B1
- [ ] API contract doc merged
- [ ] Route-level smoke tests merged
- [ ] Error code mapping frozen for frontend consumption
- [ ] No unresolved contract ambiguity in issue thread

### DoD — B2
- [ ] Flag boundary implemented and verified (`OFF` legacy / `ON` V2 MVP)
- [ ] V2 fallback path implemented for missing plan + API failure
- [ ] Loading/error UX states defined for availability/draft/checkout
- [ ] Event instrumentation present for:
  - `booking_page_view` (+ `rollout_variant`)
  - `booking_v2_fallback_clicked`

### DoD — B3
- [ ] Dashboard contract and first data source script merged (#103)
- [ ] Rollback runbook + one non-prod drill evidence merged (#104)
- [ ] Progressive rollout policy merged
- [ ] (Optional) daily go/no-go report skeleton merged (#105)

---

## 5) Sequencing Rule (Enforced)
1. #96 contract artifact (this doc)
2. #103 metrics/dashboard
3. #104 rollback/drill
4. #75 booking UI loading/error quality gate
5. #105 daily report automation (only after 2+3 are stable)

No side-track work on availability optimization issues in this execution lane unless escalated as blocker.
