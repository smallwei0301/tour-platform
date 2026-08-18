# #1825 admin plan 非 v4 UUID validator 修正實作計畫

> **For Hermes:** 依序執行下列 TDD 步驟；只做指定 validator 與回歸測試，不得動資料、migration、legacy materialization 或 publication recovery。

**Goal:** 讓格式合法但 version／variant nibble 非 RFC v1–v5 的 activity UUID（例如 `c0000003-0000-0000-0000-000000000001`）可通過 admin「方案管理」的列表、單筆讀取、儲存與同頁季節面板前置驗證，同時繼續拒絕非 8-4-4-4-12 hexadecimal 字串。

**Architecture:** 僅把 admin plans 垂直路徑上的 regex 從 RFC v1–v5／variant 限制，改為結構性 hexadecimal UUID 驗證：`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`。不建立全域 UUID helper，也不改變資料庫查詢、授權、CSRF、ownership、cache revalidation 或寫入 payload；因此輸入仍在進入任何 Supabase query 前被格式 gate 擋住。

**Tech Stack:** Next.js App Router、TypeScript、Node built-in test runner、既有 `.claude/hooks/run-checks.sh`。

---

## 已確認的範圍與決策

### 目標路徑（本次要修）

1. `apps/web/app/api/v2/admin/activities/[activityId]/plans/route.ts:20,32,108`
   - list `GET` 與 create `POST` 共用 `UUID_REGEX`。雖然本卡 AC 核心是 list／GET／PUT，替換這個唯一常數會一併使同一路徑的 `POST` 一致接受合法 structural UUID；不得為了維持舊錯誤而另加不一致 gate。
2. `apps/web/app/api/v2/admin/activities/[activityId]/plans/[planId]/route.ts:16,28-33,101-106,225-230`
   - single-plan `GET`、`PUT` 與 `DELETE` 共用常數。核心驗收為 `GET`／`PUT`；`DELETE` 的同一前置格式 gate 會同步保持一致，沒有任何資料操作邏輯變更。
3. `apps/web/src/lib/activity-plan-seasons.ts:1,27-29`
   - `isUuid()` 被 plans 的 seasons list/create/update/delete routes 使用（見 `.../seasons/route.ts:37-42,78-83` 與 `.../seasons/[seasonId]/route.ts:35-43,114-122`）。admin plans page 在成功載入計畫後會呼叫這些 URL（`apps/web/app/(non-locale)/admin/activities/[id]/plans/page.tsx:247-260`），故它是同一個可編輯頁面路徑的必要一致修正。

### 已排除的 strict-validator 路徑（本卡不得修改）

- `apps/web/app/api/v2/admin/activities/[activityId]/publication-versions/route.ts:13,38-41`
- `apps/web/app/api/v2/admin/activities/[activityId]/commands/restore-publication/route.ts:19,58-61`

上述是 publication recovery 的獨立安全／復原介面，不是 admin plan list/edit/save 或其 seasons 子路徑；保留既有 RFC v1–v5／variant policy，避免本次修復改變高風險 recovery 輸入邊界。若這三筆 native activity 未來需使用 publication recovery，另開有明確風險評估的卡。

### 已確認不需改動的相鄰路徑

- schedules route 已使用 structural regex：`.../schedules/route.ts:27-49`。
- readiness route 已使用 structural regex：`.../readiness/route.ts:36-48`。
- addons routes 無 UUID regex；其 ownership／CSRF 防線維持原狀（`.../addons/route.ts:11-35`、`.../addons/[addonId]/route.ts:13-50`）。
- 本次不動 guide-scope atomic batch RPC、legacy draft materialization、public detail／booking API、`activities`／`activity_plans` 資料、migration、任一 production SQL。

### 安全不變量

