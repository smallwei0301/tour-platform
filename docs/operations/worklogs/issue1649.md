# issue1649 — 訂單／退款／金流 v2 全面串接（實作篇）
> 最後更新：2026-07-07（Asia/Taipei）｜負責 session：claude-fable-5 / claude/payment-order-v2-migration-vq0lau
> 計劃全文：issue #1649（六階段）；docs-only 計劃書 PR #1651（另一 branch，`17-order-refund-v2-migration-plan.md`）。
> 本 worklog 記錄實作 session 的進度錨點——**context 恢復後先讀本檔**。

## 目標（owner /goal 指令，2026-07-07）
把專案中所有金流、訂單串接全數改為 v2；完成時必須有 QA 證據顯示所有修改後的串接都沒問題。

## 範圍界定（本 session）
- Phase 1+2（traveler 讀取＋寫入面）→ Phase 3（admin）→ Phase 4（guide）→ Phase 5 非凍結部分（/order/pay 補付頁）。
- **凍結區 `app/api/payments/**` 不碰**（無 P0-OVERRIDE 授權）；legacy routes 本輪保留（退役=Phase 6 另案）。
- ECPay callback 路徑切換（Phase 5.1）需部署協調，屬 owner 決策，本輪不做。

## 進度

### Phase 1+2 — traveler 訂單面 v2 全面接線（本 commit）
- 新 v2 routes（全部走 jsonOk/jsonError＋handleRouteError/錯誤映射＋zod parseBody 標準骨架；
  寫入 route 一律 route 內顯式 `validateCsrf`——middleware CSRF 不涵蓋 /api/v2 非 admin 路徑）：
  - `GET /api/v2/orders`（列表；listMyOrdersDb 委派＋myOrdersLimiter）
  - `GET /api/v2/orders/[orderId]`（既有 route 補齊 legacy 欄位聯集＋guest ?contactEmail=＋#1565 voucher＋in-memory fallback＋#1493 deadline 欄位 fallback）
  - `POST /api/v2/orders/[orderId]/cancel`（cancelOrderDb＋全通路通知扇出，legacy PATCH cancel 等價）
  - `GET/POST /api/v2/orders/[orderId]/refund-requests`（含 policy snapshot＋REFUND_AUTO_EXECUTE 移植）
  - `GET /api/v2/orders/[orderId]/reschedule-options`、`POST .../reschedule-requests`、`DELETE .../reschedule-requests/[requestId]`
  - `GET/POST /api/v2/orders/[orderId]/messages`（rate limit＋窗口由 gateway 把關）
  - `GET /api/v2/orders/[orderId]/guide-contact`（#1596 語意不變）
  - `GET /api/v2/orders/[orderId]/payments`（契約 §4.2；ownership 先行＋service-role 讀 payments）
  - `GET /api/v2/promo-codes/public`（#1381 v2 化，§D 決策 3 建議採納）
- 前端切換（零 legacy 呼叫）：`/me/orders`、`/me/orders/[orderId]`（全部互動）、`/order/success`、
  `/guides/[slug]/shop/orders`、`PublicPromoBanner`。
