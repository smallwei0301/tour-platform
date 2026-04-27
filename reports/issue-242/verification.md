# Issue #242 Verification — LIFF booking entry wrapper + LINE auth handoff

## Scope (smallest bounded delta)
- Added minimal `/booking/line` entry wrapper.
- Added minimal `/api/v2/line/auth/handoff` path (JSON + redirect mode).
- Reused existing v2 draft/checkout flow and passed truthful `sourceChannel: "line"` + `x-correlation-id` continuity.

## Changed files
- `apps/web/app/booking/line/page.tsx`
- `apps/web/app/api/v2/line/auth/handoff/route.ts`
- `apps/web/app/booking/[activityId]/page.tsx`
- `apps/web/tests/api/v2-line-liff-entry-contract.test.mjs`

## Verification commands
```bash
cd apps/web
npm run typecheck
node --test tests/api/v2-line-liff-entry-contract.test.mjs tests/api/v2-admin-pos-line-regression.test.mjs
```

## Verification result
- TypeScript typecheck: ✅ pass
- Regression/contract tests: ✅ 6/6 pass

## Correlation / audit continuity
- LIFF entry (`/booking/line`) redirects through handoff endpoint.
- Handoff endpoint injects/propagates `correlationId` to booking URL.
- Booking v2 flow forwards `x-correlation-id` header to:
  - `POST /api/v2/bookings/draft`
  - `POST /api/v2/bookings/:bookingId/checkout`
- Existing audit substrate in draft/checkout remains the source of inspectable logs (`booking_status_logs`, `payment_events`).

## Rollback
- Revert commit for this issue branch.
- No schema/migration/environment change; rollback is code-only.

## Observability
- Inspect request continuity by checking:
  - booking draft metadata (`booking_status_logs.metadata.correlationId`)
  - checkout/payment event payload (`payment_events.payload.correlationId`)
- Handoff endpoint supports JSON mode for integration checks without browser redirect.

## Risks
- This is intentionally minimal and does not perform real LINE OAuth token validation.
- Assumes LIFF caller passes valid `activityId/plan` query params.
- If callers omit `correlationId`, endpoint generates one (prefixed `line-handoff-`).
