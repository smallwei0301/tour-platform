# 回沖「未付款卻已結算」payout_items — migration 驗收報告

- **日期 / 時間**：2026-06-22 13:06 CST（Asia/Taipei）
- **Branch**：`claude/order-status-annotations-8da27n`
- **Base commit**：`f9dc1d2`（gate `315b860` 之後）
- **Migration**：
  - `supabase/migrations/20260622120000_reverse_unpaid_completed_settlements.sql`
  - `supabase/migrations/20260622120000_reverse_unpaid_completed_settlements.rollback.sql`
- **判定**：**PASS（SQL 已用真 Postgres 16 實測）**；**prod 已套用 — 2026-06-22 16:58 CST，證據見下方第 4 節**

## 1. 背景

sweep 舊版只用 `status='completed'` 當結算資格，未付款的 completed 訂單
（`orders.paid_at IS NULL`）也被誤結算撥款。live 發現 Ava Preview Smoke 訂單
…1158aa21（net 6120，從未收款）即此類 anomaly。commit `315b860` 已補
`isSettlementPaymentCollected` gate 防未來；本 migration 清存量（泛用，回沖**所有**
此類 payout_items，而非只硬刪該筆）。

## 2. 設計

回沖語意完全對齊 `src/lib/db.mjs` 的 `recordRefundReversalDb`：

1. 對每筆「`settlement_kind='settlement'` 且 `orders.paid_at IS NULL` 且尚無對應
   reversal 列」的 payout_item，插入一筆 `settlement_kind='reversal'` 的負值列
   （gmv/commission/net 取負）。
2. 借記 `guide_balances`（扣掉 `abs(net)`）。
3. 寫 `audit_logs`：`payout_reversal_created` + `guide_balance_debited_reversal`，
   metadata shape 與 app 端一致。
4. **step-0 防呆**：若該環境尚未套用 #449（無 `settlement_kind` 欄 / 仍是舊
   `UNIQUE(order_id)`），migration 會先補上 `settlement_kind` 欄與 compound
   `UNIQUE(order_id, settlement_kind)`、移除舊 unique，否則 reversal 列會被舊約束擋下。

**冪等**：只挑「尚無對應 reversal 列」的 settlement；重跑找不到目標即 no-op。整支在單一交易內。

## 3. 實測證據（ephemeral Postgres 16.13，本機 /tmp 臨時 cluster）

建最小 schema（orders / guide_profiles / guide_balances / payout_items / audit_logs），
塞對照資料後跑 migration。**兩種 prod 狀態皆驗**：

### 狀態 A — #449 已套用（compound unique 已存在）

對照資料：
- G1：anomaly 未付款結算 net 6120 + 一筆正常已付款結算 net 4250，餘額 10370
- G2：anomaly 未付款結算 net 2040，但**無 `guide_balances` 列**（edge case）
- G3：anomaly 未付款結算 net 2550，但**已被 app 回沖**（已有 reversal 列），餘額 0

| 驗證項 | 期望 | 實測 | 結果 |
|---|---|---|---|
| A1 餘額 | G1=4250（10370−6120）、G3=0、G2 無列 | 4250 / 0 / 無列 | ✅ |
| A2 reversal 列 | a1=−6120、b1=−2040（新增）、c1=−2550（既有保留） | 完全相符 | ✅ |
| A3 audit | created×2、debited×1（G2 無餘額列故不寫 debit） | created=2、debited=1 | ✅ |
| 冪等（重跑） | 餘額不變、reversal 列=3、audit=3 | 不變 | ✅ |
| rollback | G1 補回 10370、只剩 c1（app 既有）、migration audit=0 | 完全相符 | ✅ |

> 重點：G2（無餘額列）只補 reversal 列、不誤扣；G3（app 已回沖）正確跳過，不重複扣款。

### 狀態 B — #449 未套用（無 `settlement_kind` 欄、仍是舊 `UNIQUE(order_id)`）

對照資料：僅 G1 anomaly 未付款結算 net 6120，餘額 6120。

