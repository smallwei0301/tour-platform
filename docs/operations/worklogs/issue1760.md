# issue1760 — Package 5 Slice 2a availability resolver policy/day-override projection
> 最後更新：2026-08-14 15:21:07 CST（Asia/Taipei）｜負責 session：tp-builder-api

## 目標
在既有 `effective-availability-resolver.ts` 建立純 in-memory policy/day-override rule selector，並在 `slot-generator.ts` 保留未啟用時完全沿用既有規則選取的 opt-in `ruleSelector` seam；不變更 route、DB query、HTTP contract、migration 或 scheduled fixed-session 隔離。

## 範圍與基線
- GitHub issue：#1760
- Worktree：`/root/.openclaw/workspace/worktrees/tour-platform/issue-1760-p5-slice2a-resolver-policy-parity`
- Branch：`feat/issue-1760-p5-slice2a-resolver-policy-parity`
- Immutable base／起始 HEAD：`0f8776b4cf4a0da3fea6b1ec29387337690cc2d9`
- 起始 worktree：clean；目前尚有本 slice 的未 commit allowlist 變更，禁止視為已完成或可 merge。
- Slice 1 preflight：`20260814130000_issue1760_availability_scope_contract.sql` 與 `20260814130100_issue1760_atomic_day_availability.sql` 均存在；最新 forward migration 為後者。本 slice 沒有 schema、RPC、RLS 或 migration 變更。

## Allowlist
僅允許以下四檔：
1. `apps/web/src/lib/availability-v2/effective-availability-resolver.ts`
2. `apps/web/src/lib/slot-generator.ts`
3. `apps/web/tests/api/issue1760-effective-availability-policy-resolver.test.mjs`
4. `docs/operations/worklogs/issue1760.md`

## 已完成的 TDD tracer slice
- RED：先新增 `issue1760-effective-availability-policy-resolver.test.mjs`，直接 import 尚不存在的 `createCanonicalAvailabilityRuleSelector`；執行 hook 後如預期因 resolver 未 export 該 symbol 失敗（exit 1）。
- GREEN：新增 `AvailabilityPolicy`、`GuideAvailabilityDayRevision`、`CanonicalAvailabilityRuleContext`、`createCanonicalAvailabilityRuleSelector()`。
  - `closed` 永遠空集合。
  - day revision 精確以 guide/local date/timezone 比對；closed tombstone 回空集合，open revision 只回 active global exact-date ranges。
  - 無 day revision 時，`restrict` 僅回 matching plan rules，`inherit` 回 global 加 matching plan rules。
  - `resolveCanonicalAvailabilityState()` 只在可選 `ruleContext` 存在時用 selector 的當日結果判定 `outside_rule`；沒有 context 時仍使用原 `params.rules`。
- GREEN：`SlotGeneratorDeps` 新增 optional `ruleSelector`，per-date loop 僅在 selector 被提供時採用該日 rules；未提供時仍使用原本 `getAvailabilityRules()` 結果。沒有既有 caller 被遷移或啟用。
- Tests 覆蓋 inherit/restrict/closed、open/closed day revision、timezone mismatch、沒有 revision 時 exact date 的既有行為、resolver no-context state parity，以及 multi-day generator recurring/tombstone/exact-day opt-in。

## 實跑證據

### RED
```bash
./.claude/hooks/run-checks.sh apps/web/tests/api/issue1760-effective-availability-policy-resolver.test.mjs
```
結果：exit `1`；`SyntaxError: ... does not provide an export named 'createCanonicalAvailabilityRuleSelector'`。

### GREEN focused tests
```bash
./.claude/hooks/run-checks.sh apps/web/tests/api/issue1760-effective-availability-policy-resolver.test.mjs apps/web/tests/api/issue1067-canonical-availability-resolver.test.mjs apps/web/tests/api/issue1196-cross-surface-precedence.test.mjs apps/web/tests/api/issue1289-preview-canonical-parity.test.mjs
```
結果：exit `0`；`31` tests passed、`0` failed。

### Typecheck baseline
```bash
./.claude/hooks/run-checks.sh --typecheck apps/web/tests/api/issue1760-effective-availability-policy-resolver.test.mjs apps/web/tests/api/issue1067-canonical-availability-resolver.test.mjs apps/web/tests/api/issue1196-cross-surface-precedence.test.mjs apps/web/tests/api/issue1289-preview-canonical-parity.test.mjs
```
結果：exit `1`；tests 仍為 `31` passed、`0` failed。Ava 已以 `npm ci --no-audit --no-fund` 補齊本 worktree 的依賴，並確認 `package-lock.json`、`package.json`、`apps/web/package.json` 雜湊不變。`tsc --noEmit` 僅重現既有基線缺件：`e2e/login-pixel-alignment.spec.ts` 缺 `pngjs`、`pixelmatch`，以及 `src/components/activity/ReviewPhotos.tsx` 缺 `@types/react-dom`；此結果已由 Ava 在 Slice 1 的乾淨 `e507a0a1` 基線獨立重現，不屬本 slice 變更。

