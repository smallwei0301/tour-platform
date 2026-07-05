# QA 驗收報告 — 架構清理批次（#1613–#1617）＋browser smoke

- **時間**：2026-07-05 13:35（Asia/Taipei）
- **分支／SHA**：`claude/code-architecture-review-t6p1px` @ `d4d465a`
- **環境**：本機 dev server（`npm run dev`，Node 22.22.2，in-memory fallback store）＋
  Playwright Chromium（headless，真實瀏覽器）
- **範圍**：#1613 db.mjs strangler、#1614 API 回應 helper、#1615 god-page 拆解、
  #1616 env 收斂第一批、#1617 倉庫清理

## 一、自動化測試證據

| 項目 | 結果 |
|---|---|
| 全套 `npm test`（node --test，2,900+ 測試） | **0 fail**（3 skipped 為既有） |
| `tsc --noEmit` typecheck | **0 error** |
| run-checks.sh commit 證據 | 各 commit 皆綠（.claude/state/last-checks.json） |
| e2e smoke lane（`test:e2e:smoke` 4 spec，Playwright 自管 server @3333） | **9/9 passed** |

e2e smoke lane 覆蓋與本批改動的對應：
- `issue1294-slot-range-semantics`（4 條）→ **#1615 拆解後的 guide availability 頁**實際互動（規則新增、時段預覽、警示、traveler picker 一致性）
- `issue1360`／`issue1365-admin-payout`（4 條）→ **#1613 拆出的 db-payouts.mjs** 完整鏈路（列表→確認出款→狀態變更→手動 fallback→重複產生 409 冪等）
- `issue1269-step3`（1 條）→ booking V2 金流 UI 不回歸

## 二、Browser smoke（真實 Chromium 走訪，dev server @3000）

判定標準：HTTP <500、無 Application error、無 pageerror（uncaught exception）。

| # | 頁面 | 結果 |
|---|---|---|
| 1 | 首頁 `/` | ✅ 200 |
| 2 | 活動列表 `/activities` | ✅ 200 |
| 3 | 活動詳情 `/activities/kaohsiung/kaohsiung-chaishan-cave-experience` | ✅ 200 |
| 4 | 預約頁 `/booking/<activityId>`（V2 入口） | ✅ 200 |
| 5 | **guide 檔期管理 `/guide/availability`（#1615 拆頁）** | ✅ 200、零 pageerror |
| 6 | **admin 檔期管理 `/admin/guides/<guideId>/availability`（#1615 拆頁）** | ✅ 200、零 pageerror、admin console 完整渲染 |
| 7 | **admin 活動編輯 `/admin/activities/<id>/edit`（#1615 拆頁）** | ✅ 200 |
| 8 | **admin 活動方案 `/admin/activities/<id>/plans`（#1615 拆頁）** | ✅ 200 |
| 9 | admin 出款管理 `/admin/payouts`（#1613 db-payouts 消費端） | ✅ 200 |
| 10 | admin 首頁精選 `/admin/homepage`（#1613 db-homepage-featured 消費端） | ✅ 200、零 pageerror |
| 11 | 我的訂單 `/me/orders` | ✅ 200 |
| 12 | admin 登入 API `/api/admin/auth/session` | ✅ 200（session 建立） |

備註：
- 各頁少量 console error 為 dev 環境常態（假 Supabase anon URL 的資源請求、
  favicon 等），無 uncaught exception、無渲染中斷。
- `/api/admin/guides/approved` 在無真實 Supabase env 時回 SERVER_ERROR 屬**既有行為**
  （該 API 無 in-memory fallback，與本批改動無關；smoke 改以直接路由驗頁面渲染）。

## 三、逐 issue AC 對照

### #1613（db.mjs strangler）
- [x] 循環 import 消除（db-kpi/auto-complete/redeem 不再 import db.mjs；grep 佐證）
- [x] db.mjs 6,985→4,847 行（**<5,000 里程碑**）；10 個領域檔（含 supabase-env）
- [x] size-guard CEILING 收斂 6,986→4,847；契約測試綠、132 個對外 export 不變
- 註記：搬移檔未帶 @ts-check（型別中性決策，債掛 #1597）

### #1614（API 回應 helper）
- [x] api-response.ts 單測 4/4（envelope 與 successV2/errorV2 逐欄一致）
- [x] 3 個 v2 GET route 示範接入、行為測試零回歸
- [x] 28 檔白名單 ratchet＋毒丸測試

### #1615（god-page 拆解）
- [x] 4 頁全數 <800 行：edit 1,538→721、plans 1,306→639、admin availability 1,221→631、guide availability 1,218→623
- [x] ratchet 白名單 9→5 檔；UI/e2e 零回歸（smoke lane＋walkthrough 見上）
- [x] 純結構搬移（state 留頁面層；文案/testid/API 不變）

### #1616（env 收斂第一批）
- [x] 92 檔 SUPABASE_URL/SERVICE_ROLE_KEY 直讀 → config getter；grep guard 綠
- [x] process.env 檔數 ratchet 159→98；凍結區 payments 白名單

### #1617（倉庫清理）
- [x] 7 個根目錄報告歸檔 docs/99-archive/＋workspaces 移除 packages/*＋fresh install 綠
- [ ] 巢狀 tour-platform/ 刪除：**待 owner 回覆 `P0-OVERRIDE: tour-platform/`**（bash-guard 路徑保護）
- [ ] CLAUDE.md packages 描述修正：**待 owner**（鐵律 9 治理檔）

## 四、結論

**PASS（#1617 兩項 owner 決策除外）**。五張票的程式面全數完成並經
全套單元/契約測試＋官方 e2e smoke lane＋13 項真實瀏覽器走訪驗證，
被改動頁面與核心流程渲染、互動均正常。
