# 旅客下單 → 導遊收帳 全鏈流程地圖（自動流程＋手動備援）

> 建立：2026-07-06（#1637 稽核＋修復後盤點）。每段標注「自動機制」與「手動備援」，
> 供維運快速判斷卡單時該從哪裡接手。狀態語意另見 admin 訂單管理頁各狀態的連動說明。

## 全鏈一覽

```
旅客下單(draft) → 付款(ECPay callback) → 訂單 confirmed → 訂單 completed
   → 結算入導遊餘額(guide_balances) → 產生出款單(payouts pending)
   → 管理者確認出款(paid) → 導遊端「已入帳」更新
```

| # | 階段 | 自動機制 | 手動備援 | 卡住時看哪裡 |
|---|---|---|---|---|
| 1 | 下單建立 | V2 draft route 建 booking(draft)＋order(pending_payment)＋付款期限 | admin POS 手動建單 | `/admin/orders` 待付款 |
| 2 | 付款 | ECPay callback：驗簽＋金額比對（TradeAmt=total_twd，#1637）→ 原子 RPC 扣位＋轉態；逾期未付由 unpaid-expiry cron（每日 02:00 台北）自動取消 | admin POS「標記已付款」；transfer（自行匯款）由管理者查帳後手動確認 | `payment_events`／incidents（amount_mismatch、credentials_missing） |
| 3 | 訂單 → confirmed | **付款當下自動**（#1637）：booking_type 為 instant/scheduled/request 者，callback 內 booking＋order 一次到 confirmed | admin 訂單管理手動切「已確認」（舊單、POS 單、booking_type 未知者必須手動） | 停在「已付款」的單＝需人工；月結報表「對帳異常」區有累計 |
| 4 | 訂單 → completed | 兩條自動路：(a) 出團後滿 48h，auto-complete sweep（每日 02:30 台北）自動完成；(b) 導遊掃旅客電子憑證 QR 核銷（提前完成） | admin 訂單管理手動切「已完成」 | sweep 回報 stalled（缺出團時間者）；cron_run_log `auto_complete` |
| 5 | 結算入餘額 | settlement sweep（每日 10:00 台北）：completed＋paid_at 有值＋出團後 T+7＋無 hold → `payout_items`＋`guide_balances += 淨額`（85%）；退款紅沖自動反向 | 無直接手動寫餘額（刻意）——修正走退款／紅沖既有流程 | cron_run_log `settlement_sweep`；hold 單看 operations-tracking |
| 6 | 產生出款單 | generate-payouts（sweep 後串跑）：餘額 ≥ NT$5,000 自動建 pending 出款單（每導遊同時僅一張） | `/admin/payouts`「手動產生出款單」（不受門檻限制） | `/admin/payouts` 出款佇列 |
| 7 | 確認出帳 | **無自動**（刻意：實際銀行匯款是人工動作） | `/admin/payouts` 填轉帳流水號＋「確認出款」→ payouts→paid、餘額扣減；「取消」可作廢過期單後重產 | `/admin/payouts`；audit_logs `payout_confirmed` |
| 8 | 導遊端數字 | 全自動連動（同資料表即時讀）：可結算餘額=guide_balances、待出款=pending payouts、已入帳累計＋最近入帳=paid payouts（#1637 新增） | — | `/guide/dashboard` 餘額卡 |
| 9 | 月結對帳 | — | `/admin/reports` 手動選月產出（收款/退款/結算/出帳/期末負債＋異常清單＋CSV） | `/admin/reports` |

## 出帳「待出帳 → 已出帳」的準確語意（常見提問）

- **自動的部分**：出款單的「產生」是自動的（階段 6）；導遊端所有數字的「更新」是自動的（階段 8）。
- **不自動的部分**：pending → paid 這一步**永遠需要管理者按「確認出款」**——因為它對應真實世界的銀行轉帳，系統無法代替匯款。確認當下：`guide_balances` 扣減、出款單記 confirmed_at/流水號、導遊端「待出款」消失、「已入帳累計」增加，全部即時。
- **手動備援**：出款單金額過期（餘額後來又變動）→ 先「取消」再「手動產生出款單」取得以最新餘額計的新單；未達門檻的導遊也可手動產單。

## 已知缺口（追蹤中）

- **導遊端沒有掃碼 UI**：核銷 API（`POST /api/v2/guide/orders/[orderId]/redeem`）與旅客端 QR 憑證卡都已上線且實測正常，但導遊後台沒有任何頁面呼叫此 API——導遊目前無法實際「掃」。出團後 48h sweep 仍會兜底完成，掃碼提前完成的體驗待補前端。
- **停在 paid 的歷史訂單**：#1637 修復只作用於未來付款；修復前累積的 paid 訂單需人工切「已確認」或批次 backfill（待 owner 決策）。
- **guide_balances 為 read-modify-write**：sweep 與 confirm 並發時理論上有 lost-update 風險（單日單 cron＋人工確認頻率下風險低，列觀察）。

## 排程總表（皆為 GitHub Actions cron，台北時間）

| 排程 | 時間 | 作用 |
|---|---|---|
| unpaid-expiry | 每日 02:00 | 逾期未付訂單自動取消釋放名額 |
| auto-complete sweep | 每日 02:30 | confirmed＋出團後 48h → completed |
| settlement sweep → generate-payouts | 每日 10:00 | 結算入餘額 → 達門檻自動產生出款單 |
