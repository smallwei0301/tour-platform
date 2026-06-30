# 通知系統現況與架構：LINE / Email / Telegram

> 最後更新：2026-06-15（Asia/Taipei）。對應 PR #920（branch `claude/line-integration-plan-a26p7`）。
> 本文件記錄三條通知管道（LINE OA、Email、Telegram）的**現況、覆蓋率落差、與目標架構**，供後續橋接依循。

---

## 0. 目標架構（owner 拍板，2026-06-15）

```
旅客 Traveler
  └─ LINE OA 諮詢（inbound）
   + 事件 Email 通知（必發）
   + 事件 Telegram 通知（可選，需綁定）

導遊 Guide
  └─ 事件 Email 通知
   + 事件 Telegram 通知（需綁定）

管理員 Admin
  └─ LINE OA 回覆（inbound/manual）
   + 事件 Email 通知
   + 事件 Telegram 通知（群組）
```

**事件清單（五項，三類對象共用）**：建單（未付款）、付款成功（訂單確認）、訂單取消、退款申請、退款完成。

**設計要點**：
- **LINE 退居「OA 諮詢 / 管理員回覆」**，**不再做事件 outbound push**（旅客/導遊個人推播暫停，見 §2）。
- **Email 是所有對象的基本管道**（必發）。
- **Telegram 是新增的可選管道**，與 Email 平行；旅客可選、導遊綁定、管理員走群組。

---

## 1. LINE 整合現況（PR #920 已完成、已 push）

平台先前只有 LINE 的「骨架 / 稽核 / contract」，PR #920 把實際連線接上。已完成並合入 branch 的內容：

| 步驟 | 內容 | 狀態 |
|---|---|---|
| 基礎 | `line_user_mapping` schema、`line-binding.mjs`、in-memory fallback | ✅ |
| Messaging | `line-messaging.ts`（push/reply/簽章驗證）、ops 通知從**已停用的 LINE Notify** 遷移到 Messaging API | ✅ |
| Webhook | `/api/line/webhook`（簽章/rate-limit/冪等/follow/unfollow） | ✅ |
| LIFF | `/api/line/auth/verify`（idToken `aud` 驗證）＋真 LIFF 登入入口 | ✅ |
| 旅客 push | 建單/付款/取消/退款 → 旅客個人 LINE（凡綁定者都推） | ✅ |
| 導遊綁定 | `guide_line_mapping` + 綁定碼（深連結 `BIND-XXXXXX`）+ webhook 兌換 + `/api/guide/line-binding` | ✅ |
| 旅客綁定（console） | `line_bind_code` 一次性碼 `TBIND-XXXXXX` + webhook 兌換 + `/api/me/line-binding` + `/me/profile` 按鈕（非 LIFF，官網下單者也能綁） | ✅ |
| 導遊 push | 四事件 → 該團導遊個人 LINE | ✅ |
| admin 後台 push | 後台改/取消/退款訂單也派送 LINE（旅客+導遊），與 Telegram 對稱 | ✅ |
| 提醒 | pre-tour-sweep `line_push` channel | ✅ |

**對應檔案**：`src/lib/line-messaging.ts`、`line-messages.ts`、`line-binding.mjs`、`line-webhook.mjs`、`line-liff-verify.mjs`、`line-traveler-push.mjs`、`line-guide-push.mjs`、`guide-line-binding.mjs`；routes 在 `app/api/line/**`、`app/api/guide/line-binding/`。

### 1.1 LINE 旗標（kill-switch）— **全部預設 OFF**

| 旗標 | 作用 | 預設 |
|---|---|---|
| `LINE_MESSAGING_ENABLED` | 所有 Messaging API egress（ops + 個人 push）總開關 | `0` |
| `LINE_PUSH_ENABLED` | 旅客個人 push | `0` |
| `LINE_GUIDE_PUSH_ENABLED` | 導遊個人 push | `0` |
| `NEXT_PUBLIC_LINE_LIFF_ENABLED` | 真 LIFF 登入（off = legacy query-param 回退） | `0` |

---

## 1.5 後台通知矩陣（admin-controllable，#920 owner 需求）

管理者可在後台 **`/admin/notifications`「通知設定」** 頁，逐格勾選每個訂單事件要不要通知，維度為 **5 事件 × 3 對象（旅客／導遊／管理者群組）× 2 通道（LINE／Telegram）= 30 格**。