## 目前狀態與下一步
- Ava 已授權把上述 typecheck 標記為環境既有基線問題，非本卡缺陷；本 slice 不得為此修改 dependency、lockfile 或非 allowlist 檔案。
- 將重跑 `git diff --check`，只提交 allowlist 四檔，綁定 immutable `base_sha..head_sha`，然後由 Ava 建立 Rita 的獨立審查卡。

## 風險與禁止事項
- 風險：中。此 slice 僅建立未啟用的 source-level seam；目前沒有 route 或 scheduled path 傳入 selector。typecheck 的三項缺件為既有基線，Rita 仍須對最終 immutable commit 獨立審查。
- 未修改 route、`booking-availability-evaluator.ts`、`effective-booking-availability.ts`、`scheduled-plan-slots.ts`、migration、DB/RPC/RLS、UI、config 或 generated files。
- 未執行 DB/production action、push、PR、merge 或 deployment。

## Handoff
- Status：focused test gate 31/31 通過；typecheck 的 3 項既有缺件已記錄，不是本 slice 變更造成。
- Next role：tp-builder-api 提交 allowlist-only immutable commit；其後由 Ava 建立 tp-reviewer/Rita 的獨立 review card。

## Slice 2b — traveler dynamic canonical selector（續作）
> 最後更新：2026-08-16 18:40:35 CST（Asia/Taipei）｜接手 worker：一次性本機續作

### 接手與 RED 證據
- Base／接手時 HEAD：`cb3958f48a61b651399d86c085408c2780813cb5`。
- Branch：`feat/issue-1760-p5-slice2b-traveler-dynamic-selector`。
- 前 worker 已先建立 focused 測試，透過既有 `node_modules` symlink 實際載入並得到有效 RED（測試本身成功收集，部分通過、部分失敗）；其後才修改 production code。前 worker timeout 前未留下改檔後 GREEN 證據，本節不沿用其未完成結論。

### 本次修復
- `booking-availability-evaluator.ts`：optional `ruleContext` 建立 canonical selector，並把 selector 傳入 slot generator；selected schedule 也以 selector 的當日結果驗證，不讓 raw rules 或 selected schedule 繞過 closed/tombstone。
- `slot-generator.ts`：selector 啟用時保留每個候選 slot 的來源 rule，以該 rule 的 buffer 做衝突判定；未提供 selector 的 legacy 路徑維持原 shared-buffer 行為。
- `route-handler.ts`：dynamic `instant`／`request` 讀取並驗證 `availability_policy`，以 guide/dateFrom/dateTo bounded query 讀取 day revisions，建立 context 傳入 evaluator；缺失或非法 policy fail closed；`scheduled` 不查 day revisions 且維持 fixed-schedule path。
- focused fixture：將 buffer-after 情境調整為 booking 結束後的候選時段，保留 global/plan inverse provenance 的 false-block／false-allow 覆蓋，對齊既有 `slotConflictsWithBooking` buffer contract。

### 實跑證據（均為本次接手後、同一 dirty tree）
```bash
./.claude/hooks/run-checks.sh apps/web/tests/api/issue1760-traveler-dynamic-selector-parity.test.mjs
```
結果：exit `0`；`9` tests、`9` passed、`0` failed、`0` skipped。

```bash
./.claude/hooks/run-checks.sh apps/web/tests/api/issue1760-traveler-dynamic-selector-parity.test.mjs apps/web/tests/api/issue1760-effective-availability-policy-resolver.test.mjs apps/web/tests/api/v2-available-slots.test.mjs apps/web/tests/api/issue1665-available-slots-rls-regression.test.mjs
```
結果：exit `0`；`45` tests、`45` passed、`0` failed、`0` skipped。

```bash
./.claude/hooks/run-checks.sh --typecheck apps/web/tests/api/issue1760-traveler-dynamic-selector-parity.test.mjs apps/web/tests/api/issue1760-effective-availability-policy-resolver.test.mjs apps/web/tests/api/v2-available-slots.test.mjs apps/web/tests/api/issue1665-available-slots-rls-regression.test.mjs
```
結果：exit `0`；先執行的 `45` tests 為 `45` passed、`0` failed，後續 `npm run typecheck`／`tsc --noEmit` exit `0`。

