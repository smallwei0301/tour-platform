# 15. 架構模組化健檢報告（2026-07）

- **健檢日期**：2026-07-04（Asia/Taipei）
- **基準 commit**：`94820fe`（main）
- **量測方法**：全庫掃描（行數統計、import 掃描、grep 計數）＋人工抽樣代表性檔案；所有數字皆為實測，非推估。
- **配套守門**：`apps/web/tests/unit/architecture-ratchet-guard.test.mjs`（本報告 §5 的四項天花板）

## 0. 總評

**有分層、但模組化不足；雜亂度中偏高。** 分層方向乾淨（`src/lib` 從不反向 import `app/`），測試量大且有「以測試守護架構決策」的成熟文化；但資料層仍是單體 gateway、`src/lib` 攤平百餘檔、多個千行 god-page/god-route、API 樣板各自手刻、env 散讀——這些是未來新增與修改程式碼「越寫越亂」的主要風險源。本輪對策不是大重構，而是**先用 ratchet 守門讓雜亂度只降不升**，再按 §4 路線圖分批收斂。

## 1. 現況評估（附證據）

### 1.1 分層與整體結構 — 尚可

- Routes（`app/**`）→ 業務/資料層（`src/lib/**`）→ `db.mjs` gateway → Supabase；無環境變數時 fallback in-memory store（`store.mjs`／`services.mjs`／`admin.mjs`），是測試 seam。
- ✅ `src/lib` 完全沒有 import `app/` 的反向依賴（grep 0 筆）——分層方向乾淨。
- ⚠️ **`packages/{config,ui}` 實際不存在**：root `package.json` 宣告 `workspaces: ["apps/*", "packages/*"]`，但 `packages/` 目錄不在磁碟上；實質是單一 app（`apps/web`）。CLAUDE.md 的 monorepo 描述與現實不符（治理檔禁自改，僅在此回報，待 owner 決定）。
- ⚠️ 根目錄散落歷史報告檔（`ISSUE_7_COMPLETION_REPORT.md`、`PHASE11-TEST-PLAN.md` 等）與巢狀 `tour-platform/supabase` 目錄，屬清倉候選。

### 1.2 資料層 — 最大熱點

- **`src/lib/db.mjs`＝6,985 行、132 個 export** 的 god gateway（全庫最大檔，是次大檔的 4.5 倍）。
- Strangler 已啟動但進度 <15%：已拆出 6 個領域檔共約 976 行（`db-guide-delete.mjs` 244、`db-kpi.mjs` 189、`db-auto-complete.mjs` 168、`db-guides.ts` 148、`db-reviews.ts` 144、`db-redeem.mjs` 83）。
- ⚠️ **循環 import**：`db.mjs` import `db-kpi.mjs`，而 `db-kpi.mjs`／`db-auto-complete.mjs`／`db-redeem.mjs` 又回頭 import `db.mjs` 的 `hasSupabaseEnv`/`getSupabase`（`db.mjs:85-87` 已註記）。解法見 §4 P1。
- ⚠️ **資料存取路徑分裂**：89 個 route 走 `db.mjs`、41 個 route 直接 import `supabase/server`、部分 admin route（如 `refund-execute`）在 handler 內自建 service-role client——沒有單一被強制的資料存取路徑。

### 1.3 API 路由層 — 樣板重複嚴重

187 個 route 檔（admin 66、guide 43、v2 31、me 15、其他）。薄 handler 的好範例存在（`app/api/me/orders/route.ts` 僅 29 行：rate-limit → auth → `listMyOrdersDb()` → return），但不是常態：

- `app/api/v2/bookings/draft/route.ts`＝**1,198 行**的 god-handler。
- `checkout/route.ts`（524 行）、`refund-execute/route.ts`（517 行）把 ECPay MAC、退款編排、通知推送直接寫在 handler 內。
- **216 處手刻 `NextResponse.json`、其中 121 處為 inline 錯誤回應**；全庫 **0 個 zod**（輸入驗證全手刻、各自複製）。
- 共用 Supabase helper（`src/lib/supabase/server.ts`）僅 41 route 採用；`app/api` 內直接 import `@supabase/supabase-js`／`@supabase/ssr` 的檔案 20 個；`SERVICE_ROLE_KEY` 直讀 102 處。

### 1.4 前端 — god-page 集中在 app/，components/ 尚健康

- `src/components` 60 檔、按領域分資料夾（activity 15、home 9、admin 7…），最大元件 474 行，尚可。
- **問題在頁面**：>800 行的檔案 10 個，其中 7 個是 page.tsx——
  `app/admin/activities/[id]/edit/page.tsx`（1,537）、`app/admin/activities/[id]/plans/page.tsx`（1,305）、`app/admin/guides/[guideId]/availability/page.tsx`（1,220）、`app/guide/availability/page.tsx`（1,217，與前者疑似近重複）、`app/booking/[activityId]/page.tsx`（1,079）、`app/guide/profile/page.tsx`（991）、`app/me/orders/[orderId]/page.tsx`（826）。
- lib 端大檔：`email.ts`（862 行，內嵌大量模板）、`slot-generator.ts`（780）。

### 1.5 `src/lib` 組織 — 攤平擁擠

- 頂層 **156 個檔案**（約 100 `.mjs`＋55 `.ts`），僅 5 個子資料夾（`availability-v2/` 21 檔、`booking-readiness/`、`supabase/`、`alerting/`、`post-trip/`）。
- 同領域靠檔名前綴散落：`line-*` 12+ 檔攤平；`availability-v2/` 有資料夾但兄弟檔 `slot-generator.ts`、`booking-*` 仍在頂層——不一致。
- `.ts` → `.mjs` 跨 import **372 處**；`.mjs` 另配手寫 `.d.ts`／`.d.mts` sidecar（如 `booking-entry.d.ts`、`activity-bottom-bar-cta.d.mts`）造成型別重複維護。也曾出現同名雙檔（`faq-route-helpers.mjs` 與 `.ts` 並存）。

