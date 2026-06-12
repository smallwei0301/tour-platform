# Issue #1411 驗收報告 — 站內訊息第一期（訂單留言串＋email 通知）

- **Issue**: #1411（#1388 成長基礎總綱項目）
- **PR**: #1412（squash merge 至 main：`3d5f3b44b4298c27218d71aa1ad5cac1c1ab9d26`）
- **驗收時間**: 2026-06-12 00:30（Asia/Taipei）
- **環境**: 本機 `next dev`（Playwright managed webServer，`http://127.0.0.1:3333`，in-memory fallback）＋ Vercel preview `tour-platform-git-claude-repo-aud-9b0812-smallwei0301s-projects.vercel.app`（build Ready）
- **CI**: PR #1412 六項 check 全綠（lint→typecheck→test→build→preflight 的 `test`、`smoke`（e2e-smoke lane）、`scan`、Migration source-contract、Production schema drift、Vercel）

## 逐條 AC 證據

### AC1 — traveler 發言、guide 回覆 ✅ PASS
- `tests/api/issue1411-order-messages-contract.test.mjs`：`contract/create`（traveler 發言→契約 shape）、`contract/create: guide 回覆`、`contract/list`（createdAt 升冪）實測綠燈。
- `e2e/issue1411-order-messages.spec.ts` 真實瀏覽器（chromium）4/4 通過：
  - test 1：traveler 在訂單頁填寫送出 → `order-message-item` 由 1 變 2、輸入框清空、POST payload body 正確。
  - test 4：guide 在 `/guide/messages` 展開串 → 回覆 → 串內 2 則、待回覆旗標翻轉（`messages-empty` 出現）。

### AC2 — 窗口外 403 `MESSAGE_WINDOW_CLOSED`、前端唯讀/隱藏 ✅ PASS
- `tests/unit/issue1411-order-messages.test.mjs`：completed ±14 天邊界（第 14 天整點可發、超過即唯讀）、cancelled/refunded/refunding/refund_requested 唯讀、pending_payment 不可見，16 測綠燈。
- contract 測試：`ord_mock_004`（pending_payment）與 `ord_mock_005`（completed >14 天）POST 均擲 `MESSAGE_WINDOW_CLOSED`（route 層轉 403）。
- E2E test 2（唯讀提示、無輸入框）、test 3（pending_payment 留言區整個隱藏）真實瀏覽器通過。

### AC3 — ownership 隔離、admin 唯讀 ✅ PASS
- contract 測試：別人的 email → `ORDER_NOT_FOUND`（不洩漏存在性）；guide 摸非自己活動的訂單 → `FORBIDDEN`（route 層 403）；admin 不帶 ownership（service-role 路徑）可唯讀整串。
- `tests/api/issue1411-order-messages-routes.test.mjs`：admin route 僅 export GET（無 POST/PATCH/DELETE）；Supabase 分支 source-contract 鎖定 ownership→窗口→insert 順序。

### AC4 — email 通知＋15 分鐘節流＋交易類 ✅ PASS（含實寄）
- 節流實測：contract 測試同角色 15 分鐘內第二則 `shouldNotify=false`（留言仍寫入）、guide 回覆不受 traveler 節流影響；unit 測試含 15 分鐘邊界與 snake_case row。
- `order_message` 已加入 `TRANSACTIONAL_EMAIL_KINDS`（`shouldSendEmailKind` 對交易類一律回 true，不受行銷 opt-out 影響）。
- wrapper `order-message-notify.ts` 仿 `reschedule-notify.ts`（best-effort、fire-and-forget、無 email 靜默略過）；route source-contract 鎖定 `void notify…().catch`。
- **實寄驗證（2026-06-12 08:32 Asia/Taipei）**：owner 提供限權 Resend key（Sending access、事後撤銷）後，以一次性 scratch script transpile-import `src/lib/email.ts` 並呼叫 `sendOrderMessageNotice`（production 同一條路徑），實寄至 owner 信箱（sma***01@gmail.com）成功 — Resend 回傳 `ok:true, status:'sent', messageId=f31081fb-55d7-4c23-9155-940b805c467b`；收件匣到達由 owner 確認。scratch script 已刪除、key 不落地 repo。

### AC5 — rate limit 第 11 則回 429 ✅ PASS
- `tests/unit/issue1411-message-rate-limit.test.mjs`（本報告隨附補測）：transpile `rate-limit.ts` 後行為實測 — 同 key 第 1–10 則放行、第 11 則 `allowed=false` 且 `createRateLimitResponse` 產生 status 429；視窗 ≈600s、`maxRequests=10`；不同使用者不互佔額度。2 測綠燈。
- routes source-contract：兩支 POST 皆為 auth → `messageSendLimiter.check` → gateway 順序。

### AC6 — gateway fallback＋契約測試 ✅ PASS
- `listOrderMessagesDb`／`createOrderMessageDb`／`listGuideMessageThreadsDb` 三函式皆有 `hasSupabaseEnv()` fallback 分支（`order-messages-store.mjs`）；契約測試 14 測綠燈（in-memory 實測＋Supabase 分支 source-contract：`order_messages` 表、`guide_id` 過濾、shape keys）。
- 窗口/節流/serialise 邏輯抽純函式 `src/lib/order-messages.mjs`（符合 #1385 strangler 準則）。

### AC7 — E2E 全綠、既有套件不退步 ✅ PASS
- Playwright `issue1411-order-messages.spec.ts`：**4 passed (51.0s)**，真實瀏覽器 + `page.route` mocked backend。
- 全套 `npm test`：**3269 pass / 0 fail**（3 skipped 為既有）；lint ✅、typecheck ✅、production build ✅（注入測試用 `GUIDE_SESSION_SECRET`/`ADMIN_ACCESS_TOKEN`）。
- 既有 specs 未改動；traveler 訂單頁新增的 `/messages` fetch 失敗時靜默隱藏區塊，不影響 `issue1379`/`issue1383` 等既有 spec（均以 exact pattern mock）。

## 判定

**PASS**（全部 AC 含 AC4 實寄均綠；無 NOT_VERIFIED-live 項目）。

## 備註

- Migration `20260611120000_issue1411_order_messages.sql` 為新表＋RLS（idempotent guard），不動既有表；rollback 註解在檔尾。CI 的 Migration source-contract 與 schema drift 均綠。Supabase 正式環境套用後建議以 admin 唯讀 endpoint 抽查一筆真實訂單串。
- 本報告不含任何密鑰、cookie、token 或未遮蔽 PII。
