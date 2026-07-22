# Issue #1756 — Midao Foundation + Shell TDD Micro-plan

> **Status:** Draft for fresh-context review. Do not implement until review PASS and issue #1756 is changed to `status:ready + agent:now`.
>
> **Execution skill:** `subagent-driven-development`; one fresh implementer per task, then independent spec and quality review.
>
> **Parent:** Epic #1755
>
> **Design:** `docs/superpowers/specs/2026-07-22-midao-backend-design.md`
>
> **Master roadmap:** `docs/plans/2026-07-22-midao-backend-implementation.md`

## Goal

建立 Midao 可安全開工的共同地基與第一個可導航 shell：

- additive backend-mode、outbox、durable idempotency schema；
- atomic admin backend-mode switch；
- guide HMAC session version、canonical runtime DB guard、kill switches；
- signed admin-impersonation actor audit；
- V2 query/command wrapper；
- login/impersonation canonical redirect；
- Brand Book tokens、五項導航、mobile/desktop shell、loading/error/empty skeleton；
- 真實 local Postgres migration/RPC integration gate；
- 能通過 server layout HMAC＋DB guard 的真實 Playwright guide session。

## Explicit non-goals

- 不實作 home/requests/services/inquiry/calendar/public-page business screens。
- 不加 legacy mutation fences；各領域在對應 package 收斂，#1756 只提供可重用的 mode-fence helper。
- 不改 `apps/web/middleware.ts`；所有 `/midao` page/API guard 走 server boundary。
- 不套 production migration、不執行 production SQL、不切正式 guide mode。
- 不 push、開 PR、merge 或 deploy，除非使用者另行批准。

## Frozen/high-risk boundaries

- 禁止修改：`apps/web/middleware.ts`、既有 migrations、legacy orders/payments、protected E2E、`CLAUDE.md`、`.claude/**`。
- 高風險但本 package 可改：`apps/web/src/lib/guide-auth.ts`、guide login/session、admin impersonation route、Playwright config/helpers。
- 新 migration 時間戳固定且單調：
  - `20260723000000_midao_backend_mode.sql`
  - `20260723001000_midao_notification_outbox.sql`
  - `20260723002000_midao_idempotency_records.sql`
  - `20260723002500_midao_audit_events.sql`
  - `20260723003000_midao_atomic_backend_mode_switch.sql`

## TDD/evidence protocol for every code commit

1. 先只寫 test，執行 focused command。
2. RED 必須因需求尚未存在而失敗；syntax/import/path/0 tests 不算。
3. 寫最小 production change。
4. focused test GREEN。
5. Commit 前執行 task 明列的 `.claude/hooks/run-checks.sh` command，產生新鮮 evidence。
6. `git diff --check`＋read-back diff。
7. 才可 commit。

Playwright、Supabase reset、build、full suites一律用 tracked background＋`timeout --signal=TERM 570s`。

---

# Phase A — Preflight and baselines

## Task A1: 建立 fresh implementation worktree與 worklog anchor

**Prerequisite:** 本 micro-plan fresh review PASS；#1756 已成為唯一 `agent:now + status:ready`。

**Commands:**

```bash
timeout --signal=TERM 570s git fetch --prune origin
git worktree add /root/.hermes/worktrees/tour-platform/issue1756-midao-foundation \
  -b feat/issue-1756-midao-foundation origin/main
```

`git fetch/worktree add` 使用 tracked background。確認：

```bash
git status --short --branch
git rev-parse HEAD
git merge-base --is-ancestor origin/main HEAD
```

**Files:**
- Modify: `docs/operations/worklogs/issue1755.md`
- Create: `docs/operations/worklogs/issue1756.md`

Worklog 記錄 issue、branch、base SHA、plan path、non-goals、current task。Docs-only checkpoint commit：

```bash
git add docs/operations/worklogs/issue1755.md docs/operations/worklogs/issue1756.md
git diff --cached --check
git commit -m "docs: 建立 Midao foundation 工作紀錄"
```

## Task A2: 執行既有 auth/flag/impersonation baseline

