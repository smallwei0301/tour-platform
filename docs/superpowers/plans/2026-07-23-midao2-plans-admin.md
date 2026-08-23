# midao2 Plan 3：方案輕量入接案頁＋行程單一來源＋管理員打通

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。Steps use checkbox syntax。

**Goal:** ①旅客需求單可選方案（名稱/價格/時長，快照入單）；②接案頁起價自動取啟用方案最低價；③管理員可 impersonate 進入導遊 midao2（含橫幅退出）；④管理員後台新增跨導遊 midao2 需求單唯讀視圖。

**Owner 需求原文對照**：管理員後台編輯的行程同步 midao2（✅既有雙軌設計已滿足——同一張 `activities` 表＋「NULL 跟隨主站」規則，本計畫以測試鎖定該行為）；導遊自建行程保留＋一鍵串管理後台（✅既有「發佈到祕島」送審）；管理員進每個導遊 midao2 編輯新增（T4）；midao2 成交訂單進管理後台（T5，唯讀）。

## Global Constraints（沿用 Plan 1/2 全部規則，另加）

- 分支 `claude/superpowers-midao-backend-x90czx` 續作；不 merge。
- commit 前 `.claude/hooks/run-checks.sh <tests>`；add/commit 分開呼叫；yarn.lock 不入列；凍結區零接觸（middleware.ts 不動——v2 admin API 的 auth 本來就由 middleware matcher `/api/v2/admin/:path*` 統一把關，新路由**不需**寫 auth 碼，比照 `app/api/v2/admin/guides/[guideId]/activity-plans/route.ts` 前例）。
- 「active 方案」語意比照 `db.mjs:2775`：`status` 為 null/undefined/'active' 視為啟用；archived/inactive 排除。
- 方案選項形（跨任務契約）：`planOptions: Array<{planId, name, basePrice, priceType: 'per_person'|'per_group', durationMinutes: number|null}>`。
- 起價規則：`priceFromTwd = min(active plans 的 basePrice>0) ?? activities.price_twd`（inline 前例 `guides/[slug]/shop/book/page.tsx:525`）。
- migration 只增不改；**套用生產需使用者屆時重新授權 SQL-OVERRIDE**（本計畫只落檔＋contract 測試＋rollback 伴檔，T6 結尾提示使用者）。

---

### Task 1: Migration C——`midao_requests` 加方案欄位

**Files:** Create `supabase/migrations/20260723090000_midao2_request_plan_columns.sql`＋同名 `.rollback.sql`；Modify `apps/web/tests/unit/midao2-migration-contract.test.mjs`（追加 1 test）。

```sql
-- 20260723090000_midao2_request_plan_columns.sql
-- Plan 3：需求單記錄旅客所選方案（輕量：id＋名稱快照）。只增不改。
ALTER TABLE midao_requests ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES activity_plans(id) ON DELETE SET NULL;
ALTER TABLE midao_requests ADD COLUMN IF NOT EXISTS plan_title_snapshot text;
```
rollback：兩個 `DROP COLUMN IF EXISTS`。契約測試斷言檔名＋兩個 ADD COLUMN＋FK。
Steps：SQL→test 追加→`node --test` 綠→run-checks→add→commit `feat(midao2): migration C — 需求單方案欄位`。

### Task 2: Domain 層——方案選項/起價/需求單快照（TDD）

**Files:** Modify `apps/web/src/lib/midao/db-midao-showcase.mjs`、`db-midao-requests.mjs`、`midao-copy-templates.mjs`＋各自測試檔。

