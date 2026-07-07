# 17 — 訂單／退款／金流 v2 全面串接計劃（issue #1649）

> 建立：2026-07-07（Asia/Taipei）。本文件為 issue #1649 計劃全文的 repo 內存檔；進度追蹤以 issue 與 `docs/operations/worklogs/issue1649.md` 為準。
> 盤點基準：`main@a75f21ff`；契約基準：`10-api-spec-v2-booking-pos.md`；金流全鏈基準：`docs/operations/order-to-payout-flow-map.md`。


## 一句話現況

**v2 目前只覆蓋「建單→首次付款」與零星新功能（refund-preview、POS 記帳退款、月結報表、核銷、post-trip）**；訂單讀取面、所有訂單後續操作（取消／退款申請／改期／留言）、Admin 訂單維運全套、退款審核四段式、payouts 五支、Guide 訂單面、ECPay create/refund-callback 全部仍在 legacy，其中退款鏈是契約與實作之間最大的未完成遷移（#1613 已標註需另案評估凍結區邊界——即本 issue）。

---

## A. 尚未串接 v2 的完整位置清單

### A1. Traveler 端（前端呼叫點 → legacy endpoint）

| # | 呼叫點 (file:line) | Method + Endpoint | 用途 | v2 現況 |
|---|---|---|---|---|
| 1 | `apps/web/app/me/orders/page.tsx:81` | GET `/api/me/orders` | 訂單列表頁 | 無 v2 route |
| 2 | `apps/web/app/guides/[slug]/shop/orders/page.tsx:50` | GET `/api/me/orders` | 商店內訂單列表 | 無 v2 route |
| 3 | `apps/web/app/me/orders/[orderId]/page.tsx:147` | GET `/api/me/orders/{id}` | 訂單詳情主載入 | **`GET /api/v2/orders/[orderId]` 已存在但未接線** |
| 4 | `apps/web/app/me/orders/[orderId]/page.tsx:133` | GET `…/guide-contact` | 行前導遊聯絡卡（#1596） | 無 v2 route |
| 5 | `apps/web/app/me/orders/[orderId]/page.tsx:165,179` | GET/POST `…/messages` | 訂單留言（#1411） | 無 v2 route |
| 6 | `apps/web/app/me/orders/[orderId]/page.tsx:200,214,236` | GET `…/reschedule-options`、POST/DELETE `…/reschedule-requests` | 改期三支（#1383） | 無 v2 route（契約有 `bookings/:id/reschedule-request`） |
| 7 | `apps/web/app/me/orders/[orderId]/page.tsx:253` | PATCH `/api/me/orders/{id}`（cancel） | 旅人取消 | 無 v2 route（契約有 `bookings/:id/cancel`） |
| 8 | `apps/web/app/me/orders/[orderId]/page.tsx:275` | POST `…/refund-requests` | 退款申請提交 | 僅 `refund-preview` 有 v2；申請本身無 |
| 9 | `apps/web/app/order/pay/page.tsx:43,76` | GET legacy 訂單＋POST `/api/payments/ecpay/create` | 補付款/重付頁（由詳情頁 :776「重新付款」連入） | 與 v2 checkout 並存，未退役 |
| 10 | `apps/web/app/order/success/page.tsx:44` | GET `/api/me/orders/{id}` | 付款結果頁 | 同 #3 |
| 11 | `apps/web/src/components/activity/PublicPromoBanner.tsx:15` | GET `/api/promo-codes/public` | 公開優惠碼橫幅 | 無 v2 route |
| 12 | `apps/web/src/lib/client-api.ts:15,23,30,37,52` | 五個 legacy helper | **死碼**（無頁面 import） | 遷移時清理 |

已接 v2 的（對照）：bookings draft/checkout/transfer-info（兩條訂購流程）、`RefundPreviewBanner.tsx:25` → refund-preview。**`GET /api/v2/orders/[orderId]`、`GET /api/v2/bookings/[id]` 已建好、零消費者**——遷移詳情頁的現成落點。

### A2. Admin 端

