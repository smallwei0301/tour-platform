# 金流→結算→出帳鏈路稽核報告（#1637）

> 稽核時間：2026-07-06 17:06（Asia/Taipei）｜repo SHA：`8f376f6`（main 同步點，分支 `claude/payment-order-sync-check-3q3cfm`）
> 稽核者：Claude Code session（issue #1637）
> 方法：三路平行程式碼稽核（付款鏈／導遊後台連動／出帳機制）＋既有測試實跑＋生產 DB 唯讀 SELECT 查證（**全程無任何生產寫入**）。
> 結論等級：`VERIFIED-code`（程式碼逐行）＋`VERIFIED-live-readonly`（生產唯讀查證）＋`VERIFIED-tests`（本地實跑）。

## 0. 稽核範圍與提問

Owner 三問：

1. 訂單付款後可以正常計入導遊後台？
2. 平台出帳給導遊後，導遊後台「已入帳／待出帳」金額能自動正確變化？
3. 以上正常後，實作管理者後台每月手動產出會計報帳報表。

**總結論：第 1 問「顯示」正常、「入帳鏈路」斷裂（P0-1）；第 2 問「待出帳」連動正常、「已入帳」視圖不存在（P1-3）；第 3 問前置未達成，暫緩實作。**

## 1. 測試證據（本地實跑，Node v22.22.2，cwd=apps/web）

| 測試批次 | 結果 |
|---|---|
| settlement/payout 核心 10 檔（issue446/447/448/847/1360、guide-payout monthly+csv、payment-collected-gate、rules-alignment、onconflict-settlement-kind） | 145/145 綠 |
| refund/payout/sweep 鏈 14 檔（issue1474/449/479/478、partial-refund、1554 auto-complete、1106×2、1221、1284、1365×3、1501） | 200/200 綠 |
| ECPay callback/checkout 12 檔（ecpay-callback、mapping、simulatepaid、issue614×3、652、826、1590、1591、1594、checkout-service-role） | 82/82 綠 |
| 導遊 dashboard 對帳 9 檔（issue307/475/631/1605、gmv-bounds、revenue-contract、v2-sync、admin-dashboard×2） | 80/80 綠 |
| cron wiring 3 檔 | 53/53 綠 |
| `settlement-config.test.js` | 16/18（2 紅＝#1284 改名 `computeGuidePayoutEstimate` 後測試未更新，worklog issue1605 已記錄的 pre-existing 假紅，非本次迴歸） |

## 2. 鏈路現況（程式碼＋生產查證）

### 2.1 付款鏈（booking → order → payment）

- 金額計算以 DB 快照為準（`activity_plans.base_price`；加購以 `activity_addons` 現價重算；點數 server 端夾 min(餘額, 30%)）——`app/api/v2/bookings/draft/route.ts:1028-1163`、`src/lib/checkout/order-extras.mjs:52-84`。
- ECPay callback：CheckMacValue 驗證（`app/api/payments/ecpay/callback/route.ts:144-168`）→ `processPaymentCallbackDb`（`db.mjs:1812-1819`，6 具名參數呼叫 RPC）→ `fn_process_payment_callback_atomic` 單一交易（FOR UPDATE＋replay 冪等＋容量扣位失敗全回滾）。重複／亂序 callback 安全。✅
- **P0-2**：`20260624130000_callback_booking_type_auto_confirm.sql` 為 4-arg `CREATE OR REPLACE`，蓋不掉 db.mjs 實際命中的 6-arg overload；且**該 migration 未套用生產**。生產 `pg_proc` 實查：兩個 overload 並存、**兩版皆無 booking_type 邏輯**、皆含 `pending_confirmation` 舊行為。設計文件 `12-payment-callback-atomicity.md:9-13` 所稱「現行版本」與生產不符。
- **P0-1**：callback 後 order 停在 `paid`。auto-complete sweep 只掃 `confirmed`（`db-auto-complete.mjs:60-63`）、掃碼核銷也要求 `confirmed`（`redeem-eligibility.mjs:16`）、生產 DB 無相關 trigger（pg_trigger 實查）。唯一 `paid→confirmed` 路徑＝admin 手動改狀態（`db.mjs:1135-1148`）。
  - 生產實證：`status='paid'` 訂單 14 筆、合計 NT$23,838（2026-04-01～06-18），**零結算分錄**；`confirmed` 訂單 0 筆。
- **P1-1**：callback 全鏈無 `TradeAmt` vs `order.total_twd` 比對；RPC 一律以 `order.total_twd` 記帳。
- **P1-2**：`getECPayCredentials()` 丟例外時 callback 僅 `console.warn` 放行（`callback/route.ts:165-168`）；`ECPAY_HASH_KEY/IV` 不在 startup-env 強制清單。

### 2.2 訂單 → 導遊後台