**分層（三層皆需通過才送出）**：
1. **通道環境總開關**（基礎設施層）：`LINE_MESSAGING_ENABLED` / `TELEGRAM_NOTIFY_ENABLED` 等——這個 deploy 有沒有設好 token、有沒有開。
2. **後台矩陣**（業務層）：管理者在 `/admin/notifications` 勾選的那一格。**預設全開**，所以未動過設定＝沿用既有全派送行為。
3. **對象綁定**：旅客／導遊要有可解析的 LINE userId／Telegram chat。

**實作**：`src/lib/notification-settings.mjs`（gateway：`isNotifyEnabled(event, recipient, channel)` / `getNotificationMatrix` / `setNotificationCells`）；單列 JSONB 設定表 `notification_event_settings`（+ audit）；API `GET/PATCH /api/admin/notification-settings`；UI `app/admin/notifications/page.tsx`。矩陣已接進全部 6 條派送腿（LINE 旅客/導遊/管理群 ops、Telegram 三腿），任一格關閉 → 該腿回 `skipped(matrix_disabled)`。

> 關閉某格只「不發那一格」；其餘格不受影響。系統告警（非訂單事件）不在矩陣內，照常發送。

---

## 1.6 LINE 正式環境設定 checklist（external，operator 操作）

程式碼已全數就緒，要實際送出 LINE 還缺以下**外部設定**（在 LINE Developers / Vercel 操作，不在 repo）：

- [ ] **建立 Messaging API channel**（LINE Developers Console）→ 取得 `LINE_CHANNEL_ACCESS_TOKEN`（長期 token，≥32 字元）與 `LINE_CHANNEL_SECRET`（≥24 字元）。
- [ ] **註冊 webhook URL**：channel 設定填 `https://<正式網域>/api/line/webhook` 並「啟用 webhook」、關閉自動回覆。
- [ ] **bot 加入 ops/admin 群組** → 取群組 `groupId` 設 `LINE_OPS_GROUP_ID`（未設＝管理群 ops 一律 skip `no_ops_group`）。
- [ ] **官方帳號 Basic ID** 設 `LINE_BOT_BASIC_ID`（綁定深連結 `line.me/R/oaMessage/<id>/?<code>` 用；未設則綁定改顯示「手動貼碼」指示，仍可運作）。
- [ ] **LINE Login channel + LIFF app**（若要開 LIFF 進場）→ `LINE_LOGIN_CHANNEL_ID`（idToken `aud` 驗證）、`NEXT_PUBLIC_LIFF_ID`。
- [ ] **Vercel env** 填入上述變數（勿 commit）；production build 的 `startup-env` 守門會驗 LINE 必要 secret 強度。
- [ ] **依 SOP 分階段開旗標**（見 `issue-179-line-liff-rollout-support-sop.md` L0–L3）：先 `LINE_MESSAGING_ENABLED=1` 驗 ops，再 `LINE_PUSH_ENABLED` / `LINE_GUIDE_PUSH_ENABLED`，最後 `NEXT_PUBLIC_LINE_LIFF_ENABLED`。
- [ ] **後台矩陣**（§1.5）確認各事件×對象×LINE 的勾選符合營運期望（預設全開）。
- [ ] 舊 `LINE_NOTIFY_ACCESS_TOKEN`（LINE Notify，2025-03-31 已停用）可從正式環境移除。

> migration（`line_user_mapping` / `line_webhook_events` / `line_bind_code` / `notification_event_settings` 等）套用步驟見 `docs/operations/line-telegram-prod-migrations.md`。

---

## 2. ⏸️ LINE 事件 push 已暫停（2026-06-15）

依目標架構（§0），**LINE 不再負責事件 outbound 通知**。現況：

- 上述三個 push 旗標（`LINE_MESSAGING_ENABLED` / `LINE_PUSH_ENABLED` / `LINE_GUIDE_PUSH_ENABLED`）**預設即為 `0`**，因此**正式環境目前不會有任何 LINE 事件推播**——LINE 事件通知**已處於暫停狀態**，無需額外改碼。
- **保留**的部分：LINE OA 作為旅客諮詢入口、webhook 綁定 ingestion、以及（未來）管理員在 OA 手動回覆。這些不依賴上述 push 旗標。
- 程式碼**保留不刪**（flag-gated），日後若要恢復只需開旗標；目前事件通知改由 **Email + Telegram** 承擔（§3、§4）。

### 2.1 免費 LINE 訂單查詢（Reply pull，零額度成本）

