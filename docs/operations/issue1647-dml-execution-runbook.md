# ⛔ 作廢（VOID）— #1647 歷史資料 DML 執行 runbook

> **本檔全部內容於 2026-08-05 作廢，任何一段 DML 都不得執行。保留純為審計軌跡。**
>
> ## 作廢原因
>
> 本 runbook 成立的前提是「這些是真實歷史訂單，錢確實收到了，只是卡在錯誤狀態」。
> 該前提**是錯的**。owner 於 2026-08-05 指出：目前所有訂單與導遊 andy 皆為**測試資料**。
> 事後查核佐證（實測）：
>
> - 14 筆卡單中 10 筆為測試型 email，金額多為 NT$2／NT$18 的 sandbox 值；
> - **全部訂單 `payment_events` 皆為 0** —— provider 端從未有任何付款事件；
> - 當時 NT$21,814 的導遊餘額同樣來自測試資料（seed UUID `22222222…`／`00000000…`，
>   10 筆 payout_items 的 `payment_events` 全為 0）。
>
> ## 因此本檔的三項建議全部反向
>
> | 原建議 | 正確處置 |
> |---|---|
> | 項目一：14 筆 `paid` → `confirmed`，預期入帳 NT$20,261 | **絕對不可執行**。會把 NT$20,261 的假錢推進 `guide_balances`，一旦 HOLD 解除即為真實誤匯。 |
> | 項目三「cancel 後依最新餘額**重產**」 | cancel 正確並已執行；**重產不可做**，餘額本身就是測試資料。 |
> | 「觀察一輪對帳無異常後解除出款 HOLD」 | 反了 —— 在測試資料清空前解除 HOLD 才是最危險的一步。 |
>
> 另更正本檔內一句誤導性敘述：原文「三方對帳無差異 ✅ ledger = 餘額 = NT$21,814」
> 技術上為真，但被當成「可以放行」的訊號使用；實際上那是**測試資料自己對自己對得起來**，
> 不構成任何上線準備度證據。
>
> ## 實際執行了什麼（取代本檔）
>
> 2026-08-05 依 owner 指示改做**測試資料收尾**，逐筆影響見
> `docs/operations/worklogs/issue1777.md` 的「測試資料收尾」章節。
> 結果：訂單卡單 0、pending payout 0、`guide_balances` 合計 **0**、ledger 淨額 **0**。
>
> ## 若日後要處理真實歷史資料
>
> 不要沿用本檔的 SQL。必須重新 preview，且候選準則**至少要加一條**：
> `EXISTS (SELECT 1 FROM payment_events pe WHERE pe.order_id = o.id)`
> —— 本檔最根本的缺陷就是只看 `orders.paid_at`，而 `paid_at` 可以由測試路徑寫入，
> 不等於平台真的收到錢。

---

<details>
<summary>以下為作廢前的原始內容（僅供審計，勿執行）</summary>

# #1647 歷史資料 — DML 執行 runbook（待 owner 逐項授權）

> 本檔是 `issue1777-historical-data-proposal.md` 的**可執行版本**：每一項都附前置檢查、
> 實際 DML、執行後驗證與 rollback。數字為 **2026-08-05 實測**。
>
> **未經 owner 逐項明確授權，不得執行任何一段 DML。** 授權方式：在 issue #1647 或
> 對話中明確指出「授權項目 N」。

## 執行前的共通前提

| 前提 | 狀態 |
|---|---|
| 財務鏈四支函式已原子化並驗證 | ✅ #1777 已完成 |
| 端到端全鏈驗證 | ✅ 2026-08-04（10 條斷言，零落地） |
| 三方對帳無差異 | ✅ 唯一導遊 ledger = 餘額 = NT$21,814 |
| 出款 confirm | 🔒 **仍為 HOLD** — 這是本 runbook 的安全網（見下） |

**出款 HOLD 是關鍵安全網**：項目一會讓錢進入 `guide_balances`，但只要 HOLD 未解除，
錢就**不會真的匯出去**。也就是說在解除 HOLD 之前，項目一都還有補救空間。
建議：**先執行項目一與項目三、觀察一輪對帳無異常後，再解除 HOLD**。

執行紀律：每段 DML 都在**單一交易**內、附 audit_logs 追蹤列、執行後立即跑驗證查詢，
並把實際影響筆數回報到 issue #1647。

---

## 項目一：卡在 `paid` 且從未結算的訂單

### 現況（2026-08-05 實測）