**db-midao-showcase.mjs**：
- 新 seam：`__seedMemMidaoPlans(rows)`（`{id, activity_id, name, base_price, price_type, duration_minutes, status}`）＋reset 併入 `__resetMemMidaoShowcase`。
- 新內部：`fetchPlansByActivityIds(ids)`——Supabase：`from('activity_plans').select('id, activity_id, name, base_price, price_type, duration_minutes, status').in('activity_id', ids).neq('status','archived')`；in-memory 同濾。active 判定：`!p.status || p.status === 'active'`。
- `serviceShape` 擴充（多吃一個 `plans` 參數）：加 `planOptions`（active plans 映射）＋`priceFromTwd`（起價規則）。`listMidaoServicesDb` 與 `getPublicMidaoPageDb` 都先抓 plans 再組形。
- 測試：seed 兩方案（4800/3200 active＋9999 archived）→ `priceFromTwd===3200`、`planOptions.length===2`；無方案→fallback `price_twd`。

**db-midao-requests.mjs**：
- `normalizeRequestInput` 接受 `planId`（uuid 字串或空）→ `value.plan_id`；`planTitle` ≤80 → `value.plan_title_snapshot`（**歸屬驗證在 route 層**，domain 只存）。
- `shape()` 加 `planId`/`planTitle`；`SELECT_COLS` 加兩欄。
- 測試：帶 plan 建單→讀回 planTitle。

**midao-copy-templates.mjs**：`buildRequestSummaryText`/`buildLineReplyText` 服務行帶方案：有 `planTitle` 時 `服務：{activityTitle}（{planTitle}）`。測試斷言含括號方案名。

Commit：`feat(midao2): 方案選項/起價/需求單方案快照（domain）`。

### Task 3: 前後端串接——公開表單選方案＋起價顯示

**Files:** Modify `app/api/v2/public/midao/guides/[slug]/requests/route.ts`、`app/(non-locale)/g/[slug]/RequestForm.tsx`、`app/(non-locale)/g/[slug]/page.tsx`、`midao2/services/page.tsx`、`midao2/requests/[id]/page.tsx`＋`tests/api/v2-midao-public-contract.test.mjs`、`midao2-pages-contract.test.mjs` 追加斷言。

- **public requests route**：body 多收 `planId`；驗證：若給 planId，必須 ∈ 該 service 的 `planOptions`（`page.services` 已含），否則 400 `INVALID_PLAN`；通過後把 `planTitle` 塞給 normalize 前的 body（`planTitle: matched.name`），create 帶入。
- **RequestForm**：選定服務若 `planOptions.length>0` → 「選擇方案」radio 膠囊列（`{name}・NT${basePrice.toLocaleString()}{priceType==='per_group'?'／每團':'／每人'}{durationMinutes?`・約${...}小時`:''}`；testid `g-plan-{planId}`）；未選可送（optional）；送出帶 planId。服務卡價格改顯示 `priceFromTwd`。
- **公開頁/服務列表卡**：價格顯示改 `priceFromTwd`（欄位名沿用 priceTwd 的位置替換）。
- **需求詳情**：行程需求卡「服務」列有 planTitle 時顯示 `{activityTitle}（{planTitle}）`。
- 測試斷言：route 有 `INVALID_PLAN`；RequestForm 有 `g-plan-`；detail 有 planTitle。

Commit：`feat(midao2): 旅客選方案（表單/驗證/顯示）＋起價自動化`。

### Task 4: 管理員 impersonate 進 midao2＋橫幅

**Files:** Modify `app/(non-locale)/admin/guides/[guideId]/page.tsx`、`app/(non-locale)/midao2/layout.tsx`＋`midao2-layout-contract.test.mjs` 追加。

