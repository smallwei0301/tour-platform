# Issue #171 — Readiness-Usable Audit Verification Checklist

> Entrypoint document for issue #171 readiness review.  
> Matrix source of truth: `docs/implementation/phase-12-audit-coverage-matrix.md`

## A. Definition of Done (DoD)

- [ ] 單一入口文件存在（本檔）並指向 matrix
- [ ] 每個 critical write flow 都有 expected audit contract 欄位
- [ ] 每個 flow 都使用 normalized status：`yes/partial/no/verify`
- [ ] 至少 1 個 grounded verification example（command + result + conclusion）
- [ ] readiness gate 明確列出 GO / HOLD / STOP 條件
- [ ] 風險、回滾、觀測性（Observability）已記錄

## B. Plan (Verification execution order)

1. 先跑現有可重現測試（Refund admin / Admin order）
2. 對照 matrix 更新每個 flow status 與 evidence mapping
3. 補最少一個 grounded example（本輪使用 refund admin actions）
4. 做 readiness gate 判定（GO/HOLD/STOP）

## C. Per-flow Checklist (normalized status + evidence)

> 參考 matrix 的 Evidence IDs（E1..E7）

### Booking
- [ ] Draft created → status: `yes`（E3）
- [ ] Checkout initiated → status: `verify`（E4）
- [ ] Cancelled/confirmed/completed/no_show/reschedule → status: `verify`（E5）

### Payment
- [ ] Payment initialized → status: `verify`（E4）
- [ ] Callback received/paid/failed → status: `verify`（E6）
- [ ] Manual payment add (POS future) → status: `no`

### Refund
- [ ] Traveler refund request create → status: `yes`（E7）
- [ ] Admin approve/reject/process/complete audit → status: `yes`（E1）
- [ ] Complete + money movement (`payment_events.refunded`) → status: `partial`（E1 + gap note）

### POS manual
- [ ] Admin update order status → status: `yes`（E2）
- [ ] Exception actions（reschedule/adjust_capacity/oversell_fix）→ status: `yes`（E2）
- [ ] POS create order/booking draft → status: `no`

### LINE / LIFF
- [ ] Draft booking with `source_channel=line` → status: `yes`（E3）
- [ ] Checkout context retention → status: `verify`（E4）
- [ ] LIFF auth mapping audit → status: `no`
- [ ] Notification send/fail tracking → status: `no`

## D. Grounded verification example (required)

### Example-1: Refund admin action audit coverage

- Command: `node --test apps/web/tests/api/admin-audit-coverage.test.mjs`
- Result: pass（2 tests, 0 fail）
- Verified:
  - `refund_approve/reject/process/complete` 均寫入 `audit_logs`
  - metadata 含 `refundRequestId` 與 `adminNote`
- Decision impact:
  - Refund admin audit log 本身可視為 `yes`
  - 但完整金流審計仍受 `payment_events.refunded` 缺口影響，總體維持 `partial`

## E. Risks

1. **假陽性風險**：僅靠 route 存在判定已覆蓋，未有 runtime query 證據
2. **鏈路斷點風險**：booking/order/payment/refund 關聯鍵不一致時，事後追查失敗
3. **上線風險**：LINE/POS 新流程若無 audit contract，事故追溯不足

## F. Rollback

若 readiness gate 非 GO：

1. 文件層：保留本 checklist + matrix，將 `verify/no/partial` 流程列入下一輪 issue 子任務
2. 功能層：POS/LINE 新寫入流程維持關閉（不放量）
3. 變更層：若已引入新 audit 寫入邏輯，使用 feature flag 關閉並回退至上一個穩定 tag

## G. Observability

最小可觀測要求：

- 每次 critical write 可定位至少一個可查 store（`booking_status_logs` / `payment_events` / `audit_logs`）
- 查詢主鍵：`booking_id`, `order_id`, `payment_id`, `refund_request_id`
- 每次 readiness review 需附：
  1. 至少 1 條 command-based test evidence
  2. 至少 1 條 query/sample row evidence（待下一輪補齊 checkout/callback）

## H. Readiness Decision Gate

### GO
- `yes` 覆蓋所有當前上線必需流程，且無 P0 gap

### HOLD（本輪預設）
- 已有主流程 audit 覆蓋，但仍有 P0/P1 gap（例如 `payment_events.refunded` 或 callback/query 證據未補）

### STOP
- 關鍵流程落在 `no` 或無法證明可追溯（缺 actor/action/target/source/timestamp）
