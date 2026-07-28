# Midao 新導遊後台 Master Implementation Roadmap

> **Status:** 這份文件是跨 package roadmap，不能直接交給實作者逐 task 執行。每個 GitHub package issue 必須另有一份通過 fresh-context review 的 micro-plan，逐步列 RED command、預期失敗、minimal GREEN、GREEN/evidence command 與 commit boundary；未有 micro-plan 的 issue 維持 `status:blocked`。
>
> **First executable package plan:** `docs/plans/2026-07-22-midao-package-01-foundation-shell.md`（Issue #1756，active）。
>
> **Database baseline design:** `docs/plans/2026-07-24-as-built-database-baseline-design.md`
>
> **Database baseline implementation:** `docs/plans/2026-07-24-as-built-database-baseline-implementation.md`
>
> **For Hermes:** 每個 package micro-plan 使用 `subagent-driven-development`；fresh implementer 完成後，由獨立 spec reviewer 與 code-quality reviewer驗收。不得用本 roadmap 的縮寫 task 取代 micro-plan。

**Goal:** 建立獨立 `/midao` 導遊後台，串接既有 Booking V2、活動方案、availability、訊息與付款能力，新增 LINE inquiry、服務直接發布、自訂問卷與全域行事曆，最後安全灰度切換。

**Architecture:** 新 UI 放在 `apps/web/app/(non-locale)/midao/**`，只呼叫新的 `/api/v2/**` façade。讀取由 resolver 統一投影，寫入由 command/RPC 原子執行；canonical activities、activity_plans、bookings、orders 與 effective availability 維持單一真實來源。新舊後台以 `guide_profiles.backend_mode` 隔離寫入。

**Tech Stack:** Next.js 15 App Router、React 19、TypeScript、Node 22 built-in test runner、Supabase/Postgres、Playwright、Next Image、Sentry、Vercel。

**Design Spec:** `docs/superpowers/specs/2026-07-22-midao-backend-design.md`

**Baseline:** `origin/main af3963cb48afdf246035bbf746694c7de18cc2ed`

---

## 0. 執行規則與 package 順序

### 執行前置

正式改產品程式前：

1. 取得使用者同意建立 GitHub epic issue 與六個 package issues。
2. GitHub 回傳 epic issue 數字後，立即用該真實數字建立 worklog（例：issue 為 2048，檔案必須是 `docs/operations/worklogs/issue2048.md`）；禁止把示意字串原樣寫入 repo。
3. 每個 package 使用獨立 worktree／branch，基於執行當下最新 `origin/main`。
4. 每個里程碑雙寫 worklog 與 issue 留言。
5. 本計畫中的 migration 只建立檔案；不得套 production。`apply_migration` 仍需 PR、CI、`SQL-OVERRIDE` 與 ledger。
6. 不修改 frozen `apps/web/middleware.ts`；`/midao` page auth 由 server layout guard，`/api/v2/guide/**` mutation 由 route wrapper 顯式驗 CSRF。
7. 不修改 frozen `apps/web/app/api/{orders,payments}/**` legacy 凍結區；checkout gate 修改的是可修改的 `apps/web/app/api/v2/bookings/[bookingId]/checkout/route.ts`。
8. 所有 Playwright、build、完整 test suite、migration broad scan 都使用 `terminal(background=true, notify_on_complete=true)`，底層命令加 `timeout --signal=TERM 570s`；單一快速 `node --test` 可前景執行。
9. RED 階段可直接對本 task 明列的真實測試檔執行 `node --test --test-concurrency=1`；任何 code commit 前的最終 GREEN 必須改以 `.claude/hooks/run-checks.sh`（需要時加 `--typecheck`）執行本 commit 相關的真實 node test 路徑，讓 commit gate 取得 30 分鐘內證據。E2E-only task 仍須在 commit 前跑該 package 最接近的 node contract tests＋`--typecheck`，Playwright PASS 不能代替 commit evidence。
10. Database fresh install固定走catalog-verified baseline lane；128支pre-cutoff forward migrations以exact filename＋digest凍結，7支Midao保留為post-cutoff（目前forward inventory為128＋7＝135），不再從空DB全量重播或修舊檔。Fresh將`baseline.sql`＋managed overlay組成單一`baseline_v1` marker，再套post-cutoff；existing production只套cutoff後additive migrations。`catalog.cutoff`與`catalog.expected-terminal`分離，fresh/existing各自對expected-terminal exact compare。

### 縮寫 task 的固定 TDD 模板

後文若用「TDD steps」縮寫，實作者仍必須依序執行以下六步，不得把測試與實作合併：

1. 只建立／修改測試，assert 本 task 明列的行為。
2. 執行單一 focused test，保存因缺少行為而失敗的 RED 輸出；語法錯誤、路徑錯誤或 0 tests 不算 RED。
3. 寫最小 production implementation，不順手重構鄰近領域。
4. 直接跑 focused test 到 GREEN。
5. 以 `run-checks.sh --typecheck` 跑本 commit 相關 node tests；若 task 含 UI，再另跑受追蹤 Playwright。
6. `git diff --check`、review diff，再使用 task 指定的 commit message。

### Package 順序

1. Foundation：schema、backend mode、session runtime guard、API helpers。
2. Shell：品牌 token、五項導航、錯誤骨架。
3. Requests：home/list/detail、booking/order ID 分離、原子批准／婉拒。
4. Services：draft、問卷、直接發布、版本復原。
5. Inquiry：traveler inquiry、LINE share、轉 booking、確認連結、checkout gate。
6. Calendar：global rules、plan policy、month projection、effective resolver。
7. Public page/cutover：canonical `/guides/[slug]`、舊 shop redirect、我的頁面與灰度切換。
8. Verification：完整 E2E、視覺、CI、production-shaped smoke 與 soak 計畫。

---

# Package 0 — Foundation

## Task 0: 建立 staged／CI evidence runners

**Files:**
- Create: `scripts/testing/verify-staged-check-evidence.mjs`
- Create: `apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs`
- Create: `scripts/testing/run-midao-ci-command.mjs`
- Create: `apps/web/tests/unit/midao-ci-command-runner.test.mjs`

先以adversarial tests鎖same-tree evidence bundle、frozen harness semantic command、untracked/unstaged rejection，以及lint/typecheck/build固定mode、strict child env allowlist（validated absolute npm、rebuilt PATH、fixed locale、runner-owned isolated HOME/cache、兩個不同的FD-verified empty user/global npmrc）、dotenv/npmrc fail-closed、secret redaction、clean HEAD/tree與per-command log digest。npm 11會拒絕user/global config同指 `/dev/null`，故兩個config path不得相同；hostile umask case須從0777開始，runner暫設0077涵蓋全部純同步HOME/cache/npmrc setup與FD/path驗證，成功／每個失敗點都在spawn前恢復原值，期間禁止await/spawn；之後成功完成strict local npm11 no-network probe，不可把setup失敗算PASS。Temp HOME一旦建立，umask restore與所有setup/spawn/postflight success/failure paths都必須finally cleanup；cleanup失敗final nonzero且不得發布success evidence，success evidence只可在cleanup成功後atomic commit。不得修改frozen `.claude/**`。Master下方test commands是child payload；#1756實際commit依executable micro-plan由staged orchestrator執行，final CI equivalent使用CI recorder。

