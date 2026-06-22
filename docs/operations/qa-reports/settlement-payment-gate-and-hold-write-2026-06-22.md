# 結算付款 gate + payout-hold 寫入端 驗收報告

- **判定：PASS（本機實測：typecheck / 3689 node tests / lint / Playwright E2E 全綠；live 唯讀盤點）**
- **分支：** `claude/order-status-annotations-8da27n`
- **時間：** 2026-06-22 (Asia/Taipei)
- **資料層：** in-memory fallback（單測/E2E）＋ 正式 Supabase 唯讀盤點（owner 授權）

> 本報告不含密鑰／access token／service-role key／cookie／完整付款 payload／未遮蔽 PII。

---

## 待辦 1 — 結算 sweep 補「錢真的收到」gate

### 問題
`/api/internal/settlement/sweep` 只用 `.eq('status','completed')` 當資格，沒檢查訂單
是否真的收到錢。發現 `Ava Preview Smoke …1158aa21` 為 `status=completed` 但
`paid_at IS NULL`（未付款）卻已被結算進 `payout_items`（net 6120）。

### gate 設計（owner 拍板）
用 **`paid_at IS NOT NULL`** 而非 `payment_status` 文字欄：
- 每條付款路徑（ECPay callback、現金/手動付款、#197 heal）都會寫 `paid_at`；
- `payment_status` 文字欄在 #197 之前會 drift（`payments.status='paid'` 但
  `orders.payment_status='pending'`，只在 callback replay 時 lazy heal），用它當
  allowlist 會誤擋舊的合法已付訂單。

### live 唯讀盤點（驗證 gate 不誤擋舊資料、盤點受影響筆數）
`completed` 訂單的 `payment_status` × `paid_at` 分布：

| payment_status | paid_at 有值 | 筆數 |
| --- | --- | --- |
| paid | ✅ | 2 |
| partially_refunded | ✅ | 2 |
| refunded | ✅ | 1 |
| pending | ❌ | 1 |

- 所有合法 completed 訂單（paid / partially_refunded / refunded）都有 `paid_at` →
  **新 gate 不會誤擋任何一筆**。
- 唯一 `paid_at IS NULL` 的 completed 訂單就是 anomaly `…1158aa21`（Ava Preview
  Smoke）→ 新 gate 精準只擋這一筆。
- 已被誤結算進 `payout_items` 的 `paid_at IS NULL` 訂單：**1 筆**（即 `…1158aa21`）。

### 實作
- `src/lib/post-trip/payout-eligibility.mjs`：新增純函式 `isSettlementPaymentCollected(paidAt)`；
  `evaluatePayoutEligibility` 新增 `paidAt` gate（向後相容：只在有傳 `paidAt` 時啟用，
  reason `PAYMENT_NOT_COLLECTED`）。
- `app/api/internal/settlement/sweep/route.ts`：select 加 `paid_at`、Order type 加
  `paid_at`，`eligibleOrders` 過濾用 `isSettlementPaymentCollected(order.paid_at)`。
- 測試：`tests/api/settlement-payment-collected-gate.test.mjs`（行為 + 源碼契約，12 案）。

### 待處理（需 owner 決定，未自動執行）
anomaly `…1158aa21` 已存在的錯誤 `payout_items`（net 6120）與其灌進 `guide_balances`
的餘額，gate 只防未來重複（且 sweep 本身 idempotent），不會自動回沖。是否要回沖這筆
fixture 的錯誤撥款屬 production 金錢資料異動，待 owner 拍板再做。

---

## 待辦 2 — admin 後台補 is_disputed / is_safety_case 寫入入口

### 問題
#1221/#1284 讓結算/導遊端讀 `is_disputed`（payment_dispute）與
`is_safety_case`（safety_review）兩個 payout-hold 旗標、#1473 補了 DB 欄位，但 admin
後台一直沒有設定這兩個 hold 的入口（`updateOperationsTrackingDb` 不寫、頁面沒 toggle），
等於 hold 永遠 false、無法人工暫停撥款。

### 實作（gateway + fallback + UI 全層打通）
- `src/lib/db.mjs`：`listOperationsTrackingDb` select 加兩欄、回傳 map 加
  `isDisputed/isSafetyCase`、`hasException` 納入兩旗標；`updateOperationsTrackingDb`
  payload 加 `is_disputed/is_safety_case`。
- `src/lib/admin.mjs`（in-memory fallback）：`findOrCreateOpsRow` 預設、
  `buildOpsContribution` 的 `hasException` 納入、`updateOperationsTrackingFallback`
  寫入 + audit metadata。
- `src/lib/store.mjs`：seed rows 補欄位保持 shape 一致。
- `app/admin/operations-tracking/page.tsx`：Row type + 兩個 toggle
  「⚖️ 付款爭議（暫停撥款）」「🛡️ 安全事件（暫停撥款）」。
- 測試：
  - `tests/api/operations-tracking-dispute-safety-write.test.mjs`（fallback round-trip
    + hasException + 源碼契約，5 案）。
  - `e2e/operations-tracking-dispute-safety-toggle.spec.ts`（真實瀏覽器：選單→勾選→
    儲存，斷言 PATCH body 帶 `isDisputed/isSafetyCase=true`）。

設定其一為真後，既有 `computeSweepPayoutItem` / `computeGuidePayoutEstimate` 的 hold
gate（#1221/#1284）即會把該單擋下不撥款 — 端到端串通。

---

## 測試結果
- `npm run typecheck`：綠
- `npm test`：3689 pass / 0 fail / 3 skipped
- `npm run lint`：綠
- Playwright E2E：`operations-tracking-dispute-safety-toggle.spec.ts` 1 passed
