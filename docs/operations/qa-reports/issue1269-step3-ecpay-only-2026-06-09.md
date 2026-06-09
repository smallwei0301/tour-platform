# QA 驗收 — #1269 Booking V2 Step 3 ECPay-only 付款 UI（post-#1268）

**Issue:** #1269 — [QA] Verify post-#1268 Booking V2 ECPay-only payment UI
**對應修正:** PR #1268（closes #1261）— Booking V2 Step 3 移除可獨立選取的 LINE Pay / ATM 虛擬帳號 radio，改為 ECPay 安全付款頁 handoff 文案；checkout 契約維持 `provider: 'ecpay'` only
**執行者:** AI agent（Claude Code）
**分支:** `claude/issue-1269-step3-ecpay-only-qa`（基於 `origin/main` `e748ff3`）
**測試時間:** 2026-06-09 15:19（Asia/Taipei）

---

## 結論

**PASS — 付款 UI 與 checkout 契約一致，無回歸。** Booking V2 Step 3 不再顯示可被誤解的 LINE Pay / ATM radio，並顯示清楚的 ECPay handoff 文案;checkout 仍只送 `provider: 'ecpay'`。

---

## 環境 / 部署涵蓋

| 項目 | 值 |
|------|----|
| Preview 部署 | `https://tour-platform-nine.vercel.app` |
| 部署 SHA | `e748ff3eb1f3b13016ae312c317ed843ee14595e`（`/api/health` `version`，= main HEAD）|
| 含 PR #1268? | **是** — `920cf5a21e…`（#1268 merge commit）為 HEAD 祖先（`git merge-base --is-ancestor` 驗證通過）|
| 受測頁面 / route | `/booking/:activityId` Step 3、`POST /api/v2/bookings/:bookingId/checkout` |

---

## 驗收標準對應證據

### AC1 — 報告記錄環境 URL / SHA / 時間 / tester / 是否含 #1268 ✅
見上方環境表;tester = AI agent;部署含 #1268。

### AC2 — Step 3 不再顯示可獨立選取的 LINE Pay / ATM ✅
- **來源檢視:** `app/booking/[activityId]/page.tsx` 全檔搜尋 `name="payment"` / `LINE Pay` / `ATM 虛擬帳號` → **0 命中**（V2-primary 與 legacy-fallback 兩個 render 皆無）。
- **Browser smoke:** 驅動到 Step 3 後斷言 `input[name="payment"]` 數量為 0、`LINE Pay` 與 `ATM 虛擬帳號` 文字數量皆為 0。

### AC3 — ECPay handoff 文案可見、不暗示未支援能力、繁體中文 ✅
- 兩個 render 皆含（`page.tsx:403`、`:1229`）:「確認後將前往 ECPay 安全付款頁，實際可用付款方式以付款頁顯示為準。」與「🔒 付款由 ECPay 加密處理，資料不經本站」。
- Browser smoke 斷言此兩段文字於 Step 3 可見。

### AC4 — checkout 契約仍對齊可見 UI：`provider: 'ecpay'` only ✅
- `page.tsx:822` → `body: JSON.stringify({ provider: 'ecpay' })`。
- `app/api/v2/bookings/[bookingId]/checkout/route.ts:31` → `const VALID_PROVIDERS = ['ecpay'] as const;`。
- 無「把未支援 method 悄悄送進 API」的路徑。

### AC5 — 執行並記錄 PR #1268 的 focused source-contract 測試 ✅
```
node --test apps/web/tests/ui/issue1261-payment-method-ecpay-contract.test.mjs \
            apps/web/tests/ui/booking-page-shell-flag.test.mjs
# tests 12 / pass 12 / fail 0
```
含 regression guard:`booking-page-shell-flag` 斷言 V2 shell 內不再出現 `name="payment"` / `LINE Pay` / `ATM 虛擬帳號`。

### AC6 — browser smoke 抵達 Step 3、無真實付款異動 ✅
新增 durable Playwright spec `apps/web/e2e/issue1269-step3-ecpay-only-payment-ui.spec.ts`（後端以 `page.route` mock，draft 回傳假 bookingId，**不送真實付款 / 不建立正式訂單**），驅動 Step 1 → Step 2 → Step 3 並完成上述 AC2/AC3 斷言。**1 passed**。
> 註:Step 3 需先建立 draft;為避免在線上 preview 產生真實 draft 訂單（mutation），browser smoke 以本地 `next dev` + mocked API 執行;線上則記錄部署 SHA 含 #1268 與來源一致性。

### AC7 — 結果串回 #1261 / #1260 / #1267 ✅
- **#1261**（implementation bug，已由 #1268 closed）:本報告為其 post-merge production-equivalent 驗證。
- **#1260**（late-wave QA）:#1260 報告已將付款 UI 缺口列為 F3 並於 #1261/#1268 修復;本報告補足其 post-merge 驗證。
- **#1267**（2026-06-06 daily checklist）:其查詢窗 SHA 早於 #1268 merge commit，未涵蓋本修正;本報告即補上此 post-#1267 gap。

### AC8 — 無密鑰 / PII ✅
報告與測試 fixture 無 secret、cookie、JWT、API key、service-role key、連線字串、完整付款 payload、完整 order ID 或未遮蔽 PII（測試用 email/電話為合成假值）。

---

## 判定
**PASS** — #1268 的 ECPay-only 付款 UI 在含該修正的部署上與 checkout 契約一致，無回歸，補足 #1261 的 post-merge 驗證。
