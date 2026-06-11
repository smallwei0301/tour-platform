# 訂單改期設計（#1383）— 草案待 review

> 狀態：**已定案（owner review 2026-06-11）並完成第一期實作。**
> 開放問題拍板：改期上限每訂單 1 次；guide 72h lazy-expire（無 cron）；
> schema 預留 `amount_delta_twd`（第二期跨價方案）。
> 原子性與鎖序依據：`12-payment-callback-atomicity.md`（#1384 複核）。

## 1. 範圍與約束

- **第一期只支援同活動、同方案、同價的 slot 改期** — 不動金流（無補差價/退差價）。
- 入口：traveler 訂單詳情頁（`/me/orders/[orderId]`），`status ∈ {paid, confirmed}` 且距活動開始仍在退款政策時限內。
- 嚮導確認制：traveler 申請 → guide 確認/拒絕 → 完成改期（confirmed 訂單不自動轉移）。
- booking → order → payment 三層一致：改期**不改 order 金額與 payment**，只改 booking/schedule 對應。

## 2. 狀態機

```
order.status:        paid/confirmed ──(申請)──> reschedule_requested ──(guide 確認)──> 原狀態（paid/confirmed）
                                          │                                 [slot 已替換]
                                          └──(guide 拒絕 / traveler 撤回 / 逾時 72h)──> 原狀態（slot 不變）
booking.status:      confirmed ──> reschedule_requested ──> confirmed（新 slot）/ confirmed（原 slot）
```

- 新增 `reschedule_requests` 表（仿 `refund_requests`）：
  `id, order_id, booking_id, from_schedule_id/from_slot, to_schedule_id/to_slot,
   status (requested/approved/rejected/withdrawn/expired), request_id (冪等), requested_at, resolved_at, resolver, note`
- `requested` 期間訂單鎖定其他操作（不可再申請退款/取消，UI 與 API 雙重擋）。

## 3. 原子性（核心）

新增 RPC `fn_reschedule_booking_atomic(p_reschedule_request_id)`，**單一交易**內：

1. `SELECT ... FOR UPDATE` 鎖 `orders` → 鎖 `bookings` → 鎖新舊兩個 slot 列
   （**鎖序遵循 orders → bookings → activity_schedules**，與 payment callback 一致避免 deadlock；
   兩個 schedule 列以 **id 排序後依序鎖定**，避免互相等待）
2. 守門：request 狀態必須 `requested`；訂單狀態必須 `reschedule_requested`
3. 新 slot 容量檢查（仿 `fn_book_schedule`：status=open 且 `capacity - booked_count >= people_count`），不足 → `RAISE EXCEPTION 'reschedule_failed: insufficient_capacity'` → **全量回滾，舊預訂不受影響**
4. 新 slot `booked_count += n` → 舊 slot `booked_count = GREATEST(0, booked_count - n)`（先扣新再放舊，失敗時不會出現雙重釋放）
5. 更新 booking 的 slot 引用與 status、order 回原狀態、request → `approved`
6. `audit_logs` 寫入改期前後 slot（action `order_rescheduled`）

冪等：`reschedule_requests.request_id` unique（申請層）+ RPC 內 request 狀態守門（確認層 replay 變 noop/error 22000）。

## 4. API contract（v2 慣例，`docs/04-tech/04-tech-architecture/10-api-spec-v2-booking-pos.md` 體系）

| Method | Path | 說明 |
|---|---|---|
| GET | `/api/me/orders/[orderId]/reschedule-options` | 同方案未來可訂 slots（走 `getV2ActivityAvailability`） |
| POST | `/api/me/orders/[orderId]/reschedule-requests` | 申請（body: toSlot/scheduleId, requestId）；政策時限外 403 `RESCHEDULE_WINDOW_CLOSED` |
| DELETE | `/api/me/orders/[orderId]/reschedule-requests/[id]` | traveler 撤回 |
| GET | `/api/guide/reschedule-requests` | 嚮導待辦清單 |
| POST | `/api/guide/reschedule-requests/[id]/decision` | approve（呼叫 RPC）/ reject |

- 政策時限：沿用該活動 refundRules 的「可免費取消」窗（同一資料源，不另設）。
- in-memory fallback：services.mjs 同步實作（單執行緒語意），契約測試比照 issue1384 模式。

## 5. 通知

`src/lib/email.ts` 新增兩款交易類信（不受行銷 opt-out 影響，`shouldSendEmailKind` 已涵蓋）：
申請成立（→ guide）、結果通知（→ traveler）。寄送失敗不阻斷主流程（best-effort + audit）。

## 6. 測試計畫

- TDD：政策時限邊界、容量不足回滾（舊 slot 不變）、replay 冪等、三層狀態一致、并發同 slot（in-memory 序列化語意 + RPC source-contract 鎖鎖序）
- Playwright：訂單頁入口 → slot 選擇 → 申請；guide 端確認（mock 後端）
- migration source-contract：鎖序與 `FOR UPDATE` 順序斷言（比照 issue1384）

## 7. 開放問題（review 時請拍板）

1. 改期次數上限（建議：每訂單 1 次）？
2. guide 逾時未處理（建議 72h 自動 expire 回原狀態）是否要 cron？（可先靠 lazy expire：讀取時判定）
3. 第二期是否支援跨方案/補差價？（影響 reschedule_requests schema 是否預留金額欄位）
