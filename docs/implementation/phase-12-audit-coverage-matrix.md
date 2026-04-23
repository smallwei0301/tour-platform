# Phase 12 Audit Coverage Matrix (Issue #171)

> Updated: 2026-04-23  
> Scope: Booking / Payment / Refund / POS manual / LINE-LIFF critical writes  
> Status vocabulary (normalized): `yes` / `partial` / `no` / `verify`

## 1) Normalized Status Definition

- `yes`: 已有程式寫入與可重現證據（測試或查詢）
- `partial`: 有部分寫入，但 contract 欄位或關聯鏈路仍缺口
- `no`: 尚未實作 audit 落點
- `verify`: 目前可推定存在，但缺可重現證據（需補測試或實際查詢）

## 2) Expected Audit Contract (for every critical write)

必要欄位（欄位可位於主欄位或 metadata/payload）：

- actor / actor_role
- action / event_type
- target id (`booking_id` / `order_id` / `payment_id` / `refund_request_id`)
- source_channel
- created_at
- metadata / payload
- correlation chain（至少可反查 booking ↔ order ↔ payment / refund）

## 3) Coverage Matrix (normalized)

| Flow | Operation | Expected Store | Current Status | Evidence IDs | Gap / Notes |
|---|---|---|---|---|---|
| Booking | Draft created (`POST /api/v2/bookings/draft`) | `booking_status_logs` | yes | E3 | 已見 route 寫入 `booking_status_logs` 並帶 `source_channel` 契約檢查 |
| Booking | Checkout initiated (`POST /api/v2/bookings/:bookingId/checkout`) | `booking_status_logs` + `payment_events` | verify | E4 | route 顯示有寫入，需補端到端 query 證據（真實 booking/payment id） |
| Booking | Cancelled / confirmed / completed / no_show / reschedule | `booking_status_logs` | verify | E5 | 狀態流程存在，但需補對應每個轉換之可重現驗證 |
| Payment | Payment initialized on checkout | `payment_events` | verify | E4 | 需補查詢證據：可由 payment_id 回到 order/booking |
| Payment | Provider callback received/paid/failed | `payment_events` | verify | E6 | callback path 存在，需補至少一種 callback 事件查詢證據 |
| Payment | Manual payment add (POS future) | `payment_events` + `audit_logs` | no | — | 尚未定義正式 POS manual add contract |
| Refund | Traveler refund request create | `refund_requests` + `audit_logs` | yes | E7 | `refund_requested` 已寫 `audit_logs`，具 refundRequestId/previousStatus |
| Refund | Admin approve/reject/process/complete | `audit_logs` | yes | E1 | `refund_approve/reject/process/complete` 測試覆蓋且 metadata 有 refundRequestId/adminNote |
| Refund | Admin complete + payment refunded event | `audit_logs` + `payment_events(event=refunded)` | partial | E1 | `audit_logs` 已有；`payment_events.refunded` 尚缺 |
| POS | Admin update order status (`/api/admin/orders/:orderId`) | `audit_logs` | yes | E2 | status/note update 均有 audit log 行為驗證 |
| POS | Admin exception (reschedule/adjust_capacity/oversell_fix) | `audit_logs` | yes | E2 | 已有 exception audit 寫入 |
| POS | Admin create order / booking draft | `booking_status_logs` + `audit_logs` | no | — | 尚無正式 POS create flow |
| LINE / LIFF | Draft booking via LINE (`source_channel=line`) | `booking_status_logs` | yes | E3 | regression test 明確檢查 source_channel contract |
| LINE / LIFF | Checkout via LINE context retention | `booking_status_logs` + `payment_events` | verify | E4 | 需補 line context 不遺失之實際鏈路證據 |
| LINE / LIFF | LIFF auth/account mapping audit | `audit_logs` or dedicated auth audit | no | — | 尚未建立 mapping audit |
| LINE / LIFF | Notification send/fail tracking | `audit_logs` or notification store | no | — | 尚未定義與落地 |

## 4) Evidence Catalog (mapping)

- **E1**: `node --test apps/web/tests/api/admin-audit-coverage.test.mjs`（pass）  
  - 驗證 `updateAdminRefundStatusDb` 四種動作均寫 `audit_logs`
- **E2**: `node --test apps/web/tests/api/admin-orders-update.test.mjs`（pass）  
  - 驗證 admin order status/note update 與 exception path 寫 `audit_logs`
- **E3**: `apps/web/tests/api/v2-admin-pos-line-regression.test.mjs:54`  
  - 檢查 `source_channel: data.sourceChannel` contract
- **E4**: `apps/web/app/api/v2/bookings/[bookingId]/checkout/route.ts`  
  - 顯示 checkout path 寫 `payment_events` 與 `booking_status_logs`（待補 runtime query）
- **E5**: `apps/web/src/lib/booking-state.ts`  
  - 顯示 booking state log persistence path（待補逐狀態驗證）
- **E6**: `apps/web/app/api/payments/ecpay/callback`（路徑在 repo，待補 callback query evidence）
- **E7**: `apps/web/src/lib/db.mjs` `createRefundRequestDb` 內 `action: 'refund_requested'` 寫入 `audit_logs`

## 5) High-risk gaps (for readiness)

### P0
1. 補 `refund complete` 對 `payment_events(event_type=refunded)` 的一致落點
2. 補 checkout / callback 的 query-based evidence（可重現）

### P1
3. 建立 LINE/LIFF auth mapping audit 契約
4. 建立 notification send/fail audit 契約
5. 定義 POS manual payment add 雙寫規格（payment_events + audit_logs）

## 6) Grounded verification example (real)

範例：**Refund admin actions audit 完整性**

- Command:
  - `node --test apps/web/tests/api/admin-audit-coverage.test.mjs`
- Observed:
  - `refund_approve`, `refund_reject`, `refund_process`, `refund_complete` 全部 pass
  - 驗證欄位：`actor=admin`, `metadata.refundRequestId`, `metadata.adminNote`
- Conclusion:
  - Refund admin action → `audit_logs` 已達 `yes`（針對 audit log 本身）
  - 但 `refund_complete -> payment_events.refunded` 尚未覆蓋，故整體 money movement 仍 `partial`