- 只接受完整、大小寫不敏感的 8-4-4-4-12 hexadecimal UUID；空字串、短字串、額外 suffix、SQL-like 字串、非 hex 字元仍回既有 validation 400。
- route authentication、middleware CSRF、`.eq('id', ...)`／`.eq('activity_id', ...)` ownership 查詢與 404/500 semantics 不改。
- 不新增「任何字串皆可」fallback，也不移除 format validation。
- 不觸碰 canonical `activities`、`activity_plans` 的資料內容及 t_71104d93 已寫入的五筆 plan。

## 實作順序（Builder：`tp-builder-api`）

### Task 1: 先新增精準的 RED regression contract test

**Files:**
- Create: `apps/web/tests/api/issue1825-admin-plan-non-v4-uuid-validator.test.mjs`
- Read-only reference: 三個目標 validator 檔案與 `apps/web/tests/api/issue862-admin-v2-plan-crud-auth.test.mjs`

**Step 1 — 寫 failing assertions**

測試以 `readFileSync` 讀取 route/helper source，延續現有 admin route contract test 慣例，對 sample `c0000003-0000-0000-0000-000000000001` 建立以下可機器判定契約：

1. plans collection route 的 `UUID_REGEX`、single-plan route 的 `UUID_REGEX`、`activity-plan-seasons.ts` 的 `UUID_REGEX` 都是 structural 8-4-4-4-12 pattern，且對 sample 為 true。
2. 三者不得包含 version `[1-5]` 或 variant `[89ab]` 的位置限制。
3. collection route 的 `GET`、single-plan route 的 `GET` 與 `PUT` 仍在 DB access 前以各自 `UUID_REGEX.test(activityId)`／`UUID_REGEX.test(planId)` gate；此斷言確保 sample 不會在 query 前得到 `Invalid activityId`／`Invalid planId`。
4. 至少一個明確非法值（例如 `c0000003-0000-0000-0000-00000000000g`）對三個 structural pattern 都為 false，防止修成 permissive string acceptance。
5. seasons routes 繼續從 `activity-plan-seasons.ts` 使用 `isUuid`，避免 future copy-paste 導致該頁主流程與 seasons 子路徑重新漂移。
6. publication recovery 兩個排除檔仍含既有 strict pattern，作為本卡非擴散範圍的 guard。

**Step 2 — 執行 RED**

Run from repo root:

```bash
cd apps/web && node --test tests/api/issue1825-admin-plan-non-v4-uuid-validator.test.mjs
```

Expected: FAIL，原因是目前三個目標 validator 都會拒絕 sample（version nibble 為 `0`）。保留實際 failure 摘要於 builder handoff。

### Task 2: 僅放寬同一 admin plans 垂直路徑的三個 validator

**Files:**
- Modify: `apps/web/app/api/v2/admin/activities/[activityId]/plans/route.ts:20`
- Modify: `apps/web/app/api/v2/admin/activities/[activityId]/plans/[planId]/route.ts:16`
- Modify: `apps/web/src/lib/activity-plan-seasons.ts:1`
- Do not modify: publication recovery、booking/public/guide routes、DB gateways、migration、data fixtures。

**Step 1 — 最小變更**

在三個既有常數位置，將：

```text
^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
```

改為：

```text
^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$
```

保留 regex flags、常數名稱、handler guard、response code/message 與所有 query/writing code 不變。不要抽新 shared helper：本卡只需修復同一 page flow 的三個既有 validator，抽象化會擴大 impact surface。

**Step 2 — GREEN**

```bash
cd apps/web && node --test tests/api/issue1825-admin-plan-non-v4-uuid-validator.test.mjs
```

Expected: PASS。後續以 source contract 證實 list `GET`、single `GET`／`PUT` 的 pre-DB guard 均會接受 sample，而非法值仍被拒絕。

### Task 3: 做 focused regression 與 commit evidence

**Files:**
- Test: `apps/web/tests/api/issue1825-admin-plan-non-v4-uuid-validator.test.mjs`
- Regression guard: `apps/web/tests/api/issue862-admin-v2-plan-crud-auth.test.mjs`
- Cache/write guard: `apps/web/tests/api/plan-write-revalidates-activity.test.mjs`
- Update milestone: `docs/operations/worklogs/issue1825.md`