| # | 呼叫點 (file:line) | Endpoint | 用途 | v2 現況 |
|---|---|---|---|---|
| 1 | `apps/web/app/admin/orders/page.tsx:203` | GET `/api/admin/orders` | 訂單列表 | 無 v2 route |
| 2 | `…/orders/page.tsx:232,236,238` | GET `…/[orderId]`＋`timeline`＋`messages` | 詳情側欄 | 無 v2 route |
| 3 | `…/orders/page.tsx:234` | GET `…/audit-logs` | 稽核紀錄 | 無 v2 route |
| 4 | `…/orders/page.tsx:267` | POST `…/refund-execute` | **ECPay 真退款執行**（518 行重量級 route） | 無 v2 對應（v2 POS refund 語意不同） |
| 5 | `…/orders/page.tsx:301` | POST `…/cancel` | 取消＋全額退款 | 無 v2 route |
| 6 | `…/orders/page.tsx:330` | POST `…/exceptions` | 例外處理（改場次/容量） | 無 v2 route |
| 7 | `…/orders/page.tsx:349` | PATCH `…/[orderId]` | 手動改狀態＋備註 | 無 v2 route |
| 8 | `apps/web/app/admin/ops/orders/page.tsx:17` | GET `/api/admin/orders` | ops 成本/毛利檢視 | 無 v2 route |
| 9 | `apps/web/app/admin/refunds/page.tsx:22,33` | GET `/api/admin/refund-requests`＋POST `…/{approve\|reject\|process\|complete}` | 退款申請四段式審核 | 無 v2 route |
| 10 | `apps/web/app/admin/payouts/page.tsx:43,52,64,77,92` | payouts 五支（list/balances/confirm/cancel/generate） | 導遊撥款管理 | 無 v2 route |
| 11 | 無 UI 呼叫 | `refund-override`、`refund-requests/csv` | 維運端點 | 無 v2 route |

**已有 v2 route 但 UI 未接線**（API-first，目前僅 SOP 手動操作＋回歸測試）：`/api/v2/admin/pos/bookings/[id]`（詳情+timeline）、`pos/bookings/[id]/manual-payment`、`pos/orders/[id]/additional-payment`、`pos/orders/[id]/refund`、`orders/[id]/post-trip-status`、`orders/[id]/send-review-invitation`、`orders/post-trip-summary`。
UI 已走 v2 的只有月結報表：`apps/web/app/admin/reports/page.tsx:76,176`。

### A3. Guide 端

| # | 呼叫點 (file:line) | Endpoint | 用途 | v2 現況 |
|---|---|---|---|---|
| 1 | `apps/web/app/guide/bookings/page.tsx:151` | GET `/api/guide/bookings` | 訂單列表（實查 orders 表） | 無 v2 route |
| 2 | `…/bookings/page.tsx:162,181` | GET `…/pending-approval`＋POST `…/[bookingId]/approval` | request 型預約審核（V2 資料模型、legacy 路徑） | 無 v2 route |
| 3 | `…/bookings/page.tsx:202` | GET `…/[bookingId]` | 明細（參數名 bookingId、實以 orders.id 查——命名即 legacy 假設） | 無 v2 route |
| 4 | `apps/web/app/guide/dashboard/page.tsx:123,555,136` | GET `/api/guide/payout/monthly`（+csv）＋bookings 篩選 | 派彩月結估算 | 無 v2 route |
| 5 | `apps/web/app/guide/messages/page.tsx:51,80,95,104` | GET `/api/guide/messages`＋GET/POST `/api/guide/orders/[id]/messages` | 留言 | 無 v2 route |
| 6 | `apps/web/app/guide/reschedules/page.tsx:44,68` | GET/POST `/api/guide/reschedule-requests` | 改期審核 | 無 v2 route |

已在 v2：redeem（`guide/redeem/page.tsx:65,90`）、reviews（`guide/reviews/page.tsx:47,72`）、addons（`guide/activities/[id]/edit/page.tsx:356`）。另 `order-to-payout-flow-map.md` 已知缺口：**導遊掃碼 UI 不存在**（redeem API 上線但無頁面呼叫）。

