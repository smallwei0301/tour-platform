# Delta QA: PR #708 — V2 Booking slug→resolved-ID fix

**Date:** 2026-05-24 (Asia/Taipei)
**Commit SHA:** 8809be099cbc4b51c753da47aa1661a080307bb6
**PR:** #708 — fix(booking-v2): resolve ids for draft checkout
**Preceding fix:** #705 — fix(v2-slots): resolve Booking V2 activity and plan slugs
**Executor:** tour-loop automated QA

## What was fixed

PR #708 fixed BookingInnerV2FlagShell in `app/booking/[activityId]/page.tsx` to:
- Capture `json.data.activityId` from the available-slots API response as `resolvedActivityId`
- Capture `json.data.planId` from the available-slots API response as `resolvedPlanId`
- Send `resolvedActivityId` and `resolvedPlanId` (not URL slugs) in the draft POST payload

This prevents `VALIDATION_ERROR: Invalid activityId format` when the booking page URL contains slug-style activity/plan identifiers.

## Automated evidence

### V2 core smoke (`npm run test:smoke:v2-core`)

```
ℹ tests 123
ℹ suites 0
ℹ pass 123
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 364.858368
```

### Draft checkout contract tests (`node --test tests/api/v2-booking-draft-checkout.test.mjs`)

```
✔ draft API rejects slug-style activityId (regression guard for PR #708) (0.216835ms)
✔ draft API rejects slug-style planId (regression guard for PR #708) (0.172424ms)
✔ draft API accepts UUID-like resolved activityId and planId (regression guard for PR #708) (0.317406ms)
ℹ tests 36
ℹ suites 0
ℹ pass 36
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 135.673797
```

## Test cases added (regression guards)

1. **Slug-style `activityId` rejected by `parseAndValidateDraftBody`**
   - Slugs like `kaohsiung-chaishan-cave-experience`, `half-day`, `taipei-101-night-tour`,
     `activity-slug-with-numbers-123` all produce `Invalid activityId format`.

2. **Slug-style `planId` rejected by `parseAndValidateDraftBody`**
   - Slugs like `half-day`, `full-day`, `sunset-tour`, `plan-slug-123` all produce
     `Invalid planId format`.

3. **UUID-like resolved IDs accepted correctly**
   - `c0000003-0000-0000-0000-000000000001` / `c0000003-0000-0000-0000-000000000002`
     pass validation and are preserved verbatim in the parsed output.

## No real orders/payments

All tests are unit/contract level — no DB write, no ECPay round-trip, no real booking created.

## Cross-references

- Closes #709
- Fixes from: #708, #705
- Evidence contributed to: #621 (V2 cutover), #640 (launch blocker QA), #642 (observation window)
