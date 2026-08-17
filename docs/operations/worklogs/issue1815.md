# issue1815 — persisted payment release gate

> Last updated: 2026-08-17 (Asia/Taipei)｜Owner: Codex

## Goal

Only a committed checkout aggregate may create an ECPay payment attempt. Both legacy and V2 boundaries must use the persisted `orders.total_twd` and reconcile it with persisted order items.

## Milestones and evidence

- 2026-08-13: Started after #1814 merged and closed. No production Supabase migration, DML, payment, notification, or deployment is authorized or performed.
- 2026-08-17: Owner explicitly lifted the legacy payment-route freeze for #1815. Legacy and V2 create routes now share the persisted aggregate gate; an incomplete aggregate returns `409 ORDER_NOT_MATERIALIZED` before any payment-attempt side effect.
- 2026-08-17: The gateway projects item metadata, permits the intended null `booking_id` on #1812 add-on and #1813 points rows, and requires exactly one linked `activity_booking` row. A `23505` payment-attempt race reads back and reuses the winning pending attempt.
- 2026-08-17: Added isolated real-auth release coverage for persisted total, add-on, points, concurrent payment clicks, both route boundaries, and broken-aggregate rejection; added mocked Playwright coverage for add-on/points checkout rejection that remains editable. Focused Node evidence: 34 passed. Final Node 22 CI remains in progress.

## Current verification status

- `NOT_VERIFIED-local`: the real-auth PostgreSQL/PostgREST/GoTrue release case runs only in CI's loopback isolated Supabase environment. It does not use the local production-shaped `.env.local`.
- `PENDING-CI`: the final Node 22 CI check links will be recorded before merge; no red check may be merged.

## Non-goals / safety

- Legacy `app/api/payments/ecpay/create` change is limited to the owner-authorized #1815 payment release gate.
- Do not call ECPay, LINE, email, or any payment/notification provider.
- Do not apply a migration or write to production Supabase.

## Owner authorization record

- 2026-08-17: explicit authorization to lift the legacy payment-path freeze solely to complete #1815, then run CI and merge.
