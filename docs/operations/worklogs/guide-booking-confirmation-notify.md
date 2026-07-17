# Worklog — 導遊審核制缺口修補：request 申請建立時通知導遊

- **分支**：`claude/guide-booking-confirmation-1ef2uf`
- **無 issue 編號**（使用者於對話中直接派工；本檔為唯一記憶錨點）
- **日期**：2026-07-17（Asia/Taipei）

## 背景與範圍界定

使用者盤點「導遊確認後才成立訂單」模式，回報五項現況。經核實（基準 commit `144b3c8`）：

1. DB `activity_plans.booking_type`（instant/scheduled/request）✅ 存在
2. 狀態機 `pending_confirmation → confirmed` ✅ 存在（但該轉換屬付款驅動；導遊審核走 `bookings.guide_approval_status` 軸，「先審核後付款」，approve 時 booking 維持 draft）
3. Admin 可設 request 模式 ✅ 存在
4. 導遊確認/拒絕功能 —— **使用者回報缺失，實際已存在**（#1649）：
   - `POST /api/v2/guide/bookings/[bookingId]/approval`（approve/reject）
   - `GET /api/v2/guide/bookings/pending-approval`
   - `/guide/bookings` 頁「待審核」分頁＋批准/婉拒按鈕
   - 審核結果通知旅客：`booking-approval-notify.ts`
5. **真缺口：request 申請建立時沒有任何通知導遊的機制**：
   - `POST /api/v2/bookings/draft` 建單後零導遊通知（request 模式連付款期限信都是 null 不發）
   - `guide_new_order` LINE 模板存在但全 repo 無生產呼叫端；`notifyNewOrder` 同樣零呼叫
   - 對照：改期申請有通知導遊信（`email.ts` sendRescheduleRequestNotice）

本次只補第 5 項。

## 環境異常記錄

- **本 session hooks 未武裝**：`00_INDEX.md` 第 0 步煙霧測試失敗（Edit 探針只回一般錯誤、無 `HARNESS BLOCK`）。已回報使用者，使用者裁示繼續。凍結區規則改由人工遵守：本次僅動 `app/api/v2/bookings/draft/route.ts`（非凍結）、`src/lib/{email.ts,line-messages.ts,booking-approval-notify.ts}`、新測試檔。
- 遠端環境 `npm install --ignore-scripts` 完成，Node v22.22.2。

## 設計決策

- **雙通道通知**：email（`guide_profiles.guide_email`，經 `lookupOrderContext`）＋ LINE push（`pushGuideOrderEvent`，自帶 flag／matrix／綁定三層 gating）。皆 best-effort、fire-and-forget，不影響建單主流程——比照 `payment-deadline-notify` 與 `reschedule-notify` 既有模式。
- **LINE 事件 kind 用 `guide_approval_requested`**（非復用 `guide_new_order`，語意不同：申請待審核 vs 新訂單待付款）。`notification-settings.mjs` 對未建模事件 default true（模組明文設計），故不動 `NOTIFY_EVENTS` 矩陣；若日後要讓 admin 可關此通知再另案加矩陣格。
- 掛載點：draft route 建單成功、status log 寫完之後、return 之前；以 `requiresGuideApproval(planData.booking_type)` 分流。

## 進度

- [x] 核實五項現況（唯讀）
- [x] email 模板 `sendBookingApprovalRequested`（email.ts，置於審核結果通知同區塊）
- [x] LINE `guide_approval_requested` 訊息（line-messages.ts GuideEventKind＋composer）
- [x] wrapper `notifyBookingApprovalRequested`（booking-approval-notify.ts；orderId／guideEmail guard）
- [x] draft route 掛載（`requiresGuideApproval(planData.booking_type)` 分流、fire-and-forget）
- [x] 測試綠燈：`run-checks.sh --typecheck` — 22 pass／0 fail＋tsc 無錯（booking-approval-request-notify、line-guide-push、notification-matrix-gating、issue1493 回歸）
- [x] commit + push

## 實跑證據與備註

- 測試指令：`.claude/hooks/run-checks.sh --typecheck apps/web/tests/api/booking-approval-request-notify.test.mjs apps/web/tests/api/line-guide-push.test.mjs apps/web/tests/api/notification-matrix-gating.test.mjs apps/web/tests/api/issue1493-payment-deadline-email.test.mjs` → exit 0。
- 新 wrapper 無法被 node --test runtime import（內部相對 import 無副檔名，Next 才解析得了）——比照 issue1493 慣例以 source-contract 測試鎖行為。
- 既有 `booking-type-callback-contract.test.mjs` 從 repo root 跑會 ENOENT（`path.resolve('../../supabase/...')` 依賴 cwd=apps/web），與本次無關，未列入證據集。
- 未動 `notification-settings.mjs` 矩陣：`approval_requested` 屬未建模事件，isNotifyEnabled default true（模組明文設計）。後續若要讓 admin 可關，另案加 NOTIFY_EVENTS＋後台 UI。
- 遺留建議（未做，避免 scope creep）：`/guide/bookings` 頁標題仍叫「訂單查看」，改名會牽動引用該字面的 e2e/README，另案處理。