### Scope／副作用封存
- 允許檔最終僅五檔：上述三個 production 檔、`apps/web/tests/api/issue1760-traveler-dynamic-selector-parity.test.mjs`、本 worklog。
- 未修改 lockfile、migration、harness、#1825、P6、pilot、scheduled route、guide preview、calendar、payments/checkout 或 feature flag；既有依賴 symlink 僅供本機測試，未安裝或改寫依賴。
- 無 Kanban mutation、無 GitHub remote mutation、無 push／PR／merge／deploy、無 production DDL/DML、無 credential 操作。
- commit 前 final HEAD 將由本機 Git read-back；禁止推送，並以本節實跑證據作為 commit gate。

---

## Stage 2 — /midao2/calendar canonical availability convergence（Kanban t_eef2a09f，Anna / tp-builder-api）

- 日期：2026-08-21（Asia/Taipei）
- Worktree：`/root/.hermes/worktrees/tour-platform/build-1760-calendar-canonical`（linked，非 primary）
- Branch：`builder/issue-1760-calendar-canonical-90c324f7`
- base_sha：`90c324f75c2dc038050ab90733426dad1e7c60bc`
- Owner 不可變決議：U-1 段別固定 `morning=09:00-12:00`／`afternoon=13:00-17:00`／`evening=18:00-21:00`；U-2 採 W-2（週預設只是 UI 批次工具，不落第二套 durable 真相）。
- Owner APPROVE_A（卡片 comment #1351/#1352）：允許清單擴充旅客端公開接案頁 availability route、其舊模組單元測試，以及公開契約／parity 測試。

### 目標

把 `/midao2/calendar` 與其變更 API 收斂到既有 canonical effective availability（`guide_availability_rules` global ranges ＋ `guide_availability_day_revisions` ＋ `activity_plans.availability_policy`），並退役平行引擎，不新增第三套引擎、不做背景雙寫。

### 變更檔案

新增：
- `apps/web/src/lib/midao/midao-calendar-canonical.ts` — U-1 段別與 canonical 區間互轉的純函式與單日投影。
- `apps/web/src/lib/midao/db-midao-canonical-availability.mjs` — canonical 讀寫 gateway（月投影、單日 CAS、W-2 批次轉單日）；使用既有 `supabase-env.mjs` service-role seam，未經 `db.mjs`。
- `apps/web/tests/unit/issue1760-midao-segment-range-mapping.test.mjs`
- `apps/web/tests/api/issue1760-stage2-calendar-canonical-read.test.mjs`
- `apps/web/tests/api/issue1760-stage2-day-cas-mutation.test.mjs`
- `apps/web/tests/api/issue1760-stage2-cross-surface-parity.test.mjs`
- `apps/web/tests/api/issue1760-stage2-public-guide-availability-canonical.test.mjs`
- `apps/web/tests/api/issue1760-stage2-parallel-engine-retirement-guard.test.mjs`
- `apps/web/e2e/midao2-calendar-canonical.spec.ts`

修改：
- `apps/web/app/api/v2/guide/midao/calendar/route.ts` — GET 改讀 canonical 月投影，新增 `revision`／`isClosed`／`timezone`／`ranges`，保留 `items`／`hasPending`／`hasConfirmed`／requests 疊加／bookings 疊加與既有 bookings degrade。
- `apps/web/app/api/v2/guide/midao/availability/days/[date]/route.ts` — PUT 改為 canonical CAS：必填 `expectedRevision` 與 `Idempotency-Key`；`REVISION_CONFLICT` 對 409（帶 `currentRevision`），`DAY_TIMEZONE_MISMATCH`／`INVALID_RANGES`／`INVALID_IDEMPOTENCY`／`INVALID_ARGUMENT` 對 422，`GUIDE_NOT_FOUND` 對 404，`IDEMPOTENCY_KEY_REUSED` 對 409；CSRF 與 guide session 不放寬，guideId 一律取自 session。
- `apps/web/app/api/v2/guide/midao/availability/defaults/route.ts` — W-2 批次工具：GET 由 canonical 月投影推導初始勾選，POST 將「星期幾 乘 U-1 段別」展開成逐日 canonical CAS 寫入；無週預設 durable 表、無新 RPC 或 migration。
- `apps/web/app/(non-locale)/midao2/calendar/page.tsx` — day state 帶 revision，寫入送 canonical ranges 與 `Idempotency-Key`，409 時重新載入該月並顯示提示。
- `apps/web/app/(non-locale)/midao2/calendar/WeeklyDefaultsModal.tsx` — 改批次 POST（month 與 days[{date,expectedRevision}]），標籤帶 U-1 固定 HH:MM。
- `apps/web/app/api/v2/public/midao/guides/[slug]/availability/route.ts`（APPROVE_A）— 只替換可用性讀取來源為 canonical；URL、回應形狀、`openPeriods` 契約、公開資料邊界與 fail-closed 行為不變，無任何 mutation 或 auth 擴張。
- `apps/web/e2e/midao2-backend-flow.spec.ts` — 行事曆案例對齊 canonical CAS 契約。