| 指標 | 值 |
|---|---|
| 筆數 | **14** |
| 全部 `paid_at` 非空（provider 確實已收款） | ✅ 14/14 |
| 有 `guide_id`（可歸屬導遊） | ✅ 14/14 |
| 有 `eligible_since` 且已過 T+7 | ✅ 14/14 |
| 任一 hold 旗標 | **0** |
| 有退款 | **0** |
| `payment_status` 不同步 | **0** |
| 訂單總額 | **NT$23,838** |
| 建立區間 | 2026-04-01 ～ 2026-06-18 |

**14 筆全部符合候選準則，無一需要個別檢視。**

### ⚠️ 這一項的實際金流後果

改成 `confirmed` 後，訂單會由 auto-complete sweep 推進到 `completed`，再由每日
settlement sweep 結算入帳。**預期入帳金額：**

| 導遊（遮罩） | 訂單數 | 訂單總額 | 預期入帳淨額 | 目前餘額 |
|---|---|---|---|---|
| `963a3e13…` | 13 | NT$21,838 | **NT$18,561** | NT$21,814 |
| `650ac868…` | 1 | NT$2,000 | **NT$1,700** | NT$0 |
| **合計** | **14** | **NT$23,838** | **NT$20,261** | — |

這是 owner 要簽核的實質內容：**兩位導遊的餘額合計會增加 NT$20,261**。
（金額為現行 rate 0.15 下 `floor(total × 0.85)` 之和；實際由 DB 端在結算交易內重算。）

**這不是立即發生**：paid→confirmed 只是把訂單放回正常狀態機，實際入帳要等
auto-complete sweep 與 settlement sweep 各跑一次（各為每日排程）。

### 前置檢查（必跑，數字須與上表一致）

```sql
SELECT count(*) AS total,
       count(*) FILTER (WHERE o.paid_at IS NULL) AS must_be_zero_not_collected,
       sum(o.total_twd) AS gross_twd
  FROM orders o
 WHERE o.status = 'paid'
   AND NOT EXISTS (SELECT 1 FROM payout_items pi WHERE pi.order_id = o.id);
-- 期望：total=14、must_be_zero_not_collected=0、gross_twd=23838
-- 數字不符 ⇒ 資料已變動，停止執行並重新 preview。
```

### DML

```sql
BEGIN;

WITH target AS (
  SELECT o.id, o.total_twd
    FROM orders o
   WHERE o.status = 'paid'
     AND o.paid_at IS NOT NULL                      -- 從未實收者不處理
     AND NOT EXISTS (SELECT 1 FROM payout_items pi WHERE pi.order_id = o.id)
), upd AS (
  UPDATE orders o
     SET status = 'confirmed', updated_at = now()
    FROM target t
   WHERE o.id = t.id
     AND o.status = 'paid'                          -- 競態再確認
  RETURNING o.id, t.total_twd
)
INSERT INTO audit_logs (order_id, actor, action, metadata)
SELECT u.id, 'issue1647-item1', 'issue1647_paid_to_confirmed',
       jsonb_build_object(
         'order_id', u.id,
         'total_twd', u.total_twd,
         'from_status', 'paid',
         'to_status', 'confirmed',
         'batch', '2026-08-05-item1',
         'reason', '#1637 P0-1 修復前的存量：callback 後缺少自動 paid→confirmed 路徑'
       )
  FROM upd u;

-- ⚠️ COMMIT 前先看上面 INSERT 的列數：必須是 14。不是 14 就 ROLLBACK。
COMMIT;
```

### 執行後驗證

```sql
SELECT (SELECT count(*) FROM orders WHERE status='paid'
          AND NOT EXISTS (SELECT 1 FROM payout_items pi WHERE pi.order_id=orders.id)) AS remaining_stuck,
       (SELECT count(*) FROM audit_logs
         WHERE action='issue1647_paid_to_confirmed'
           AND metadata->>'batch'='2026-08-05-item1') AS audited;
-- 期望：remaining_stuck=0、audited=14
```

之後**連續兩天**檢查月報表的 `reconciliation` 區塊：`ok` 應維持 true，
`missedSettlementCount` 與 `notEvaluableSettlementCount` 應為 0。

### Rollback

```sql
UPDATE orders o
   SET status = 'paid', updated_at = now()
  FROM audit_logs al
 WHERE al.action = 'issue1647_paid_to_confirmed'
   AND al.metadata->>'batch' = '2026-08-05-item1'
   AND o.id = al.order_id
   AND o.status = 'confirmed';
```

**⚠️ Rollback 有時效**：一旦 auto-complete sweep 把訂單推進到 `completed`，
上面的 `AND o.status='confirmed'` 就不再匹配。若已進到 `completed` 甚至已結算，
補救方式改為：對已產生的 payout item 走 `fn_record_refund_reversal_atomic` 紅沖
（餘額會被扣回，允許為負），而非改回 `paid`。