## Task 1: 建立 backend mode migration contract test

**Objective:** 先以測試鎖定 `guide_profiles.backend_mode` 預設 legacy、允許值與 index。

**Files:**
- Create: `apps/web/tests/api/midao-backend-mode-migration.test.mjs`
- Create later: `supabase/migrations/20260723000000_midao_backend_mode.sql`

**Step 1: Write failing test**

測試讀 migration source，assert：

```js
assert.match(sql, /ADD COLUMN IF NOT EXISTS backend_mode TEXT NOT NULL DEFAULT 'legacy'/);
assert.match(sql, /CHECK \(backend_mode IN \('legacy', 'midao'\)\)/);
assert.match(sql, /CREATE INDEX/);
```

**Step 2: Verify RED**

Run:

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-backend-mode-migration.test.mjs
```

Expected: FAIL，migration file 尚不存在。

**Step 3: Create migration**

Migration 只新增 `backend_mode`、constraint、index 與 comment；不改既有 migration。

**Step 4: Verify GREEN**

Run 同上，Expected: PASS。

**Step 5: Commit**

```bash
git add apps/web/tests/api/midao-backend-mode-migration.test.mjs supabase/migrations/20260723000000_midao_backend_mode.sql
git commit -m "feat: 新增 Midao 後台模式欄位"
```

## Task 1A: 建立 notification outbox schema

**Objective:** 在任何 atomic command 前建立可交易式寫入的通知 outbox。

**Files:**
- Create: `apps/web/tests/api/midao-notification-outbox-migration.test.mjs`
- Create: `supabase/migrations/20260723001000_midao_notification_outbox.sql`

**TDD steps:**

1. 寫 source-contract test，鎖定 `event_name/payload/status/attempt_count/next_attempt_at`、claim index、PII-minimal comment、RLS 與 service-role grants。
2. 跑 targeted test，Expected RED。
3. 建立 additive migration；outbox payload 不存完整旅客地址或付款資料。
4. 跑 targeted test，Expected GREEN。
5. Commit：`feat: 建立 Midao 通知 outbox schema`。

## Task 1B: 建立 durable idempotency schema

**Files:**
- Create: `apps/web/tests/api/midao-idempotency-migration.test.mjs`
- Create: `supabase/migrations/20260723002000_midao_idempotency_records.sql`

建立service-role-only `midao_idempotency_records`，唯一鍵為actor type/ID＋command＋scope type/ID＋idempotency key；以 `processing|completed` lifecycle保存request hash、鎖定/完成時間與已去敏response snapshot，completed才允許非空response。同scope/key同hash replay，不同hash回409；不同guide scope可重用key。

## Task 1C: 建立 transactional audit schema

**Files:**
- Create: `apps/web/tests/api/midao-audit-events-migration.test.mjs`
- Create: `supabase/migrations/20260723002500_midao_audit_events.sql`

建立 service-role-only `midao_audit_events`，保存 actor、guide、action、resource、request ID與去敏 metadata。既有 `audit_logs`為 order-centric schema，欄位不足；跨表 command在同一 transaction寫專用 audit＋outbox。完整 RED/GREEN與 local SQL驗證以 #1756 micro-plan為準。

## Task 2: 讓 guide session payload回傳已簽章 sessionVersion

**Objective:** 保持三段 token 格式，讓 runtime guard 能比對 DB version。

**Files:**
- Modify: `apps/web/src/lib/guide-auth.ts:115-202`
- Test: `apps/web/tests/api/midao-guide-session-version.test.mjs`

**Step 1: Write failing unit test**

建立 cookies 後呼叫 `verifyGuideSession()`，要求：

```js
assert.equal(session.sessionVersion, 7);
assert.equal(token.split(':').length, 3);
```

另測篡改 version 後 HMAC 驗證失敗。

**Step 2: Verify RED**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-guide-session-version.test.mjs
```

Expected: FAIL，payload 尚無 `sessionVersion`。

**Step 3: Minimal implementation**

將 interface 擴充：

```ts
export interface GuideSessionPayload {
  guideId: string;
  guideName: string;
  sessionVersion: number;
  isNew?: boolean;
}
```

`verifyGuideSession()` 回傳解析並驗簽後的 `version`。不得改 token 格式。

**Step 4: Verify GREEN + regression**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-guide-session-version.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs
```

Expected: PASS。

**Step 5: Commit**

```bash
git add apps/web/src/lib/guide-auth.ts apps/web/tests/api/midao-guide-session-version.test.mjs
git commit -m "feat: 暴露導遊 session version"
```

## Task 3: 建立 guide runtime access gateway

**Objective:** 每次 Midao page/API 存取時比對 canonical backend mode 與 session version。

**Files:**
- Create: `apps/web/src/lib/db-midao-runtime-access.mjs`
- Create: `apps/web/tests/api/midao-runtime-access-gateway.test.mjs`

**Step 1: Write failing contract tests**

涵蓋：

- in-memory seed legacy/midao。
- token version 等於 DB version。
- stale version → `SESSION_STALE`。
- wrong mode → `BACKEND_MODE_MISMATCH`。
- inactive guide → `GUIDE_NOT_ACTIVE`。
- Supabase branch select明列 `display_name, backend_mode, guide_session_version, verification_status`；route context guideName只取DB display_name。

**Step 2: Verify RED**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-runtime-access-gateway.test.mjs
```

**Step 3: Implement gateway**

Exports：

```js
getGuideRuntimeAccessDb({ guideId })
assertMidaoRuntimeAccess({ session, runtime })
__seedGuideRuntimeAccessForTest(row)
__resetGuideRuntimeAccessForTest()
```

新增函式不得進 `db.mjs`。

**Step 4: Verify GREEN**

Run 同上。

**Step 5: Commit**

```bash
git add apps/web/src/lib/db-midao-runtime-access.mjs apps/web/tests/api/midao-runtime-access-gateway.test.mjs
git commit -m "feat: 新增 Midao runtime access guard"
```

## Task 4: 建立 V2 guide query/command wrappers

**Objective:** 統一 auth、runtime mode、CSRF、request ID、error envelope 與 Sentry sanitization。

**Files:**
- Create: `apps/web/src/lib/midao/with-guide-route.ts`
- Create: `apps/web/src/lib/midao/route-errors.ts`
- Test: `apps/web/tests/api/midao-guide-route-wrapper.test.mjs`
- Reuse: `apps/web/src/lib/api-response.ts`
- Reuse: `apps/web/src/lib/route-error.ts`
- Reuse: `apps/web/src/lib/csrf.mjs`

**Step 1: Write failing tests**

Assert：

