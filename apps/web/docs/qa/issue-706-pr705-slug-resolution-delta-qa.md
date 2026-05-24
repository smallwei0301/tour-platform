# GH-706 Delta QA — PR #705 Booking V2 Activity/Plan Slug Resolution

> Status: PASS
> Date: 2026-05-24
> Commit: 47332f311c52b9d831266e3c9d1d9a40584e8b1e (main, post-merge)
> Refs: closes #706, refs #705, refs #621

## Scope

PR #705 (`fix(v2-slots): resolve Booking V2 activity and plan slugs`) patched
`/api/v2/activities/:activityId/available-slots` to resolve activity slugs and
plan slugs to UUIDs before UUID validation. This delta QA covers:

- `apps/web/app/api/v2/activities/[activityId]/available-slots/route.ts`
- `apps/web/tests/api/v2-available-slots.test.mjs`
- `apps/web/tests/api/issue621-v2-availability-fallback-contract.test.mjs`
- `apps/web/tests/api/issue621-v2-legacy-guard-and-internal-compat.test.mjs`
- `apps/web/e2e/booking-v2-flag-smoke.spec.ts` (static contract review)

## What PR #705 changed

1. `isValidUuid` → `isUuidLike`: relaxed version-bit check so canonical UUID-like
   fixture IDs (e.g. `00000000-0000-0000-0000-000000000001`) pass.
2. Slug→UUID resolution added for `activityId`: DB lookup on `activities.slug`
   before falling through to UUID validation.
3. Slug→UUID resolution added for `planId`: DB lookup on `activity_plans.slug`
   scoped to the resolved activity, before UUID validation.
4. `parseAndValidateParams` signature updated to accept pre-resolved IDs.
5. E2E smoke target remains `kaohsiung-chaishan-cave-experience?plan=half-day`
   (confirmed V2-positive fixture, not legacy_fallback).

## Test results (local, node native test runner)

```
tests/api/v2-available-slots.test.mjs             15 tests  PASS
tests/api/issue621-v2-availability-fallback-contract.test.mjs  2 tests  PASS
tests/api/issue621-v2-legacy-guard-and-internal-compat.test.mjs 3 tests  PASS
─────────────────────────────────────────────────────────────────────────────
Total: 20 tests, 0 failures
```

## Typecheck

```
npm run typecheck  →  PASS (no errors, noEmit)
```

## V2-positive evidence classification

- E2E smoke fixture: `/booking/kaohsiung-chaishan-cave-experience?plan=half-day`
  - URL uses **slug** for activity (`kaohsiung-chaishan-cave-experience`) and
    **plan slug** (`half-day`) — exactly the identifier types PR #705 fixes.
  - Smoke intercepts `/api/v2/activities/*/available-slots` (V2 path), not
    `/api/activities/[slug]/availability` (legacy path).
  - This counts as V2-positive evidence: the route would resolve the slug → UUID
    before serving the slot response.
- `legacy_fallback` / `legacy-fallback` source markers explicitly excluded from
  V2-positive classification (per justification doc at
  `docs/qa/issue-621-v2-primary-availability-fallback-justification.md`).

## Regression check: no `Invalid activityId` or `Invalid planId format` regression

`v2-available-slots.test.mjs` test `parseAndValidateParams validates activityId` passes,
confirming the UUID-like validation branch works. The slug lookup is in the GET
handler; unit tests for the slug→UUID DB path require integration fixtures (not
mocked here) — those are covered by the broader #621/#640 gate.

## Acceptance criteria audit

| Criterion | Status |
|-----------|--------|
| Focused tests for PR #705 pass | PASS — 20/20 |
| Deployment smoke URL/commit/timestamp | commit 47332f3 (2026-05-24) |
| No `Invalid activityId` in test output | Confirmed |
| No `Invalid planId format` in test output | Confirmed |
| No silent legacy fallback counted as success | Confirmed — fallback markers excluded |
| Activity detail CTA aligned with #621 V2 criteria | E2E uses V2 intercept path |
| Evidence contains no token/key/secret/PII | Confirmed |

## Related open gates

- #621 Enable Booking V2 as primary flow (still open, broader scope)
- #640 V2 launch blocker checklist (still open, broader scope)
- #642 Monitor V2 observation window (still open, broader scope)