**No code changes.**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs \
  apps/web/tests/guide-auth.test.mjs \
  apps/web/tests/security/guide-auth-env.test.mjs \
  apps/web/tests/api/admin-guide-impersonation.test.mjs
```

Expected：四支 existing focused tests PASS。若 baseline red，停止並先回報，不把既有失敗混入本 package。

---

# Phase B — Foundation schema

## Task B1: backend_mode migration — RED/GREEN source contract

**Files:**
- Create: `apps/web/tests/api/midao-backend-mode-migration.test.mjs`
- Create: `supabase/migrations/20260723000000_midao_backend_mode.sql`

**RED test assertions:**

```js
assert.match(sql, /ADD COLUMN IF NOT EXISTS backend_mode TEXT NOT NULL DEFAULT 'legacy'/i);
assert.match(sql, /backend_mode IN \('legacy', 'midao'\)/i);
assert.match(sql, /CREATE INDEX IF NOT EXISTS/i);
assert.match(sql, /COMMENT ON COLUMN guide_profiles\.backend_mode/i);
```

**RED command:**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-backend-mode-migration.test.mjs
```

Expected RED：migration file missing。

**Minimal GREEN:** additive column、named check constraint、mode index、comment。不得修改 `guide_session_version` 或既有 migration。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-backend-mode-migration.test.mjs
.claude/hooks/run-checks.sh apps/web/tests/api/midao-backend-mode-migration.test.mjs
```

**Commit:**

```bash
git add apps/web/tests/api/midao-backend-mode-migration.test.mjs \
  supabase/migrations/20260723000000_midao_backend_mode.sql
git diff --cached --check
git commit -m "feat: 新增 Midao 後台模式欄位"
```

## Task B2: notification outbox migration — RED/GREEN source contract

**Files:**
- Create: `apps/web/tests/api/midao-notification-outbox-migration.test.mjs`
- Create: `supabase/migrations/20260723001000_midao_notification_outbox.sql`

**Contract:**

```text
event_name
aggregate_type
aggregate_id
payload
status pending|processing|delivered|failed
attempt_count
next_attempt_at
last_error_code
created_at
delivered_at
```

Migration 同時建立 claim index、RLS enabled、revoke anon/authenticated、service_role grants。Payload comment 明記不存完整 PII／payment secrets。

**RED:**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-notification-outbox-migration.test.mjs
```

Expected RED：migration missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-notification-outbox-migration.test.mjs
.claude/hooks/run-checks.sh apps/web/tests/api/midao-notification-outbox-migration.test.mjs
```

**Commit:** `feat: 建立 Midao 通知 outbox schema`。

## Task B3: durable idempotency migration — RED/GREEN source contract

**Files:**
- Create: `apps/web/tests/api/midao-idempotency-migration.test.mjs`
- Create: `supabase/migrations/20260723002000_midao_idempotency_records.sql`

**RED assertions:** actor type/ID、command name、key、request hash、response status/body、resource、created/expires、unique `(actor_type, actor_id, command_name, idempotency_key)`、expiry index、RLS＋service-role-only grants。

**RED:**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-idempotency-migration.test.mjs
```

Expected RED：migration missing。

**Minimal GREEN:** response snapshot comment 必須禁止 raw confirmation token、cookie、secret 與不必要 PII。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-idempotency-migration.test.mjs
.claude/hooks/run-checks.sh apps/web/tests/api/midao-idempotency-migration.test.mjs
```

**Commit:** `feat: 建立 Midao durable idempotency schema`。

## Task B4: transactional audit migration — RED/GREEN source contract

**Files:**
- Create: `apps/web/tests/api/midao-audit-events-migration.test.mjs`
- Create: `supabase/migrations/20260723002500_midao_audit_events.sql`

**RED assertions:** `midao_audit_events`含 actor type/ID、guide、action、resource、request ID、reason、metadata、created_at；action/request與 guide時間 indexes；RLS enabled；anon/authenticated無權；service_role最小 grants；metadata comment禁止 token/cookie/payment/完整旅客 PII。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-audit-events-migration.test.mjs
```

Expected RED：migration missing。

