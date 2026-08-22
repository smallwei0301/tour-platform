# midao2 Plan 4：直接預約（instant booking）

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。Spec：`docs/superpowers/specs/2026-07-27-midao2-instant-booking-design.md`（先讀完 spec 再動工）。

**Goal:** instant_booking 服務與行事曆單位結合——旅客選開放時段送單即 `confirmed` 並原子消耗單位；撞單自動降級一般需求單；取消自動釋放；導遊可再開單位收第二筆。**硬規則：只有 confirmed 的 instant 單消耗單位，待確認單一律不佔時段。**

## Global Constraints（沿用 Plan 1–3 全部規則，另加）

- 分支 `claude/superpowers-midao-backend-x90czx` 續作；不 merge。
- Migration D 生產套用已獲 owner SQL-OVERRIDE 授權（2026-07-27）；仍須落檔＋CI 綠後由 controller 執行 apply＋ledger。
- 狀態機硬規則：guide PATCH 禁止轉入 `confirmed`（僅系統建立時寫入）；`cancelled` 僅可由 `confirmed` 轉入；`confirmed` 僅可轉 `closed_done`／`cancelled`。
- weekday／時區慣例不變（0=Sun、Asia/Taipei 固定 +08:00、taipeiDateOf）。
- 新資料存取一律 `src/lib/midao/`（strangler；db.mjs 零接觸）。

---

### Task 1: Migration D——狀態機擴充＋消耗帳表

**Files:** Create `supabase/migrations/20260727120000_midao2_instant_booking.sql`＋同名 `.rollback.sql`；Modify `apps/web/tests/unit/midao2-migration-contract.test.mjs`（追加 1 test）。

SQL 內容照 spec §2（status/preferred_period CHECK DROP+ADD、`kind` 欄、`midao_slot_consumptions` 表＋`uq_midao_slot_active` partial unique index＋request 索引＋RLS 比照 midao_requests）。rollback：還原兩 CHECK 至原值集、DROP COLUMN kind、DROP TABLE。契約測試斷言：檔名時間戳、7 值 status CHECK、full_day、kind、CREATE TABLE midao_slot_consumptions、`WHERE released_at IS NULL` unique index。
Commit：`feat(midao2): migration D — instant booking 狀態機與消耗帳`。

### Task 2: Domain——db-midao-instant.mjs＋狀態機擴充（TDD）

**Files:** Create `apps/web/src/lib/midao/db-midao-instant.mjs`＋`apps/web/tests/unit/db-midao-instant.test.mjs`；Modify `db-midao-requests.mjs`、`midao-copy-templates.mjs`＋各自測試。

- **db-midao-instant.mjs**（in-memory seam `__resetMemMidaoInstant`／`__seedMemConsumptions`）：
  - `consumeSlotsDb(guideId, requestId, date, periods[])` → `{ok:true}`|`{ok:false, code:'SLOT_TAKEN'}`。Supabase：單一 `.insert(rows)`，error.code==='23505' → SLOT_TAKEN，其他 error throw；in-memory：先檢查任一 (guide,date,period) 已有 active 列→SLOT_TAKEN，否則整批 push（all-or-nothing）。periods 驗證 ∈ MIDAO_PERIODS。
  - `releaseSlotsByRequestDb(requestId)` → active 列標 `released_at`，回 `[{date, period, guideId}]`。
  - `releaseSlotByUnitDb(guideId, date, period)` → 同上單一單位。
  - `listActiveConsumptionsDb(guideId, month)` → `[{date, period, requestId}]`（行事曆標示用；不 join，requestNo 由 route 層合併——避免 nested select 複雜化）。