- 新增 `src/lib/v2/traveler-auth.ts`（getTravelerIdentity：有 env auth 失敗即拋、無 env 回空身分）＋
  `src/lib/supabase/service.ts`（service-role factory；app/api 不再直接 import @supabase/*）。
- `client-api.ts` 六個死碼 helper 移除（fetchExperiences/fetchMyOrders/fetchMyOrderDetail/
  fetchRefundRequests/createRefundRequest/submitEcpayCallback）。
- e2e mocks 同步：16 個 spec 的 `/api/me/orders*`→`/api/v2/orders*`、`/api/promo-codes/public`→v2。
- 測試基建修復：`issue1381-public-promo-codes.test.mjs` path.resolve cwd 依賴 → WEB_ROOT
  （import.meta.url 基準；run-checks 從 repo root 跑也綠）。
- 治理 guard 遭遇＋照規則修正：`v2-route-contract-smoke` auth 斷言改認 getTravelerIdentity
  （guard 意圖不變）；`src/lib 頂層檔案數天花板` → v2/ 子資料夾；`app/api 直接 import
  @supabase/* 天花板` → supabase/service.ts helper。
- **證據**：`run-checks.sh --typecheck` 綠（94 tests＋tsc）；新契約測試
  `tests/api/issue1649-v2-traveler-orders-contract.test.mjs` 14/14。

### Phase 3+4+5（非凍結）— admin/guide/補付 v2 命名空間接線（本 commit）
- **單一實作策略（strangler）**：v2 route＝殼，委派 legacy handler——零行為漂移、
  envelope/錯誤碼全等；legacy 退役（Phase 6）時實作整體搬遷。
  - Admin 20 殼（orders 全套 9＋refund-requests 6＋payouts 5）：純 re-export；
    auth+CSRF 由 middleware 對 /api/v2/admin/**（matcher 已涵蓋）施加與 legacy 相同規則。
    refund-execute（518 行、10 個測試檔鎖原始碼）因此完全不複製、不分岔。
  - Guide 10 殼：GET re-export（payout 兩支含 dynamic）；寫入三支（approval／order
    messages POST／reschedule decision）middleware 不涵蓋 /api/v2/guide → 殼內顯式
    validateCsrf 再委派 legacy POST。
  - Payments：`POST /api/v2/payments/ecpay/create` re-export 凍結區 handler
    （只 import 不修改）；/order/pay 頁切 v2（detail＋create 兩呼叫）。
- UI 切換：admin orders/refunds/payouts/ops-orders 四頁、guide bookings/dashboard
  （payout+bookings 呼叫）/messages/reschedules 四頁——全域 grep 前端零 legacy 命中
  （guide/dashboard 的 /api/guide/dashboard 與 /api/guide/qa 不在 #1649 範圍清單，保留）。
- e2e mocks 同步：admin 8 specs＋guide 5 specs（受保護 booking-flow-validation 直打
  legacy API、legacy 保留故不受影響，未觸碰）。
- 測試基建修復（cwd 依賴 → WEB_ROOT）：guide-payout-csv-contract、
  issue1411-order-messages-routes；頁面 URL 斷言更新：issue448-payouts、
  issue1365-admin-payout-manual-fallback、guide-payout-monthly-contract。
- 新契約測試：`issue1649-v2-admin-guide-namespace-contract.test.mjs`（殼委派＋CSRF＋
  頁面零 legacy，4 tests 全綠）。
- **證據**：`run-checks.sh --typecheck` 綠（14 檔測試＋tsc）。

### 待辦
- [ ] Phase 3：admin orders/refunds/payouts v2 化＋三頁 UI 切換＋POS 四支接 UI
- [ ] Phase 4：guide bookings/payout/messages/reschedules v2 化
- [ ] Phase 5（非凍結）：/order/pay 補付頁 v2 repay
- [ ] QA 收尾：npm test 全綠＋Playwright 實跑＋QA 報告落 docs/operations/qa-reports/
- [ ] 契約偏差記錄：cancel/reschedule 以 order 為主體實作（`/api/v2/orders/:id/...`），
  與契約 bookings/:id/* 端點語意相同、主體不同——Phase 6 更新 spec 時一併對齊。

## 刻意決策
1. **order-scoped 而非 booking-scoped**：UI 全面以 orderId 操作；契約定義的
   `POST /api/v2/bookings/:id/cancel`／`reschedule-request` 改實作為
   `/api/v2/orders/:orderId/cancel`／`reschedule-requests`——行為與 legacy 等價、
   in-memory（無 bookings）可測。spec 更新列入 Phase 6。
2. **legacy 通知扇出整段複製到 v2 route**（非抽共用 lib）：legacy route 有大量 source-regex
   契約測試鎖住原始碼，抽出會破壞；legacy 於 Phase 6 退役後重複即消失（strangler 常態）。
3. **e2e mock 只換 URL 不換 envelope**：前端一律讀 `j.data`/`j.error`，v1 `{ok}` 與 v2
   `{success}` envelope 對頁面行為無差；降低 spec churn。