### 1.6 env／config — 集中化名存實亡

- `src/config/`（`env.ts`、`feature-flags.mjs`、`security-env.mjs`、`startup-env.mjs`）存在，但 **`src/config` 之外仍有 347 處 `process.env` 散讀、跨 159 檔**。缺乏 env 單一事實來源。

### 1.7 測試與守護文化 — 亮點

- 551 個測試檔按領域分類（api／ui／unit／integration／security／e2e／ops／qa）。
- 以 issue 編號 guard 測試固化架構決策（`db-mjs-size-guard`、`issue1407-legacy-retirement-residue-guard` 等十餘個）；全庫 0 個 TODO/FIXME 殘留——債務用 guard 測試追蹤而非註解。
- legacy booking 已退役且有殘留守門，`BOOKING_V2` 殘名僅剩非 flag 用途（安全網 fallback，by-design）。

## 2. 「以後怎麼寫才乾淨」——新程式碼擺放規則速查表

| 你要新增… | 放哪裡／怎麼寫 | 不要做 |
|---|---|---|
| 資料存取函式 | 開（或加入）`src/lib/db-<domain>.mjs/.ts` 領域檔；同步 in-memory fallback＋契約測試（harness/07 §3） | ❌ 塞進 `db.mjs`（CI guard 會擋） |
| API endpoint | `app/api/v2/**`；handler 保持薄（驗證→授權→呼叫 lib→回應），商業邏輯放 `src/lib` | ❌ 在 handler 內寫編排邏輯、自建 Supabase client |
| Supabase client | 一律 `src/lib/supabase/server.ts`／`client.ts` | ❌ 直接 `import @supabase/supabase-js`（ratchet 會擋增量） |
| env 讀取 | 經 `src/config/*`（`env.ts`／`security-env.mjs`／`feature-flags.mjs`） | ❌ 散讀 `process.env`（ratchet 會擋增量） |
| React 元件 | `src/components/<domain>/`；page.tsx 超過約 300 行就拆子元件 | ❌ 把狀態機、表單、資料邏輯全堆在 page.tsx |
| lib 模組 | 新領域開子資料夾（仿 `availability-v2/`）；優先 `.ts` | ❌ 再往 `src/lib` 頂層堆散檔（ratchet 會擋增量）；❌ 無故用 `.mjs`（只有 edge middleware import 或免編譯執行才用） |
| 錯誤回應 | 待 §4 P2 共用 helper 落地後一律採用；現階段至少沿用同 route 群的既有 envelope | ❌ 再發明新的錯誤 JSON 形狀 |

## 3. Ratchet 守門機制（本輪新增）

`apps/web/tests/unit/architecture-ratchet-guard.test.mjs` 鎖住 2026-07-04 現值、只能降不能升：

1. **巨型檔案**：現有 9 個 >800 行檔案逐檔鎖現值（`db.mjs` 由既有 `db-mjs-size-guard` 單管）；其他任何檔案不得超過 800 行。
2. **`app/api` 直接 import `@supabase/*`**：≤ 20 檔。
3. **直讀 `process.env`**（`src/config`／`test-support`／`fixtures` 之外）：≤ 159 檔。
4. **`src/lib` 頂層檔案數**：≤ 156。

每完成一批清理，把對應天花板下修鎖住成果；只有 P0 修復可調高且須在 PR 說明（與 `db-mjs-size-guard` 同協議）。

## 4. 分批改善路線圖（已開票追蹤：P1=#1613、P2=#1614、P3=#1615、P4=#1616、P5=#1617）

- **P1｜繼續 strangler `db.mjs`**（#1613）：每次挑一個領域整塊搬到 `db-<domain>`，搬完下修 `db-mjs-size-guard` 天花板。先抽 `supabase-env.mjs`（`hasSupabaseEnv`／`getSupabase`）解掉 `db.mjs ⇄ db-kpi.mjs` 循環 import，讓之後每個領域檔都不必回頭依賴單體。
- **P2｜共用 API 回應 helper＋驗證層**（#1614；輸入驗證另見 #1600、catch 錯誤處理另見 #1598）：`jsonOk`/`jsonError`（回傳 `NextResponse`）＋輸入驗證 helper；**只強制新 v2 route 採用**，舊 route 隨改隨換，逐步消化 216 處手刻回應。
- **P3｜拆 4 個 1,200 行級 god-page**（#1615）：admin activities edit／plans、admin 與 guide 的 availability（後兩者疑似近重複，優先抽共用元件）；拆完逐檔下修 ratchet 天花板。
- **P4｜env 集中回 `src/config`**（#1616）：以 ratchet 驅動，改到哪收斂到哪，目標把 159 檔降到個位數。
- **P5｜倉庫清理（需 owner 決定）**（#1617）：`packages/` 空殼 workspaces 宣告、根目錄歷史報告檔、巢狀 `tour-platform/supabase` 目錄的去留；CLAUDE.md 架構描述同步修正（鐵律 9，需 owner 授權）。

## 5. 本輪產出

| 項目 | 位置 |
|---|---|
| 本報告 | `docs/04-tech/04-tech-architecture/15-architecture-modularity-review.md` |
| Ratchet 守門測試（4 項天花板） | `apps/web/tests/unit/architecture-ratchet-guard.test.mjs` |
| 踩坑教訓追加 | `.cursor/harness/lessons.md` |
