# 結算規則說明書

> 最後更新：2026-04-20
> 狀態：已拍板 v1（Wei, 2026-05）

## 1. 目的
定義 Tour Platform 與導遊之間的款項結算方式，避免上線後在抽成、撥款、退款、對帳上出現認知落差。

## 2. 基本原則
- 平台先向旅客收款
- 訂單完成並過退款觀察期後，再對導遊進行撥款
- 平台抽成以訂單實收金額為基礎計算
- 若訂單進入退款 / 爭議流程，該筆結算暫停

## 3. 建議結算週期
- 預設：**T+7**（活動完成日後第 7 天）
- 目的：保留取消 / 爭議 / 款項異常的處理窗口

## 4. 抽成規則
- 預設平台抽成：**15%**
- 計算基礎：旅客實付金額（扣除已退款部分後）

### 範例
- 訂單實收 NT$2,000
- 平台抽成 15% = NT$300
- 導遊應收 = NT$1,700

## 5. 不結算情境
以下情況不得進入撥款：
- 訂單尚未完成
- 訂單已申請退款且未結案
- 訂單有爭議 / 客訴升級中
- 金流狀態與平台訂單狀態不一致

## 6. 導遊提款流程（建議版）
1. 導遊提供收款帳戶資訊
2. 平台完成 KYC / 基本身分與帳戶驗證
3. 系統產出可撥款清單
4. 人工或批次轉帳執行
5. 寫入撥款紀錄與對帳結果

## 7. 最低提款門檻（建議）
- 最低提款門檻：**NT$5,000**
- 若未達門檻，累積到下個週期一併結算

## 8. 對帳與異常處理
若發生以下情況，需人工對帳：
- 平台紀錄已付款，但金流紀錄缺漏
- 已退款訂單仍出現在可撥款清單
- 批次轉帳失敗
- 導遊回報金額不符

## Operator notes

- Monthly payout JSON (`/api/guide/payout/monthly`) and CSV (`/api/guide/payout/monthly/csv`) now read the active `settlement_rules` row from the database (same source as the guide dashboard). The env constant `SETTLEMENT_COMMISSION_RATE` is only used as a fallback if the DB is unreachable or has no active row.
- When approving payouts, verify that the `settlementRulesVersion` field in the JSON response (or the `X-Settlement-Rule-Version` response header for CSV downloads) matches the version shown on the guide dashboard. A mismatch indicates a data inconsistency that must be investigated before approving.

## 9. Go-Live 前待確認事項（已解決 — 2026-05）

以下事項已拍板，詳見 [05-settlement-payout-ops-runbook.md](./05-settlement-payout-ops-runbook.md)（#540）：

- ✅ **結算週期**：固定採 T+7（活動完成日後第 7 天）
- ✅ **結算等級**：soft-launch 第一階段不區分導遊等級，全部統一規則
- ✅ **執行模式**：採「人工先行」— Admin 系統生成記錄，Wei（maker）+ 第二位確認人（checker）手動核准轉帳；批次自動功能在 soft-launch 期間暫緩
- ✅ **導遊明細頁**：soft-launch 第一階段由 Admin 後台提供結算明細，導遊自助查詢頁列為後續迭代