### A4. 金流層（凍結區 `app/api/payments/**`）

| route | 現況 | v2 化狀態 |
|---|---|---|
| `payments/ecpay/create/route.ts:32` | 以 order 為主體的補付路徑，唯一消費者 `/order/pay`；CustomField 已對齊 v2 canonical（`src/lib/ecpay-create-orchestration.mjs:24`） | **與 v2 checkout 並存未退役**（契約無此端點） |
| `payments/ecpay/callback/route.ts:108` | v2 checkout 的 ReturnURL 即指向此（checkout route.ts:429）；寫回走 `fn_process_payment_callback_atomic`（6-arg，#1637） | **資料模型已 v2 化，但路徑仍在 legacy 凍結區**；契約定義 `POST /api/v2/payments/ecpay/callback` 未實作 |
| `payments/ecpay/refund-callback/route.ts:31` | 以 merchant_trade_no 反查，更新 orders/refund_requests/payments，冪等 | **不更新 bookings 狀態**（退款後 booking 收斂依賴其他流程）；無 v2 對應 |
| `payments/mock-confirm/route.ts:10` | 測試用，`ALLOW_MOCK_PAYMENT=true` 才開，前端零呼叫 | 退役候選 |

### A5. Internal 層（cron/sweep — 非對外 API）

- `internal/settlement/sweep`＋`generate-payouts`：**直查 orders 表，settlement 是最深的 legacy orders 依賴**。
- `internal/bookings/auto-complete-sweep`（#1554）、`internal/reminders/pre-tour-sweep`（#341）、`internal/reviews/review-invitation-sweep`（#1175）：以 orders.status 為主體。
- 已對齊 v2 原子 RPC：`internal/payments/ecpay-reconcile`、`internal/bookings/unpaid-expiry-sweep`（#1493）。
- `src/lib/line-order-query.mjs:237`（LINE OA 訂單查詢）：直查 legacy orders 資料模型（無 endpoint 耦合）。

### A6. 契約已定義、repo 內完全沒有 v2 route 的端點（spec §對照）

- `POST /api/v2/bookings/:id/confirm`／`complete`／`cancel`／`reschedule-request`
- `POST /api/v2/payments/ecpay/callback`
- `GET /api/v2/orders/:orderId/payments`
- `GET /api/v2/activities/:id/plans`（公開 catalog）
- `/api/v2/guide/availability-rules`、`/api/v2/guide/blackout-dates`（導遊自助版；v2 僅有 admin 代管版）
- `POST /api/v2/admin/pos/orders`（POS 建單）、`GET /api/v2/admin/pos/orders/:orderId`
- `/api/v2/line/auth`、`/api/v2/line/bookings/draft`、`/api/v2/line/webhook`（v2 僅 `line/auth/handoff`）

---

## B. 分階段串接計劃

排序原則：**讀取面先、寫入面後、凍結區與金流切換最後**；每階段獨立可 merge、獨立可驗收；全程遵守 v2 route 標準骨架（`jsonOk/errorV2`＋`handleRouteError`＋zod `parseBody`，#1598/#1600/#1614/#1616）與 strangler 硬規則（新資料函式一律進 `db-*` 領域檔，禁入 `db.mjs`，#1570）。

### Phase 1 — 已建未接的 v2 接線＋訂單讀取面（低風險，先行）
1. Traveler 訂單詳情頁改接既有 `GET /api/v2/orders/[orderId]`（先補齊與 legacy 回應的欄位差異＋契約測試），`/order/success` 同步切換。
2. 新增 `GET /api/v2/orders`（旅人訂單列表；涵蓋商店情境的過濾參數），`/me/orders` 與 shop orders 頁切換。
3. Admin POS 四支既有 v2 route 接上 admin UI（詳情/manual-payment/additional-payment/refund），取代 SOP curl 操作。
4. 清理 `client-api.ts` 五個死碼 helper。
- **AC**：兩頁訂單讀取零 legacy 呼叫；v2 orders 列表/詳情契約測試綠燈；POS 操作可全程走 UI；`run-checks.sh` 綠燈＋Playwright 實跑訂單詳情頁。

