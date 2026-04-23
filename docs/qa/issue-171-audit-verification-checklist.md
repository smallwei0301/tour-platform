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

### C0. Expected audit contract（critical write flows 必備欄位）

每個 critical write flow 的審計事件至少應可查到以下欄位：

- `actor_type`（system/admin/traveler）
- `actor_id`（可為 null，但需有 actor_type + source）
- `action`（例：`booking_status_changed` / `refund_complete`）
- `target_type`（booking/order/payment/refund_request）
- `target_id`
- `source`（api/admin/line/liff/worker）
- `timestamp`（事件時間，ISO 或 DB 時間戳）
- `correlation_id`（order_id/payment_id/refund_request_id 其一，供跨表追蹤）
- `metadata`（至少含該 flow 的業務鍵值，如 `from_status`、`to_status`、`adminNote`）

### Booking
- [ ] Draft created → status: `yes`（E3）
  - expected metadata: `booking_id`, `source_channel`, `draft=true`
- [ ] Checkout initiated → status: `verify`（E4）
  - expected metadata: `booking_id`, `order_id`, `checkout_session_id`
- [ ] Cancelled/confirmed/completed/no_show/reschedule → status: `verify`（E5）
  - expected metadata: `booking_id`, `from_status`, `to_status`, `reason|note`

### Payment
- [ ] Payment initialized → status: `verify`（E4）
  - expected metadata: `payment_id`, `order_id`, `amount`, `currency`, `provider`
- [ ] Callback received/paid/failed → status: `verify`（E6）
  - expected metadata: `payment_id`, `provider_event_id`, `callback_status`, `signature_verified`
- [ ] Manual payment add (POS future) → status: `no`
  - expected metadata: `order_id`, `payment_method`, `operator_id`, `amount`

### Refund
- [ ] Traveler refund request create → status: `yes`（E7）
  - expected metadata: `refund_request_id`, `booking_id`, `reason`, `requested_amount`
- [ ] Admin approve/reject/process/complete audit → status: `yes`（E1）
  - expected metadata: `refund_request_id`, `admin_id`, `adminNote`, `decision`
- [ ] Complete + money movement (`payment_events.refunded`) → status: `partial`（E1 + gap note）
  - expected metadata: `refund_request_id`, `payment_id`, `refunded_amount`, `provider_refund_id`

### POS manual
- [ ] Admin update order status → status: `yes`（E2）
  - expected metadata: `order_id`, `from_status`, `to_status`, `admin_id`
- [ ] Exception actions（reschedule/adjust_capacity/oversell_fix）→ status: `yes`（E2）
  - expected metadata: `order_id|booking_id`, `exception_type`, `before`, `after`, `operator_id`
- [ ] POS create order/booking draft → status: `no`
  - expected metadata: `order_id`, `booking_id`, `pos_terminal_id`, `operator_id`

### LINE / LIFF
- [ ] Draft booking with `source_channel=line` → status: `yes`（E3）
  - expected metadata: `booking_id`, `line_user_id`, `source_channel=line`
- [ ] Checkout context retention → status: `verify`（E4）
  - expected metadata: `booking_id`, `context_token`, `expires_at`
- [ ] LIFF auth mapping audit → status: `no`
  - expected metadata: `line_user_id`, `member_id`, `mapping_result`
- [ ] Notification send/fail tracking → status: `no`
  - expected metadata: `notification_id`, `channel`, `template_id`, `delivery_status`, `error_code?`

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

## I. Fix-round assessment (Round 2, branch-scope check)

### I-1) 可否在本分支立即消除 Judy blockers？

**結論：不可在本分支（文件收斂分支）內一次性消除；屬於跨層實作/環境證據缺口。**

### I-2) Grounded blocker evidence（repo/code）

1. **`refund_complete -> payment_events.refunded` 目前無落點（P0）**
   - `apps/web/src/lib/db.mjs` 的 `updateAdminRefundStatusDb()`（`action === 'complete'`）僅更新：
     - `refund_requests.status='refunded'`
     - `orders.status='refunded'`
     - `audit_logs(action='refund_complete')`
   - 該函式中**未寫入** `payment_events(event_type='refunded')`。
   - 這代表缺口是「程式行為缺失」，不是僅靠文件可消除。

2. **checkout/callback 的 query-based evidence 仍缺（P0）**
   - 本分支可提供 route/test 佐證，但 Judy blocker 要求的是可重現 query/sample row（真實鏈路）。
   - 這需要執行環境（DB 寫入後查詢）證據，不是單純編修 checklist 可完成。

3. **`no` 類流程（POS create / LIFF mapping / notification）屬範圍外**
   - 已在 matrix/checklist 維持 `no`，不宣稱已完成。
   - 這些項目需另開 implementation issue，避免在 #171（readiness 文件收斂）內混入 scope creep。

### I-3) 對 merge policy 的影響

- 依 `merge-ready-only` + `qa_gate=required`，目前判定仍為 **HOLD / BLOCKED**。
- #171 可保留為「readiness artifact 完整」，但不可宣稱「P0 已清」。
