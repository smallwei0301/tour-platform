# Issue #171 — Audit Verification Checklist (Parent Readiness Artifact)

> Parent: #171  
> Child artifact issue: #221  
> Purpose: 建立「已落地證據 vs 仍缺口」的真實 readiness gate，避免重開已完成 scope。  
> Non-goal: 這不是 #171 全量重做；不重開 #208 / #210 / #197；不重用已關閉 PR #196。

---

## 1) Scope boundary for this artifact (#221)

本文件只做 **parent-level verification artifact**：
- 彙整既有已落地證據（grounded evidence）
- 標示 critical write paths 的 coverage 狀態
- 定義 GO / HOLD / STOP gates
- 指出剩餘缺口，供後續 child issues 逐一落地

不在本 slice：
- 新功能實作
- 全面重做 #171 所有路徑
- 重開已結案子議題（#208、#210、#197）

---

## 2) Landed evidence already in repo / history (do not reopen)

### 2.1 Child #208 landed (refund_complete → refunded event)
- Issue: #208 (closed)
- Landing PR: #209
- Merge commit on `main`: `cfbe5b3`
- Branch trace: `tracy/issue-208-refund-complete-payment-event`
- Grounded effect: 補齊 `refund_complete` 對應 `payment_events(event_type=refunded)` 的寫入證據路徑。

### 2.2 Child #210 landed (booking/cancel verification pack)
- Issue: #210 (closed)
- Landing PR: #211
- Merge commit on `main`: `0af018c`
- Branch trace: `tracy/issue-210-booking-cancel-verification-pack`
- Grounded artifacts:
  - `docs/qa/issue-210-booking-cancel-verification-checklist.md`
  - `reports/issue-210/*`

### 2.3 Callback/payment-status evidence already landed (do not reopen closed follow-up)
- Follow-up issue: #197 (closed)
- Landing PR: #213
- Commit trace: `c48401f` (`fix(payment-callback): sync orders.payment_status on paid callback replay (#213)`)
- Grounded effect: callback paid/replay path 與 `orders.payment_status` 同步行為已有落地，應視為既有證據，不在本 #221 重新實作。

---

## 3) Critical write-path coverage matrix (parent truth table)

| Write Path | Current Status | Grounded Evidence | Gap Notes |
|---|---|---|---|
| booking/create | **Partially Covered** | 既有 booking/create verification 已被 parent children 採納（先前 accepted slice） | 需與 parent gate 的統一模板對齊（同一 decision pack 命名/彙整） |
| booking/cancel | **Covered** | #210 → PR #211 → `docs/qa/issue-210-booking-cancel-verification-checklist.md` + `reports/issue-210/*` | 仍需在 parent #171 統一 gate 中納入跨路徑 decision 彙整 |
| payment-init (建立付款意圖/付款請求) | **Still Missing** | 尚無對應已驗收 child slice 證據 | issue #171 明確列為 critical write path；需獨立 child slice 補齊並納入 parent gate |
| payment callback → payment_status sync | **Covered** | #197 closed + PR #213 (`c48401f`) | 屬既有落地，不應重開 scope |
| refund_complete → payment_events(refunded) | **Covered** | #208 → PR #209 (`cfbe5b3`) | 屬既有落地，不應重開 scope |
| admin-manual audit writes（POS / LINE / 後台人工異動） | **Still Missing** | 無對應已驗收 child slice 證據 | 路徑名稱需與 issue #171 文案對齊；後續以 child issues 分批補齊 |
| Cross-path consolidated readiness report (#171 final gate) | **Still Missing** | 尚無單一 parent-level consolidated report | 本文件先建立門檻，後續以 child evidence 疊代收斂 |

---

## 4) Readiness gates (GO / HOLD / STOP)

### GO
僅在以下條件全部成立時：
1. 所有 P0/P1 critical write paths 均為 **Covered**（無 Still Missing）
2. 每個路徑皆有可重現證據（checklist + report/query/script 其一以上）
3. callback/payment-status 與 refund/cancel 路徑在最近驗證窗口無 regression 訊號
4. Parent consolidated readiness report 已產生且可被 QA/on-call 直接重跑

### HOLD（預設）
任一情況成立即 HOLD：
1. 任一 critical write path 為 **Partially Covered** 或 **Still Missing**
2. 證據存在但不可重現（命令/SQL/報表鏈斷裂）
3. 僅有文件宣告、缺少可驗證產出

### STOP
任一高風險條件成立即 STOP：
1. 發現 write-path regression（如 callback/replay 導致 payment_status 不一致）
2. 發現 audit chain 斷裂（correlation_id / actor/source 關鍵欄位不可追）
3. 生產監控顯示金流/取消/退款關鍵路徑出現持續性錯誤且無可用回滾證據

---

## 5) Current parent decision for #171 (based on this artifact)

**Decision: HOLD**

Reason (truthful):
- 已有落地證據：#208、#210、#197 對應的關鍵子路徑已可被引用
- 但 parent-level 全路徑收斂仍未完成，仍存在 **Still Missing** critical write paths（含 payment-init、admin-manual audit writes）
- 因此 #171 readiness 不能標為 GO，也不應誤報為全阻塞（已非全空白）

---

## 6) How to update this checklist safely

每次新增 child slice 落地時，請僅做下列最小更新：
1. 在第 2 節追加 landed evidence（issue/PR/commit/artifact）
2. 在第 3 節更新對應 write path 狀態（Still Missing → Partially/Covered）
3. 重新評估第 5 節 decision（GO/HOLD/STOP）

禁止：
- 以尚未落地的計畫文字替代 grounded evidence
- 將已關閉 scope 重新標示為未完成並重開同一範圍