### Phase 2 — Traveler 寫入面 v2 化
1. `POST /api/v2/bookings/:id/cancel`（契約既定；訂單詳情頁取消改接）。
2. `POST /api/v2/orders/:orderId/refund-requests`＋`GET`（申請＋列表；與 refund-preview 串成一體）。
3. 改期：`POST /api/v2/bookings/:id/reschedule-request`＋options/withdraw（對齊 `13-order-reschedule-design.md`）。
4. 訂單留言與 guide-contact v2 化（traveler 側）。
5. `GET /api/v2/orders/:orderId/payments`（契約既定，付款紀錄查詢）。
- **AC**：訂單詳情頁所有互動零 legacy 呼叫；每支新 route 有 zod schema＋契約測試＋冪等/權限測試；改期/退款申請 e2e 綠燈。

### Phase 3 — Admin 訂單維運＋退款鏈 v2 化（本計劃核心、成本最高）
1. `/api/v2/admin/orders` 列表/詳情/timeline/audit-logs/messages/exceptions/PATCH（讀先寫後兩批）。
2. 退款申請四段式（approve/reject/process/complete）v2 化——與 POS refund 記帳鏈已共用的 `createRefundRequestDb`/`updateAdminRefundStatusDb` 抽入 `db-refund` 領域檔（#1613 遺留的 refund 鏈續拆一併完成）。
3. **refund-execute 搬遷**（518 行）：ECPay AllRefund/DoAction 邏輯已在 `src/lib/refund-execute`＋`src/lib/ecpay`，v2 route 以薄殼重接＋auth 換 v2 規範；部分退款/冪等重放/修復路徑行為零改變（以 #1571 三鏈路契約測試＋`issue1474` staging 實測護航）。
4. `cancel`（取消＋全額退款）與 `refund-override` v2 化；`refund-requests/csv` 併入 admin 匯出。
5. payouts 五支 v2 化＋`/admin/payouts` 頁切換（注意 #1372 payout_items UNIQUE PR 仍 open，先合流）。
6. admin orders/refunds/payouts 三頁 UI 切換到 v2。
- **AC**：admin 三頁零 legacy 呼叫；refund-execute v2 版對 legacy 版行為等價（同輸入同結果契約測試）；退款四段式狀態機轉移表測試；payouts 冪等（同導遊同時僅一張 pending）測試。

### Phase 4 — Guide 端 v2 化
1. `/api/v2/guide/bookings`（列表/pending-approval/approval/明細——明細參數正名 orderId）。
2. `/api/v2/guide/payout/monthly`（+csv）。
3. guide messages v2 化；`/api/v2/guide/reschedule-requests`（審核側）。
4. 補導遊掃碼 UI（接既有 redeem API——`order-to-payout-flow-map.md` 已列缺口）。
- **AC**：guide bookings/dashboard/messages/reschedules 四頁零 legacy 呼叫；approval 連動（reject → booking cancelled＋order 取消）契約測試；掃碼 UI Playwright 實跑。

### Phase 5 — 金流凍結區收斂（需 owner P0-OVERRIDE＋部署協調，單獨排程）
1. 新增 `POST /api/v2/payments/ecpay/callback`（契約既定）：與 legacy callback 共用 `processPaymentCallbackDb` 單一實作；v2 checkout 的 ReturnURL 切至 v2 路徑；legacy callback 保留相容期（ECPay 站方設定與 in-flight 交易），觀察窗後另案退役。
2. refund-callback v2 化＋補 bookings 狀態收斂（退款成功後 booking 側轉態，含紅沖連動確認）。
3. `/order/pay` 補付頁改走 v2（checkout 重付語意或新 `orders/:id/checkout`），`payments/ecpay/create` 退役。
4. `mock-confirm` 處置（移 v2 或直接刪除＋守門測試）。
- **硬條件**：凍結區任何修改需使用者在對話中 `P0-OVERRIDE: <路徑>` 授權；callback RPC 如需改動**一律 6-arg 簽名 CREATE OR REPLACE**（#1637 P0-2 教訓）；鎖序 `orders → bookings → activity_schedules` 不可違反；冪等三防線（RPC replay／payment_events unique／status_logs WHERE NOT EXISTS）全數保留並有測試。
- **AC**：v2 callback 與 legacy callback 對同一 payload 行為等價（含 replay）；TradeAmt≠total_twd RAISE 行為不變；切換前後 `payment_events` 無重複；e2e staging 實測（接手 #1474 的 ECPay 測試卡流程）。

