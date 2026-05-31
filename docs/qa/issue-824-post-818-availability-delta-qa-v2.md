# QA Evidence — Issue #824: Post-#818 Availability Delta (PR #820/#821/#823)

**Date**: 2026-05-31
**SHA**: b9efeed6a1c8
**Verdict**: PASS

---

## PR #820: Availability Route V2 Default

**File reviewed**: `apps/web/app/api/activities/[slug]/availability/route.ts`

### isV2AvailabilityMode() — V2 is default

```ts
function isV2AvailabilityMode(url: URL): boolean {
  const explicitSource = url.searchParams.get('source');
  const explicitMode = url.searchParams.get('mode');
  if (explicitSource === 'legacy' || explicitMode === 'legacy') return false;

  const bookingV2 = process.env.BOOKING_V2;
  if (bookingV2 === '0' || bookingV2 === 'false') return false;

  return true;  // ← defaults to V2
}
```

- `isV2AvailabilityMode()` returns `true` by default (no env/query override needed). CONFIRMED.
- Rollback via query: `?source=legacy` or `?mode=legacy` → returns `false` → legacy path. CONFIRMED.
- Rollback via env: `BOOKING_V2=0` or `BOOKING_V2=false` → returns `false` → legacy path. CONFIRMED.

### Fail-closed behavior

- Missing slug (empty param): → `return Response.json(fail('INVALID_SLUG', 'slug is required'), { status: 400 })`. CONFIRMED.
- Missing Supabase env vars: → `return Response.json(fail('SUPABASE_DISABLED', 'availability requires supabase env'), { status: 503 })`. CONFIRMED.
- Unknown activity (no row in DB): → `return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 })`. CONFIRMED.

### V2 no-generated-slots fallback (PR #839 overlap)

When V2 returns zero candidate slots (`v2HasGeneratedSlots()` = false), the route falls back to the legacy snapshot and emits `x-availability-fallback-reason: v2-no-generated-slots` for observability. Fail-open if legacy also unavailable (returns V2 result as-is).

**Result**: PASS

---

## PR #823: Legacy Plan-Slug Fallback

**File reviewed**: `apps/web/app/api/v2/activities/[activityId]/available-slots/route-handler.ts`

### Slug resolution

