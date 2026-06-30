# PR #1529 開放季節「全年開放」切換 — 驗收報告

- **判定：PASS（自動化真實瀏覽器 smoke 全綠）／ 部署環境已驗證項目 NOT_PROD_EXECUTED（operator-gated）**
- **功能**：管理者後台 方案管理 → 開放季節 面板新增「全年開放」切換選項
- **PR**：[#1529](https://github.com/smallwei0301/tour-platform/pull/1529)（已 squash-merge）
- **Merge commit（main）**：`b36fbec`（`feat(admin): 開放季節新增「全年開放」切換選項 (#1529)`）
- **Branch / head commit**：`claude/year-round-open-season-6s93sz` @ `d307f6d`
- **驗收時間**：2026-06-30 22:20（Asia/Taipei）
- **正式環境**：https://tour-platform.vercel.app （首頁 read-only 探測 HTTP 200）
- **本機驗證環境**：`next dev` @ `127.0.0.1:3333`（in-memory fallback）+ 真實 Chromium（Playwright）

---

## 一、背景與變更摘要

截圖回報的警告「『全年開放』資料持久化仍在另一個資料契約切片處理中」其實是**過時文案** —
後端早已支援全年開放旗標：

- `activity_plans.is_year_round` 欄位（migration `20260605_issue1067_activity_plans_is_year_round.sql`）
- `PUT /api/v2/admin/activities/[activityId]/plans/[planId]` 已驗證並寫入 `is_year_round`
- guide 端 `/guide/activities/[id]/plans/[planId]/seasons` 早有「全年供應」切換

唯獨**管理者後台缺一個入口**。本 PR 在 admin 開放季節面板補上「全年開放」switch，
開啟即透過既有 plan PUT 路由寫入 `is_year_round`，並重新載入方案反映狀態；
同時移除誤導性的舊警告文案。純前端、零 migration、不改後端契約。

---

## 二、Acceptance Criteria 逐條證據

| # | 驗收項目 | 證據 | 判定 |
|---|---------|------|------|
| AC1 | admin 開放季節面板出現「全年開放」切換 | 真實瀏覽器載入 `/admin/activities/{id}/plans` → 開放季節，switch（`role="switch" aria-label="全年開放"`）可見 | ✅ PASS |
| AC2 | 開啟切換會以 `{ is_year_round: true }` 呼叫既有 plan PUT 路由 | E2E 攔截並斷言 `PUT .../plans/{planId}` request body 等於 `[{ is_year_round: true }]` | ✅ PASS |
| AC3 | 開啟後 UI 反映全年開放狀態 | `aria-checked` 由 `false`→`true`；顯示綠色「已設定全年開放」說明、停用「新增季節」按鈕、通知「已設定為全年開放。」（見截圖 `yearround-on`） | ✅ PASS |
| AC4 | 未開啟且無啟用季節時顯示正確引導、且不再出現舊文案 | 顯示「請先設定指定季節或開啟全年開放」；全域搜尋確認「資料持久化仍在另一個資料契約切片處理中」字串已不存在於 source | ✅ PASS |
| AC5 | 既有開放季節管理（檢視／新增／停用季節）未回歸 | `issue1067-admin-plan-season-editor-ui.spec.ts` 既有 4 案全綠 | ✅ PASS |
| AC6 | is_year_round 於部署環境（preview／正式）實機持久化並反映旅客端供應 | 需 operator-only secret 且會寫入正式營運資料 | ⛔ NOT_PROD_EXECUTED（見第四節） |

---

## 三、實際執行的測試與結果（綠燈證據）

於本機（fresh container，2026-06-30）重跑：

1. **真實瀏覽器 Playwright E2E**（真 Chromium，非 headless-shell；`PW_EXECUTABLE_PATH=/opt/pw-browsers/chromium`）
   - `e2e/issue1067-admin-plan-season-editor-ui.spec.ts`：**5 passed**
     - 含本 PR 新增案「admin can enable 全年開放 for a plan, persisting is_year_round via the plan PUT route」
   - 螢幕截圖 smoke（OFF→ON 兩態）：**1 passed**，產出 `yearround-off.png`／`yearround-on.png`
   - 合計 **6 passed**
2. **Node 全測**：`npm test` → **3980 pass / 0 fail**（merge 前於同分支執行）
3. **typecheck**：`tsc --noEmit` 通過
4. **lint**：ESLint 無錯誤（Node 22）
5. **production build**：`next build`（注入 production secrets）exit 0
6. **CI（PR #1529）**：`test` ✅ / `smoke` ✅ / `scan` ✅ / `Vercel Preview` ✅ — 全綠後合併

> 註：本 PR 新增 E2E 採 `page.route()` 攔截後端。原因見第四節 —
> 管理者 plans／seasons API 走 `getSupabase()`（`src/lib/db.mjs`），
> **無 in-memory fallback**，本機無真實 service-role 連線時無法跑真後端，
> 故前端互動以真瀏覽器驗證、後端持久化以契約（request payload + 既有 PUT 路由原始碼）佐證。

---

## 四、NOT_PROD_EXECUTED 項目與 blocker（AC6）

部署環境（preview／正式）之「真實登入後切換並確認 DB 持久化」**未由本次自動化執行**，原因：

1. **operator-only secret — `ADMIN_ACCESS_TOKEN`**：管理者後台登入需此密鑰，本環境不具備且不應持有。
2. **後端無離線路徑**：`getSupabase()`（`apps/web/src/lib/db.mjs:61`）硬性要求 `SUPABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY`（service-role，亦屬 operator-only）。即使在本機跑真後端，
   也需 prod 等級密鑰並指向真實資料庫。
3. **會動到正式營運資料**：切換「全年開放」會將 `is_year_round` 寫入真實方案，屬 hard-to-reverse 變更。

依專案 QA 準則（需 operator-only secret／會動到正式營運資料才標 `NOT_VERIFIED-live`／`NOT_PROD_EXECUTED`），
此項交由 operator 在受控視窗執行。

### 替代證據（已具備）
- 真瀏覽器互動（OFF→ON）+ PUT payload 斷言（第三節）。
- 後端能力既存且非本 PR 新增：`is_year_round` 欄位 migration、plan PUT 路由驗證＋寫入、guide 端同旗標已上線。
- 正式環境首頁 read-only 探測 HTTP 200（部署存活）。

### Operator 後續步驟（建議）
1. 於 preview 部署，用 operator `ADMIN_ACCESS_TOKEN` 登入後台。
2. 挑一個**測試用方案**，進 方案管理 → 開放季節，開啟「全年開放」。
3. 重新整理頁面，確認 switch 維持 ON、顯示「已設定全年開放」（代表 `is_year_round` 已持久化）。
4. 到旅客端該方案行程頁，確認其供應不再受指定季節窗限制（全年可預約）。
5. 關閉切換，確認回到指定季節判定。
6. 全程使用測試方案，避免改動正式販售中的方案資料。

---

## 五、合規性

本報告未含密鑰／cookie／token／service-role key／完整付款 payload／未遮蔽 PII。
截圖為本機 in-memory 測試資料（非真實旅客／訂單）。
