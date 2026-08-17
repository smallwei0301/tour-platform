# issue1815 — persisted payment release gate

> Last updated: 2026-08-17 (Asia/Taipei)｜Owner: Codex

## Goal

Only a committed checkout aggregate may create an ECPay payment attempt. Both legacy and V2 boundaries must use the persisted `orders.total_twd` and reconcile it with persisted order items.

## Milestones and evidence

- 2026-08-13: Started after #1814 merged and closed. No production Supabase migration, DML, payment, notification, or deployment is authorized or performed.
- 2026-08-17: Owner explicitly lifted the legacy payment-route freeze for #1815. Legacy and V2 create routes now share the persisted aggregate gate; an incomplete aggregate returns `409 ORDER_NOT_MATERIALIZED` before any payment-attempt side effect.
- 2026-08-17: The gateway projects item metadata, permits the intended null `booking_id` on #1812 add-on and #1813 points rows, and requires exactly one linked `activity_booking` row. A `23505` payment-attempt race reads back and reuses the winning pending attempt.
- 2026-08-17: Added isolated real-auth release coverage for basic, add-on and points totals, concurrent payment clicks, both route boundaries, and broken-aggregate rejection. The matrix verifies the API amount, persisted `orders.total_twd`, item sum and payment response; an injected notification/payment double verifies commit-readback delivery totals. Mocked Playwright coverage includes add-on/points error recovery and persisted payment-page amount plus the payment guard.

## Current verification status

- `NOT_VERIFIED-local`: the real-auth PostgreSQL/PostgREST/GoTrue release case runs only in CI's loopback isolated Supabase environment. It does not use the local production-shaped `.env.local`.
- Focused local command (2026-08-17): `node --test apps/web/tests/unit/issue1815-persisted-amount-delivery.test.mjs apps/web/tests/api/issue652-ecpay-create-on-conflict.test.mjs apps/web/tests/api/issue614-ecpay-create-callback-persistence-contract.test.mjs apps/web/tests/unit/issue1815-payment-boundary.test.mjs apps/web/tests/unit/issue1815-payment-materialization-guard.test.mjs` → 19 passed, 0 failed.
- `NOT_AUTOMATABLE-local`: `npm run test:e2e -w @tour/web -- e2e/issue1814-checkout-idempotency.spec.ts` could not start because the managed command dispatcher cancelled its network approval before execution. The isolated CI Playwright runner remains the required authoritative evidence; do not treat this local result as pass.
- `NOT_AUTOMATABLE-historical-RED`: the guard code predates this work session, so a truthful pre-GREEN failure record is not recoverable. The current regression is retained as GREEN coverage; this limitation is explicitly recorded rather than relabelled as historical RED evidence.
- CI evidence (2026-08-17, commit `a7dec22`): [Node 22 CI #2829](https://github.com/smallwei0301/tour-platform/actions/runs/32019878200) PASS; [secret scan #2562](https://github.com/smallwei0301/tour-platform/actions/runs/32019878265) PASS; [smoke E2E #428](https://github.com/smallwei0301/tour-platform/actions/runs/32019878313) PASS; [isolated Supabase / real API / Playwright release lane #168](https://github.com/smallwei0301/tour-platform/actions/runs/32019878420) PASS.
- The real-auth suite completed cleanup of its fixture orders, bookings, items, add-ons, points ledger, idempotency records and temporary triggers through `beforeEach`/`after`; no production database, payment, or notification provider was used.

## Non-goals / safety

- Legacy `app/api/payments/ecpay/create` change is limited to the owner-authorized #1815 payment release gate.
- Do not call ECPay, LINE, email, or any payment/notification provider.
- Do not apply a migration or write to production Supabase.

## Owner authorization record

- 2026-08-17: explicit authorization to lift the legacy payment-path freeze solely to complete #1815, then run CI and merge.