- **admin 導遊詳情頁**：在既有「🚪 進入導遊後台」旁加 `Btn`「進入 midao2 後台」（testid `admin-enter-midao2`）：同一支 impersonate POST（`/api/v2/admin/guides/{id}/impersonate`＋csrfHeaders＋`json.success` 檢查），成功後 `window.location.href = '/midao2'`。顯示條件同 `canImpersonate`。
- **midao2/layout.tsx**：掛載時讀 `guide_impersonation` cookie（比照 `guide/layout.tsx:23-29` 的 `hasImpersonationCookie` 寫法，勿 import 對方檔案、自帶小 helper）；為 true 時在內容頂端渲染紫色橫幅（testid `midao2-impersonation-banner`）：「目前以導遊身分代入操作」＋「結束代入」按鈕→ DELETE `/api/guide/auth/session`（csrfHeaders）→ 清 `guide_impersonation` cookie（Max-Age=0）→ `window.location.href='/admin/guides'`。
- 測試斷言：layout 有 `guide_impersonation`＋`midao2-impersonation-banner`；admin 頁有 `admin-enter-midao2`。

Commit：`feat(midao2): 管理員一鍵代入 midao2＋代入橫幅`。

### Task 5: 管理員跨導遊需求單視圖（唯讀）

**Files:** Modify `src/lib/midao/db-midao-requests.mjs`（＋測試）；Create `app/api/v2/admin/midao/requests/route.ts`、`app/(non-locale)/admin/midao-requests/page.tsx`；Modify `src/components/admin/AdminShell.tsx`（nav 陣列加一項）；Create `tests/api/v2-midao-admin-contract.test.mjs`。

- **domain**：`listAllMidaoRequestsDb({status='all', limit=100})`——跨導遊（無 guide 過濾，僅供 admin route）；Supabase 用 nested select `guide_profiles(display_name)` 帶導遊名（in-memory 以 guide_id 當名）；status 篩選同 TAB_FILTERS；回 `{items:[{...shape, guideName}]}`，依 created_at desc。測試：兩導遊各一單→all 回 2 筆＋guideName 存在。
- **route** `GET /api/v2/admin/midao/requests?status=`：**不寫 auth 碼**（middleware matcher `/api/v2/admin/:path*` 統一把關，比照 `v2/admin/guides/[guideId]/activity-plans` 前例）；驗 status 白名單→jsonOk({items})＋handleRouteError。
- **admin page** `/admin/midao-requests`：'use client'；用 `src/components/admin/ui` 的 `PageHeader/Card/StatusBadge/Select/EmptyState`（比照 admin/guides 頁模式，fetch `cache:'no-store'`、讀 `{success,data}` envelope）；狀態下拉（全部/新需求/待回覆/已回覆/已完成，預設全部）；卡片列：`#requestNo`＋旅客名＋導遊名＋服務（含方案）＋日期人數＋狀態章。唯讀。
- **AdminShell nav**（`AdminShell.tsx:11-28` 陣列末尾）：`{ href: '/admin/midao-requests', label: 'midao2 需求單', icon: '📨' }`。
- 測試：contract 斷言 route 無 verifyGuideSession（admin 走 middleware）、有 status 白名單；page 斷言 API 路徑＋nav label。

Commit：`feat(midao2): 管理員跨導遊需求單視圖`。

### Task 6: 全面驗證＋worklog＋push

1. `run-checks.sh --typecheck` 全部 midao 測試檔（Plan 1/2/3 全套）＋守門測試＋lint。
2. E2E `midao2-backend-flow.spec.ts` 重跑確認未破（mock 未含 planOptions——若 UI 因 undefined 崩潰，修 UI 的防禦而非 mock）。
3. worklog：Plan 3 段（行程單一來源行為驗證說明＋唯讀視圖假設）＋部署驗收清單追加：⑦選方案送單、⑧管理員代入 midao2、⑨管理員需求單視圖；**提示：migration C 待使用者 SQL-OVERRIDE 授權後套用生產**。
4. push。

## 完成定義

- [ ] 方案選項在公開表單可選且入單快照；起價＝方案最低價
- [ ] 管理員可一鍵進入任一導遊 midao2 並安全退出
- [ ] `/admin/midao-requests` 唯讀視圖上線（middleware 統一 auth）
- [ ] 全部測試綠；凍結區零接觸；migration C 已入 repo（生產套用另候授權）
