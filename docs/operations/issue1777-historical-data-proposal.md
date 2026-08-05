# #1777 Phase 4 — #1647 歷史資料處理 proposal

> 建立：2026-07-29 Asia/Taipei｜狀態：**待 owner 授權，尚未執行任何 production 寫入**
> 對應 issue：#1777（機制修復）／#1647（歷史資料追蹤）

## 這份文件是什麼

#1777 Phase 2／3 讓**新的**結算、退款、出款寫入不可能再產生「只寫一半」或「金額算錯」。但既有的歷史偏離不會自己消失。這份文件提供三項歷史資料的處理方案、影響範圍取得方式、DML proposal 與 rollback／compensation path，供 owner 逐項授權。

**本文件不是執行紀錄。** 截至建立時間，未對 production 執行任何 DML、未套用任何 migration、未 confirm／cancel 任何真實出款。

## 2026-07-29 read-only preview 實測結果

已對 production 執行唯讀查核（純 SELECT，無任何寫入）。**與 2026-07-06 舊快照有一項重大差異**：

| 項目 | 2026-07-06 舊快照 | **2026-07-29 實況** | 結論 |
|---|---|---|---|
| 一：`paid` 卡單 | 14 筆 NT$23,838 | 14 筆 NT$23,838，**全部 `paid_at` 非空（已收款）** | 仍待處理，全數符合候選條件 |
| 二：未實收卻入帳 | NT$6,120 待沖銷 | **ledger 淨額 0——已被 reversal 沖銷** | ✅ **已完成，無待處理** |
| 三：過期 pending 出款 | NT$7,168 | 1 筆 NT$7,168（2026-06-11），當前餘額 NT$21,814 | 仍待處理，但餘額足夠、confirm 不會被擋 |

三方對帳同時確認：**唯一一位導遊的 ledger 淨額 = 餘額 = NT$21,814，差異 0**。

### 項目二為何已完成

訂單 `1158aa21…`（NT$7,200、`paid_at IS NULL`）同時存在 `settlement +6120` 與 `reversal −6120` 兩筆分錄，淨額為 0——`20260622120000_reverse_unpaid_completed_settlements.sql` 已處理過。舊快照描述的「未實收 NT$6,120 已進餘額」在當時屬實，但**該筆已沖銷**，不需再執行任何 DML。

### 這次 preview 暴露的對帳盲點（已修）

那筆錯誤分錄的**金額完全正確**（`floor(7200 × 0.85) = 6120`），ledger 與餘額也一致，因此逐導遊與逐訂單的金額對帳全部判定「正常」。**錯的不是金額，是資格**（訂單從未實收）。

已新增 `buildEligibilityAudit`：回頭掃既有分錄，比對的正是 `fn_record_settlement_atomic` 在交易內重驗的那組條件（`completed`／已實收／四個 hold 旗標）。淨額已被沖銷為 0 者標為 `alreadyReversed` 但不列入待處理——帳已平，列出來只是雜訊。

## 執行前必做：重新取得 preview

上表為 **2026-07-29 快照**。實際執行 DML 前仍須重跑一次——期間可能有新的付款、退款或人工調整。

重新取得的方式（唯讀，不需 SQL-OVERRIDE）：

```bash
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
  node scripts/admin/issue1777-reconciliation-preview.mjs --out /tmp/issue1777-preview.json
```

輸出為 privacy-safe JSON（識別碼遮罩、只含金額與計數）。該腳本在程式碼層面沒有任何寫入呼叫，並有測試鎖住（`issue1777-reconciliation.test.mjs` 的「對帳路徑必須是唯讀」）。

## 前置條件

三項處理都應在**機制修復上線之後**才執行，否則修完的資料會再次被舊路徑弄髒：

1. migration `20260729160000`（原子 settlement／payout confirm）已套用並記入 ledger
2. migration `20260729170000`（退款差額 adjustment）已套用並記入 ledger
3. 對應的應用程式碼已 merge 且部署（部署順序見下方警告）
4. 重新 preview 的結果已交 owner 確認