### Phase 6 — Internal 對齊＋legacy 退役收尾
1. settlement/reminders/auto-complete/review-invitation 四類 sweep：internal 非對外 API，**建議不搬路徑、只補契約測試**鎖住 orders 主體行為（若 owner 要求命名空間統一再另案）。
2. `line-order-query.mjs` 改用與 v2 orders 相同的讀取函式。
3. legacy routes 分批退役：`/api/me/orders/**`、`/api/admin/{orders,refund-requests,payouts}/**`、`/api/guide/{bookings,orders,payout,messages,reschedule-requests}/**`、`/api/payments/ecpay/create`——每批附殘留守門測試（比照 `issue1407-legacy-retirement-residue-guard.test.mjs`）＋301/410 策略。
4. 更新 `10-api-spec-v2-booking-pos.md`（把「超出契約的已實作面」補進契約、標注已退役端點）。
- **AC**：grep legacy endpoint 前端零命中；守門測試綠燈；readiness snapshot 重生。

---

## C. 全程硬限制（lessons＋CLAUDE.md，計劃內建）

1. **凍結區**（`app/api/{orders,payments}/**` 等）：修改需 owner 當輪 `P0-OVERRIDE: <路徑>` 授權原文；Phase 5 整段標 `owner:human-decision` 前置。
2. **migration**：只增不改、時間戳命名；**凡需套 migration 才能 merge 的子任務一開始就標 owner-blocked**（`SQL-OVERRIDE` 30 分鐘消耗式授權＋ledger 補登，見 `docs/operations/migration-apply-ledger-sop.md`）。
3. **strangler**：新資料存取函式禁入 `db.mjs`（CI 行數天花板只降不升）；改 gateway 函式必須同步 in-memory fallback＋契約測試。
4. **ratchet guard 四天花板不升**（巨型檔行數／api 直 import @supabase／直讀 process.env／src/lib 頂層檔數）；SUPABASE env 一律走 `src/config/supabase-service-env.mjs` getter。
5. **測試證據**：每個子 PR `.claude/hooks/run-checks.sh` 綠燈才 commit；CI 綠才 merge；使用者可見流程跑 Playwright；`tests/api/issue1571-three-chain-contract.test.mjs`（建/付/退三鏈路）為全程回歸基線。
6. **每 Phase 一個子 issue＋worklog 雙寫**（`docs/operations/worklogs/issueNNNN.md`）；單 PR diff 過大即拆。
7. **範圍外**（另案追蹤，不混入本計劃）：#1637 遺留 P1-4/P1-5 人工對帳（owner 決策）、停在 paid 的歷史訂單 backfill、`guide_balances` read-modify-write 原子化、availability snapshot fallback 移除（#839/#1133）、#1121 憑證輪替。

## D. 建議執行順序與 owner 決策點

- Phase 1 → 2 → 3 → 4 可由 agent 依序執行（`owner:ai-agent`）；Phase 3 的 refund-execute 搬遷與 Phase 5 全段需 owner 拍板（`owner:mixed`／`status:needs-decision`）。
- 需要 owner 現在決定的三件事：
  1. Phase 5 ECPay callback 路徑切換的時點（建議：首筆正式付款前完成，避免上線後切換）。
  2. internal sweep 是否要求命名空間統一（建議：不搬，省成本）。
  3. `/api/promo-codes/public` 與 LINE 三端點是否納入本計劃（建議：promo-codes 併 Phase 2；LINE 端點待 #926 LIFF rollout 一起處理）。

---
_worklog：`docs/operations/worklogs/issue1649.md`_
