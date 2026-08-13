# issue1815 — persisted payment release gate

> Last updated: 2026-08-13 (Asia/Taipei)｜Owner: Codex

## Goal

Only a committed checkout aggregate may create an ECPay payment attempt. The V2 boundary must use the persisted `orders.total_twd` and reconcile it with persisted order items.

## Milestones and evidence

- 2026-08-13: Started after #1814 merged and closed. No production Supabase migration, DML, payment, notification, or deployment is authorized or performed.
- 2026-08-13: Added V2-only materialization guard plus isolated local-Supabase runtime coverage for persisted total → ECPay amount and malformed aggregate rejection. Focused test set (21) and typecheck passed; the ordinary suite passed 5,531 tests and has only the known Node 24 guide-session HMAC fixture failures (3).
- 2026-08-13: The canonical Node 22 runner cannot start locally because its managed `tp-node22` toolchain is absent. Per explicit authorization, the equivalent manual-safe gate is the focused tests plus typecheck above; the real Node 22/PostgREST/GoTrue case remains CI-only and isolated.

## Current verification status

- `NOT_VERIFIED-local`: the real-auth PostgreSQL/PostgREST/GoTrue release case runs only in CI's loopback isolated Supabase environment. It does not use the local production-shaped `.env.local`.
- `NOT_VERIFIED`: payment/notification provider test doubles and full release checklist remain to be completed before #1815 can close.

## Non-goals / safety

- Do not change frozen legacy `app/api/payments/**` routes.
- Do not call ECPay, LINE, email, or any payment/notification provider.
- Do not apply a migration or write to production Supabase.

## P0-OVERRIDE record

- None.
