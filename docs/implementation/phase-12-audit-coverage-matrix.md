# Phase 12 Audit Coverage Matrix (Issue #165)

> Scope: 以 repo 既有程式與文件證據，整理 Phase 12 critical write paths 的 audit coverage 現況。
> 
> Ground rules: 不重開已落地 slices；缺口以 follow-up slice 明確列出。

## Canonical contract baseline

- Audit 欄位契約與排錯路徑：`docs/implementation/issue-170-audit-field-contract-and-troubleshooting.md`
- Parent checklist（現況 truth table）：`docs/qa/issue-171-audit-verification-checklist.md`
- LINE/LIFF payment-init 已驗證證據：`reports/issue-236/payment-init-audit-verification.md`

## Coverage matrix

| Path | Actor | Action | Target | Before / After | source_channel | correlation_id | timestamp | MVP vs later | Current evidence | Gap / follow-up issue |
|---|---|---|---|---|---|---|---|---|---|---|
| POS manual payment (`POST /api/v2/admin/pos/bookings/:bookingId/manual-payment`) | admin operator | manual payment create + order status update | `payments`, `orders`, `payment_events` | `pending_payment -> paid` | `admin_pos` (contract target) | Required by #170 cross-entity chain | `created_at/updated_at` on written rows | MVP in-place（POS Lite） | Route: `apps/web/app/api/v2/admin/pos/bookings/[bookingId]/manual-payment/route.ts`; regression: `apps/web/tests/api/v2-admin-pos-manual-payment-regression.test.mjs`; compatibility report: `docs/qa/issue-182-pos-line-availability-compatibility-report-2026-04-26.md` | 仍需 parent-level #171 / #165 consolidation query pack，確認 source_channel/correlation_id 在實 DB 無缺洞（follow-up: child under #171） |
| LINE/LIFF booking draft entry | line user | draft init write chain | booking draft + audit log metadata | draft init state set | `line_liff` | Required and reused through checkout | event/log created time | MVP landed | Contract tests: `apps/web/tests/api/v2-line-liff-entry-contract.test.mjs`; draft route audit signal: `apps/web/app/api/v2/bookings/draft/route.ts` (`line_liff_draft_entry`) | 需納入 parent consolidated evidence（#165 matrix + #171 gate） |
| LINE/LIFF checkout payment-init | line user | payment-init (checkout) | order/payment-init audit payload | draft/booking state -> payment init requested | `line_liff` | Required, chain continuity required | payment init event time | MVP landed | Checkout route: `apps/web/app/api/v2/bookings/[bookingId]/checkout/route.ts` (`line_liff_payment_init`); verification artifact: `reports/issue-236/payment-init-audit-verification.md` | 已有 slice 證據；缺 parent single-go gate（#171 final convergence） |
| Payment callback (`POST /api/payments/ecpay/callback`) | system callback worker | callback received / paid / replay noop | `orders`, `payments`, `payment_events`, audit trail | legal one-way transitions, replay noop idempotency | `system` (per #170 callback rule) | callback/replay must carry same chain id | callback receive / process time | MVP landed + hardening landed | Route: `apps/web/app/api/payments/ecpay/callback/route.ts`; tests: `apps/web/tests/api/ecpay-callback.test.mjs`, `apps/web/tests/api/ecpay-callback-mapping-contract.test.mjs`; #197 SQL/test evidence: `apps/web/tests/api/payment-status-update-verification-pack.test.mjs` | 仍需 parent #171 consolidated runtime verification window（not code gap） |
| User refund request (`POST /api/me/orders/:orderId/refund-requests`) | web user | refund request create | `refund_requests`, `orders`, `audit_logs` | `paid/confirmed -> refund_pending` | `web` (contract target) | Required for booking->refund chain | request created time | MVP landed | Route: `apps/web/app/api/me/orders/[orderId]/refund-requests/route.ts`; db/service coverage: `apps/web/src/lib/db.mjs`, `apps/web/tests/api/refund-requests.test.mjs`, `apps/web/tests/api/issue160-audit-coverage.test.mjs` | 需補 parent-level query evidence（欄位完整性與可追鏈率） |
| Admin refund actions (`approve/process/complete/reject`) | admin operator | refund lifecycle transitions | `refund_requests`, `orders`, `payment_events`, `audit_logs` | `requested -> approved -> processing -> refunded` (or rejected) | `admin` / admin-manual channel | Required by #170 | action timestamps | MVP landed (with idempotent refunded event guard) | Routes: `apps/web/app/api/admin/refund-requests/[refundRequestId]/*/route.ts`; logic: `apps/web/src/lib/db.mjs`, `apps/web/src/lib/admin.mjs`; tests: `apps/web/tests/api/admin-refunds.test.mjs`, `apps/web/tests/api/admin-audit-coverage.test.mjs` | #171 checklist仍標示 admin-manual coverage parent gate 未完成；需 child slices 補齊跨入口一致性驗證 |
| Admin order manual updates (`POST /api/admin/orders/:orderId`) | admin operator | status/note/exception updates | `orders`, `audit_logs` | mutable admin updates with audit | `admin` | Required for manual operations trace | audit log timestamp | MVP landed | Tests: `apps/web/tests/api/admin-orders-update.test.mjs`; admin API path usage in UI: `apps/web/app/admin/orders/page.tsx` | 需把 manual updates 併入 #171 parent truth gate，不與 callback/payment-init 路徑分離驗收 |

## Current conclusion (truth-first)

1. **已落地證據存在**：#170（契約基線）、#171（parent checklist）、#236（payment-init 驗證）與多條 API/DB 測試證據已覆蓋 critical paths 的主要寫入行為。
2. **仍未達 parent single-pass gate**：缺的是「跨路徑收斂證據包」，不是重做既有路徑。
3. **Issue #165 的定位**：作為 audit coverage matrix truth artifact，讓 QA / on-call 能先知道「哪裡已被證明、哪裡仍缺 parent 收斂」。

## Follow-up slices (concrete, bounded)

1. **#171-child: consolidated query pack**
   - 產出可重跑 SQL/腳本，驗證 `source_channel`、`correlation_id`、actor/action/target、before/after 在 critical paths 的缺失率。
2. **#171-child: admin-manual cross-entry consistency report**
   - 聚焦 POS manual payment + admin refund + admin order update，確認欄位語意一致且可追鏈。
3. **#171-parent: final convergence report**
   - 以單一時間窗輸出 GO/HOLD verdict，明確註記 callback / payment-init / refund / admin-manual 全部狀態。