**Step 1 — 執行 required checks**

```bash
NODE_OPTIONS='--max-old-space-size=1024' .claude/hooks/run-checks.sh \
  apps/web/tests/api/issue1825-admin-plan-non-v4-uuid-validator.test.mjs \
  apps/web/tests/api/issue862-admin-v2-plan-crud-auth.test.mjs \
  apps/web/tests/api/plan-write-revalidates-activity.test.mjs \
  --typecheck
```

Expected: exit 0。若 worktree 沒有 dependencies，依 CLAUDE.md 使用 `npm ci --include=dev --ignore-scripts --no-audit --no-fund`，並恢復任何 incidental lockfile／tsbuildinfo 變動後才繼續；不得把 lockfile 納入 commit。

**Step 2 — diff hygiene**

```bash
git diff --check
git diff --name-only <base_sha>..HEAD
git status --short
```

Expected changed production files 僅為三個 validator 檔，另加新 issue1825 regression test 與 worklog；沒有 migration、legacy materialization、publication recovery、public/booking/guide scope 或 data changes。

**Step 3 — commit**

在 task-specified dedicated clean worktree 以單一小型 commit 提交，commit message 建議：

```text
fix(admin): accept structural UUIDs in plan routes
```

## 驗收清單

- [ ] sample activity ID 可通過 collection `GET` 的 `activityId` gate。
- [ ] sample activity ID 加上合法 plan UUID 可通過 single-plan `GET`／`PUT` 的 pre-DB gates。
- [ ] admin page 的 seasons 子路徑使用同一個放寬後的 `isUuid()`，不留下同頁 400 dead end。
- [ ] 非 hex／非完整 UUID 仍在 DB query 前回 existing validation error；沒有 SQL/string fallback。
- [ ] schedules/readiness structural UUID policy 未被改壞；publication recovery strict policy 未變。
- [ ] `activities`、`activity_plans` 資料、migration、legacy materialization 與 guide-scope RPC 零異動。
- [ ] focused `run-checks.sh ... --typecheck` 實跑 exit 0，worktree clean，commit range 可重現。

## Rollback

這是純 validator 邏輯且沒有 schema/data side effect。若發布後發現未預期輸入邊界，revert 此單一 implementation commit 即可回到原 strict RFC v1–v5 policy；不執行資料回填或 migration rollback。rollback 前仍先保留測試與 issue evidence，避免重引入 version-0 native ID 的 admin edit regression。

## Rita 獨立 final-review gate（`tp-reviewer`）

Rita 必須以獨立 worktree、immutable `base_sha..head_sha` commit range 審查，且不得信任 builder summary：

1. 確認 diff 僅含三個 validator、issue1825 regression test、worklog；沒有 DB/data/migration/legacy materialization/public booking/guide-scope/recovery route side effect。
2. 逐條驗證 acceptance checklist，特別是 sample acceptance、非法值 rejection、`GET`／`PUT` pre-DB guard，以及 seasons continuity。
3. 重跑 builder 所列的 exact `run-checks.sh ... --typecheck` command，確認結果與 commit SHA 相符。
4. 確認 publication recovery strict pattern 仍存在、schedules/readiness 沒有回歸，且 auth/CSRF/query ownership/revalidation 沒被移除。
5. 只有在 `approved: true`、`changed_files_verified: yes`、`scope_inventory_complete: yes`、`direct_issue_goal_verified: yes`、`acceptance_criteria_result: pass`、`test_evidence_result: pass`、`playwright_or_e2e_required: not_required`（純 server validator、沒有 UI code change）時才 PASS；否則回 builder 的窄 scope fix，再做 fresh Rita review。

## Handoff

- **Next assignee:** `tp-builder-api`
- **Implementation risk:** 低；唯一有意義的風險是把 structural validation 誤放寬成任意字串，已由非法樣本與 pre-DB guard assertions 防護。
- **Blocked questions:** 無。publication recovery 的 strict policy 明確排除，不需在本卡猜測其相容性。
