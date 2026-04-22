# TP-BP-012A — v2 Booking Core Smoke Regression Pack

Run locally / CI:

```bash
pnpm --dir apps/web test:smoke:v2-core
```

Coverage map:

- `tests/api/v2-available-slots.test.mjs`
  - available slots request validation + success/error envelope
- `tests/api/v2-booking-draft-checkout.test.mjs`
  - booking draft payload validation + checkout contract + payment payload envelope
- `tests/api/booking-state.test.mjs`
  - booking lifecycle guards, including cancel transitions and terminal-state protection
- `tests/api/ecpay-callback.test.mjs`
  - callback-driven paid/cancelled edge cases, including illegal transition rejection from cancelled
- `tests/api/v2-route-contract-smoke.test.mjs`
  - source-level route contract smoke for available-slots / draft / checkout

Acceptance mapping:

- v2 available slots smoke pass → `v2-available-slots.test.mjs`
- v2 booking draft flow smoke pass → `v2-booking-draft-checkout.test.mjs`
- v2 checkout flow smoke pass → `v2-booking-draft-checkout.test.mjs`
- v2 cancel flow smoke pass → `booking-state.test.mjs` + `ecpay-callback.test.mjs`
- regression can rerun in standard flow → `pnpm --dir apps/web test:smoke:v2-core`
- do not break existing v1 booking path → pack is bounded to v2/core booking state tests only and does not rewrite legacy checkout codepaths
