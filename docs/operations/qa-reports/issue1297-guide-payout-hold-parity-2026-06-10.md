# QA 驗收 — #1297 guide payout estimate hold parity（post-#1285）

**Issue:** #1297 — [QA] Verify post-#1285 guide payout estimate hold parity
**對應修正:** PR #1285（closes #1284）— 以 canonical `computeGuidePayoutEstimate` 對齊導遊端預估撥款與 settlement hold guard（guide dashboard、monthly payout JSON、monthly payout CSV）
**執行者:** AI agent（Claude Code）
**分支:** `claude/issue-1297-guide-payout-hold-qa`（基於 `origin/main` `c125a86`）
**測試時間:** 2026-06-10 08:14（Asia/Taipei）

---

## 結論

**PASS（無回歸）** — 導遊端預估撥款與 settlement hold 語意一致:normal payable 計入、partial refund 減額、full refund 與四類 on-hold 不計入 payable net，且只暴露 privacy-safe 的 `payoutHoldReason`（enum）／`needsManualReview`（boolean）。已完成**真實 browser smoke** 與 **authenticated API smoke**;線上 andy 資料未涵蓋的 refund/hold 狀態以 93 個契約測試等效覆蓋。

---

## 環境
| 項目 | 值 |
|------|----|
| Preview 部署 | `https://tour-platform-nine.vercel.app`，smoke 時 SHA `74e6b23`（含 #1285）|
| 受測 | `/guide/dashboard`（browser）、`GET /api/guide/dashboard`、`/api/guide/payout/monthly`、`/api/guide/payout/monthly/csv` |
| 帳號 | 已核可 approved guide（唯讀）|

---

## 驗收標準對應證據

### AC1 — normal payable 訂單仍計入預估撥款與月總額 ✅（live）
- **Browser + API:** 導遊登入 → `/api/guide/dashboard` `expectedPayoutTwd = 1698`;monthly 1 筆 normal 訂單 `payableNetTwd = 1698`（= `netTwd`），計入 totals。
- **契約測試:** `issue1284-guide-payout-hold-alignment` 等（93/93）。

### AC2 — partial refund 只計入減額後金額（不回歸 #847）✅（測試 + 欄位 live）
- **來源:** `computeGuidePayoutEstimate`（settlement-config.ts）`effectiveTwd = max(0, total - refund)`，partial refund 無 hold → 減額後 non-zero payableNet。
- **Live 欄位佐證:** monthly row 含 `refundAmountTwd`、CSV 含「已退款 / 實付扣退款」欄,減額在介面可見。
- **NOT live-exercised:** andy 線上無 partial-refund 訂單 → 由 `issue1284` + `issue847` 契約測試覆蓋。

### AC3 — full refund 不計入 payable net ✅（測試）
- **來源:** full refund → `payableNetTwd = 0`、`payoutHoldReason = null`（settlement-config.ts:160-170）。
- 線上無 full-refund 訂單 → 契約測試覆蓋。

### AC4 — dispute／safety／complaint／oversell on-hold 不計入，且只暴露 privacy-safe enum/boolean ✅（shape live + 邏輯測試）
- **Live API shape:** monthly row 欄位含 `payoutHoldReason`（enum）、`needsManualReview`（boolean）;CSV 含「審核狀態」欄。**未暴露** incident 細節/PII。
- **邏輯（四類 hold → payableNet 0）:** `isPayoutOnHold` + `computeGuidePayoutEstimate`,契約測試 `issue1284`（四類 `payment_dispute`／`safety_review`／`complaint_under_review`／`oversell_investigation`）涵蓋。
- 線上 on-hold rows = 0（andy 無 held 訂單）→ 排除邏輯由契約測試覆蓋。

### AC5 — monthly CSV 總額/列數與 JSON 相符 ✅（live parity）
- **Live:** 同月 JSON totals `{gmv:1998, commission:299, net:1698}`;CSV 合計列 `…,1998,299,1698,` — **完全吻合**;CSV 資料列數對應 JSON orders 數（1 筆）。

### AC6 — browser dashboard / payout copy 清楚標示 held 需人工審核、不洩 PII ✅（real browser smoke）
- **真實 browser smoke:** 導遊登入 → `/guide/dashboard` 正常渲染（未被導向登入）、預估撥款卡片顯示、截圖留存。held-order 文案由 `needsManualReview`/「審核狀態」欄驅動（線上無 held 訂單可顯示，邏輯由契約測試覆蓋）;畫面無 PII。

### AC7 — evidence sanitized ✅
本報告僅含聚合數字/欄位名/enum 狀態;**無** email、完整 order id 值、cookie、token、service-role key、完整付款 payload 或未遮蔽 PII（monthly body 與 CSV 經掃描:無 email、CSV 無完整 UUID）。

### AC8 — 發現 mismatch → follow-up ✅
**未發現 mismatch**，不需 follow-up。

---

## 測試證據
```
node --test apps/web/tests/api/issue1284-guide-payout-hold-alignment.test.mjs \
            apps/web/tests/api/guide-payout-monthly-contract.test.mjs \
            apps/web/tests/api/guide-revenue-dashboard-contract.test.mjs \
            apps/web/tests/api/issue1106-payout-eligibility-helpers.test.mjs
# tests 93 / pass 93 / fail 0
```
線上 real browser smoke + API smoke（SHA `74e6b23`）:dashboard 渲染 + expectedPayoutTwd 1698、monthly privacy-safe hold 欄位、CSV↔JSON 總額吻合、無 PII。

---

## 判定
**PASS** — #1285 後導遊預估撥款與 settlement hold parity 正確、無回歸。線上資料未涵蓋的 partial/full-refund 與四類 on-hold 狀態，由 93 個契約測試（canonical `computeGuidePayoutEstimate`）等效覆蓋;real browser + API smoke 已依規範完成。