**Minimal GREEN:** 建立專用 transactional table；不得引用 repo migration中不存在的 `audit_logs`，也不得把 transaction audit委託給 best-effort app helper。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-audit-events-migration.test.mjs
.claude/hooks/run-checks.sh apps/web/tests/api/midao-audit-events-migration.test.mjs
```

**Commit:** `feat: 建立 Midao transactional audit schema`。

---

# Phase C — Session, actor and runtime access

## Task C1: 抽離 shared guide-session crypto且保持行為零變更

**Files:**
- Create: `apps/web/src/lib/guide-session-crypto.ts`
- Modify: `apps/web/src/lib/guide-auth.ts`
- Create: `apps/web/tests/api/guide-session-crypto.test.mjs`
- Reuse regression: existing guide-auth tests found by filename search

**RED:** 先測 domain-separated `signGuideSession(guideId, version)`／`verifyGuideSessionSignature()`，production secret 少於 32 chars fail closed，non-production configured secret deterministic。

```bash
node --test --test-concurrency=1 apps/web/tests/api/guide-session-crypto.test.mjs
```

Expected RED：module missing。

**Minimal GREEN:** 將既有 secret resolution與 HMAC 搬進 shared module；guide token payload/format不變。不得匯出 raw secret。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/guide-session-crypto.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/guide-session-crypto.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs
```

**Commit:** `refactor: 抽離導遊 session 簽章工具`。

## Task C2: verifyGuideSession 回傳 signed sessionVersion

**Files:**
- Modify: `apps/web/src/lib/guide-auth.ts`
- Create: `apps/web/tests/api/midao-guide-session-version.test.mjs`

**RED:** valid token version=7 must yield `session.sessionVersion===7`; tampered version/signature returns null；token仍三段。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-guide-session-version.test.mjs
```

Expected RED：payload 尚無 sessionVersion。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-guide-session-version.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-guide-session-version.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs
```

**Commit:** `feat: 暴露導遊 signed session version`。

## Task C3: Midao feature flags default-off

**Files:**
- Modify: `apps/web/src/config/feature-flags.mjs`
- Create: `apps/web/tests/unit/midao-feature-flags.test.mjs`

**RED:** `isMidaoBackendEnabled()` 與 `isMidaoBackendMutationsEnabled()` default false；只接受 existing truthy contract；mutation enabled 不能隱含 backend enabled。

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-feature-flags.test.mjs
```

Expected RED：exports missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-feature-flags.test.mjs
.claude/hooks/run-checks.sh apps/web/tests/unit/midao-feature-flags.test.mjs
```

**Commit:** `feat: 新增 Midao 後台 kill switches`。

## Task C4: signed impersonation actor cookie

**Files:**
- Create: `apps/web/src/lib/midao/impersonation-actor.ts`
- Modify: `apps/web/app/api/v2/admin/guides/[guideId]/impersonate/route.ts`
- Modify: `apps/web/app/api/guide/auth/session/route.ts`（logout clear）
- Create: `apps/web/tests/api/midao-impersonation-actor.test.mjs`

**RED cases:**

- HMAC-signed HttpOnly cookie round-trip：admin email、target guide ID、issuedAt、expiresAt。
- target guide mismatch／tampering／expiry → invalid。
- production cookie Secure；all environments HttpOnly/SameSite=Lax。
- impersonation route actor 只取 `pickAdminCredentials(request).email`，不接受 body actor。
- logout 清 signed actor cookie與可見 `guide_impersonation` cookie。
- signed value不放 admin token。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-impersonation-actor.test.mjs
```

Expected RED：module/cookie missing。

**Minimal GREEN:** 使用 shared guide-session crypto 的 domain-separated HMAC，不重複 secret resolver。保留既有 banner cookie。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-impersonation-actor.test.mjs \
  apps/web/tests/api/admin-guide-impersonation.test.mjs
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-impersonation-actor.test.mjs \
  apps/web/tests/api/admin-guide-impersonation.test.mjs
```

**Commit:** `feat: 保存可驗證的管理員代入 actor`。

## Task C5: canonical guide runtime access gateway

