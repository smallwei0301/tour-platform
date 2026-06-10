# Daily QA Checklist — 2026-06-06 批次 merged PR（#1267）

**Issue:** #1267 — [QA] Daily test checklist for recent merged PRs 2026-06-06
**本 issue 新增驗證重點:** `activities/[region]` 首屏 SSR / cache / mobile（PR #1258）、lint 版本守門 vs 實際 lint 一致性（PR #1210 ↔ #1264）
**執行者:** AI agent（Claude Code）
**分支:** `claude/issue-1267-daily-checklist-qa`

> 其餘 booking / availability / post-trip / payout / seasons / reason-copy 等項目，主驗證沿用同批部署的 #1260（late-wave QA）與 #1263/#1257（衝突例外）結論，本 issue 不重複派工。

---

## 測試環境 / Deploy
| 項目 | 值 |
|------|----|
| Deploy URL | `https://tour-platform-nine.vercel.app` |
| Commit SHA | `b4514c1`（`/api/health` `version`；`origin/main` HEAD `ba59d37`）— 皆 ≥ issue 要求的 `5da2ac78` |
| 測試時間 | 2026-06-10 08:3x（Asia/Taipei）|
| 帳號 | public/匿名（region listing 無需登入）|

---

## 手動測試清單（PR #1258）

- [x] **高雄 region 首屏 SSR** — `/activities/kaohsiung`：raw HTML 含 **4 個 SSR 活動連結、0「載入中」**;桌機瀏覽器 6 點時間軸（@300ms 起）穩定 **4 卡片、0 載入中**（無「先載入中再跳內容」flicker）。**PASS**
- [x] **台北 / 花蓮 region** — `/activities/taipei`(SSR 1 連結)、`/activities/hualien`(SSR 1 連結) 皆 HTTP 200、0「載入中」、各自顯示對應地區內容，切換後無前一地區殘留。**PASS**
- [x] **手機版 region 首屏** — iPhone 13 viewport 開 `/activities/kaohsiung`：**4 卡片**、非僅載入中、**0 console error**、無破版。**PASS**
- [x] **單一活動路徑** — `/activities/kaohsiung-chaishan-cave-experience` → HTTP **200**，正常顯示活動內容（無 404/空白）。**PASS**

---

## 整合測試清單

- [x] **region SSR source-contract** — `node --test apps/web/tests/api/activities-region-ssr-contract.test.mjs`（+ `issue1195-eslint…`）→ **8/8**;確認 `activities/[region]` 保有 SSR 初始資料、未重新引入 `force-dynamic`。
- [x] **region-perf E2E** — `npx playwright test e2e/activities-region-perf.spec.ts` → **2 passed**。
- [x] **region cache header** — `curl -I /activities/kaohsiung`：文件層 `cache-control: private, no-cache…`、`x-vercel-cache: MISS`。#1258 的 perf 機制是 **SSR 初始資料（首屏即見卡片）+ `/api/activities` edge cache**（後者於 #1260 已驗 `public` + edge），文件層非快取屬預期，非 revalidate 失效。
- [x] **PR #1210 版本守門測試** — `node --test apps/web/tests/api/issue1195-eslint-config-next-version-pin.test.mjs` → 通過（`next` 與 `eslint-config-next` major pin 契約成立）。
- [x] **實際 lint（vs #1264 一致性）** — `npm run lint` → **exit 0**（僅 eslintrc deprecation warning）。**guard 綠燈 + 實際 lint 綠燈一致 → #1264 的 circular config lint 失敗在本部署已解除**，非 blocker。
- [x] **typecheck** — `npm run typecheck` → exit 0。
- [x] **deploy 一致性** — 本 issue 與 #1260/#1263 引用同一 deploy（`b4514c1`/同批），結論不矛盾。

---

## 完整回歸測試清單
- [x] **Public listing regression** — `/activities`(200)、`/activities/kaohsiung`(SSR 4)、`/taipei`(SSR 1)、`/hualien`(SSR 1)、活動 detail(200) 皆正常。
- [x] **Console / network** — region 桌機+手機 **0 console error**、無 hydration mismatch、無非預期 4xx/5xx。
- [x] **Deploy consistency** — 同批 #1260/#1263 無 FAIL/HOLD 與本結論衝突。
- [x] **Tooling** — `issue1195` guard 通過且實際 lint 綠燈一致 → 不需 `HOLD pending follow-up`（#1264 lint 失敗已解除）。
- [x] **Mobile / responsive** — 高雄 region 手機寬度 smoke PASS。

---

## 失敗項 / Evidence
- 無。觀察:首輪桌機抓拍曾出現 1 筆「0 卡片/載入中」瞬態，經 6 點時間軸 + raw HTML + 手機三方複驗，確認 region SSR 首屏穩定顯示 4 卡片、0 載入中，該筆為冷啟動取樣瞬態，非回歸。

## Follow-up issue / owner
- 無。#1264 所述 lint 失敗在本部署已不重現（lint exit 0）。

## Go / No-Go
**GO** — PR #1258 的 region SSR 首屏（桌機+手機）、cache 行為、單一活動路徑皆正常無回歸;PR #1210 guard 與實際 lint 一致（#1264 已解除）;整合測試 region-ssr-contract 8/8 + region-perf E2E 2/2 + lint/typecheck 綠;與 #1260/#1263 同部署結論一致。

> 證據不含 secrets、token、cookie、service-role key、完整付款 payload 或未遮蔽 PII。
