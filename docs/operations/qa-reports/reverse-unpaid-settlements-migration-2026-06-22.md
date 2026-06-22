# 回沖「未付款卻已結算」payout_items — migration 驗收報告

- **日期 / 時間**：2026-06-22 13:06 CST（Asia/Taipei）
- **Branch**：`claude/order-status-annotations-8da27n`
- **Base commit**：`f9dc1d2`（gate `315b860` 之後）
- **Migration**：
  - `supabase/migrations/20260622120000_reverse_unpaid_completed_settlements.sql`
  - `supabase/migrations/20260622120000_reverse_unpaid_completed_settlements.rollback.sql`
- **判定**：**PASS（SQL 已用真 Postgres 16 實測）**；**prod 套用：HOLD — blocker 見下方第 4 節**

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

## 4. Prod 套用 blocker（HOLD 原因）

owner 拍板由 Claude 代跑 `supabase db push`，但**本 remote 執行環境沒有 supabase CLI、
也沒有任何 prod 憑證**（`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_DB_URL` /
`SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF` / `SUPABASE_DB_PASSWORD` 皆 unset），
故**無法在此 container 內對 prod 執行寫入**，標 `NOT_PROD_EXECUTED`。

**Operator 套用方式**（canonical 見 `docs/operations/booking-v2-rollback-runbook.md`）：

```bash
# 於有 prod 憑證的環境
supabase link --project-ref <PROJECT_REF>
supabase db push    # 套用所有 pending migration，含本支

# 套用後驗證（應為 0 列）
#   SELECT pi.order_id, pi.net_twd
#   FROM payout_items pi JOIN orders o ON o.id=pi.order_id
#   WHERE pi.settlement_kind='settlement' AND o.paid_at IS NULL
#     AND NOT EXISTS (SELECT 1 FROM payout_items r
#                     WHERE r.order_id=pi.order_id AND r.settlement_kind='reversal');
```

若要由 Claude 代跑，需在 session 環境注入上述憑證 / CLI 後再執行。

## 5. 不含敏感資訊聲明

本報告不含密鑰 / cookie / token / service-role key / 完整付款 payload / 未遮蔽 PII。