**Files:**
- Create: `apps/web/src/lib/db-midao-runtime-access.mjs`
- Create: `apps/web/src/lib/midao/canonical-guide-session.ts`
- Create: `apps/web/tests/api/midao-runtime-access-gateway.test.mjs`

**RED cases:**

- DB projection明列 `backend_mode, guide_session_version, verification_status`。
- HMAC invalid → 401。
- token version != DB version → `SESSION_STALE` 401。
- verification != approved → `GUIDE_NOT_ACTIVE` 403。
- backend flag off → `MIDAO_DISABLED` 404/503（page/API由 caller映射）。
- mode != midao → `BACKEND_MODE_MISMATCH` 409。
- valid signed impersonation → actorType admin／actorId verified email。
- forged actor cookie → 401；不能退回 guide actor。
- normal guide → actorType guide／actorId guide ID。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-runtime-access-gateway.test.mjs
```

Expected RED：modules missing。

**Minimal GREEN exports:**

```text
getGuideRuntimeAccessDb({ guideId })
verifyCanonicalGuideSession(request, { requireMode })
assertMidaoRuntimeAccess({ session, runtime, flags, impersonation })
```

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-runtime-access-gateway.test.mjs \
  apps/web/tests/api/midao-guide-session-version.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-runtime-access-gateway.test.mjs \
  apps/web/tests/api/midao-guide-session-version.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs
```

**Commit:** `feat: 建立 canonical Midao session guard`。

## Task C6: V2 guide query/command wrappers

**Files:**
- Create: `apps/web/src/lib/midao/with-guide-route.ts`
- Create: `apps/web/src/lib/midao/route-errors.ts`
- Create: `apps/web/src/lib/midao/idempotency.ts`
- Create: `apps/web/tests/api/midao-guide-route-wrapper.test.mjs`
- Reuse: `apps/web/src/lib/api-response.ts`
- Reuse: `apps/web/src/lib/route-error.ts`
- Reuse: `apps/web/src/lib/csrf.mjs`

**RED cases:**

- Query runs canonical guard before handler。
- Command additionally validates CSRF and `MIDAO_BACKEND_MUTATIONS_ENABLED` before handler。
- Required `Idempotency-Key` normalized；missing 422。
- `hashIdempotentRequest()` canonical JSON hash deterministic。
- Context contains guideId/name/sessionVersion/actorType/actorId/requestId/idempotencyKey/requestHash。
- ownership maps 404；mode conflict 409；mutation kill switch 503；unexpected error sanitized。
- response exclusively `jsonOk/jsonError` V2 envelope。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-guide-route-wrapper.test.mjs
```

Expected RED：wrapper missing。

**Minimal GREEN:** wrappers only establish boundary；actual durable record is written inside each future command RPC，not in route memory。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-guide-route-wrapper.test.mjs
.claude/hooks/run-checks.sh --typecheck apps/web/tests/api/midao-guide-route-wrapper.test.mjs
```

**Commit:** `feat: 建立 Midao V2 route boundary`。

---

# Phase D — Atomic backend mode switch and real SQL gate

## Task D1: atomic backend-mode switch RPC source contract

**Files:**
- Create: `apps/web/tests/api/midao-backend-mode-switch-migration.test.mjs`
- Create: `supabase/migrations/20260723003000_midao_atomic_backend_mode_switch.sql`

**RED assertions:**

- function `midao_switch_guide_backend_mode` exists；service-role only。
- `SELECT ... FOR UPDATE` guide profile。
- validate mode＋reason＋actor＋Idempotency-Key/request hash。
- 先 lock/claim `midao_idempotency_records`；同 key同 hash replay已去敏 response，不同 hash回 `IDEMPOTENCY_KEY_REUSED`。
- mode changed：update mode and `guide_session_version = guide_session_version + 1`。
- same mode：no version bump；第一次執行仍保存 canonical response，replay不重複 side effects。
- insert `midao_audit_events` action `guide_backend_mode_switched` with actor/reason/request ID。
- insert outbox in same transaction。
- unknown/inactive guide deterministic exception code。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-backend-mode-switch-migration.test.mjs
```

Expected RED：migration missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-backend-mode-switch-migration.test.mjs
.claude/hooks/run-checks.sh apps/web/tests/api/midao-backend-mode-switch-migration.test.mjs
```