- Dashboard 營收以 `status ∈ {paid,confirmed,completed}` 納入、GMV 扣 `operations_tracking.refund_amount_twd`（`app/api/guide/dashboard/route.ts:91,138-144,268-273`）→ **付款成功即「看得到」**。✅
- 實際結算四道閘門（sweep）：`completed`＋`paid_at NOT NULL`＋行程結束過 T 天＋非 hold/全退款（`app/api/internal/settlement/sweep/route.ts:105,142,147-148`；`settlement-config.ts:220-241`）。分潤 `net=floor(effective×(1−commission_rate))`，commission_rate 生產來源 `settlement_rules`（預設 0.15、T+7、門檻 5000）。部分退款按 effective 縮減、全退款不建分錄。✅
- **落差（P2）**：Dashboard `expectedPayoutTwd` 納入 paid/confirmed、不看 `paid_at`/T+7 → 系統性高估；hold 中訂單導遊端不可見；月界線時區不一致（`monthlyBookings` 伺服器時區 vs GMV 台北時區）。

### 2.3 出帳機制（sweep → guide_balances → payouts）

- 管線：GitHub Actions cron（每日 02:00 UTC）sweep upsert `payout_items`（冪等鍵 `order_id,settlement_kind`）→ 累加 `guide_balances` → generate-payouts 對達門檻者建 pending payout（快照當下餘額）→ admin confirm 扣 `guide_balances`＋payout→`paid`；cancel 不動餘額。狀態機 `pending→paid/cancelled` 單向。✅
- 生產 cron 實查：07-03～05 三次紅燈（embed 歧義、ON CONFLICT 索引缺失），**07-06 起綠燈**（settled 5、guides_updated 1）；`payout_items(order_id,settlement_kind)` 唯一索引已存在。
- **導遊端連動**：「可結算餘額」讀 `guide_balances`、「待出款」讀 `payouts.state='pending'`（`dashboard/route.ts:154-164`）→ admin confirm 後**自動正確變化**（同表，非快照）。✅
- **P1-3**：導遊端無任何 route 讀 `payouts.state='paid'` → 「已入帳累計」視圖**不存在**；月報／CSV（`api/guide/payout/monthly`）純由訂單即時推算，與實際出帳無關。
- **P1-4**：生產遺留——order `1158aa21`（NT$7,200、`paid_at IS NULL`、`payment_status='pending'`）於 2026-06-11（06-22 paid_at 閘門補上前）被結算 net NT$6,120 入餘額。現餘額 NT$21,814 內含這筆平台未實收款。
- **P1-5**：2026-06-11 的 pending payout NT$7,168 懸置近一月；pending 唯一索引使 generate 永遠 skip；confirm 只扣舊快照（`db-payouts.mjs:75` `Math.max(0,...)` 靜默吞差額）。
- **P2**：`guide_balances` 為 read-modify-write 非原子（sweep vs confirm 並發 lost-update 風險）；手動出款不驗門檻；`getUnsettledOrdersDb`（`db-settlement-ops.mjs:62-76`）死碼＋壞子查詢＋資格過鬆，誤接回會 500 且錯結算；4 筆 completed 訂單 `paid_at` 有值但 `payment_status='pending'`（欄位不同步）；commission/net 各自 floor、殘差歸平台（對帳時 `gmv ≠ commission+net` 屬預期）。

## 3. 生產資料快照（2026-07-06，唯讀）

| 項目 | 數字 |
|---|---|
| orders：pending_payment / paid / completed / refunded / refund_pending | 44 / **14（零結算）** / 12 / 5 / 2 |
| payout_items（settlement） | 10 筆 |
| guide_balances | 1 位導遊，NT$21,814（含 P1-4 的 6,120） |
| payouts | 1 筆 pending NT$7,168（2026-06-11，懸置） |
| settlement cron | 07-06 綠（settled 5）；07-03～05 紅（已修） |

## 4. 對 Owner 三問的回答

1. **付款後計入導遊後台？** 「顯示」正常（paid 即入 GMV/預期撥款）；「實際入帳」斷裂——無自動 `paid→confirmed`，14 筆已付訂單卡死、零結算（P0-1）。
2. **出帳後已入帳／待出帳自動變化？** 「待出帳」（可結算餘額＋待出款）自動正確連動 ✅；「已入帳」視圖不存在，導遊只能從餘額變少間接推斷（P1-3）。
3. **每月會計報表？** 前置未達成（P0-1／P1-3／P1-4 未解），暫緩；修復路線與報表規劃見 issue #1637。

## 5. 附註

- 開機 Edit 探針曾誤判 hooks 未武裝（本版 Claude Code 先驗 old_string 才跑 hook，探針拿不到 HARNESS BLOCK）；後續 bash-guard 實際攔截 commit 證實**防線武裝中**。稽核階段仍全程僅文件＋唯讀查證。
- 生產 DB 全程僅 SELECT/EXPLAIN（鐵律 2）；未套用任何 migration、未寫入任何資料。
