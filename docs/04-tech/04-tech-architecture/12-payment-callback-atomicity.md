# Payment Callback 原子性複核（#1384）

> 複核日期：2026-06-11（Asia/Taipei）。本文將 `fn_process_payment_callback_atomic`
> 的原子性假設文件化，作為 booking → order → payment 三層狀態鏈一致性的依據。
> 對應契約測試：`apps/web/tests/api/issue1384-flow-contract.test.mjs`（鎖定本文所述順序）。

## 函式定義位置

- **現行版本**：`supabase/migrations/20260624130000_callback_booking_type_auto_confirm.sql`
  （三種預約模式 PR3：付款後依 `booking_type` 自動確認 booking — instant/scheduled/request
  → `draft → confirmed`；未知/NULL → `draft → pending_confirmation`。決策與純函式
  `src/lib/booking-type-flow.mjs shouldAutoConfirmOnPayment` 一致；契約測試
  `apps/web/tests/api/booking-type-callback-contract.test.mjs`。rollback 還原為 #195 版本。）
- **前一版本**：`supabase/migrations/20260423194000_issue195_callback_booking_status_loop.sql`
  （#195：booking status loop 閉合，付款後一律 `draft → pending_confirmation`）
- **更早版本**：`supabase/migrations/20260420143000_issue59_payment_race_hardening.sql`（#59 併發加固）
- **容量扣位**：`fn_book_schedule`，定義於 `supabase/migrations/005_schedule_plan_id.sql`

## 複核結論：✅ 單一交易內，順序正確

plpgsql 函式本體即單一交易（任何 `RAISE EXCEPTION` 全量回滾）。實際順序（已逐行核對）：

| 步驟 | 內容 | 行為依據 |
|---|---|---|
| 1. 鎖定訂單 | `SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE` | 同訂單併發回調序列化（migration L38-41） |
| 2. booking loop 閉合 | booking `FOR UPDATE` → 讀 `activity_plans.booking_type` → instant/scheduled/request `draft → confirmed`（寫 `confirmed_at`）、其餘 `draft → pending_confirmation` + `booking_status_logs` 冪等插入（`WHERE NOT EXISTS`，dedup 鍵含 `to_status`） | 20260624130000 |
| 3. replay 冪等 | `IF v_order.status IN ('paid','confirmed','completed')` → 補寫 payments 後 `RETURN`（noop） | L100-127 |
| 4. 非法轉移守門 | `IF v_order.status <> 'pending_payment'` → `RAISE EXCEPTION`（ERRCODE 22000） | L129-132 |
| 5. 容量扣位 | `fn_book_schedule(schedule_id, people_count)`：場次 `FOR UPDATE` → status=open 檢查 → `capacity - booked_count` 餘額檢查 → 扣位；失敗回 `{ok:false}` → 上層 `RAISE EXCEPTION 'booking_failed'` → **整筆回滾（含步驟 2 的 booking 轉移）** | L134-142 + 005 migration |
| 6. 狀態轉移 | `UPDATE orders SET status='paid', paid_at=…` （限定 `AND status='pending_payment'`）→ `INSERT payments` | L144-162 |

### 鎖序（deadlock 視角）

觀察到的鎖定順序固定為 **orders → bookings → activity_schedules**。
任何新增的 RPC 若需同時鎖這幾張表，必須遵循同一順序，否則有 deadlock 風險 —
新增 migration 時以本文為準（#1383 改期 RPC 設計時特別注意）。

### 冪等的三道防線

1. RPC 內 replay 檢查（步驟 3）— 已付訂單回 noop。
2. `payment_events` 表 unique constraint（gateway 層，`db.mjs processPaymentCallbackDb`）。
3. `booking_status_logs` 冪等插入（`WHERE NOT EXISTS`）。

## 殘餘風險（已知、可接受）

- **in-memory fallback**（`services.mjs processPaymentCallback`）為單執行緒 JS，無交易概念，
  靠 replay 檢查達成冪等 — 與 RPC 行為由契約測試（issue1384）鎖定一致的狀態轉移與回傳 shape，
  但**併發語意僅 Supabase 路徑有保證**（fallback 僅供本地/測試）。
- Supabase 真連線的 RPC 行為未在 CI 內 live 驗證（`NOT_VERIFIED-live`）：CI 無 production DB。
  依據為本文逐行複核 + migration source-contract 測試 + production 既有運行觀察（#59/#195 上線後無超賣回報）。
