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

### QA 收尾（2026-07-08 00:20 完成）
- `run-checks.sh --typecheck --all`：4533 tests／4530 pass／0 fail／3 skipped＋tsc＋lint 綠。
- Playwright 整合批次 27 specs／67 tests → 64 pass；3 fail 全數查證非本次回歸
  （1 個 main 基準線同敗＝既有問題；2 個批次負載 flaky，單獨重跑綠）。
- **main worktree 基準線交叉驗證**：6 個既有 e2e 失敗於 main（a75f21f）完全相同，
  與 v2 遷移無關（清單見 QA 報告）。
- #1598 guard 補「委派殼」結構性辨識；自寫 traveler routes 真接 reportRouteError。
- 死碼測試改寫（issue826→殘留守門、issue461a AC2→改鎖詳情頁）；3 個 cwd 依賴測試修復；
  member-pages-redesign networkidle deflake（根因：沙盒 Chromium 無 proxy 掛住
  va.vercel-scripts.com／unsplash 外部請求，debug script 實證）。
- QA 報告：`docs/operations/qa-reports/issue1649-v2-full-wiring-qa-20260707.md`。

### Phase 5.1＋Phase 6（2026-07-08 完成，接續 owner 指令）
- **Phase 5.1**：新增 `POST /api/v2/payments/ecpay/callback`（re-export 凍結區 legacy handler
  ——單一實作，冪等三防線/驗簽/金額比對零分岔）；v2 checkout ReturnURL 預設切至 v2 路徑
  （`ECPAY_CALLBACK_URL` env 覆寫保留＝部署協調 escape hatch）；legacy callback 保留相容期。
  契約測試 `issue1649-phase51-v2-callback-contract`（3 tests）；issue1571 三鏈路基線 11/11 綠。
- **Phase 6 退役**：
  - `app/api/me/orders/**` 刪除（v2 為獨立實作）；`app/api/admin/{orders,refund-requests,
    payouts}/**`（20 檔）與 `app/api/guide/{bookings,payout,messages,orders,
    reschedule-requests}/**`（10 檔）實作**整體搬遷**至 v2 命名空間（import 深度+1、
    guide 寫入三支殼內顯式 validateCsrf 保留）。
  - 受保護 spec 安全性確認：`booking-flow-validation.spec.ts` 零 expect 斷言（純報告型），
    legacy 刪除不致紅燈；funnel spec 只走頁面。
  - 30 支搬遷 route 接上 `reportRouteError`（26 支自動注入含 return 的 catch；4 支零
    try/catch 唯讀 GET 列 #1598 白名單附原因）。
  - #1614 手刻樣板 guard：30 檔以「債務搬遷」註記列白名單（app/api 全域手刻總數未增；
    envelope ok/fail 凍結至前端 envelope 遷移另案）。
  - 測試 repoint：admin 17 檔＋guide 10 檔＋traveler 8 檔 source-contract 測試改指 v2 路徑；
    v2 refund-requests route 補回 legacy 原註解/日誌字樣（436/auto-execute 契約）；
    issue1571 cwd 依賴修復。
  - 殘留守門：`issue1649-phase6-legacy-retirement-residue-guard`（5 tests：legacy 不回流＋
    v2 在場＋非殼＋guide CSRF）。
  - `line-order-query.mjs` 已用 `listMyOrdersDb`（與 v2 orders 同一讀取函式）——Phase 6.2
    天然滿足；internal sweeps 不搬命名空間（§D 決策 2）。
  - 契約 spec 同步：`10-api-spec-v2-booking-pos.md` 新增 §9 實作狀態補記（超契約端點清單、
    order-scoped 偏差、已退役路徑、internal sweeps 決策）。
  - `scripts/demo-smoke.sh` 改打 v2。
- **e2e 修復（#1655，main 既有 6 失敗）**：tablist focus race 真修（use-tablist-keyboard
  有界重試＋事件目標索引）＋退役 checkout 陳舊 specs 改寫＋login-redirect regex 修正，
  全部實跑綠。