**因此：若要保留簡單 rollback，請在執行後、auto-complete sweep 下次執行前決定是否回退。**

---

## 項目二：已進導遊餘額但平台從未實收 ✅ 無需 DML

2026-07-29 與 2026-08-05 兩次實測皆為 **ledger 淨額 0** —— 已由 `20260622120000` 沖銷完成。
**本項無待執行 DML。**

---

## 項目三：過期 pending 出款單

### 現況（2026-08-05 實測）

| 指標 | 值 |
|---|---|
| pending 筆數 | **1**（`77276203…`） |
| 導遊 | `963a3e13…` |
| 快照金額 | **NT$7,168** |
| 該導遊目前餘額 | **NT$21,814** |
| `exceedsBalance` | **false** |
| 建立日 / 帳齡 | 2026-06-11 / **54 天** |

### 為什麼不能直接 confirm

金額是**建立當下的餘額快照**（NT$7,168）。餘額後續已成長到 NT$21,814，而
`payouts_pending_unique` 的部分唯一索引讓 generate 永遠 skip，所以舊快照會一直卡著
（#1637 P1-5）。直接 confirm 會只付 7,168、剩下的 14,646 繼續卡在餘額裡，
且下一張 payout 仍然產不出來。

**正確順序：cancel → 依最新餘額重產。**

### 餘額中性（已驗證，非假設）

`cancelPayoutDb`（`src/lib/db-payouts.mjs`）只做兩件事：`state → 'cancelled'`
與寫一筆 `payout_cancelled` audit。**不動 `guide_balances`** —— 餘額扣減只發生在
`fn_confirm_payout_atomic`。因此 cancel 是完全可逆、零金額影響的操作。

### DML

```sql
BEGIN;

WITH upd AS (
  UPDATE payouts
     SET state = 'cancelled'
   WHERE state = 'pending'
     AND created_at < now() - interval '30 days'    -- 只處理陳舊快照
  RETURNING id, guide_id, total_twd
)
INSERT INTO audit_logs (actor, action, metadata)
SELECT 'issue1647-item3', 'payout_cancelled',
       jsonb_build_object(
         'payout_id', u.id, 'guide_id', u.guide_id, 'total_twd', u.total_twd,
         'cancelled_by', 'issue1647-item3',
         'batch', '2026-08-05-item3',
         'reason', '#1637 P1-5 陳舊餘額快照；將依最新餘額重產'
       )
  FROM upd u;

-- ⚠️ COMMIT 前確認列數為 1。
COMMIT;
```

### 重產（不用 SQL）

走既有 admin 介面／`generate-payouts` 排程，讓它依**最新餘額**產生新的 pending payout。
不要手動 INSERT `payouts`——重產路徑有 `min_withdrawal_twd` 等規則，手寫會繞過。

### 執行後驗證

```sql
SELECT p.state, count(*), sum(p.total_twd) AS twd
  FROM payouts p GROUP BY p.state ORDER BY 1;
-- 期望：cancelled +1（7,168）、pending 0（重產前）
SELECT guide_id, balance_twd FROM guide_balances;
-- 期望：21814 完全未變（cancel 不動餘額）
```

### Rollback

```sql
UPDATE payouts SET state = 'pending'
 WHERE id IN (SELECT (metadata->>'payout_id')::uuid FROM audit_logs
               WHERE action='payout_cancelled' AND metadata->>'batch'='2026-08-05-item3')
   AND state = 'cancelled';
```

若已重產出新的 pending payout，需先 cancel 新的那張，否則
`payouts_pending_unique` 會擋下回退。

---

## 建議執行順序

1. **項目三先做**（零金額影響、完全可逆）→ 觀察餘額未變 → 重產並確認新 payout 金額 = 21,814。
2. **再做項目一**（有金額後果）→ 等 auto-complete + settlement sweep 各跑一輪 →
   確認 `reconciliation.ok` 仍為 true、兩位導遊餘額增加 NT$20,261。
3. **最後解除出款 HOLD**（`PAYOUT_CONFIRM_ENABLED=true`）→ 才真正把錢匯出去。

把有金額後果的那一步夾在「可逆操作」與「HOLD 解除」之間，任何一步出錯都還有退路。

## 授權紀錄

| 項目 | 授權時間 | 授權者 | 執行時間 | 實際影響 |
|---|---|---|---|---|
| 一 | **作廢，永不執行** | — | — | 無（前提錯誤，見檔頭） |
| 二 | n/a（無需 DML） | — | — | — |
| 三 | 2026-08-05 owner 指示測試資料收尾 | owner | 2026-08-05 | cancel 1 筆 payout（NT$7,168）＋1 筆 audit；**重產部分作廢未執行** |

</details>