> ⚠️ **部署順序硬規則**：settlement sweep 由 GitHub Actions cron 每日 02:00 UTC 自動執行。migration 必須**先**套用，才能部署改呼叫 RPC 的應用程式碼；順序顛倒會讓隔日排程整批失敗（呼叫端刻意 fail-closed，不會退回非原子路徑）。

---

## 項目一：卡在 `paid` 且從未結算的訂單

### 現況

訂單狀態停在 `paid`、無任何 `payout_items` 分錄。成因是 #1637 P0-1：callback 後沒有自動 `paid→confirmed` 路徑，而 auto-complete sweep 與掃碼核銷都只認 `confirmed`。該根因已由 #1637／PR #1644 修復（callback 依 booking_type 自動 confirm），因此**這批是修復前的存量**，不會再新增。

### 判斷準則

preview 的 `historical.stuckPaidOrders` 會分出：

- `collectedCount`：`paid_at` 非空＝provider 確實已收款 → **候選**
- `notCollectedCount`：`paid_at` 為空＝從未實收 → **不處理**，維持原狀
- `paymentStatusMismatchCount`：`paid_at` 有值但 `payment_status='pending'`＝欄位不同步，需個別檢視

### Proposal

只推進「provider 已收款 ＋ 行程資料完整 ＋ 狀態轉移合法」者。**不建議無條件全改**。

```sql
-- 逐筆執行，一次一張訂單；:order_id 由 preview 的候選清單提供
-- 前置檢查（必須為 1 列且 paid_at 非空）
SELECT id, status, paid_at, payment_status, total_twd
  FROM orders WHERE id = :order_id;

-- 推進狀態（僅限已收款且行程已結束者）
UPDATE orders
   SET status = 'confirmed', updated_at = now()
 WHERE id = :order_id
   AND status = 'paid'
   AND paid_at IS NOT NULL;
```

推進為 `confirmed` 後，既有的 auto-complete sweep 會在行程結束後自動帶到 `completed`，再由 settlement sweep 依正常資格結算——**不需要手動插入 ledger 分錄**。這是刻意的：讓存量資料走與新資料完全相同的路徑，避免另一套手工帳。

### Rollback / compensation

```sql
-- 尚未被 auto-complete 帶走時可直接還原
UPDATE orders SET status = 'paid', updated_at = now()
 WHERE id = :order_id AND status = 'confirmed';
```

若已被結算：不可直接改回，須改走 #1777 Phase 3 的退款 adjustment 或人工沖銷分錄，並留會計理由。**因此建議逐筆小批執行、每批之間確認 sweep 結果**。

---

## 項目二：已進導遊餘額但平台從未實收的金額 ✅ 已完成

### 現況（2026-07-29 實測）

**無待處理項。** #1637 P1-4 記錄的那筆（訂單 `1158aa21…`，`paid_at IS NULL` 卻被結算 net 6120）已同時存在 `settlement +6120` 與 `reversal −6120`，**ledger 淨額為 0**——`20260622120000_reverse_unpaid_completed_settlements.sql` 已處理過。三方對帳亦顯示餘額與 ledger 差異為 0。

以下 DML proposal **暫不需要執行**，保留作為日後若再出現同類情形的處理範本。preview 的 `historical.uncollectedInBalance` 現以兩條路徑偵測：餘額無分錄支撐（`balanceSurplus`）＋分錄不符資格（`ineligibleSettlements`）。

### Proposal

分兩種情形，取決於這筆錢**是否已實際付給導遊**（查 `payouts` 中該導遊的 `paid` 紀錄與轉帳憑證）：

**情形 A — 尚未付出去：直接沖銷**

```sql
-- 前置：確認差額與 preview 一致
SELECT guide_id, balance_twd FROM guide_balances WHERE guide_id = :guide_id;

BEGIN;
UPDATE guide_balances
   SET balance_twd = balance_twd - :surplus_twd,
       updated_at = now()
 WHERE guide_id = :guide_id
   AND balance_twd >= :surplus_twd;   -- 防呆：不足額則 0 rows，不得扣成負數

INSERT INTO audit_logs (actor, action, metadata)
VALUES ('issue1777-historical-fix', 'guide_balance_uncollected_writeoff',
  jsonb_build_object('guide_id', :guide_id, 'surplus_twd', :surplus_twd,
                     'reason', 'balance had no ledger backing; platform never collected'));
COMMIT;
```