**Commit:** `feat: 新增原子導遊後台模式切換 RPC`。

## Task D2: admin mode-switch gateway/API

**Files:**
- Create: `apps/web/src/lib/db-midao-backend-mode.mjs`
- Create: `apps/web/app/api/v2/admin/guides/[guideId]/backend-mode/route.ts`
- Create: `apps/web/tests/api/midao-backend-mode-switch.test.mjs`

**RED cases:** admin actor from verified credentials；body only backendMode/reason；`Idempotency-Key` required；invalid UUID/mode/reason；route只呼叫 RPC gateway；same key/same body replay，same key/different body 409；same-mode first call no version bump且不重複 audit/outbox；returns mode/version/redirectTo；CSRF remains admin middleware realm。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-backend-mode-switch.test.mjs
```

Expected RED：route/gateway missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-backend-mode-switch.test.mjs \
  apps/web/tests/api/midao-backend-mode-switch-migration.test.mjs
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-backend-mode-switch.test.mjs \
  apps/web/tests/api/midao-backend-mode-switch-migration.test.mjs
```

**Commit:** `feat: 建立原子導遊後台模式切換 API`。

## Task D3: local Postgres migration/RPC runtime integration

**Files:**
- Create: `apps/web/tests/integration/midao-foundation-postgres.test.mjs`
- Create: `scripts/testing/run-midao-foundation-postgres.sh`

**RED:** integration test先查 expected columns/functions/tables；在 migrations尚缺時對 disposable local Supabase DB失敗。

**Tracked RED command:**

```bash
timeout --signal=TERM 570s bash scripts/testing/run-midao-foundation-postgres.sh
```

Runner responsibilities：

1. `npx supabase start`（已啟動可重用）。
2. `npx supabase db reset --local`，真實編譯全部 migrations＋seed。
3. 設 `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`。
4. `node --test --test-concurrency=1 apps/web/tests/integration/midao-foundation-postgres.test.mjs`。
5. 不 stop 使用者既有 local Supabase；只在 runner 自己啟動且明確 owner 時清理。

Integration assertions：

- five foundation migrations真實 apply。
- backend mode default/check/index。
- outbox/idempotency/audit RLS enabled；anon/authenticated無 write grants。
- seeded Andy guide存在。
- mode switch legacy→midao：version恰加一，audit/outbox各一筆。
- same-mode replay：不再 bump，不重複 audit/outbox。
- invalid mode/reason rollback，row/audit/outbox皆不變。
- concurrent two switches使用兩個 pg clients；無 lost update，結果符合 row lock。
- idempotency unique constraint擋同 actor/command/key duplicate；不同 request hash由 domain helper映射 409。

**GREEN:** 實作 runner與 integration test後，使用 tracked background跑同命令，Expected PASS。

**Commit evidence:** 先跑 SQL integration，再：

```bash
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-backend-mode-migration.test.mjs \
  apps/web/tests/api/midao-notification-outbox-migration.test.mjs \
  apps/web/tests/api/midao-idempotency-migration.test.mjs \
  apps/web/tests/api/midao-audit-events-migration.test.mjs \
  apps/web/tests/api/midao-backend-mode-switch-migration.test.mjs \
  apps/web/tests/api/midao-backend-mode-switch.test.mjs
```

**Commit:** `test: 驗證 Midao foundation Postgres contracts`。

---

# Phase E — Login redirects and E2E-auth infrastructure

## Task E1: login/impersonation canonical redirect contract

**Files:**
- Modify: `apps/web/src/lib/guide-auth-session-supabase.ts`
- Modify: `apps/web/app/api/guide/auth/session/route.ts`
- Modify: `apps/web/app/api/v2/admin/guides/[guideId]/impersonate/route.ts`
- Modify: `apps/web/app/(non-locale)/guide/login/page.tsx`
- Create: `apps/web/tests/api/midao-guide-login-redirect.test.mjs`
- Create: `apps/web/tests/api/midao-guide-impersonation-redirect.test.mjs`