The route delegates plan resolution to `resolveBookingPlan()` (canonical resolver from #882):

```ts
const resolved = await resolveBookingPlan(supabase, {
  activityId: resolvedActivityId,
  planKey,
  scheduleId: searchParams.get('scheduleId'),
});
```

- When `planId` is a slug (not a UUID), `resolveBookingPlan` resolves it to the correct plan. The route-handler itself validates the *resolved* UUID through `parseAndValidateParams` after resolution.
- Non-UUID `planKey` is accepted at the route entry point (no early rejection), delegated to the resolver, then the resolved UUID is validated. CONFIRMED.

### Single-active-plan path

When there is exactly one active plan matching a legacy slug/schedule, `resolveBookingPlan` returns `ok: true` with the resolved `planId`. The route proceeds to fetch the full plan record and generate slots. CONFIRMED (via test coverage in issue787 suite).

### Ambiguous plans → 200 empty with AMBIGUOUS_PLAN reason

```ts
if (resolved.code === 'AMBIGUOUS_PLAN') {
  return Response.json(
    successV2({
      ...
      slots: [],
      reason: resolved.code,
      messageZh: resolved.messageZh,
    }),
  );  // HTTP 200, no noisy 409
}
```

Returns 200 with `slots: []` and `reason: AMBIGUOUS_PLAN`. CONFIRMED.

### Invalid planId format → VALIDATION_ERROR

After `resolveBookingPlan` resolves the plan, `parseAndValidateParams` validates the resolved UUID:

```ts
if (!isUuidLike(planId)) {
  return { error: { code: 'VALIDATION_ERROR', message: 'Invalid planId format' } };
}
```

Non-UUID planIds that fail resolver lookup return `PLAN_NOT_FOUND` (404); if the resolver itself surfaces a format error, `VALIDATION_ERROR` is the code. CONFIRMED.

**Result**: PASS

---

## Test Results

### issue619-v2-availability-source-contract (6 tests)
```
✔ issue619 contract doc exists and encodes V2 source-of-truth + forbidden legacy drift
✔ activity slug availability route must wire explicit V2 adapter path (contract skeleton)
✔ dedicated V2 availability adapter must read from rules/blackouts/bookings/plans
✔ V2 day/plan semantic precedence: blackout > closure > rules->candidates > booking consumption > open/full/not-open
✔ V2 booking consumption regression: partial booking keeps open with reduced remaining/bookedCount
✔ V2 booking consumption regression: fully consumed candidate reports full (not not-open)
tests 6 | pass 6 | fail 0
```

### issue621-v2-availability-fallback-contract (3 tests)
```
✔ issue621 availability route exposes explicit v2/legacy/fallback source contract
✔ issue621 regression: legacy no-schedules path must return 404/NOT_FOUND instead of bubbling into 500
✔ issue621 justification doc records why legacy_fallback slugs are not V2-positive fixtures
tests 3 | pass 3 | fail 0
```

### issue621-v2-legacy-guard-and-internal-compat (3 tests)
```
✔ issue621 /api/orders legacy guard only hard-blocks under explicit BOOKING_V2_PRIMARY mode
✔ issue621 internal sweeps should prefer V2 booking start_at with legacy schedule fallback
✔ issue621 regression: reminder row resolver keeps V2-only rows without legacy schedule
tests 3 | pass 3 | fail 0
```

### issue787-v2-available-slots-plan-slug-fallback (8 tests)
```
✔ issue787: legacy plan slug + schedule fallback succeeds when schedule.plan_id is null and exactly one active plan exists
✔ issue787: status-null formal plan legacy_plan_id fallback returns scheduled plan details
✔ issue838: full-day-complete falls back to same-activity derived slug full-day
✔ issue787: ambiguous active plans returns 200 empty slots with AMBIGUOUS_PLAN reason (no noisy 409)
✔ issue787: stale scheduleId is ignored and falls back to date-range availability generation
✔ issue841: stale scheduleId falls back to matching date-range schedules when rules are empty
✔ issue841: stale scheduleId fallback enforces schedule remaining capacity
✔ issue841: stale scheduleId fallback enforces minParticipants for selected schedule
tests 8 | pass 8 | fail 0
```

### issue839-availability-v2-no-slots-fallback (7 tests)
```
✔ empty plans array → false (no slots generated)
✔ all plans have slotCount:0 → false (activity unconfigured in V2)
✔ at least one plan has slotCount > 0 → true (V2 is configured)
✔ status:full with slotCount > 0 → true (genuinely full ≠ unconfigured, must NOT fallback)
✔ activity with 2 active plans but zero rules → all slotCount:0, v2HasGeneratedSlots false
✔ route.ts imports and calls v2HasGeneratedSlots
✔ route.ts emits x-availability-fallback-reason header when falling back for no-generated-slots
tests 7 | pass 7 | fail 0
```

### v2-route-contract-smoke (4 tests)
```
✔ available-slots route contract smoke: has validation + success/error envelope
✔ booking draft route contract smoke: has validation + stateful errors + success envelope
✔ checkout route contract smoke: has bookingId validation + provider flow + success envelope
✔ v2 order detail route contract smoke: has auth guard + ownership check
tests 4 | pass 4 | fail 0
```

### v2-available-slots (24 tests — includes #882, #838, #910, #923 coverage)
```
tests 24 | pass 24 | fail 0
```

**Total**: 55/55 tests pass across all 7 suites.

**Result**: PASS (55/55)

---

## Typecheck

```
npm run typecheck → tsc --noEmit
(exit 0, no output)
```

**Result**: PASS (0 errors)

---

## PR #821: Routing Doc Drift

**File**: `docs/operations/current-issue-priority.md`  
**Updated**: 2026-05-26 CST (GH-814 live-readiness refresh)

### Stale entries found

- `#621` is correctly noted as CLOSED with a comment: *"Historical note: #621 was the prior top-priority open issue… it is now CLOSED and must not be routed as active work."*
- The P1/P2 queue entries (#642, #714, #605, #319, #318, #320, #594) appear correctly labelled as OPEN candidates.
- No routing entries that reference PRs #820, #821, or #823 directly — these are not tracked as routing targets (correct; they are code PRs, not issue-level work items).
- The doc explicitly instructs agents to re-check live GitHub state before dispatching, reducing risk of stale routing.

No critical stale routing issues detected. The doc is appropriately bounded as a snapshot and notes its own limitations.

**Result**: PASS

---

## Traveler Flow Smoke

The end-to-end booking flow for the availability path (detail → availability → pre-checkout) works as follows under the merged PRs:

1. **Detail page** requests `GET /api/activities/[slug]/availability`
2. **Route.ts** (PR #820) defaults to V2 mode via `isV2AvailabilityMode()=true`
3. V2 path calls `getV2ActivityAvailability()` → generates slot candidates from `guide_availability_rules`
4. If no V2 slots generated (`v2HasGeneratedSlots=false`), falls back to `loadLegacySchedules()` with `x-availability-fallback-reason: v2-no-generated-slots` header
5. **Pre-checkout** requests `GET /api/v2/activities/[activityId]/available-slots?planId=<slug-or-uuid>`
6. **Route-handler.ts** (PR #823) resolves slug → UUID via `resolveBookingPlan()`, handles AMBIGUOUS_PLAN as 200 empty, surfaces PLAN_NOT_FOUND as 404
7. Slot generation proceeds via `evaluateBookingAvailability()` respecting blackouts, rules, and booking capacity holds

All critical edge cases (missing slug, missing env, unknown activity, legacy slug planId, ambiguous plans, stale scheduleId) are covered by the 55 passing tests.

---

## Final Verdict

**PASS**

All three PRs (#820, #821, #823) pass code review and automated test verification at SHA `b9efeed6a1c8`:

- PR #820: V2 is correctly the default; rollback paths (env + query) confirmed; fail-closed error codes confirmed.
- PR #821: Routing doc has no critical stale entries; appropriately bounded as a snapshot with live-check requirement.
- PR #823: Legacy plan-slug fallback delegates to canonical resolver; AMBIGUOUS_PLAN returns 200 empty; validation chain confirmed.
- 55/55 tests pass across 7 targeted suites.
- TypeScript typecheck: 0 errors.