刪除（退役）：
- `apps/web/src/lib/midao/db-midao-availability.mjs`
- `apps/web/tests/unit/db-midao-availability.test.mjs`（APPROVE_A 授權，改由退役 guard 取代）

### RED 到 GREEN 證據

RED（實跑捕獲，非事後補寫）：
- U-1 mapping：`ERR_MODULE_NOT_FOUND: midao-calendar-canonical.ts`，pass 0、fail 1。
- canonical read：9 tests，2 failed（calendar route 仍 import 平行引擎、缺 revision/isClosed/timezone）。
- day CAS：12 tests，3 failed（day route 未接 canonical、缺 expectedRevision 與 Idempotency-Key、defaults route 仍寫週預設）。
- 退役 guard：5 tests，3 failed（舊模組仍存在、仍有 import、app/src 仍有 midao 舊表參照）。

GREEN（同一 tree，實跑）：

```bash
node --test apps/web/tests/unit/issue1760-midao-segment-range-mapping.test.mjs \
  apps/web/tests/api/issue1760-stage2-calendar-canonical-read.test.mjs \
  apps/web/tests/api/issue1760-stage2-day-cas-mutation.test.mjs \
  apps/web/tests/api/issue1760-stage2-cross-surface-parity.test.mjs \
  apps/web/tests/api/issue1760-stage2-public-guide-availability-canonical.test.mjs \
  apps/web/tests/api/issue1760-stage2-parallel-engine-retirement-guard.test.mjs \
  apps/web/tests/api/midao2-pages-contract.test.mjs \
  apps/web/tests/unit/midao2-migration-contract.test.mjs \
  apps/web/tests/api/issue1760-availability-scope-day-cas.test.mjs \
  apps/web/tests/api/issue1760-effective-availability-policy-resolver.test.mjs
```

結果：`80` tests、`80` passed、`0` failed。

typecheck：`apps/web/node_modules/.bin/tsc --noEmit`（TypeScript 6.0.2）— 本次變更檔案零錯誤。剩餘錯誤全為 pre-existing 缺依賴或既有型別債（`next-intl`、`zod`、`qrcode.react`、`@line/liff`、`pngjs`、`pixelmatch` 未安裝，以及 blog/orders 既有 implicit any），與本次 diff 無交集。

### 退役守門

- `application_table_reference_guard`：`apps/web/app/**` 與 `apps/web/src/**` 內 `midao_availability_defaults`／`midao_day_overrides` 參照數為 0；只排除歷史 SQL（`supabase/migrations/**`，migration 只增不改）。
- `legacy_module_import_guard`：`apps/web/{app,src,tests,e2e}` 內對 `db-midao-availability.mjs` 的 import 或 require 為 0；不以 migration 例外掩蓋模組 import。
- 兩個 guard 皆 GREEN 後才刪除舊模組；未保留 fallback 或雙寫。

### NOT_VERIFIED-local

- `npm run test:e2e -w @tour/web -- midao2-calendar-canonical`：未於本機實跑。blocker：本機 primary checkout 與本 worktree 的 `node_modules` 皆缺 `next-intl`（且該套件未列於 `apps/web/package.json` 依賴），Playwright 需完整依賴與 dev server；本卡片禁止安裝依賴或改 lockfile。Playwright spec 已依契約撰寫，實跑驗證留待 CI 或具完整依賴之環境。
- `apps/web/tests/api/issue1760-traveler-dynamic-selector-parity.test.mjs`：本機 `ERR_MODULE_NOT_FOUND: next-intl`（來自 `src/i18n/routing.ts`），屬 pre-existing 環境缺依賴，與本次 diff 無交集（本次未觸及 available-slots、i18n、slot-generator、resolver 任一檔）。

### Scope 與副作用封存

- 僅動 Owner 修正後允許清單內檔案；未改 lockfile、migration、harness、middleware、security-env、orders/payments、scheduled-plan-slots、canonical resolver、traveler available-slots 或 guide preview。
- 無新 migration、無 migration apply、無 ledger、RLS、ACL，無 Production SQL 或資料操作，無 feature flag 或 backend_mode。
- 無 push、PR、merge、rebase、deploy；未 clean/reset/stash primary checkout。