**RED cases:** regular/invite login select backend mode；response `redirectTo`；login UI consumes response；safe next only within canonical backend；first-time behavior documented and mode-consistent；impersonation response/cookies use target mode/version；actor cookie signed。

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-guide-login-redirect.test.mjs \
  apps/web/tests/api/midao-guide-impersonation-redirect.test.mjs
```

Expected RED：backend_mode/redirectTo missing，UI ignores response。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-guide-login-redirect.test.mjs \
  apps/web/tests/api/midao-guide-impersonation-redirect.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs \
  apps/web/tests/api/admin-guide-impersonation.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-guide-login-redirect.test.mjs \
  apps/web/tests/api/midao-guide-impersonation-redirect.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs \
  apps/web/tests/api/admin-guide-impersonation.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs
```

**Commit:** `feat: 依 canonical mode 導向導遊後台`。

## Task E2: 建立真實 Midao E2E guide session helper

**Problem fixed:** existing `setGuideSession()` only has fake 64-char signature and cannot pass server layout HMAC/DB guard。

**Files:**
- Modify: `supabase/seed.sql`（local-only second guide fixture）
- Modify: `apps/web/e2e/helpers.ts`
- Modify: `apps/web/playwright.config.ts`
- Create: `scripts/testing/run-midao-e2e.sh`
- Create: `apps/web/tests/security/midao-e2e-auth-seam.test.mjs`

**Fixture:** 在 `supabase/seed.sql` 新增 local-only user `88888888-8888-4888-8888-888888888888` 與 guide `99999999-9999-4999-8999-999999999999`，slug `midao-e2e-guide`、`backend_mode='midao'`、`guide_session_version=1`、approved。不得改 Andy fixture mode。

**RED cases:**

- `setMidaoGuideSession()` 使用 Node crypto與 `GUIDE_SESSION_SECRET`產生真 HMAC，不使用 `'a'.repeat(64)`。
- Playwright webServer和helper共用相同 >=32-char non-production secret。
- runner從 `npx supabase status -o env`取得 local URL/anon/service-role env，再啟動 Playwright；不硬編 production key。
- production config不能啟用 test bypass；本方案沒有 runtime bypass cookie。
- helper token能被 `verifyGuideSession()`驗證。

```bash
node --test --test-concurrency=1 apps/web/tests/security/midao-e2e-auth-seam.test.mjs
```

Expected RED：helper/config/seed尚未提供真實 session。

**Minimal GREEN:** 保留既有 `setGuideSession()`供 legacy browser tests；新增 `setMidaoGuideSession()`專用真 HMAC＋seeded DB row。Runner只操作 local Supabase。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/security/midao-e2e-auth-seam.test.mjs
.claude/hooks/run-checks.sh --typecheck apps/web/tests/security/midao-e2e-auth-seam.test.mjs
```

再以 tracked background先跑 local Postgres runner，確認 seed/schema。

**Commit:** `test: 建立真實 Midao E2E guide session`。

---

# Phase F — Responsive shell

## Task F1: Brand Book tokens

**Files:**
- Create: `apps/web/src/features/midao/styles/tokens.css`
- Create: `apps/web/src/features/midao/styles/shell.css`
- Create: `apps/web/tests/ui/midao-brand-tokens.test.mjs`

**RED assertions:** Brand Book colors、Noto Serif TC headings、safe-area vars、44px target、focus-visible、reduced-motion。禁止 reference screenshot blue作主色。

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-brand-tokens.test.mjs
```

Expected RED：files missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-brand-tokens.test.mjs
.claude/hooks/run-checks.sh apps/web/tests/ui/midao-brand-tokens.test.mjs
```

**Commit:** `feat: 建立 Midao 品牌 token`。

## Task F2: five-item navigation model

**Files:**
- Create: `apps/web/src/features/midao/shell/nav-items.ts`
- Create: `apps/web/tests/unit/midao-nav-items.test.mjs`

**RED:** exact five labels/routes；nested matching；only one active；no secondary features in bottom nav。

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-nav-items.test.mjs
```

