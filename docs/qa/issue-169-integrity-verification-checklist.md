# Issue #169 — Integrity Verification Regression Pack (Executable)

> Updated: 2026-04-24  
> Goal: 將原 checklist 升級為可執行、可重跑、可附證據的 regression pack。  
> Schema truth baseline（來自 #164）：`bookings.order_id` 為核心；必須驗證 `payments.order_id`；不得假設 `payments.booking_id` 一定存在。

---

## 1) 內容範圍（此 slice）

本 pack 覆蓋：
1. precheck / postcheck metrics（同一支 SQL 可重跑）
2. orphan / mismatch detection（order-centric）
3. write-path verification（最近 24h + callback contract tests）
4. rollback verification（可回到 precheck baseline 的證據比較）
5. attachable evidence outputs

不在此 slice：
- 新 FK migration
- 決策是否引入 `payments.booking_id`
- 直接執行 orphan repair
- 重寫 #161 rollout plan
- 擴大到整站 E2E

---

## 2) 執行入口（one command）

### 前置條件
- 已設定 `DATABASE_URL`（或 `PGHOST/PG*`）
- 可在 repo root 執行 `npm` / `psql`

### Command

```bash
cd /root/tour-platform
npm run regression:issue-169
```

對應腳本：
- `scripts/phase12/run-issue-169-regression-pack.sh`

對應 SQL：
- `supabase/scripts/phase12/issue-169-integrity-regression-pack.sql`

---

## 3) 證據輸出（attachable）

每次執行會產生：
- `reports/issue-169/<timestamp>/precheck-postcheck-sql-output.txt`
- `reports/issue-169/<timestamp>/write-path-contract-tests.txt`
- `reports/issue-169/<timestamp>/summary.md`

`summary.md` 內含：
- 主要 metrics 快速索引
- write-path contract test 尾段結果

---

## 4) Gate 規則（merge / rollout 前可見）

以下任一成立 => **HOLD/STOP**：
- `bookings_order_id_orphan_count > 0`
- `payments_order_id_orphan_count > 0`
- `payments_order_to_booking_mismatch_count > 0`
- `recent_24h_bookings_missing_order_id > 0`
- `recent_24h_payments_missing_order_id > 0`
- write-path contract tests fail

### 注意
- `payments_booking_id_column_present` 僅做 schema snapshot，不是通過條件。
- 若欄位 absent，屬 schema truth；不得因此判定 regression pack fail。

---

## 5) Rollback verification（實務版）

1. 在修復前先跑一次，保存 baseline evidence（timestamp A）
2. 修復後重跑（timestamp B）
3. 比較 A/B 的 `summary.md`：
   - orphan / mismatch 是否下降到可接受範圍
   - write-path tests 是否持續通過
4. 若 B 比 A 更差，視為 rollback trigger，回到前一步修復策略

---

## 6) QA / Engineering / On-call 操作手冊（無 tribal knowledge）

- QA：只要會設定 DB 連線即可執行 `npm run regression:issue-169`
- Engineering：可直接看 SQL script 了解每個 metric 的定義
- On-call：先看 `summary.md`，再定位原始輸出檔追查 sample rows

---

## 7) Hand-off checklist

- [ ] 已執行 `npm run regression:issue-169`
- [ ] 已附上 `reports/issue-169/<timestamp>/summary.md`
- [ ] 已附上 SQL raw output 與 test raw output
- [ ] 已標記 gate decision（GO / HOLD / STOP）
- [ ] 已在 PR 或 issue 附上 rollback 判準