- **db-midao-requests.mjs**：STATUS 集合加 `confirmed`/`cancelled`；轉移矩陣照 Global Constraints 硬規則；`normalizeRequestInput` 收 `kind`（'request'|'instant'，預設 'request'）與 `preferredPeriod` 加 'full_day'；`SELECT_COLS`/`shape` 加 kind；TAB_FILTERS：`confirmed` 進處理中側、`cancelled` 進 closed 側（確認現有 tabs 結構後以最小侵入納入）；summary 加 `confirmedCount`。
- **midao-copy-templates.mjs**：`periodLabel('full_day')`→'全天'；instant 單摘要標頭「【已確認預約】」。
- 測試：consume 原子性（同單位第二次→SLOT_TAKEN；3 periods all-or-nothing——先佔其一再全天消耗必須整批失敗）；release by request/unit；狀態機新矩陣（PATCH 禁入 confirmed、cancelled 僅由 confirmed、confirmed→closed_done/cancelled、既有轉移不變）。

Commit：`feat(midao2): instant booking domain——消耗帳＋狀態機擴充`。

### Task 3: 公開 route——instant 送單即確認＋撞單降級

**Files:** Modify `app/api/v2/public/midao/guides/[slug]/requests/route.ts`、`src/lib/midao/midao-request-notify.mjs`＋`tests/api/v2-midao-public-contract.test.mjs`。

- service.dealMode==='instant_booking' 分支：必填 preferredDate＋preferredPeriod∈{morning,afternoon,evening,full_day}；`getMonthEffectiveDb` 驗該日時段開放（full_day＝三段全開），否則 400 `SLOT_UNAVAILABLE`；backupDate 忽略清空。
- 流程：create request（status:'confirmed', kind:'instant'）→ `consumeSlotsDb`（full_day→三 periods）→ ok：`setDayOverrideDb` 關閉對應時段、回 `outcome:'confirmed'`；SLOT_TAKEN：update request 為 status:'new', kind:'request'、回 `outcome:'converted_to_request'`（**降級單不消耗任何時段——owner 決策⑤**）。非 instant 服務照舊（回 `outcome:'request_submitted'` 以統一 envelope，前端相容處理）。
- notify：confirmed →「🎉 新預約已確認」模板（日期＋periodLabel＋服務＋旅客名）；converted/一般→既有新需求模板。fire-and-forget 不變。
- 測試：instant 缺時段 400；時段未開 400 SLOT_UNAVAILABLE；full_day 三段未全開 400；成功 outcome='confirmed' 且時段被關；mock 佔用後送單 outcome='converted_to_request' 且單 status='new' 且**零消耗列**；一般服務不受影響。

Commit：`feat(midao2): 公開送單 instant 即確認＋撞單自動降級`。

### Task 4: 導遊端 API——取消/完成/再開單位/行事曆標示

**Files:** Modify `app/api/v2/guide/midao/requests/[requestId]/route.ts`、`app/api/v2/guide/midao/calendar/route.ts`；Create `app/api/v2/guide/midao/calendar/reopen/route.ts`；Modify `tests/api/v2-midao-guide-requests-contract.test.mjs`、`v2-midao-guide-calendar-contract.test.mjs`。

- PATCH requests：新轉移交 domain 驗證；轉 `cancelled` 成功後 `releaseSlotsByRequestDb` → 對每個釋出的 (date,period) `setDayOverrideDb` 開回 `is_open=true`（owner 決策③自動恢復）。
- reopen route：POST `{date, period}`（驗格式＋period 白名單）→ `releaseSlotByUnitDb`＋`setDayOverrideDb` 開回該時段 → jsonOk({reopened:true})。verifyGuideSession 比照同層 routes。
- calendar route：月視圖每日加 `bookedPeriods: string[]`（`listActiveConsumptionsDb`）；日詳情把 active 消耗對應的 request（requestNo/travelerName/status）列入 `instantBookings[]`。
- 測試：cancel 釋放＋時段恢復；reopen 契約；calendar 帶 bookedPeriods。

Commit：`feat(midao2): 導遊端取消/再開單位/行事曆已預約標示`。

### Task 5: 旅客表單——instant 選日選時段＋全天鈕＋結果分流

**Files:** Modify `app/(non-locale)/g/[slug]/RequestForm.tsx`、`app/(non-locale)/g/[slug]/page.tsx`（若需傳 slug 給 availability fetch）＋`tests/api/midao2-pages-contract.test.mjs` 追加。

