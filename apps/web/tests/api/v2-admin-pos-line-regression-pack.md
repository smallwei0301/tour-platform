# V2 Admin POS + LINE Draft Regression Pack (Issue #150)

## Goal
Deterministic regression guard for:
1. **Admin POS create order flow** via `/api/v2/bookings/draft` -> `/api/v2/bookings/:id/checkout`
2. **LINE draft flow** via mocked draft+checkout transport (no real LINE API dependency)

## Stable Test Location
- `tests/api/v2-admin-pos-line-regression.test.mjs`

## Scope
- Keep accepted channels: `web | line | admin_pos`
- Ensure `source_channel` write contract remains in draft route
- Validate admin_pos + line draft/checkout flow contract with deterministic mocks

## Run (local / CI)
```bash
cd apps/web
npm run test:smoke:admin-pos-line
```

## Notes
- This pack intentionally avoids brittle full E2E and external provider calls.
- If this fails after API refactor, update route contract and this pack together in the same PR.
