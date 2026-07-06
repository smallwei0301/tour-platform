# issue1637 — 金流→結算→出帳鏈路稽核＋每月會計報表前置
> 最後更新：2026-07-06 17:10（Asia/Taipei）｜負責 session：claude-fable-5 / claude/payment-order-sync-check-3q3cfm

## 目標
1. 稽核「付款→訂單→導遊後台→出帳」全鏈路邏輯正確性（Owner 三問，見 issue #1637）。
2. 前置正常後：實作管理者後台每月手動產出會計報帳報表。

## AC 清單
- [x] AC1 三路程式碼稽核完成（付款鏈／導遊連動／出帳機制），逐條附 file:line 證據
- [x] AC2 既有測試實跑取證：settlement/payout/ECPay/dashboard/cron 共 500+ tests 綠（唯一 2 紅＝settlement-config.test.js pre-existing 假紅，issue1605 worklog 已記錄）
- [x] AC3 生產 DB 唯讀查證（pg_proc overload、schema_migrations、pg_trigger、訂單狀態分布、payout/balance/cron_run_log）——全程 SELECT，零寫入
- [x] AC4 稽核報告落檔 `docs/operations/qa-reports/payment-payout-chain-audit-20260706.md`＋issue #1637 開立
- [ ] AC5 P0/P1-1/P1-2 修復（凍結區＋migration，待 owner 授權：P0-OVERRIDE／SQL-OVERRIDE＋拍板路線）
- [x] AC6 每月會計報帳報表實作（admin `/admin/reports`＋v2 JSON/CSV routes＋`src/lib/accounting/` 領域檔；37 個新測試綠）
- [x] AC7 導遊「已入帳」視圖（P1-3）：dashboard `settledPayoutTwd`/`lastPayoutAt`＋餘額卡顯示，admin confirm 後自動連動（同 payouts 表）

## 關鍵發現（詳見稽核報告與 issue #1637）
- **P0-1** order `paid→confirmed` 無自動轉移：生產 14 筆 paid 訂單（NT$23,838）零結算、confirmed 訂單 0 筆；sweep/掃碼都只認 confirmed。
- **P0-2** callback RPC overload 遮蔽：db.mjs 用 6 具名參數呼叫→命中 6-arg 舊版；20260624130000（4-arg auto-confirm）蓋不掉且**未套用生產**（schema_migrations＋ledger 皆查無）；`12-payment-callback-atomicity.md` 所稱現行版本與生產不符。
- **P1-1** callback 無 TradeAmt 金額比對；**P1-2** ECPay 憑證缺失時靜默跳過驗簽；**P1-3** 導遊端無「已入帳」視圖（confirm 後只有餘額/待出款連動，無已出帳累計）；**P1-4** 生產遺留未實收款 NT$6,120 已入導遊餘額（order 1158aa21，06-11 結算、06-22 才補 paid_at 閘門）；**P1-5** 06-11 pending payout NT$7,168 懸置、阻塞 generate 且快照過期。
- 正常部分：callback 冪等三防線✅、結算四閘門＋分潤公式＋退款調整✅、sweep→generate 管線 07-06 起生產綠燈✅、admin confirm→導遊「待出帳」自動連動✅。

## 已完成（附證據）
- 2026-07-06 三路稽核＋本地測試批次全綠（145+200+82+80+53 tests，apps/web cwd）。
- 2026-07-06 生產唯讀查證：pg_proc 兩 overload 並存且皆無 booking_type 邏輯；orders 狀態分布（paid 14 筆零結算）；cron_run_log 07-03～05 sweep 紅（embed 歧義／ON CONFLICT 缺索引）→ 07-06 綠（settled 5）；payout_items 唯一索引 `(order_id,settlement_kind)` 已存在。
- 2026-07-06 issue #1637 開立＋稽核報告落檔＋本 worklog。
- 2026-07-06 實作月結報表＋導遊已入帳視圖（TDD）：
  - 純計算層 `src/lib/accounting/report.mjs`（台北月界線／加總／CSV+BOM，15 runtime tests）；DB 層 `db-report.mjs`（歸月：收款 paid_at／退款 payments.refunded_at／結算 settled_at／出帳 confirmed_at；異常清單：paid 未結算＋completed 無 paid_at）；service 層 env-fallback。
  - v2 routes `/api/v2/admin/reports/monthly`（jsonOk/jsonError＋handleRouteError，#1614/#1598 標準骨架）＋ `/csv`（text/csv attachment）；admin 頁 `/admin/reports`（月選擇＋摘要卡＋異常提醒＋四張明細表＋CSV 下載）；AdminShell 加「月結報表」nav。
  - guide dashboard route 加 `payouts state='paid'` 聚合 → `settledPayoutTwd`/`lastPayoutAt`（兩個 early-return fallback 同步補欄位）；餘額卡顯示「已入帳累計＋最近入帳」。
  - 治理 guard 教訓：初版被三個 ratchet guard 攔（v2 route 需 handleRouteError 上報 #1598、src/lib 頂層檔案數天花板 → 移入 `accounting/` 子資料夾、v2 route 禁手刻 Response.json → jsonOk/jsonError #1614），全數照規則改寫後過。
  - 證據：新增 3 test 檔 37 tests 綠；全套 `npm test` 4470/4470（3 skipped）；`run-checks.sh --typecheck` 綠。issue1605 的 dashboard 契約鎖全數未破（127/127）。

## 下一步
1. 等 owner 拍板 P0 修復路線（A：新 6-arg migration 納 auto-confirm＋order paid→confirmed；B：sweep/redeem 改認 paid）——套用需當輪 `SQL-OVERRIDE` 授權＋ledger 補登。
2. P1-1/P1-2 callback 加金額比對＋憑證 fail-closed（動到凍結區 `app/api/payments/**`，需 `P0-OVERRIDE` 授權）。
3. P1-3 導遊「已入帳」視圖（新 route 讀 payouts state='paid'，非凍結區）。
4. P1-4/P1-5 人工對帳決策（沖銷 6,120／處理懸置 payout 7,168）。
5. 綠燈後實作每月會計報表（admin 手動產出：GMV/退款/抽成/分潤/已出帳/待出帳＋CSV）。

## 絕不重做（Do-NOT-redo）
- **hooks 探針假陰性教訓**：Edit 探針（old_string 不存在）在本版 Claude Code 會先回「string not found」、hook 根本沒機會跑——探針顯示未武裝其實是誤判。實證：bash-guard 有攔 commit（證據 gate 正常）。判斷防線要以 bash-guard 攔截行為為準，或改用 Write 探針（會真的過 hook）。
- 生產 orders 的 `completed` 全是人工改的；`completed+payment_status='pending'` 有 5 筆（4 筆 paid_at 有值、1 筆 NULL）——欄位不同步是既存資料現象，不是本輪造成。
- `settlement-config.test.js` 2 紅是 #1284 改名後未更新的 pre-existing 假紅，勿當本輪迴歸追。
- 20260624130000 有配套 `.rollback.sql`；修復時要處理的是「6-arg overload 才是被呼叫的那個」，別再只改 4-arg。