Expected RED：module missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-nav-items.test.mjs
.claude/hooks/run-checks.sh --typecheck apps/web/tests/unit/midao-nav-items.test.mjs
```

**Commit:** `feat: 定義 Midao 五項導航`。

## Task F3: shell components and a11y contract

**Files:**
- Create: `apps/web/src/features/midao/shell/MidaoShell.tsx`
- Create: `MidaoBottomNav.tsx`
- Create: `MidaoDesktopSidebar.tsx`
- Create: `MidaoPageHeader.tsx`
- Create: `MidaoImpersonationBanner.tsx`
- Create: `apps/web/tests/ui/midao-shell-contract.test.mjs`

**RED:** semantic nav、aria-current、touch target、safe area、mobile bottom nav、desktop sidebar breakpoint、banner rendered from verified actor state、content bottom padding。

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-shell-contract.test.mjs
```

Expected RED：components missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-shell-contract.test.mjs
.claude/hooks/run-checks.sh --typecheck apps/web/tests/ui/midao-shell-contract.test.mjs
```

**Commit:** `feat: 建立 Midao responsive shell`。

## Task F4: UI primitives and failure states

**Files:**
- Create: `apps/web/src/features/midao/ui/AppCard.tsx`
- Create: `StatusBadge.tsx`
- Create: `SegmentedTabs.tsx`
- Create: `LoadingSkeleton.tsx`
- Create: `EmptyState.tsx`
- Create: `InlineError.tsx`
- Create: `ConflictRecoverySheet.tsx`
- Create: `apps/web/tests/ui/midao-ui-primitives-a11y.test.mjs`

**RED:** accessible role/label、keyboard、status icon+text not color only、retry action、sheet focus behavior、skeleton aria-busy。

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-ui-primitives-a11y.test.mjs
```

Expected RED：components missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-ui-primitives-a11y.test.mjs
.claude/hooks/run-checks.sh --typecheck apps/web/tests/ui/midao-ui-primitives-a11y.test.mjs
```

**Commit:** `feat: 建立 Midao UI primitives`。

## Task F5: server layout/page-session guard

**Files:**
- Create: `apps/web/src/lib/midao/page-session.ts`
- Create: `apps/web/app/(non-locale)/midao/layout.tsx`
- Create: `loading.tsx`
- Create: `error.tsx`
- Create: `not-found.tsx`
- Create: `apps/web/tests/ui/midao-layout-auth-contract.test.mjs`

**RED:** server layout calls canonical guard；flag off notFound/controlled unavailable；no session redirect with safe relative next；legacy mode redirect legacy；valid Midao renders shell；verified impersonation shows banner；forged impersonation denied；no direct Supabase in page components。

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-layout-auth-contract.test.mjs
```

Expected RED：layout/helper missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/ui/midao-layout-auth-contract.test.mjs \
  apps/web/tests/api/midao-runtime-access-gateway.test.mjs
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/ui/midao-layout-auth-contract.test.mjs \
  apps/web/tests/api/midao-runtime-access-gateway.test.mjs
```

**Commit:** `feat: 建立 Midao page session guard`。

## Task F6: five route skeletons + real-auth Playwright

**Files:**
- Create: `apps/web/app/(non-locale)/midao/page.tsx`
- Create: `requests/page.tsx`
- Create: `calendar/page.tsx`
- Create: `services/page.tsx`
- Create: `me/page.tsx`
- Create: `apps/web/e2e/midao-navigation.spec.ts`

**RED Playwright:** 使用 `setMidaoGuideSession()`，先因 routes missing/redirect失敗。單一 spec 建立兩個 describe blocks，分別 `test.use({ viewport: { width: 390, height: 844 } })` 與 `{ width: 1440, height: 1000 }`；不新增全域 Playwright projects，避免讓既有全套 E2E倍跑。驗五 route、active item、mobile bottom nav、desktop sidebar、no horizontal overflow、banner fixture、keyboard nav。

**Tracked RED/GREEN command:**

```bash
timeout --signal=TERM 570s bash scripts/testing/run-midao-e2e.sh e2e/midao-navigation.spec.ts
```

Expected RED before pages；GREEN after minimal skeleton。不得用 `page.route()`繞過 server auth。

**Commit evidence:**

```bash
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/ui/midao-shell-contract.test.mjs \
  apps/web/tests/ui/midao-layout-auth-contract.test.mjs \
  apps/web/tests/security/midao-e2e-auth-seam.test.mjs