**情形 B — 已實際付出：不沖銷餘額，改列 carry-forward 回收**

沖銷會讓帳面看似平衡，實際上錢已經出去了。改以稽核紀錄留下應回收金額，於下期出款時扣抵：

```sql
INSERT INTO audit_logs (actor, action, metadata)
VALUES ('issue1777-historical-fix', 'payout_carry_forward_created',
  jsonb_build_object('guide_id', :guide_id, 'carry_forward_twd', :surplus_twd,
                     'reason', 'uncollected amount already paid out; recover from future payouts'));
```

（此 action 名稱與 Phase 3 的 `fn_apply_refund_adjustment_atomic` 一致，方便統一查詢待回收項。）

### Rollback / compensation

情形 A 可還原：`UPDATE guide_balances SET balance_twd = balance_twd + :surplus_twd WHERE guide_id = :guide_id;`
情形 B 只寫稽核列，無需回滾；如需撤銷，另插一筆註記列，**不要刪除既有稽核紀錄**。

---

## 項目三：過期／與餘額不符的 pending 出款單

### 現況

`payouts` 中的 `pending` 列，金額是建立當下的餘額快照。餘額後續變動（結算、退款紅沖）不會回頭改這個快照，而 `payouts_pending_unique` 的部分唯一索引又使 generate 永遠 skip，因此舊快照會一直卡著（#1637 P1-5）。preview 的 `historical.stalePendingPayouts` 會標出 `exceedsBalance` 與 `ageDays`。

### Proposal

**不可直接 confirm 舊快照。** 順序是：對帳 → cancel → 依最新餘額重產。

```sql
-- 1) 確認該導遊的對帳已無 mismatch（preview 的 reconciliation.guides 對應列 needsAttention=false）

-- 2) cancel 舊快照。cancel 不動餘額，只釋放 pending 唯一鍵
BEGIN;
UPDATE payouts
   SET state = 'cancelled'
 WHERE id = :payout_id AND state = 'pending';

INSERT INTO audit_logs (actor, action, metadata)
VALUES ('issue1777-historical-fix', 'payout_cancelled',
  jsonb_build_object('payout_id', :payout_id, 'guide_id', :guide_id,
                     'total_twd', :stale_total_twd,
                     'reason', 'stale balance snapshot superseded by reconciled balance'));
COMMIT;

-- 3) 依最新正確餘額重產（走既有 admin API，不手寫 INSERT）
--    POST /api/v2/admin/payouts/generate
```

重產走既有 API 而非手寫 INSERT，可沿用 `createPayoutDb` 的 pending 唯一性防呆與稽核。

### Rollback / compensation

```sql
-- 誤 cancel 時可還原（前提：期間沒有重產出新的 pending，否則會撞唯一索引）
UPDATE payouts SET state = 'pending' WHERE id = :payout_id AND state = 'cancelled';
```

若已重產新的 pending，**不要**把舊列改回 pending（會違反唯一索引）；改為維持 cancelled 並在稽核紀錄說明。

---

## 執行紀律

1. **逐項、逐筆、小批**：每項獨立取得 owner 授權；每批執行後重跑 preview 確認差異如預期收斂。
2. **每次寫入前後都留證**：執行前的 SELECT 結果、執行的 SQL、影響列數、執行後的 SELECT 結果，一併記入 `docs/operations/worklogs/issue1777.md` 與 issue 留言。
3. **鐵律 2**：agent 執行任何寫入後必須立刻回報實際影響（動到哪張表、幾筆、結果）。
4. **不得為了讓數字好看而動 ledger**：`payout_items` 是 append-only 帳本，任何調整都應該是新增分錄，而非修改或刪除既有列。
5. **出款 HOLD**：Phase 2 驗收前 `PAYOUT_CONFIRM_ENABLED` 維持未設定（fail-closed）。歷史資料處理過程中若需要重產出款單，只做到 pending 為止，不 confirm。