- query 未登入 401。
- stale session 401 `SESSION_STALE`。
- legacy mode 409 `BACKEND_MODE_MISMATCH`。
- backend disabled 或 mutation disabled 時 fail-closed。
- command 在 handler 前驗 CSRF。
- admin impersonation signed actor cookie 驗證後才產生 `actorType=admin`；偽造 cookie 回 401。
- ownership error 可映射 404。
- response 使用 `jsonOk/jsonError`。

**Step 2: Verify RED**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-guide-route-wrapper.test.mjs
```

**Step 3: Implement wrappers**

Public API：

```ts
withMidaoGuideQuery(handler)
withMidaoGuideCommand(handler)
```

Command context 至少含：

```ts
{ guideId, guideName, sessionVersion, actorType, actorId, requestId, idempotencyKey }
```

**Step 4: Verify GREEN**

Run targeted test。

**Step 5: Commit**

```bash
git add apps/web/src/lib/midao/with-guide-route.ts apps/web/src/lib/midao/route-errors.ts apps/web/tests/api/midao-guide-route-wrapper.test.mjs
git commit -m "feat: 建立 Midao V2 route wrapper"
```

## Task 5: 更新 login 與 admin impersonation redirect contract

**Objective:** 由 server canonical backend mode 決定登入後入口。

**Files:**
- Modify: `apps/web/src/lib/guide-auth-session-supabase.ts`
- Create: `apps/web/src/lib/midao/impersonation-actor.ts`
- Modify: `apps/web/app/api/guide/auth/session/route.ts`
- Modify: `apps/web/app/api/v2/admin/guides/[guideId]/impersonate/route.ts`
- Modify: `apps/web/app/(non-locale)/guide/login/page.tsx`
- Modify: `apps/web/app/(non-locale)/admin/guides/[guideId]/page.tsx`
- Test: `apps/web/tests/api/midao-guide-login-api-redirect.test.mjs`
- Test: `apps/web/tests/api/midao-guide-impersonation-redirect.test.mjs`
- Test: `apps/web/tests/ui/midao-admin-impersonation-ui-redirect.test.mjs`
- Test: `apps/web/tests/api/midao-impersonation-actor.test.mjs`

**Step 1: Write RED tests**

Require queries to select `backend_mode` and responses：

```json
{ "redirectTo": "/midao" }
```

或 `/guide/dashboard`。Login UI使用server `redirectTo`，`next`只允許同realm relative path；admin guide page亦consume impersonation response的allowlisted `/midao/**`或`/guide/**` redirect，不再硬編legacy route。Impersonation以normalized admin email簽actor cookie；invite/regular/legacy guideId普通登入與logout都清actor/banner cookies。

**Step 2: Verify RED**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-guide-login-api-redirect.test.mjs \
  apps/web/tests/api/midao-guide-impersonation-redirect.test.mjs \
  apps/web/tests/ui/midao-admin-impersonation-ui-redirect.test.mjs
```

**Step 3: Implement minimal changes**

保留既有 cookie shape、rate limit、CSRF、password upgrade 與 invite flow。

**Step 4: Verify GREEN + auth regression**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-guide-login-api-redirect.test.mjs \
  apps/web/tests/api/midao-guide-impersonation-redirect.test.mjs \
  apps/web/tests/ui/midao-admin-impersonation-ui-redirect.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs
```

**Step 5: Commit**

```bash
git add apps/web/src/lib/guide-auth-session-supabase.ts apps/web/app/api/guide/auth/session/route.ts apps/web/app/api/v2/admin/guides/[guideId]/impersonate/route.ts 'apps/web/app/(non-locale)/admin/guides/[guideId]/page.tsx' apps/web/tests/api/midao-guide-*.test.mjs apps/web/tests/ui/midao-admin-impersonation-ui-redirect.test.mjs
git commit -m "feat: 依後台模式導向導遊入口"
```

## Task 5A: 建立原子 backend mode switch

**Objective:** 提供可稽核、可 rollback 的唯一 admin 切換入口，mode 與 session version 不得分段更新。

**Files:**
- Create: `supabase/migrations/20260723003000_midao_atomic_backend_mode_switch.sql`
- Create: `apps/web/src/lib/db-midao-backend-mode.mjs`
- Create: `apps/web/app/api/v2/admin/guides/[guideId]/backend-mode/route.ts`
- Create: `apps/web/tests/api/midao-backend-mode-switch.test.mjs`

**Step 1: Write RED tests**

鎖定：admin route使用既有admin middleware/CSRF realm，actor email normalized且禁止body actor。Forward切midao要求backend＋mode-switch flags，rollback永遠允許。RPC順序為validate→idempotency claim/replay→profile lock→conditional update→audit→outbox→response snapshot→commit；fresh same-mode不bump/audit/outbox。Function revoke PUBLIC/anon/authenticated EXECUTE，只grant service_role。

**Step 2: Verify RED**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-backend-mode-switch.test.mjs
```

**Step 3: Implement migration, gateway, route**

Route 不自行做兩段 update，只呼叫 `midao_switch_guide_backend_mode` RPC。Response：

```json
{
  "guideId": "uuid",
  "backendMode": "midao",
  "sessionVersion": 8,
  "redirectTo": "/midao"
}
```

**Step 4: Verify GREEN + auth regressions**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-backend-mode-switch.test.mjs \
  apps/web/tests/api/midao-guide-login-api-redirect.test.mjs \
  apps/web/tests/api/midao-guide-impersonation-redirect.test.mjs
```

**Step 5: Commit**

```bash
git add supabase/migrations/20260723003000_midao_atomic_backend_mode_switch.sql apps/web/src/lib/db-midao-backend-mode.mjs apps/web/app/api/v2/admin/guides/[guideId]/backend-mode/route.ts apps/web/tests/api/midao-backend-mode-switch.test.mjs
git commit -m "feat: 建立原子導遊後台模式切換"
```

## Package 0 gate

Run：

```bash
.claude/hooks/run-checks.sh \
  apps/web/tests/api/midao-backend-mode-migration.test.mjs \
  apps/web/tests/api/midao-notification-outbox-migration.test.mjs \
  apps/web/tests/api/midao-idempotency-migration.test.mjs \
  apps/web/tests/api/midao-audit-events-migration.test.mjs \
  apps/web/tests/api/midao-guide-session-version.test.mjs \
  apps/web/tests/api/midao-runtime-access-gateway.test.mjs \
  apps/web/tests/api/midao-guide-route-wrapper.test.mjs \
  apps/web/tests/api/midao-guide-login-api-redirect.test.mjs \
  apps/web/tests/api/midao-guide-impersonation-redirect.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs \
  apps/web/tests/api/midao-backend-mode-switch.test.mjs \
  --typecheck
```

Expected: targeted tests PASS、typecheck PASS。由 fresh reviewer read-back migration、auth、route wrapper。

---

# Package 1 — Midao Shell

## Task 6: 建立 Midao Brand Book tokens

**Files:**
- Create: `apps/web/src/features/midao/styles/tokens.css`
- Create: `apps/web/src/features/midao/styles/shell.css`
- Test: `apps/web/tests/ui/midao-brand-tokens.test.mjs`

**TDD steps:**

1. Test assert token 檔包含八色、Noto Serif TC、safe-area 與 44px touch target。
2. Run test，Expected RED。
3. 建立 CSS variables，不在頁面硬編截圖藍色。
4. Run test，Expected GREEN。
5. Commit：`feat: 建立 Midao 後台設計 token`。

## Task 7: 建立五項 navigation model

**Files:**
- Create: `apps/web/src/features/midao/shell/nav-items.ts`
- Test: `apps/web/tests/unit/midao-nav-items.test.mjs`

要求固定五項與 route：`/midao`、`/midao/requests`、`/midao/calendar`、`/midao/services`、`/midao/me`。測 nested route active matching。

Run：

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-nav-items.test.mjs
```

Commit：`feat: 定義 Midao 五項主導航`。

## Task 8: 建立 shell components

**Files:**
- Create: `apps/web/src/features/midao/shell/MidaoShell.tsx`
- Create: `apps/web/src/features/midao/shell/MidaoBottomNav.tsx`
- Create: `apps/web/src/features/midao/shell/MidaoDesktopSidebar.tsx`
- Create: `apps/web/src/features/midao/shell/MidaoPageHeader.tsx`
- Create: `apps/web/src/features/midao/shell/MidaoImpersonationBanner.tsx`
- Test: `apps/web/tests/ui/midao-shell-composition.test.mjs`

先寫 source/DOM contract：五項 nav、`aria-current`、safe-area、桌面 sidebar breakpoint、impersonation banner 由 shell render。再實作最小元件。

Commit：`feat: 建立 Midao 響應式 shell`。

## Task 9: 建立 page-session helper 與 layout guard

**Files:**
- Create: `apps/web/src/lib/midao/page-session.ts`
- Create: `apps/web/app/(non-locale)/midao/layout.tsx`
- Create: `apps/web/app/(non-locale)/midao/loading.tsx`
- Create: `apps/web/app/(non-locale)/midao/error.tsx`
- Create: `apps/web/app/(non-locale)/midao/not-found.tsx`
- Test: `apps/web/tests/ui/midao-layout-wiring.test.mjs`

Layout server-side 讀 cookie、驗 HMAC，再以 runtime access gateway 比 DB mode/version。不改 frozen middleware。未登入 redirect `/guide/login?next=/midao`；legacy mode 導回 legacy。

Commit：`feat: 建立 Midao 頁面權限與錯誤骨架`。

## Task 10: 建立shell基本狀態元件

**Files:**
- Create: `apps/web/src/features/midao/ui/LoadingSkeleton.tsx`
- Create: `apps/web/src/features/midao/ui/InlineError.tsx`
- Test: `apps/web/tests/ui/midao-shell-composition.test.mjs`

只建立shell立即使用的loading/error。AppCard、StatusBadge、SegmentedTabs、EmptyState與ConflictRecoverySheet延後到第一個實際消費它們的package，以該互動的Playwright驗證。

## Task 11: 建立五個 route skeleton

**Files:**
- Create: `apps/web/app/(non-locale)/midao/page.tsx`
- Create: `apps/web/app/(non-locale)/midao/requests/page.tsx`
- Create: `apps/web/app/(non-locale)/midao/calendar/page.tsx`
- Create: `apps/web/app/(non-locale)/midao/services/page.tsx`
- Create: `apps/web/app/(non-locale)/midao/me/page.tsx`
- Test: `apps/web/e2e/midao-navigation.spec.ts`

E2E使用local seeded guide＋real HMAC/DB guard，驗五route、active nav、desktop/mobile layout與auth/impersonation；不得用legacy fake-signature helper或mock `/midao` server auth。

Run：

```bash
node scripts/testing/verify-staged-check-evidence.mjs --run-heavy -- \
  timeout --signal=TERM 570s bash scripts/testing/run-midao-e2e.sh \
  apps/web/e2e/midao-navigation.spec.ts
node scripts/testing/verify-staged-check-evidence.mjs --check-only
```

Commit：`feat: 建立 Midao 五頁入口`。

## Package 1 gate

Targeted UI contracts＋Playwright mobile 390×844＋desktop 1440×1000＋typecheck；runner cleanup與staged evidence `--check-only`都必須PASS。

---

# Package 2 — Requests 與原子批准

## Task 12: 建立 request reference parser

**Files:**
- Create: `apps/web/src/lib/midao/request-ref.mjs`
- Create: `apps/web/tests/unit/midao-request-ref.test.mjs`

API：

```js
parseRequestRef('booking_<uuid>')
parseRequestRef('inquiry_<uuid>')
formatRequestRef(kind, id)
```

非法 prefix/UUID 回 deterministic error，不猜 order ID。

## Task 13: 建立 request bucket mapping

**Files:**
- Create: `apps/web/src/lib/midao/request-buckets.mjs`
- Create: `apps/web/tests/unit/midao-request-buckets.test.mjs`

測 `new/needs_reply/replied/completed`，取消與成功保留 secondary state。

## Task 14: 建立 requests read gateway

**Files:**
- Create: `apps/web/src/lib/midao/db-requests.mjs`
- Create: `apps/web/tests/api/midao-requests-gateway.test.mjs`
- Create: `supabase/migrations/20260723004000_midao_request_read_projection.sql`
- Create: `apps/web/tests/api/midao-requests-read-migration.test.mjs`
- Modify: `scripts/testing/with-midao-local-supabase.mjs`
- Modify: `apps/web/tests/unit/midao-local-supabase-runner.test.mjs`

Exports：

```js
listMidaoRequestsDb({ guideId, bucket, cursor, limit, sort })
getMidaoBookingRequestDb({ guideId, bookingId })
getMidaoInquiryRequestDb({ guideId, inquiryId })
```

先完成 booking branch；inquiry branch 在 Package 4 啟用。回傳明列 bookingId/orderId，不回 admin_note。in-memory 與 Supabase shape contract 必測。因 bucket、latest-message 與 keyset sort 無法由既有單表 PostgREST relation 在 server-side 正確分頁，booking list 使用 service-role-only read RPC；RPC 計算 closed bucket、latest message、priority/updated/service keyset 與 `limit + 1`，detail 才讀 contact snapshot。Cursor 必須 HMAC 簽章並綁 guide、bucket、sort 與完整 tuple。新 migration 只落 source/CI，未經 migration override 不套 production。

## Task 15: 建立 request list/detail resolvers

**Files:**
- Create: `apps/web/src/lib/midao/request-list-resolver.ts`
- Create: `apps/web/src/lib/midao/request-detail-resolver.ts`
- Test: `apps/web/tests/unit/midao-request-resolvers.test.mjs`

Resolver 只接受 gateway projection，輸出 UI DTO 與 allowedActions。

## Task 16: 建立 Requests V2 APIs

**Files:**
- Create: `apps/web/app/api/v2/guide/requests/route.ts`
- Create: `apps/web/app/api/v2/guide/requests/[requestRef]/route.ts`
- Test: `apps/web/tests/api/midao-requests.test.mjs`
- Test: `apps/web/tests/api/midao-request-detail.test.mjs`

使用 `withMidaoGuideQuery`＋`jsonOk/jsonError`。測 401、legacy mode、ownership 404、cursor、invalid ref 422、admin_note absent。

## Task 17: 建立 home resolver/API

**Files:**
- Create: `apps/web/src/lib/midao/home-resolver.ts`
- Create: `apps/web/app/api/v2/guide/home/route.ts`
- Test: `apps/web/tests/api/midao-home.test.mjs`

先合併 pending booking requests＋messages＋profile；inquiry counters 在 Package 4 加入。API 失敗不得回假零值。

## Task 18: 建立 Requests/Home UI

**Files:**
- Create: `apps/web/src/features/midao/home/HomeScreen.tsx`
- Create: `apps/web/src/features/midao/home/RequestCounterCards.tsx`
- Create: `apps/web/src/features/midao/home/PriorityRequestCard.tsx`
- Create: `apps/web/src/features/midao/home/RecentProgressList.tsx`
- Create: `apps/web/src/features/midao/requests/RequestListScreen.tsx`
- Create: `apps/web/src/features/midao/requests/RequestCard.tsx`
- Create: `apps/web/src/features/midao/requests/RequestDetailScreen.tsx`
- Create: `apps/web/src/features/midao/requests/RequestSummaryCard.tsx`
- Create: `apps/web/app/(non-locale)/midao/requests/[requestRef]/page.tsx`
- Test: `apps/web/e2e/midao-home.spec.ts`
- Test: `apps/web/e2e/midao-requests.spec.ts`

Mock APIs；驗 loading/error/empty、tabs、deep link、PII masking、mobile card layout。

## Task 19: 建立 atomic approval migration contract

**Files:**
- Create: `apps/web/tests/api/midao-atomic-approval-migration.test.mjs`
- Create: `supabase/migrations/20260723010000_midao_atomic_booking_approval.sql`

RPC `midao_decide_booking_request` lock order 遵守 orders → bookings → activity_schedules；compare pending；更新 booking/order/log/outbox；回 projection。測 SQL source contract 含 `FOR UPDATE`、狀態 guard 與 exception code。

## Task 20: 建立 atomic approval gateway/route

**Files:**
- Create: `apps/web/src/lib/db-midao-booking-commands.mjs`
- Create: `apps/web/app/api/v2/guide/bookings/[bookingId]/commands/decide/route.ts`
- Create: `apps/web/tests/api/midao-booking-decision.test.mjs`

Supabase branch `.rpc('midao_decide_booking_request', ...)`；in-memory 模擬 transaction result。測 approve/reject/double decision/ownership/idempotency。

## Task 21: 接上批准／婉拒 UI

**Files:**
- Create: `apps/web/src/features/midao/requests/RequestProgressActions.tsx`
- Create: `apps/web/src/features/midao/requests/requests.api.ts`
- Modify: `apps/web/src/features/midao/requests/RequestDetailScreen.tsx`
- Modify: `apps/web/e2e/midao-requests.spec.ts`

批准成功更新 latest projection；409 顯示 ConflictRecoverySheet；婉拒要求 confirm＋note。不得 optimistic 宣稱成功。

## Package 2 gate

Focused tests、E2E、typecheck；fresh reviewer 確認 booking/order IDs 分離與 route 未回 admin_note。

---

# Package 3 — Services、問卷與直接發布

## Task 22: 建立 service schema migration contract

**Files:**
- Create: `apps/web/tests/api/midao-service-schema-migrations.test.mjs`
- Create: `supabase/migrations/20260723020000_midao_service_drafts_and_questions.sql`
- Create: `supabase/migrations/20260723021000_midao_service_publication_versions.sql`

鎖定：

- `guide_service_drafts` revision、partial unique activity draft。
- `activity_intake_questions` type/options constraints。
- `activities.inquiry_enabled BOOLEAN DEFAULT false`，不是 booking_type。
- `service_publication_versions` unique activity/version。
- indexes/FKs/RLS/grants 最小權限。

## Task 23: 建立 questionnaire validator

**Files:**
- Create: `apps/web/src/lib/midao/questionnaire-schema.mjs`
- Create: `apps/web/tests/unit/midao-questionnaire-validation.test.mjs`

API：

```js
validateQuestionnaireSchema(questions)
validateQuestionnaireAnswers(snapshot, answers)
```

測最多 20 題、duplicate key、choice 至少兩項、required、single/multi/text type。

## Task 24: 建立 service publication validator

**Files:**
- Create: `apps/web/src/lib/midao/service-publication.ts`
- Create: `apps/web/tests/unit/midao-service-publication-validation.test.mjs`

驗 title、tagline 60 字、image、region、plan price/duration/participants、booking_type 三值、inquiry_enabled boolean、question schema。

## Task 25: 建立 service draft gateway

**Files:**
- Create: `apps/web/src/lib/db-midao-service-drafts.mjs`
- Create: `apps/web/tests/api/midao-service-drafts-gateway.test.mjs`

CRUD＋revision CAS；ownership 404；in-memory/Supabase parity。

## Task 26: 建立 service draft APIs

**Files:**
- Create: `apps/web/app/api/v2/guide/service-drafts/route.ts`
- Create: `apps/web/app/api/v2/guide/service-drafts/[draftId]/route.ts`
- Create: `apps/web/tests/api/midao-service-drafts.test.mjs`

POST/GET/PATCH/DELETE；422 field errors；409 revision conflict；Midao mode guard。

## Task 27: 建立 atomic publish RPC

**Files:**
- Create: `supabase/migrations/20260723022000_midao_atomic_service_publication.sql`
- Create: `apps/web/tests/api/midao-service-publish-rpc.test.mjs`

Transaction：lock draft → validate ownership/revision → upsert canonical activity → upsert plans → replace questions → insert next publication version → delete draft → outbox。不得寫 review pending overlay。此 migration 獨立新增，禁止修改 Package 2 的 booking approval migration。

## Task 28: 建立 publish gateway/API

**Files:**
- Create: `apps/web/src/lib/db-midao-service-publication.mjs`
- Create: `apps/web/app/api/v2/guide/service-drafts/[draftId]/commands/publish/route.ts`
- Create: `apps/web/tests/api/midao-service-publish.test.mjs`

測 direct publish、update publish、rollback、idempotency、slug collision、wrong guide、draft retained on failure。

## Task 29: 建立 services list gateway/API

**Files:**
- Create: `apps/web/src/lib/midao/service-list-resolver.ts`
- Create: `apps/web/app/api/v2/guide/services/route.ts`
- Create: `apps/web/tests/api/midao-services-list.test.mjs`

價格與人數來自 active plans；多方案輸出 min/max price。Draft 與 published 分頁分離。

## Task 30: 建立三步 Service Wizard UI

**Files:**
- Create: `apps/web/src/features/midao/services/ServiceListScreen.tsx`
- Create: `apps/web/src/features/midao/services/ServiceCard.tsx`
- Create: `apps/web/src/features/midao/services/ServiceWizard.tsx`
- Create: `apps/web/src/features/midao/services/ServiceBasicsStep.tsx`
- Create: `apps/web/src/features/midao/services/ServiceQuestionsStep.tsx`
- Create: `apps/web/src/features/midao/services/ServicePreviewStep.tsx`
- Create: `apps/web/src/features/midao/services/QuestionEditor.tsx`
- Create: `apps/web/src/features/midao/services/QuestionPreview.tsx`
- Create: `apps/web/src/features/midao/services/ServicePublishAction.tsx`
- Create: `apps/web/app/(non-locale)/midao/services/new/page.tsx`
- Create: `apps/web/app/(non-locale)/midao/services/[activityId]/edit/page.tsx`
- Test: `apps/web/e2e/midao-services.spec.ts`

驗 auto-save states、step validation、question reorder、booking type 不含 LINE、inquiry_enabled 獨立、direct publish、public URL。

## Task 31: 建立 admin publication recovery

**Files:**
- Create: `apps/web/src/lib/db-midao-publication-recovery.mjs`
- Create: `apps/web/app/api/v2/admin/activities/[activityId]/publication-versions/route.ts`
- Create: `apps/web/app/api/v2/admin/activities/[activityId]/commands/restore-publication/route.ts`
- Create: `apps/web/tests/api/midao-publication-recovery.test.mjs`

Restore 指定 snapshot 時建立新 version，不刪歷史。測 admin auth/CSRF、reason required、transaction rollback。

## Package 3 gate

Service API tests、wizard E2E、typecheck、mobile screenshot。Fresh reviewer 核對直接發布沒有繞過 ownership/validation，且 LINE 沒進 booking enum。

---

# Package 4 — LINE Inquiry、轉單與旅客確認

## Task 32: 建立 inquiry/confirmation/pricing schema migrations

**Files:**
- Create: `supabase/migrations/20260723030000_midao_inquiries.sql`
- Create: `supabase/migrations/20260723031000_midao_booking_intake_pricing_and_confirmation.sql`
- Create: `apps/web/tests/api/midao-inquiry-schema-migrations.test.mjs`

測 tables、enums/check constraints、unique converted booking/source inquiry、token hash、pricing snapshot、indexes、RLS、traveler ownership。

## Task 33: 建立 inquiry state machine

**Files:**
- Create: `apps/web/src/lib/midao/inquiry-state-machine.mjs`
- Create: `apps/web/tests/unit/midao-inquiry-state-machine.test.mjs`

合法 transition：new→opened/replied/closed/expired，replied→ready_to_convert/converted/closed，ready→converted/closed；終態禁止重轉。

## Task 34: 建立 inquiry gateway

**Files:**
- Create: `apps/web/src/lib/db-midao-inquiries.mjs`
- Create: `apps/web/tests/api/midao-inquiries-gateway.test.mjs`

Create/list/detail/mark-replied；traveler/guide ownership；snapshot questions；in-memory/Supabase parity。

## Task 35: 建立 public inquiry API

**Files:**
- Create: `apps/web/app/api/v2/public/guides/[slug]/inquiries/route.ts`
- Create: `apps/web/tests/api/midao-public-inquiry.test.mjs`

使用 traveler SSR session、CSRF、rate limit；service 必須 published、inquiry_enabled、plan active；validate answers；body 不接受 traveler/guide ID。

## Task 36: 建立 LINE reply template

**Files:**
- Create: `apps/web/src/lib/midao/line-reply-template.ts`
- Create: `apps/web/app/api/v2/guide/requests/[requestRef]/reply-template/route.ts`
- Create: `apps/web/tests/unit/midao-line-reply-template.test.mjs`

文案意圖：acknowledge/approve/ask_more/payment_link。測 URL encode、無內部 UUID/PII、缺 confirmation URL 時禁止 payment intent。

## Task 37: 建立 inquiry conversion pure validation

**Files:**
- Create: `apps/web/src/lib/midao/inquiry-conversion.ts`
- Create: `apps/web/tests/unit/midao-inquiry-conversion.test.mjs`

驗 plan ownership、request booking type、start/end、participants、quoted total、24h TTL bounds、state legality。

## Task 38: 建立 atomic inquiry conversion RPC

**Files:**
- Create: `supabase/migrations/20260723032000_midao_atomic_inquiry_conversion.sql`
- Create: `apps/web/tests/api/midao-inquiry-convert-rpc.test.mjs`

Lock order orders → bookings → activity_schedules；lock inquiry；availability/capacity；建立 booking/order/pricing/intake/token/log/outbox；converted_booking_id CAS；重複 idempotency 回同 booking。此檔同時定義 traveler confirmation accept RPC，禁止修改前兩個 command migrations。

## Task 39: 建立 conversion gateway/API

**Files:**
- Create: `apps/web/src/lib/db-midao-booking-confirmations.mjs`
- Create: `apps/web/app/api/v2/guide/inquiries/[inquiryId]/commands/mark-replied/route.ts`
- Create: `apps/web/app/api/v2/guide/inquiries/[inquiryId]/commands/convert/route.ts`
- Create: `apps/web/tests/api/midao-inquiry-convert.test.mjs`

測 success、double convert、wrong guide、expired/closed、slot conflict、invalid quote、rollback、token 只回一次。

## Task 40: 建立 traveler confirmation helper/RPC/API

**Files:**
- Create: `apps/web/src/lib/midao/booking-confirmation.ts`
- Use RPC from: `supabase/migrations/20260723032000_midao_atomic_inquiry_conversion.sql`
- Create: `apps/web/app/api/v2/me/booking-confirmations/[token]/accept/route.ts`
- Create: `apps/web/tests/api/midao-booking-confirmation.test.mjs`

Token hash 使用 server pepper；驗 user ownership/expiry/consumed；再驗 slot/capacity；consume＋confirm transaction。

## Task 41: 擴充 checkout gate

**Files:**
- Modify: `apps/web/src/lib/booking-type-flow.mjs`
- Modify: `apps/web/app/api/v2/bookings/[bookingId]/checkout/route.ts:117-167`
- Test: `apps/web/tests/api/midao-checkout-confirmation-gate.test.mjs`
- Regression: `apps/web/tests/api/booking-checkout-approval-gate.test.mjs`

在 booking select 加 `traveler_confirmation_status` optional-column fallback；新增 pure gate：source inquiry booking 必須 confirmed，普通 booking `not_required` 不受影響。不得改 legacy payment routes。

## Task 42: 建立 inquiry request detail UI

**Files:**
- Create: `apps/web/src/features/midao/requests/TravelerContactActions.tsx`
- Create: `apps/web/src/features/midao/requests/InquiryConversionSheet.tsx`
- Create: `apps/web/src/features/midao/requests/LineReplyAction.tsx`
- Modify: `apps/web/src/features/midao/requests/RequestDetailScreen.tsx`
- Modify: `apps/web/src/lib/midao/home-resolver.ts`
- Modify: `apps/web/src/lib/midao/request-list-resolver.ts`
- Test: `apps/web/e2e/midao-inquiry-conversion.spec.ts`

驗 copy→open LINE fallback、opening LINE 不 mark replied、轉單表單、confirmation URL、409 recovery。

## Task 43: 建立 traveler confirmation page

**Files:**
- Create: `apps/web/app/(non-locale)/booking/confirm/[token]/page.tsx`
- Create: `apps/web/src/components/booking/BookingConfirmationCard.tsx`
- Test: `apps/web/e2e/midao-inquiry-conversion.spec.ts`

顯示服務、日期、人數、價格、期限；未登入帶 safe next；accept 後進既有 checkout。Expired/used/mismatch 有明確狀態。

## Package 4 gate

完整 traveler→inquiry→guide convert→traveler accept→checkout E2E；API concurrency test；typecheck。不得打真 LINE 或付款。

---

# Package 5 — Global Calendar

## Task 44: 建立 availability scope migration contract

**Files:**
- Create: `supabase/migrations/20260723040000_midao_global_availability_scope.sql`
- Create: `apps/web/tests/api/midao-global-availability-migration.test.mjs`

新增 `scope_type`、global/plan constraint、`activity_plans.availability_policy`、revision column/index。既有 null plan rows backfill global，非 null backfill plan；migration preflight 明列異常資料查詢。

## Task 45: 建立 time segment pure helpers

**Files:**
- Create: `apps/web/src/lib/midao/availability-segments.mjs`
- Create: `apps/web/tests/unit/midao-availability-segments.test.mjs`

固定 segments：08–12、12–18、18–22；custom overlap/invalid range；Asia/Taipei date conversion；segments→single-day rules。

## Task 46: 收斂 plan availability policy

**Files:**
- Create: `apps/web/src/lib/availability-v2/plan-availability-policy.ts`
- Modify: `apps/web/src/lib/availability-v2/effective-availability-resolver.ts`
- Modify: consumers found by search before editing
- Test: `apps/web/tests/unit/midao-plan-availability-policy.test.mjs`
- Regression: existing slot/effective availability focused suites

Pure resolver：scheduled bypass；inherit global；restrict intersection；closed none。Guide preview、traveler slots、calendar 全部委派同一 helper。

## Task 47: 建立 calendar gateway/resolver

**Files:**
- Create: `apps/web/src/lib/db-midao-calendar.mjs`
- Create: `apps/web/src/lib/midao/calendar-projection.ts`
- Create: `apps/web/src/lib/midao/calendar-resolver.ts`
- Create: `apps/web/tests/api/midao-calendar-gateway.test.mjs`

只抓一個月；合併 rules、bookings、pending requests、external holds、blackouts；不物化另一張 calendar table。

## Task 48: 建立 atomic day availability command

**Files:**
- Create: `supabase/migrations/20260723041000_midao_atomic_day_availability.sql`
- Create: `apps/web/tests/api/midao-day-availability-command.test.mjs`

Revision CAS；transaction replace 該日 global rules；回 revision。此 migration 獨立新增，禁止修改既有 command migrations。

## Task 49: 建立 calendar APIs

**Files:**
- Create: `apps/web/app/api/v2/guide/calendar/route.ts`
- Create: `apps/web/app/api/v2/guide/calendar/days/[date]/availability/route.ts`
- Create: `apps/web/tests/api/midao-calendar.test.mjs`

測 month validation、401/404/409/422、effective reasons、scheduled bypass。

## Task 50: 建立 calendar UI

**Files:**
- Create: `apps/web/src/features/midao/calendar/CalendarScreen.tsx`
- Create: `apps/web/src/features/midao/calendar/MonthGrid.tsx`
- Create: `apps/web/src/features/midao/calendar/CalendarLegend.tsx`
- Create: `apps/web/src/features/midao/calendar/DayAgenda.tsx`
- Create: `apps/web/src/features/midao/calendar/DayAvailabilityEditor.tsx`
- Create: `apps/web/src/features/midao/calendar/AvailabilitySegmentButton.tsx`
- Create: `apps/web/src/features/midao/calendar/CustomTimeRangeEditor.tsx`
- Test: `apps/web/e2e/midao-calendar.spec.ts`

測 month nav、today、day selection、segments、custom、conflict recovery、stale read disables mutation、mobile overflow。

## Package 5 gate

Calendar API/E2E、existing availability focused regression、typecheck。Fresh reviewer 比對 traveler slots 與 calendar 同一 resolver output。

---

# Package 6 — Public Page、我的頁面與 Cutover

## Task 51: 擴充 public guide projector

**Files:**
- Modify: `apps/web/src/lib/guide-shop.mjs`
- Create: `apps/web/src/lib/midao/public-guide-resolver.ts`
- Create: `apps/web/tests/unit/midao-public-guide-projection.test.mjs`

重用既有公開欄位投影與 active plans；加入 inquiryEnabled、questions public schema；assert 無銀行/notification/private contact。

## Task 52: 建立 public guide V2 API

**Files:**
- Create: `apps/web/app/api/v2/public/guides/[slug]/route.ts`
- Create: `apps/web/tests/api/midao-public-guide.test.mjs`

公開成功 response 可 cache；未發布 404 不 cache；只回 published activities＋active plans。

## Task 53: 整合 canonical `/guides/[slug]`

**Files:**
- Modify: `apps/web/app/[locale]/guides/[slug]/page.tsx`
- Create: `apps/web/src/components/guide/MidaoServiceCards.tsx`
- Create: `apps/web/src/components/guide/MidaoInquiryForm.tsx`
- Test: `apps/web/e2e/midao-public-page.spec.ts`

保留 metadata、JSON-LD、i18n、reviews、ISR；新增服務卡與 booking/LINE inquiry CTA。未登入 inquiry 走 login safe next。

## Task 54: 建立 Midao 公開頁管理

**Files:**
- Create: `apps/web/src/features/midao/profile/PublicPageManagerScreen.tsx`
- Create: `apps/web/src/features/midao/profile/PublicPagePreviewCard.tsx`
- Create: `apps/web/src/features/midao/profile/FeaturedServicesPreview.tsx`
- Create: `apps/web/src/features/midao/profile/PublicPageShareActions.tsx`
- Create: `apps/web/src/features/midao/profile/PublicPageQrDownload.tsx`
- Create: `apps/web/app/(non-locale)/midao/me/public-page/page.tsx`
- Create: `apps/web/app/api/v2/guide/public-page-preview/route.ts`
- Test: `apps/web/e2e/midao-public-page.spec.ts`

QR 只含 canonical URL；preview no-store；share fallback copy。

## Task 55: 將既有次要功能放進 `/midao/me`

**Files:**
- Create routes under `apps/web/app/(non-locale)/midao/me/{messages,schedules,payouts,reviews,redeem,helpers,settings}/page.tsx`
- Extract reusable feature components from corresponding `apps/web/app/(non-locale)/guide/**` pages when needed
- Test: `apps/web/e2e/midao-me-navigation.spec.ts`

不得 iframe；先抽 component，再由新舊 page 共用。每次只搬一項並跑原 E2E focused regression。

## Task 56: 建立 legacy service mutation backend-mode guard

**Files:**
- Create: `apps/web/src/lib/midao/backend-mode-guard.mjs`
- Modify only service/plan mutation routes under `apps/web/app/api/guide/activities/**`
- Test: `apps/web/tests/api/midao-legacy-service-write-guard.test.mjs`

Midao guide 的舊 activity/plan POST/PUT/submit 回 `409 BACKEND_MODE_MISMATCH`；legacy guide 不受影響。Read routes仍可用。不改 middleware。

## Task 57: 建立 shop temporary redirect

**Files:**
- Modify: `apps/web/app/(non-locale)/guides/[slug]/shop/page.tsx`
- Preserve initially: `shop/book`、`shop/orders` until canonical booking/order links verified
- Test: `apps/web/tests/ui/midao-shop-redirect.test.mjs`

第一階段使用 temporary redirect；production soak 完成後另 PR 改 permanent redirect。不得提前破壞既有深連結。

## Task 58: 建立 feature flags 與入口切換

**Files:**
- Modify: `apps/web/src/config/feature-flags.mjs`
- Modify login UI consuming `redirectTo`
- Test: `apps/web/tests/api/midao-backend-kill-switch.test.mjs`
- Test: `apps/web/e2e/midao-backend-routing.spec.ts`

Flags：`MIDAO_BACKEND_ENABLED`、`MIDAO_BACKEND_MUTATIONS_ENABLED`、`MIDAO_BACKEND_MODE_SWITCH_ENABLED`。Mutation off時read保留、write明確fail-closed；forward mode rollout另受mode-switch gate，rollback不受三個flags阻擋。

## Package 6 gate

Public page SEO/i18n/E2E、me navigation、legacy write guard、kill switch、typecheck、mobile/desktop screenshot。

---

# Package 7 — Cross-cutting Verification and Cutover

## Task 59: 建立 notification outbox consumer

**Files:**
- Use existing schema: `supabase/migrations/20260723001000_midao_notification_outbox.sql`
- Create: `apps/web/src/lib/db-midao-notification-outbox.mjs`
- Create: `apps/web/app/api/internal/midao/notification-outbox/route.ts`
- Create: `apps/web/tests/api/midao-notification-outbox.test.mjs`

測 claim/retry/delivered/failed、attempt limit、PII-minimal payload、internal auth。發送 resolver重用站內/Email/LINE；不得把 client share 當 server delivered。

## Task 60: 建立 expiry sweeps

**Files:**
- Create: `apps/web/app/api/internal/midao/inquiry-expiry-sweep/route.ts`
- Create: `apps/web/app/api/internal/midao/booking-confirmation-expiry-sweep/route.ts`
- Create: `apps/web/tests/api/midao-expiry-sweeps.test.mjs`

Expired confirmation 釋放 hold；sweep 冪等；不取消已付款或已確認 booking。

## Task 61: 建立 deterministic visual fixtures

**Files:**
- Create: `apps/web/e2e/fixtures/midao/home.json`
- Create: `apps/web/e2e/fixtures/midao/requests.json`
- Create: `apps/web/e2e/fixtures/midao/request-detail.json`
- Create: `apps/web/e2e/fixtures/midao/calendar.json`
- Create: `apps/web/e2e/fixtures/midao/services.json`
- Create: `apps/web/e2e/fixtures/midao/service-draft.json`
- Create: `apps/web/e2e/fixtures/midao/public-page.json`
- Create: `apps/web/e2e/midao-visual-mobile.spec.ts`
- Create: `apps/web/e2e/midao-visual-desktop.spec.ts`

Capture 390 × 844 and 1440 × 1000. 逐頁以 `docs/superpowers/assets/midao-reference/01-home.jpg` 至 `07-public-page.jpg` 為固定 baseline；reference comparison excludes phone chrome。每輪只修 top 3–5 mismatch。

## Task 62: 跑 package 全套與完整 CI equivalent

Targeted package checks先完成，再依序執行四個受追蹤背景工作；每個都有明確 timeout 且必須各自 exit 0：

```bash
timeout --signal=TERM 570s env NODE_ENV=test \
  GUIDE_SESSION_SECRET='midao-local-test-secret-at-least-32-bytes' \
  NODE_OPTIONS='--experimental-strip-types' \
  .claude/hooks/run-checks.sh --all
timeout --signal=TERM 570s node scripts/testing/run-midao-ci-command.mjs lint
timeout --signal=TERM 570s node scripts/testing/run-midao-ci-command.mjs typecheck
timeout --signal=TERM 570s node scripts/testing/run-midao-ci-command.mjs build
```

第一條保存repo harness evidence；其餘三條各保存exact wrapper argv、mode、allowlisted env names、sanitized child argv、HEAD/tree SHA、exit與sanitized log digest，不保存secret values。以上命令一律使用 `terminal(background=true, notify_on_complete=true)`；主機資源不足時可以分開跑，但不得省略，也不得用其中一項綠燈代替全部。若單項超過570秒，視為異常並先診斷，不盲目放大timeout。

## Task 63: Fresh-context spec review

Reviewer 只拿：設計 spec、implementation plan、diff、AC。必做 read-back、targeted tests、E2E、逐條 PASS/FAIL。FAIL 回實作者修正，再由 fresh reviewer 重驗。

## Task 64: PR 與 production-shaped verification

1. push 前 branch hygiene。
2. 開 PR；記錄 checks URLs。
3. CI conclusion=success 才可 merge。
4. Merge 後確認 production SHA。
5. 以測試 guide 開 `backend_mode=midao`。
6. 驗證七頁、request、inquiry、publish、calendar、admin impersonation。
7. 不跑真人付款；checkout 只驗到安全邊界。
8. 寫 `docs/operations/qa-reports/`，含 URL、SHA、Asia/Taipei 時間與證據。

## Task 65: 灰度與 rollback drill

每批 guide 對帳：requests、services、calendar effective slots、booking/order IDs、error rate。演練：mutation kill switch off → mode legacy → bump session version → 重新登入舊後台。不得反轉已成立 booking/order/payment。

---

# Definition of Done

- [ ] 七張手機 UI 依 reference 比對並附 actual screenshots。
- [ ] 桌面雙欄／三欄可用。
- [ ] 所有既有導遊功能由 `/midao/me` 可達。
- [ ] bookingId/orderId/inquiryId 全程分離。
- [ ] request approval 為單一 transaction。
- [ ] inquiry 併發轉單只產生一筆 booking。
- [ ] traveler confirmation gate 阻擋未接受 inquiry quote 的 checkout。
- [ ] LINE inquiry 不進 `booking_type` enum。
- [ ] 服務直接發布有 immutable version 與 admin restore。
- [ ] calendar 與 traveler slots 共用 effective resolver。
- [ ] Midao/legacy write mode fail-closed。
- [ ] 401/404/409/422/429/500 UX 實測。
- [ ] targeted tests、typecheck、lint、full test、build、Playwright 全綠。
- [ ] production migration 未經授權不套用。
- [ ] PR CI、merge SHA、production SHA 與 QA evidence 完整。
