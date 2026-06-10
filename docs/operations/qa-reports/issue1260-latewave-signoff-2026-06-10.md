# QA 驗收（補充 / sign-off）— #1260 late-wave merged PRs（#1236 cutoff 後）

**Issue:** #1260 — [QA] Verify late 2026-06-05 merged PRs after #1236 cutoff
**前置報告（已在 main）:** `docs/operations/qa-reports/post-merge-qa-1236-cutoff-2026-06-05.md`（隨 PR #1268 / `920cf5a` 併入）
**本補充:** 在**當前部署**重跑焦點測試 + live smoke，並對齊後續以**真實 browser smoke** 覆蓋同一批面向的姊妹 QA issue，作為 #1260 的最終 sign-off。
**執行者:** AI agent（Claude Code）
**分支:** `claude/issue-1260-latewave-signoff-qa`

---

## 結論

**PASS — 全部 late-wave PR 叢集（#1240–#1259）在當前部署 `c80f607` 上無回歸。** 各面向除了焦點測試與 live smoke，皆已由後續姊妹 QA issue 以**真實 browser smoke** 重新驗證（見對應表）。

---

## 環境
| 項目 | 值 |
|------|----|
| Deploy URL | `https://tour-platform-nine.vercel.app` |
| Commit SHA | `c80f607`（`/api/health` `version`；= `origin/main` HEAD）— 遠新於 audit 時的 `0dabbf9`，含 #1240–#1255、#1259 全部 |
| 測試時間 | 2026-06-10 12:33（Asia/Taipei）|

---

## 焦點測試（當前 main 重跑）
```
node --test (issue839 + issue1238 + issue1212 x2 + issue1254 x2 + issue1221 +
             issue1106 + issue1249 + activities-region-ssr-contract + v2-line-liff-entry)
# tests 104 / pass 104 / fail 0
npm run lint → exit 0 ；npm run typecheck → exit 0
```

## Live smoke（當前部署）
- **#1259 post-trip summary API**：`GET /api/admin/post-trip/summary`（未授權）→ **401**（非 PGRST200/500）。
- **#1246 public Booking V2 entry**：`/booking/<uuid>` → **200**。
- **#1251 `/api/activities` Cache-Control**：`public` + `x-vercel-cache`（edge 生效）。
- **#1252 `/activities`**：200；`/api/activities` ok=true、7 活動。

---

## 逐 AC 判定 + 真實 browser smoke 對應

| #1260 面向（PR 叢集）| 焦點測試 / live | 真實 browser smoke 覆蓋（姊妹 issue，同部署）| 判定 |
|---|---|---|---|
| Traveler Booking V2 entry/availability（#1246/#1248/#1241/#1245/#1250）| v2-line-liff-entry、issue839、issue1212 x2 + live booking 200 | **#1294**（slot range，桌機+手機）、**#1273/#1257**（衝突例外 + 旅客下單瀏覽器）、**#1279**（available-slots 隱私）| PASS |
| Admin seasons / schedule（#1243/#1253/#1244）| issue1238 + 契約 | **#1292**（guide availability schema 無 drift）、#1294（schedule modal/單日）| PASS |
| Post-trip / payout / settlement（#1259/#1240/#1242）| issue1254 x2、issue1221、issue1106 + post-trip 401 live | **#1297**（guide payout dashboard 真實登入 browser + API + CSV parity）| PASS |
| Public activities perf / cache（#1251/#1252）| issue1249、activities-region-ssr-contract + live cache/SSR | **#1267**（region SSR 首屏桌機+手機 browser smoke）| PASS |
| Tooling / docs（#1247/#1255）| 實際 lint exit 0（guard 一致）| #1267（lint 一致性）| PASS |

> AC6 payout：以契約測試 + #1297 真實 dashboard browser/API 驗證，未對真實 payout 做 mutation。
> AC5 post-trip：live 401（protected），非 PGRST200/500。

---

## AC 檢查
- [x] 報告含 env URL / SHA `c80f607` / Asia/Taipei 時間 / 部署含 #1240–#1255、#1259。
- [x] 每個 PR 叢集有 PASS 證據（焦點測試 + live + 姊妹 browser smoke）。
- [x] Traveler Booking V2 entry/availability 安全載入、zh-TW 失敗原因、resolver 該擋時不放行（#1294/#1273/#1257）。
- [x] Admin seasons/schedule 顯示 actionable 錯誤、正確 plan-derived 預設（#1238 + #1292）。
- [x] Post-trip summary API 回 401，非 PGRST200/500。
- [x] Payout hold/eligibility 以測試 + #1297 安全驗證，無真實 payout mutation。
- [x] Public activities perf/cache 以低風險 GET/browser smoke 驗證（#1267 + live）。
- [x] Lint/typecheck/test 記錄（104/104、lint 0、typecheck 0）。
- [x] 未發現回歸 → 唯一缺口 #1261 付款 UI 已於 PR #1268 修復並由 #1269 browser 驗證。
- [x] evidence 無 secrets / PII。

---

## 判定
**PASS** — late-wave 批次在當前部署 `c80f607` 上線安全、無回歸。原報告 F3（#1261 付款 UI）已修復並關閉。各面向已有真實 browser smoke（#1294/#1297/#1267/#1292/#1273/#1257/#1269/#1279）佐證。