## 待 owner 決定的事項

| 項目 | 需要的決定 |
|---|---|
| 一 | 14 筆全數已收款、符合候選條件——是否逐筆推進 `paid→confirmed`；批次大小 |
| 二 | ✅ 無需決定（已由 `20260622120000` 沖銷完畢，淨額 0） |
| 三 | 確認 cancel 舊 pending 出款單（NT$7,168）並重產的時點 |
| 全部 | production DML 的執行時窗與授權方式（`SQL-OVERRIDE` 僅涵蓋 schema 變更；DML 依 #1777 留言需另行明確授權） |

---

## 2026-08-04 重新 preview（執行前必做，已完成）

依本文件 §「執行前必做：重新取得 preview」重跑，數字如下。**全程唯讀，未執行任何 DML。**

### 項目一：卡在 `paid` 且從未結算的訂單

| 指標 | 2026-07-29 | **2026-08-04** |
|---|---|---|
| 總筆數 | 14 | **14** |
| `collectedCount`（`paid_at` 非空＝候選） | 14 | **14** |
| 候選金額 | NT$23,838 | **NT$23,838** |
| `notCollectedCount`（不處理） | 0 | **0** |
| `paymentStatusMismatchCount`（需個別檢視） | — | **0** |
| 建立區間 | — | 2026-04-01 ～ 2026-06-18 |

與前次一致，且無欄位不同步者 —— 14 筆全部符合本文件的候選準則。

### 項目二：已進導遊餘額但平台從未實收 ✅ 仍為已完成

ledger 淨額 0，無需處理（2026-07-29 已由 `20260622120000` 沖銷）。

### 項目三：過期 pending 出款單

| 指標 | 值 |
|---|---|
| pending 筆數 | **1** |
| 快照金額 | **NT$7,168** |
| 該導遊目前餘額 | **NT$21,814** |
| `exceedsBalance` | **false** |
| `ageDays` | **54**（建立於 2026-06-11） |

**與 2026-07-29 的判斷一致**：快照金額未超過現有餘額，因此 confirm 不會扣出負數。
但它仍是舊快照（餘額已從 7,168 成長到 21,814），依本文件 proposal 仍應
**cancel → 依最新餘額重產**，而非直接 confirm 舊快照。

### 順帶：F6 漏結算稽核首次對真實資料執行

`missedCount = 0` —— 沒有「該結算卻漏掉」的訂單。

但稽核抓到 **2 筆 `notEvaluable`**：`status='completed'`、`paid_at` 非空、無任何
payout item，卻**同時沒有 `booking_id` 也沒有 `schedule_id`** ⇒ 算不出 `eligible_since`。

這一點重要：**sweep 用的是同一個欄位**（`booking.start_at` fallback
`activity_schedules.start_at`），所以它對這些訂單同樣評估不了 ⇒ **永遠不會結算**。

兩筆都是 `22222222…` 開頭的 seed／測試資料（冷啟動尚無真實訂單），其中一筆已全額
退款（effective 0，本來就不該結算），另一筆部分退款（total 7,000、已退 2,000、
effective 5,000）。**金額上無實害**，但暴露了稽核本身的一個小型盲點——
`no_eligible_since` 原本被歸進「不算漏結算」，等於把「永遠無法評估」偽裝成「沒事」。
已修：獨立成 `notEvaluable` 分類，且同樣讓 `buildReconciliationReport` 的 `ok` 為 false。

**這是 F6 的教訓在小一號的尺度上重演一次**：任何把「無法判斷」與「判斷為正常」
混為一談的分類，最後都會讓真問題隱形。

---

## 可執行版本：`issue1647-dml-execution-runbook.md`

本文件提供方案與判斷準則；**實際要執行時請看
[`issue1647-dml-execution-runbook.md`](./issue1647-dml-execution-runbook.md)** ——
那份有 2026-08-05 實測數字、逐項的前置檢查／DML／執行後驗證／rollback，
以及每一項的實質金流後果（項目一會讓兩位導遊餘額合計增加 NT$20,261）。