| 驗證項 | 期望 | 實測 | 結果 |
|---|---|---|---|
| B1 step-0 schema guard | 補 `settlement_kind` 欄 + compound unique，reversal 插入成功 | settlement/reversal 兩列並存 | ✅ |
| B2 餘額 | 6120−6120=0 | 0 | ✅ |
| B3 索引 | compound unique 存在、舊 `payout_items_order_unique` 移除 | 只剩 `payout_items_order_kind_unique` + pkey | ✅ |

## 4. Prod 套用紀錄（已執行）

- **環境**：正式專案 `tour platform`，ref `pyoderxmpeyqjwkeliiu`，region `ap-northeast-1`，狀態 `ACTIVE_HEALTHY`。
- **套用時間**：2026-06-22 16:58 CST（Asia/Taipei）。
- **授權**：owner 於 session 內明確同意執行（AskUserQuestion「確認執行」）。
- **套用方式**：owner 提供 access token，於 remote session 安裝 supabase CLI 2.107.0。
  因本環境網路政策**封鎖對外 5432**（pooler / 直連 Postgres 連線 timeout），
  無法用 `supabase db push`；改以 **Supabase Management API `POST /v1/projects/{ref}/database/query`**
  （走 443）執行整支 migration SQL（檔內 `BEGIN…COMMIT`，單一交易原子套用，回應 HTTP 201）。
- **重要 caveat**：此路徑**不會寫入 `supabase_migrations.schema_migrations` 版本紀錄**。
  本 migration 全冪等（schema 用 `IF NOT EXISTS` / `DROP … IF EXISTS`，data 步驟只挑「尚無
  reversal 列」的 settlement），故日後 operator 補跑 `supabase db push` 重套為 no-op，安全。
  若要對齊版本表，operator 可日後 `supabase db push`（會 no-op 套用並登錄 version）。

### 套用前 baseline（實測）

| 項目 | 值 |
|---|---|
| 遠端 schema 狀態 | 狀態 A：`settlement_kind` 欄已存在（#449 已套用） |
| 待回沖 anomaly | 1 筆 — order `1158aa21…`、net 6120、guide `963a3e13…` |
| 目標 settlement 列 | id `16f95431…`、gmv 7200 / commission 1080 / net 6120、order `completed`、`paid_at = NULL` |
| 導遊 `963a3e13…` 餘額 | 14136 |
| 既有 `payout_items_order_unique` | 真 constraint（`UNIQUE(order_id)`）→ step-0 `DROP CONSTRAINT` 會正確移除 |
| 本 migration audit | 0（確認未跑過） |

### 套用後驗證（逐條實測，皆 PASS）

| 驗證項 | 期望 | 實測 | 結果 |
|---|---|---|---|
| V1 anomaly recheck | 0 列 | `[]` | ✅ |
| V2 該訂單 payout_items | settlement +6120 與 reversal −6120（gmv ±7200 / commission ±1080）並存 | 完全相符 | ✅ |
| V3 導遊餘額 | 14136 − 6120 = 8016 | 8016 | ✅ |
| V4 migration audit | `payout_reversal_created`=1、`guide_balance_debited_reversal`=1 | 1 / 1 | ✅ |
| V5 schema | 舊 `payout_items_order_unique` 移除；只剩 `payout_items_pkey` 約束 + `payout_items_order_kind_unique` 索引 | 完全相符 | ✅ |

### Rollback（如需）

```sql
-- 套用 supabase/migrations/20260622120000_reverse_unpaid_completed_settlements.rollback.sql
-- 會補回餘額、刪除本 migration 的 reversal 列與 audit 標記（schema 變更刻意保留）。
```

> 安全提醒：本次 owner 將 access token / DB 密碼貼於 session 對話，憑證已留存於 transcript，
> 已建議 owner 事後於 Supabase 後台 **rotate access token 與 DB 密碼**。

## 5. 不含敏感資訊聲明

本報告不含密鑰 / cookie / token / service-role key / 完整付款 payload / 未遮蔽 PII。