- instant 服務選中時：日期改「可預約日」選擇（fetch 公開 availability `?month=`，只可選有開放時段的日；月份可前後切換，過去日不可選）；時段膠囊 上午/下午/晚上（未開 disabled，testid `g-period-{period}`）＋「全天」鈕（三段全開才顯示，testid `g-period-full_day`，選中＝preferredPeriod='full_day'）；隱藏備用日期與時間起迄欄。
- 送出 payload 帶 preferredPeriod；依回應 `outcome` 分流成功畫面：confirmed→「✅ 預約成功！行程已確認」（文案強調不需等回覆）；converted_to_request→「此時段剛被預約，已改為需求單送出，導遊會盡快與你確認」；一般→既有文案。
- 非 instant 服務表單零改動。
- 測試斷言：`g-period-full_day`、`SLOT_UNAVAILABLE` 文案 key、outcome 分流字串。

Commit：`feat(midao2): 旅客 instant 表單——時段選擇/全天/結果分流`。

### Task 6: 導遊 UI——行事曆三態/再開＋需求單確認態＋摘要卡＋admin 補狀態

**Files:** Modify `app/(non-locale)/midao2/calendar/**`、`midao2/requests/page.tsx`、`midao2/requests/[id]/page.tsx`、`midao2/page.tsx`、`midao2/ui.tsx`（STATUS_META 加二態）、`app/(non-locale)/admin/midao-requests/page.tsx`＋相關契約測試追加。

- ui.tsx STATUS_META：`confirmed`（藍底白字「已確認」）、`cancelled`（灰底「已取消」）。
- 行事曆：時段格三態（開放／已預約 bookedPeriods／關閉）；已預約格點開日詳情顯示 instantBookings（連 `/midao2/requests/[id]`）＋「再開放此時段」鈕（testid `midao2-reopen-slot`，打 reopen API 後 refetch）。
- 需求列表/詳情：confirmed 單狀態章；詳情對 confirmed 顯示「行程結束」（→closed_done）＋「取消預約」（二次確認 dialog，說明時段將自動恢復開放；testid `midao2-status-cancelled`）；隱藏既有三顆 radio 於 confirmed/cancelled 單；load 時 status==='new' 自動轉 pending_reply 邏輯對 instant 單跳過。
- 首頁：摘要卡加「已確認預約」（summary.confirmedCount）。
- admin 需求單頁：狀態下拉與狀態章補 confirmed/cancelled（白名單同步 route——route 白名單也要加，注意 Task 4/此處與 `v2-midao-admin-contract.test.mjs` 同步）。

Commit：`feat(midao2): 導遊/管理 UI——已確認預約全鏈`。

### Task 7: 全面驗證＋E2E＋worklog＋push

1. run-checks --typecheck 全 midao 測試檔＋守門測試＋lint。
2. E2E：`midao2-backend-flow.spec.ts` 重跑（mock 補 bookedPeriods 等新欄位——防禦優先於改 mock 的原則不變）；新增或擴充 instant 流 E2E（mock route 層即可：選日→選時段→送出→已確認畫面）。
3. worklog：Plan 4 段＋部署驗收清單追加⑭instant 送單即確認＋時段消耗、⑮撞單降級（雙瀏覽器實測）、⑯取消自動恢復、⑰再開單位收第二筆；記 owner 決策⑤。
4. push。（Migration D 生產套用由 controller 在 T1 CI 綠後即先行執行，此處確認 ledger 已入。）

## 完成定義

- [ ] instant 送單即 confirmed＋原子消耗；待確認單零消耗（決策⑤測試鎖定）
- [ ] 撞單降級、取消自動釋放、再開單位收第二筆全鏈可用
- [ ] 狀態機硬規則測試鎖定；既有五狀態行為零回歸
- [ ] Migration D 已套用生產＋ledger verified；全測試綠；凍結區零接觸