```

**Commit:** `feat: 建立 Midao 五頁入口`。

---

# Package gates

## Gate G1: focused Node/typecheck evidence

```bash
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-backend-mode-migration.test.mjs \
  apps/web/tests/api/midao-notification-outbox-migration.test.mjs \
  apps/web/tests/api/midao-idempotency-migration.test.mjs \
  apps/web/tests/api/midao-audit-events-migration.test.mjs \
  apps/web/tests/api/guide-session-crypto.test.mjs \
  apps/web/tests/api/midao-guide-session-version.test.mjs \
  apps/web/tests/unit/midao-feature-flags.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs \
  apps/web/tests/api/midao-runtime-access-gateway.test.mjs \
  apps/web/tests/api/midao-guide-route-wrapper.test.mjs \
  apps/web/tests/api/midao-backend-mode-switch-migration.test.mjs \
  apps/web/tests/api/midao-backend-mode-switch.test.mjs \
  apps/web/tests/api/midao-guide-login-redirect.test.mjs \
  apps/web/tests/api/midao-guide-impersonation-redirect.test.mjs \
  apps/web/tests/security/midao-e2e-auth-seam.test.mjs \
  apps/web/tests/ui/midao-brand-tokens.test.mjs \
  apps/web/tests/unit/midao-nav-items.test.mjs \
  apps/web/tests/ui/midao-shell-contract.test.mjs \
  apps/web/tests/ui/midao-ui-primitives-a11y.test.mjs \
  apps/web/tests/ui/midao-layout-auth-contract.test.mjs
```

Expected：exit 0、tests > 0、typecheck exit 0、evidence timestamp fresh。

## Gate G2: local Postgres runtime

Tracked background：

```bash
timeout --signal=TERM 570s bash scripts/testing/run-midao-foundation-postgres.sh
```

Expected：reset/migration compile/RLS/RPC/rollback/concurrency全部 PASS。

## Gate G3: real-auth Playwright

Tracked background：

```bash
timeout --signal=TERM 570s bash scripts/testing/run-midao-e2e.sh e2e/midao-navigation.spec.ts
```

Expected：spec 內 mobile＋desktop viewport blocks PASS；不是 fake middleware-only signature。

## Gate G4: lint/build

各自 tracked background：

```bash
timeout --signal=TERM 570s npm run lint
timeout --signal=TERM 570s npm run build
```

Expected：兩者 exit 0。

## Gate G5: independent review

Fresh spec reviewer逐條核對 #1756 AC、read-back migration/runtime guard/actor/E2E seam，並重跑 G1–G3。Fresh quality reviewer檢查 security、PII、duplication、test quality、no bypass。任一 FAIL 回實作者修正，之後由 fresh reviewer重驗。

## Definition of Done for #1756

- [ ] Five foundation migrations source-contract＋local runtime PASS。
- [ ] backend mode switch atomically updates mode/version/audit/outbox；same mode no duplicate effects。
- [ ] durable idempotency schema exists and is service-role-only。
- [ ] canonical guard checks HMAC/DB version/status/mode/flags。
- [ ] signed impersonation actor survives into route context；forgery denied；logout clears cookies。
- [ ] login/impersonation redirectTo consumed by UI。
- [ ] `/midao` server layout does not depend on frozen middleware。
- [ ] E2E uses real HMAC and seeded local DB row，no production bypass。
- [ ] five routes work on mobile/desktop with accessible shell。
- [ ] G1–G4 actual commands exit 0。
- [ ] Independent spec＋quality reviews PASS。
- [ ] Worklog/issue contain exact commands、exit codes、commit SHA、remaining blockers。
- [ ] No push/PR/merge/deploy/production mutation without separate authorization。
