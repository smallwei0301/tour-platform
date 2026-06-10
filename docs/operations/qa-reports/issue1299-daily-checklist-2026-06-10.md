# Daily QA Checklist — 2026-06-09 批次 merged PR（#1299）

**Issue:** #1299 — [QA] Daily test checklist for recent merged PRs 2026-06-09
**涵蓋 PR:** #1295（旅客端衝突例外下單 E2E）、#1291（GH-1289 slot semantics）、#1287（migration drift safeguards）、#1285（guide payout hold）、#1274 / #1272（GH-1257）
**執行者:** AI agent（Claude Code）
**分支:** `claude/issue-1299-daily-checklist-qa`

---

## 測試環境 / Deploy
| 項目 | 值 |
|------|----|
| Deploy URL | `https://tour-platform-nine.vercel.app` |
| Commit SHA | `b4514c1`（`/api/health` `version`，= `origin/main` HEAD）|
| 含本批 PR? | **是**（≥ issue 要求的 `6c360d1`，且為更新版本，#1295/#1291/#1287/#1285/#1274/#1272 皆已併入）|
| 測試時間 | 2026-06-10 08:2x（Asia/Taipei）|
| 帳號 | approved guide（唯讀）;traveler/public 匿名;admin 由 Playwright test-token 驗證 |

> 所有結果綁定**同一 deploy SHA `b4514c1`**;引用的既有 QA issue 結論也對齊同批部署。

---

## 手動測試清單

- [x] **旅客端從公開詳情頁進入預訂流程（#1295/#1274）** — `/activities/kaohsiung/...`(200) → booking 頁帶 plan/date 完整渲染（步驟 1 行程確認、方案、日期選擇器）。**只有被例外開放的精確衝突場可繼續**、未開放衝突場維持不可預約 → 由 `issue1257-traveler-conflict-override-booking.spec.ts`（2/2 passed，本 SHA）直接證據覆蓋。**PASS**
- [x] **旅客 booking 時段完整區間文案（#1291/#1295）** — 時段以 `09:00 – 15:00` 完整區間呈現、切換日期/方案無殘留、無 `17:00–00:00` timezone 異常 → `issue1294-slot-range-semantics.spec.ts`（AC2/AC4，4/4）+ `issue1289-ui-range-display`（本 SHA）覆蓋。線上 booking 頁日期選擇器顯示「（剩餘 N）/（不可預約）」正常。**PASS**
- [x] **手機版 booking 頁不破版（#1295/#1291）** — iPhone 13 viewport 帶 plan/date 開 booking 頁:完整渲染標題/步驟/方案/日期選擇器，**0 非-404 console error**、無 hydration error、CTA 可用。**PASS**
- [x] **導遊可用性頁時段區間 + mismatch 提醒（#1291）** — `/guide/availability`(authed) render OK、0 console error;duration/interval mismatch 提醒與完整區間語意由 `issue1294`（AC1/AC3）+ `issue1289`（85/85）覆蓋。**PASS**
- [x] **導遊首頁 dashboard 交叉 sanity（#1285）** — `/guide/dashboard`(authed) 正常載入、**0 console error**、預估可領摘要顯示（`expectedPayoutTwd`）。完整 payout 四狀態矩陣以 #1297（已 PASS/closed，同批）為準。**PASS**

---

## 整合測試清單

- [x] **旅客端衝突例外 E2E** — `e2e/issue1257-traveler-conflict-override-booking.spec.ts` → green（含在下方 11/11）。
- [x] **admin/guide/single-day 同 SHA Playwright** — `issue1257-admin-conflict-override-ui` + `issue1273-guide-conflict-override-warning` + `issue1273-admin-single-day-opening-tz` + `issue1269-step3-ecpay-only` + `issue1294-slot-range-semantics` → **11 passed**（同一 SHA，三角色不打架）。
- [x] **PR #1291 焦點測試** — `issue1289-duration-vs-interval` + `preview-canonical-parity` + `buffer-conflict` + `ui-range-display` → 通過（含在 85/85）。
- [x] **PR #1285 焦點測試（交叉 sanity）** — `issue1284-guide-payout-hold-alignment` + `guide-payout-monthly-contract` → 通過（含在 85/85）;**詳細 payout 狀態矩陣由 #1297 擁有**。
- [x] **PR #1287 drift guard（同 SHA）** — 主要功能煙霧由 #1292（closed，同批）覆蓋:guide `activities-with-plans` 200/無 `is_year_round` drift、admin plans 無 SCHEMA_MISMATCH、archived 不曝光旅客端。未對 production 做 mutation。
- [x] **Auth / CSRF** — 未登入 `GET /api/guide/{dashboard,payout/monthly,bookings}` → **401**(×3);admin/guide mutation 的 CSRF 雙提交保護未被弱化（middleware + 既有測試）。
- [x] **Browser network/console** — 導遊三頁 0 console error;booking 頁唯一 404 為 `/api/activities/<UUID>` 的 **UUID→slug 入口恢復**（#1237 既有設計，會轉址至 slug 後正常），非回歸。

**測試指令證據:**
```
node --test (issue1289 x4 + issue1284 + guide-payout-monthly)   # 85/85
npx playwright test (issue1257-traveler, issue1257-admin, issue1273 x2, issue1269, issue1294)   # 11 passed
```

---

## 完整回歸測試清單
- [x] **Public UI smoke** — `/`、`/activities`、公開詳情頁、2 個 booking URL、`/guide/login`、`/admin/login` → 全 **200**。
- [x] **Role consistency** — traveler（匿名 booking 渲染 + issue1257-traveler spec）、guide（andy 登入 dashboard/availability/bookings render）、admin（Playwright test-token spec）皆對齊 SHA `b4514c1`。
- [x] **API/DB/schema** — drift guard 與功能層一致（#1292 同批），無 schema drift。
- [x] **Payment/refund/settlement** — 導遊首頁摘要與月結 API 與 #1297 結論一致（PASS）。
- [x] **Auth/CSRF** — 401 未登入、CSRF 保護維持。
- [x] **Mobile/responsive** — 手機版 booking 頁完整渲染、無破版。
- [x] **Console/network** — 無主要 console error / hydration mismatch（唯一 404 為設計內 UUID→slug 恢復）。

---

## 失敗項 / Evidence
- 無。唯一觀察:直接以 **UUID 無參數** 開 booking 頁會先 404（`/api/activities/<UUID>`）再轉址到 slug——此為 #1237 既有入口恢復設計，非本批回歸;帶 plan/date 的真實路徑（含手機版）完整渲染。

## Follow-up issue / owner
- 無需 follow-up。

## Go / No-Go
**GO** — 本批 merged PR（#1295/#1291/#1287/#1285/#1274/#1272）在 deploy SHA `b4514c1` 上:旅客 booking（桌機+手機）、導遊可用性/首頁、payout 摘要、auth/CSRF、console/network 皆無回歸;整合測試 node 85/85 + Playwright 11/11 全綠;跨頁（detail→booking→guide availability）對齊同一 SHA。

> 引用來源:#1297（payout 狀態矩陣，PASS）、#1294（slot semantics，PASS）、#1292（migration drift，PASS）、#1273/#1279/#1269（衝突例外/隱私/付款 UI，PASS）——皆同批部署。
> 證據不含 secrets、token、cookie、service-role key、完整付款 payload 或未遮蔽 PII。