LINE **Push API（主動推播）會計入方案額度**（免費方案 200 則/月）；**Reply API（回覆使用者主動傳來的訊息）目前免費且不限量**。因此「主動通知」走 Email/Telegram，而「LINE 上的訂單查詢」改成**使用者來查、我們免費回覆**的 pull 模式：

- 旅客在 OA 傳含「我的訂單／訂單／付款／預約」等關鍵字的訊息 → webhook 用 **Reply API** 回覆其**最近 3 筆訂單**狀態、金額、訂單編號；**未付款**訂單附「前往付款」連結（`/me/orders`）。
- 未綁定 → 回覆引導去 `/me/profile` 綁定；查無訂單 → 引導去 `/activities`。**不洩漏任何他人資料**（僅以 `lineUserId` 反查本人綁定）。
- 實作：`src/lib/line-order-query.mjs`（`parseOrderQueryIntent` / `buildOrderQueryReplyMessages`，永不 throw、回覆內容不落地）接進 `line-webhook.mjs`（順序：guide 綁定 → traveler 綁定 → **訂單查詢** → bare upsert）。測試：`tests/api/line-order-query-reply.test.mjs`。
- 連結用 `NEXT_PUBLIC_APP_URL` 組絕對網址。Reply 仍受 `LINE_MESSAGING_ENABLED` 總開關節制（關閉時 no-op），但**因為是 Reply 不是 Push，開啟後也不耗額度**。
- **建議 operator 設定**：在 LINE OA 後台建一個 **Rich Menu「我的訂單／前往付款」**，按鈕送出上述關鍵字文字（或 postback），讓旅客一鍵觸發免費查詢、提高可發現性。

---

## 3. Email 覆蓋率現況與落差

**傳輸**：Resend（`RESEND_API_KEY`，寄件人 `EMAIL_FROM`）。實作於 `src/lib/email.ts`。
**管理員收件**：`ADMIN_EMAIL_ALLOWLIST`（逗號分隔）。

### 3.1 現況矩陣（每事件 × 每對象是否寄 Email）

| 事件 | 旅客 | 導遊 | 管理員 | 派送點 |
|---|---|---|---|---|
| 建單（未付款） | ✅ | ❌ | ❌ | `app/api/orders/route.ts` `sendOrderConfirmation` |
| 付款成功 | ✅ | ❌ | ✅ | `ecpay/callback/route.ts` `sendPaymentSuccess` + `sendAdminPaymentNotification` |
| 訂單取消 | ✅ | ❌ | ❌ | `me/orders/[orderId]/route.ts` `sendOrderCancellation` |
| 退款申請 | ✅ | ❌ | ❌ | `refund-requests/route.ts` `sendRefundRequested` |
| 退款完成 | ✅ | ❌ | ❌ | `refund-requests/route.ts` `sendRefundExecuted`（僅 auto-execute） |

> 導遊另有 reschedule 專屬 email（`sendRescheduleRequestNotice`），但**核心五事件導遊完全收不到 email**。

### 3.2 落差 → ✅ 已補齊（commit `5fa54b1`）

- ~~導遊 Email：五事件全缺~~ → 新增 `sendGuideOrderNotification` + `dispatchOrderEventEmails`，四個 order hooks 都會寄；guide email 由 `lookupOrderContext` 解析，無 email 自動 skip。
- ~~管理員 Email：只有付款~~ → 新增 `sendAdminOrderNotification`，補「建單 / 取消 / 退款申請 / 退款完成」；付款仍走既有 `sendAdminPaymentNotification`（`includeAdmin:false` 避免重複）。

**現況矩陣（補齊後）**：旅客五事件、導遊五事件、管理員五事件，皆有 Email（導遊需 `guide_profiles.guide_email`）。

---

## 4. Telegram 現況與目標

**系統告警（既有）**：`src/lib/telegram-notify.ts`，env `TELEGRAM_ALERT_BOT_TOKEN` / `TELEGRAM_ALERT_CHAT_ID`（#1215）。與訂單通知**分開的 bot**。

**訂單通知 — 管理員群組：✅ 已完成（commit `04ff92b`）**：
- `telegram-messaging.ts`（`sendTelegramMessage` / `pushTelegramToAdmin`，用 `TELEGRAM_BOT_TOKEN`）+ `telegram-messages.ts`（三對象文案）。
- `dispatchOrderEventTelegram` 接到四個 order hooks → 五事件都通知 `TELEGRAM_ORDER_CHAT_ID`。
- 旗標 `TELEGRAM_NOTIFY_ENABLED`（預設 OFF）；403（被封鎖）視為 skip。