- **凍結區未動（需 owner P0-OVERRIDE 才能退役）**：`app/api/payments/ecpay/{create,callback,
  refund-callback}`、`app/api/payments/mock-confirm`——v2 對應已接線，legacy 為相容期安全網。

### 2026-07-08 追加輪（同 session、fresh container）
- **重複工作事故（已回收）**：本輪 container clone 早於 PR #1656 merge，開機未對齊遠端
  → 盲目重做 Phase 1–5 非凍結範圍（7 commits）。發現後：本地重複 commits 捨棄、分支
  重置回遠端尖端＋合併最新 main；教訓入 lessons.md（stale-clone-duplicates-merged-work）。
  重做過程的獨立驗證結論與 #1656 QA 一致（全量 0 fail、traveler/admin/guide e2e 綠）。
- **本輪淨增量**：
  1. `issue1212-traveler-canonical-copy` 日期碰撞 flake 修復——fixture 寫死 2026-07-08
     （週三）＝今天，evaluator 的 today 判定蓋過預期 reason state，**main CI 今天必紅**；
     改為動態「未來 ≥14 天的週三」（語意不變）。
  2. owner 指示（2026-07-08）「剩餘退役先不刪、開 follow-up」→ issue #1662
     （凍結區 payments legacy 相容期收斂清單；已依 #1656 現況修正內容）。
  3. Vercel 生產調查：`/api/v2/activities/.../available-slots` 7/4–7/6 15 次
     `permission denied for table guide_availability_rules`（42501，v2 可訂時段生產壞損，
     需另案；與 #1646 相關）；7/4 舊部署 2 次 GUIDE_SESSION_SECRET SECURITY_ENV_BLOCK
     （最新部署未再現，建議 owner 檢查 env scope）。
  4. lessons.md 追加 playwright-pipe-tail-fake-green＋stale-clone-duplicates-merged-work。

### 待辦（另案）
- [ ] Phase 5.1：v2 ecpay callback＋ReturnURL 切換（P0-OVERRIDE＋部署協調，owner 決策）
- [ ] Phase 6：legacy routes 退役＋殘留守門＋契約 spec 同步（含 order-scoped 正名）
- [ ] main 既有 e2e 失敗 6 項另開 issue 追蹤
- [ ] Admin POS 四支既有 v2 route 接 UI（API-first 現況維持，屬功能增項非串接切換）

## PR/CI/merge 紀錄（鐵律 6 證據）
- PR #1656（Phase 1–6＋callback 接線＋#1655 修復）→ **merged 2026-07-08 01:50 Asia/Taipei**，squash → main `da0ce2b`。
- CI check-runs（head `af0672c`，全部 conclusion=success）：
  - test：https://github.com/smallwei0301/tour-platform/actions/runs/28886029665/job/85686315305
  - smoke：https://github.com/smallwei0301/tour-platform/actions/runs/28886029201/job/85686314047
  - scan：https://github.com/smallwei0301/tour-platform/actions/runs/28886029217/job/85686314184
  - Vercel Preview：Ready（af0672c）
- #1655 已隨 merge 自動關閉（Closes 連結）。

## 刻意決策
1. **order-scoped 而非 booking-scoped**：UI 全面以 orderId 操作；契約定義的
   `POST /api/v2/bookings/:id/cancel`／`reschedule-request` 改實作為
   `/api/v2/orders/:orderId/cancel`／`reschedule-requests`——行為與 legacy 等價、
   in-memory（無 bookings）可測。spec 更新列入 Phase 6。
2. **legacy 通知扇出整段複製到 v2 route**（非抽共用 lib）：legacy route 有大量 source-regex
   契約測試鎖住原始碼，抽出會破壞；legacy 於 Phase 6 退役後重複即消失（strangler 常態）。
3. **e2e mock 只換 URL 不換 envelope**：前端一律讀 `j.data`/`j.error`，v1 `{ok}` 與 v2
   `{success}` envelope 對頁面行為無差；降低 spec churn。
