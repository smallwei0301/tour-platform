# Issue #244 Verification (Tracy r1)

## Scope
- Keep LIFF-originated continuation on shared V2 path (draft -> checkout/payment-init)
- Keep `source_channel=line` + `correlationId` continuity inspectable
- Make line fallback/error behavior explicit and testable

## Changed Files
1. `apps/web/app/booking/[activityId]/page.tsx`
2. `apps/web/tests/api/v2-line-liff-entry-contract.test.mjs`

## Verification Commands
```bash
cd apps/web
node --test tests/api/v2-line-liff-entry-contract.test.mjs
```

## Result
- PASS (5/5)

## Evidence Highlights
- Line continuation state marker added: `data-testid="booking-v2-line-fallback-state"`
- Line retry action added: `data-testid="booking-v2-line-retry-btn"`
- Contract asserts checkout audit continuity:
  - draft metadata correlation reuse
  - `sourceChannel`
  - `auditSignal: 'line_liff_payment_init'`

## Risk / Rollback
- Risk: low; UI-only fallback branch + contract test updates, no DB schema changes
- Rollback: revert the two changed files above