**訂單通知 — 導遊/旅客個人：✅ 已完成（綁定 increment）**：

| 對象 | Telegram 綁定方式 |
|---|---|
| 管理員 | 單一群組 chat id（`TELEGRAM_ORDER_CHAT_ID`） |
| 導遊 | 深連結 `https://t.me/Midao2026bot?start=<code>` → bot 收 `/start <code>` → webhook 兌換 → 綁定 chat_id ↔ guide_id（鏡像 LINE 綁定碼） |
| 旅客（可選） | 同上，role=traveler（subject=user_id，contact_email 備援） |

**已建檔案**：
- `telegram-messaging.ts`（send client）+ `telegram-messages.ts`（三對象文案）。
- `telegram-binding.mjs`（綁定/兌換/解析 `/start`/idempotency）+ `db.mjs` Supabase helpers + in-memory fallback。
- `telegram-webhook.mjs` + `/api/telegram/webhook`（`X-Telegram-Bot-Api-Secret-Token` 常數時間驗證、`update_id` 冪等、`my_chat_member` 封鎖處理）。
- `order-telegram-notify.mjs`（admin + guide + traveler fan-out）接到四個 order hooks。
- mint 端點：`/api/guide/telegram-binding`、`/api/me/telegram-binding`。
- schema：`20260615_line302c_telegram_binding.sql`（+rollback）：`telegram_chat_mapping` / `telegram_bind_code` / `telegram_webhook_events`。
- 旗標：`TELEGRAM_NOTIFY_ENABLED` / `TELEGRAM_GUIDE_NOTIFY_ENABLED` / `TELEGRAM_TRAVELER_NOTIFY_ENABLED`（預設 OFF）。
- env 守門：`startup-env`（notify 開時要 `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET`）、`security-env`（webhook secret 弱密鑰檢查）。

**設定（Step 0）**：BotFather 開 bot（username `Midao2026bot`）→ `TELEGRAM_BOT_TOKEN`（存 Vercel/.env，勿 commit）；`TELEGRAM_BOT_USERNAME=Midao2026bot`；設 `TELEGRAM_WEBHOOK_SECRET` 並用 Telegram `setWebhook`（指向 `/api/telegram/webhook`、帶 `secret_token`）；bot 拉進 ops 群組取 `TELEGRAM_ORDER_CHAT_ID`；開 `TELEGRAM_NOTIFY_ENABLED=1`。

---

## 5. 後續橋接路線圖

1. ✅ 文件化 + 暫停 LINE 事件 push（§2，旗標已 OFF）。
2. ✅ 補 Email 落差：導遊五事件 + 管理員缺漏事件（`5fa54b1`）。
3. ✅ Telegram messaging client + 管理員群組通知（`04ff92b`）。
4. ✅ **Telegram 導遊/旅客個人綁定**：webhook + `/start <code>` 深連結 + `telegram_chat_mapping` schema + 個人 push 接四 hooks（`TELEGRAM_GUIDE_NOTIFY_ENABLED` / `TELEGRAM_TRAVELER_NOTIFY_ENABLED` gated）+ mint 端點。
5. ✅ **綁定 UI**：後台「綁定 LINE / Telegram」按鈕（`NotificationBindingButton`，呼叫 `/api/guide/{line,telegram}-binding`、`/api/me/telegram-binding`）。guide profile 有 LINE + Telegram 兩面板、traveler profile 有 Telegram；GET 顯示狀態、POST 產生一次性碼 + 深連結。綁定在 app 內 out-of-band 完成，面板於**視窗 refocus** 與「我已完成，重新檢查狀態」按鈕重新查詢狀態，確認綁定後收合一次性碼。Playwright：`issue302b-guide-binding-panel.spec.ts`、`issue302b-traveler-telegram-binding.spec.ts`。

> **正式環境啟用前置**（Vercel env，PR #920 部署後生效）：`TELEGRAM_BOT_TOKEN`、`TELEGRAM_WEBHOOK_SECRET`、`TELEGRAM_BOT_USERNAME=Midao2026bot`（深連結用）；並以 Telegram `setWebhook` 指向 `/api/telegram/webhook` 帶 `secret_token`。push 旗標（`TELEGRAM_*_NOTIFY_ENABLED`）預設 OFF，驗證後再開。

> 所有新管道一律 **feature flag 預設 OFF**、**fire-and-forget 不阻塞 API**、**PII 不落地**（沿用 LINE 既有準則）。
