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
- Brand Book tokens、五項導航、mobile/desktop shell、loading/error skeleton；
- 真實 local Postgres migration/RPC integration gate；
- 能通過 server layout HMAC＋DB guard 的真實 Playwright guide session。

## Architecture

新 `/midao` UI 位於 non-locale route group，page/layout只組裝feature screen；所有安全判斷集中於canonical guide-session boundary，所有新API經V2 query/command wrappers。Shared schema依序建立outbox、scoped durable idempotency與transactional audit，再由單一service-role RPC原子切換backend mode。Local Postgres與Playwright共用self-owned Supabase runner，禁止依賴production或前一個gate殘留狀態。

## Tech Stack

Next.js 15 App Router、React 19、TypeScript、Node 22 `node:test`、Supabase/PostgreSQL RPC與RLS、Playwright Chromium、CSS Brand Book tokens、Git worktrees與repo harness evidence。

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
5. Commit 前在固定 Node 22/test env下執行 task明列的 `.claude/hooks/run-checks.sh` command，產生新鮮 evidence。
6. `git add`後執行 `node scripts/testing/verify-staged-check-evidence.mjs`；它必須確認 Node 22、evidence exit=0、未逾30分鐘、沒有未 staged code diff，且 evidence時間不早於 staged code檔mtime。這是必要補強，因現有 frozen `bash-guard.sh`對 code-staged判斷反向，實際會提早放行。
7. `git diff --check`＋read-back staged diff。
8. 才可 commit。

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

**Node/dependency/test-env preflight（每個新 shell session重跑；不得假設 nvm存在）：**

```bash
NODE22_BIN="$(npx --yes node@22 -p 'process.execPath')"
export PATH="$(dirname "$NODE22_BIN"):$PATH"
test "$(node -p "process.versions.node.split('.')[0]")" = "22"
export NODE_ENV=test
export GUIDE_SESSION_SECRET='midao-local-test-secret-at-least-32-bytes'
export NODE_OPTIONS='--experimental-strip-types'
node --version
npm --version
```

若 fresh worktree缺 dependencies，以 tracked background執行：

```bash
timeout --signal=TERM 570s npm install
```

安裝完成後確認 `node_modules/typescript`存在。Local-only secret只用於非 production test process，不寫入 `.env`、log、worklog或commit。

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
NODE22_BIN="$(npx --yes node@22 -p 'process.execPath')"
export PATH="$(dirname "$NODE22_BIN"):$PATH"
export NODE_ENV=test
export GUIDE_SESSION_SECRET='midao-local-test-secret-at-least-32-bytes'
export NODE_OPTIONS='--experimental-strip-types'
node --test --test-concurrency=1 \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs \
  apps/web/tests/guide-auth.test.mjs \
  apps/web/tests/security/guide-auth-env.test.mjs \
  apps/web/tests/api/admin-guide-impersonation.test.mjs
```

Expected：38 tests PASS。此精確命令已於 design worktree實跑 38/38 PASS；fresh implementation worktree仍必須重跑。若 baseline red，停止並先回報，不把既有失敗混入本 package。

## Task A3: 建立 staged evidence verifier（補強 frozen hook）

**Files:**
- Create: `scripts/testing/verify-staged-check-evidence.mjs`
- Create: `apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs`

**RED:** pure validator以 injected nodeMajor/now/evidence/staged files/unstaged code測：Node非22、exit非0、>30分鐘、evidence早於staged code mtime、或仍有unstaged code diff都拒絕；docs-only staged可放行。

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs
```

Expected RED：module missing。

**Minimal GREEN:** CLI read `.claude/state/last-checks.json`、`git diff --cached --name-only`、`git diff --name-only`和 staged code working-tree mtimes；不得修改 `.claude/hooks/bash-guard.sh`。輸出不得包含 secret或完整 evidence log。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs
.claude/hooks/run-checks.sh apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs
git add scripts/testing/verify-staged-check-evidence.mjs apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs
```

**Commit:** `test: 補強 staged code evidence驗證`。

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

**RED assertions:** actor/command/scope/key/request hash、state `processing|completed`、nullable response直到completed、CHECK確保completed時response status/body皆非空、resource、created/locked/completed/expires、scoped unique key、expiry/stale-processing indexes、RLS＋service-role-only grants。不同guide scope可重用相同key；concurrent replay可等待claim owner完成，不讀placeholder response。

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

**Minimal GREEN:** 建立專用 transactional table；既有 `audit_logs`為 order-centric schema，缺 actor type、guide、resource與request ID，不得硬塞或把 transaction audit委託給 best-effort app helper。

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
- Reuse: `apps/web/tests/guide-auth.test.mjs`
- Reuse: `apps/web/tests/security/guide-auth-env.test.mjs`
- Reuse: `apps/web/tests/api/guide-auth-session-post-bounded.test.mjs`

**RED:** guide session legacy compatibility必須鎖死：`signGuideSession(guideId, version)`精確維持現有 HMAC message bytes `${guideId}:${sessionVersion}`；production secret少於32 chars fail closed，non-production configured secret deterministic。另提供 domain-separated signer只給新用途，guide token不得套 prefix。

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/guide-session-crypto.test.mjs \
  apps/web/tests/guide-auth.test.mjs
```

Expected RED：shared module missing；既有 `apps/web/tests/guide-auth.test.mjs`仍須GREEN，不得以使舊token失效換取抽離。

**Minimal GREEN:** 將既有 secret resolution與 guide HMAC搬進 shared module，簽章bytes/token format逐字不變；新增 `signDomainSeparatedValue('midao:impersonation-actor:v1', payload)`與 verify供actor使用。Actor signature不能驗成guide token，guide signature不能驗成actor。不匯出raw secret。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/guide-session-crypto.test.mjs \
  apps/web/tests/guide-auth.test.mjs \
  apps/web/tests/security/guide-auth-env.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/guide-session-crypto.test.mjs \
  apps/web/tests/guide-auth.test.mjs \
  apps/web/tests/security/guide-auth-env.test.mjs \
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
  apps/web/tests/guide-auth.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-guide-session-version.test.mjs \
  apps/web/tests/guide-auth.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs
```

**Commit:** `feat: 暴露導遊 signed session version`。

## Task C3: Midao feature flags default-off

**Files:**
- Modify: `apps/web/src/config/feature-flags.mjs`
- Create: `apps/web/tests/unit/midao-feature-flags.test.mjs`

**RED:** `isMidaoBackendEnabled()`、`isMidaoBackendMutationsEnabled()`、`isMidaoBackendModeSwitchEnabled()`皆default false，只接受existing truthy contract；三者互不隱含。Forward `legacy→midao`之後必須同時要求 backend＋mode-switch gates；rollback `midao→legacy`不得被mode-switch或mutation flag擋住。

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

## Task C4: signed impersonation actor codec/cookie

**Files:**
- Create: `apps/web/src/lib/midao/impersonation-actor.ts`
- Create: `apps/web/tests/api/midao-impersonation-actor.test.mjs`

**RED:** normalized admin email、target guide ID、issued/expiry的HMAC-signed HttpOnly cookie round-trip；target mismatch/tamper/expiry拒絕；production Secure、all env SameSite=Lax；actor domain不能驗成guide token，反向亦然；payload不含admin token。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-impersonation-actor.test.mjs
```

Expected RED：module/cookie codec missing。

**Minimal GREEN:** 重用shared domain-separated signer，不重複secret resolver；export create/verify/clear cookie helpers，不匯出raw secret。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-impersonation-actor.test.mjs \
  apps/web/tests/api/guide-session-crypto.test.mjs
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-impersonation-actor.test.mjs \
  apps/web/tests/api/guide-session-crypto.test.mjs
```

**Commit:** `feat: 建立可驗證的管理員代入actor cookie`。

## Task C4A: admin impersonation route signs canonical actor

**Files:**
- Modify: `apps/web/app/api/v2/admin/guides/[guideId]/impersonate/route.ts`
- Create: `apps/web/tests/api/midao-impersonation-route-actor.test.mjs`
- Reuse: `apps/web/tests/api/admin-guide-impersonation.test.mjs`

**RED:** actor只取 `pickAdminCredentials(request).email`後 `trim().toLowerCase()`；禁止body actor；成功同時下發signed actor與visible banner cookie；target/version仍canonical；existing admin middleware/CSRF/approved gate不變。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-impersonation-route-actor.test.mjs
```

Expected RED：route尚未簽actor cookie。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-impersonation-route-actor.test.mjs \
  apps/web/tests/api/admin-guide-impersonation.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-impersonation-route-actor.test.mjs \
  apps/web/tests/api/admin-guide-impersonation.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs
```

**Commit:** `feat: 代入route保存canonical admin actor`。

## Task C4B: ordinary login/logout clears impersonation identity

**Files:**
- Modify: `apps/web/app/api/guide/auth/session/route.ts`
- Create: `apps/web/tests/api/midao-guide-login-clears-impersonation.test.mjs`
- Reuse: `apps/web/tests/api/guide-auth-session-post-bounded.test.mjs`

**RED:** invite、regular email/password、legacy guideId三條非impersonation成功登入，都在重發guide session時清signed actor＋visible banner cookies；logout亦清。測「同target有效actor→未logout→普通登入」後只能建立guide actor。Error paths不誤清現有session。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-guide-login-clears-impersonation.test.mjs
```

Expected RED：普通登入尚未清actor/banner cookies。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-guide-login-clears-impersonation.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-guide-login-clears-impersonation.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs
```

**Commit:** `fix: 普通導遊登入清除代入身份`。

## Task C5: canonical guide runtime access gateway

**Files:**
- Create: `apps/web/src/lib/db-midao-runtime-access.mjs`
- Create: `apps/web/src/lib/midao/canonical-guide-session.ts`
- Create: `apps/web/tests/api/midao-runtime-access-gateway.test.mjs`

**RED cases:**

- DB projection明列 `display_name, backend_mode, guide_session_version, verification_status`；canonical `guideName`只取DB `display_name`，禁止從可改寫的 `guide_name` cookie建立route/audit context。
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
- Context contains guideId、canonical DB guideName、sessionVersion、actorType/actorId、requestId、idempotencyKey、requestHash；不得傳遞public cookie guideName。
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

- function `midao_switch_guide_backend_mode` exists；若用 `SECURITY DEFINER`，固定安全 `search_path`並schema-qualify所有objects。
- `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`；`GRANT EXECUTE ... TO service_role`。
- transaction順序固定：validate mode/reason/canonical actor/key/hash，設定 `scope_type='guide'`、`scope_id=targetGuideId` → claim/lock `midao_idempotency_records` → same-hash replay或different-hash deterministic conflict → `SELECT ... FOR UPDATE` guide profile → conditional mode/version update → audit → outbox →寫去敏response snapshot並把idempotency state改completed → commit。
- mode changed：`guide_session_version`恰加一，audit/outbox各一。
- fresh-key same-mode：不bump、不audit、不outbox，只保存canonical idempotent response；同key replay不產生任何side effect。
- unknown/inactive guide deterministic error，且idempotency狀態不留下半成品。

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

**RED cases:** admin actor from verified credentials且normalized；body only backendMode/reason；`Idempotency-Key` required；invalid UUID/mode/reason；route只呼叫RPC gateway。`legacy→midao`要求 `MIDAO_BACKEND_ENABLED=true`且 `MIDAO_BACKEND_MODE_SWITCH_ENABLED=true`，default-off回503；`midao→legacy` rollback即使backend/mutation/mode-switch flags全關仍允許。Same key/same body replay，same key/different body 409；fresh same-mode no version bump/audit/outbox；returns mode/version/redirectTo；CSRF remains admin middleware realm。

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

## Gate D3: local Postgres migration/RPC runtime verification（不是TDD RED）

**Files:**
- Create: `apps/web/tests/integration/midao-foundation-postgres.test.mjs`
- Create: `apps/web/tests/unit/midao-local-supabase-runner.test.mjs`
- Create: `scripts/testing/with-midao-local-supabase.mjs`
- Create: `scripts/testing/run-midao-foundation-postgres.sh`

這是B1–B4/D1完成後的production-shaped verification，不宣稱第一次執行是RED。Runner或test path missing不算RED；任何FAIL都阻擋package並回到對應migration/RPC task修正。

**Tracked command:**

```bash
timeout --signal=TERM 570s bash scripts/testing/run-midao-foundation-postgres.sh
```

**Runner必須可獨立重跑：**

1. `with-midao-local-supabase.mjs`固定Node 22/test env，確認Docker/Supabase CLI可用，接收 `--reset -- child-command`。
2. 若目前worktree的local stack已在跑，預設中止以免reset他人資料；只有明確 `MIDAO_REUSE_LOCAL_DB=1`才可重用。否則wrapper自行 `npx supabase start`並記ownership。
3. 對wrapper自有stack執行 `npx supabase db reset --local`，真實編譯全部 migrations＋seed。
4. 讀 `npx supabase status -o json`，用JSON parser逐鍵驗證並映射：`DB_URL→TEST_DATABASE_URL`、`API_URL→SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL`、`SERVICE_ROLE_KEY→SUPABASE_SERVICE_ROLE_KEY`、`ANON_KEY→NEXT_PUBLIC_SUPABASE_ANON_KEY`；禁止硬編、placeholder、`eval`或輸出keys。
5. 用 `pg`重試 `SELECT 1`至ready，不用blind sleep；用 sanitized child env執行傳入命令。
6. wrapper自己啟動的stack在exit/signal handler `npx supabase stop`，重用stack則不stop。Unit test以mocked subprocess/status JSON驗start/reset/env mapping/cleanup／secret redaction，不啟Docker。

**Integration fixture：** test在disposable reset DB建立固定user/guide rows，guide明列 `verification_status='approved'`、`backend_mode='legacy'`、known session version；不得依賴pending Andy seed。另建第二guide測key scope。

**精確assertions：**

- five foundation migrations真實apply；backend mode default/check/index。
- tables RLS enabled；`SET ROLE anon/authenticated`實際DML得到permission denied；service_role可透過RPC成功。
- `has_function_privilege()`證明PUBLIC/anon/authenticated無EXECUTE、service_role有EXECUTE；若SECURITY DEFINER，核對固定search_path。
- 單次legacy→midao：version只加一、audit/outbox/idempotency各一，response snapshot去敏。
- fresh-key same-mode：不bump、不audit、不outbox，但新增一筆canonical idempotency response。
- 故障注入rollback：local test暫掛一個會在outbox INSERT raise的trigger，再呼叫會改mode的RPC；assert profile/version、audit、outbox、idempotency全部維持呼叫前狀態，最後drop trigger。
- 兩clients以barrier同時用同key/same hash切同guide：兩者response完全相同，idempotency/audit/outbox/版本變更各只有一次，且有statement timeout避免deadlock。
- 兩clients同key/different hash：一成功、一個 deterministic `IDEMPOTENCY_KEY_REUSED`，只有winner side effects。
- 兩clients不同keys同時切同guide到相同mode：final mode=midao、version只加一、audit/outbox各一、兩筆idempotency canonical responses；fresh same-mode loser不產生business side effect。
- 不同guide可共用相同key，各自在actor/guide scope內成功。

**Commit evidence:** tracked SQL verification PASS後，再跑：

```bash
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/unit/midao-local-supabase-runner.test.mjs \
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

## Task E1: guide session API canonical redirect

**Files:**
- Modify: `apps/web/src/lib/guide-auth-session-supabase.ts`
- Modify: `apps/web/app/api/guide/auth/session/route.ts`
- Create: `apps/web/tests/api/midao-guide-login-api-redirect.test.mjs`

**RED:** invite、regular email/password、legacy guideId三條success path都從DB取canonical `backend_mode/display_name/guide_session_version`，回 `redirectTo`，並清殘留actor/banner cookies。Existing error/rate-limit/CSRF/password-upgrade不變。Midao new/returning guide皆回 `/midao`；legacy new/returning分別維持 `/guide/profile`、`/guide/dashboard`。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-guide-login-api-redirect.test.mjs
```

Expected RED：backend_mode/redirectTo/cookie clear尚不存在。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-guide-login-api-redirect.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs \
  apps/web/tests/guide-auth.test.mjs
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-guide-login-api-redirect.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs \
  apps/web/tests/guide-auth.test.mjs
```

**Commit:** `feat: 回傳 canonical導遊登入入口`。

## Task E2: guide login UI consumes server redirect

**Files:**
- Modify: `apps/web/app/(non-locale)/guide/login/page.tsx`
- Create: `apps/web/tests/ui/midao-guide-login-ui-redirect.test.mjs`

**RED:** success一律優先使用V2 response `data.redirectTo`；URL `next`只可在server redirect所屬realm內覆蓋，跨 `/guide`↔`/midao`、absolute、protocol-relative都拒絕。UI不可自行以invite硬編 `/guide/profile`。

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-guide-login-ui-redirect.test.mjs
```

Expected RED：UI仍忽略redirectTo。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-guide-login-ui-redirect.test.mjs
.claude/hooks/run-checks.sh --typecheck apps/web/tests/ui/midao-guide-login-ui-redirect.test.mjs
```

Browser-observable redirect在F10真實Playwright驗證。

**Commit:** `feat: 由server導向導遊登入後入口`。

## Task E3: admin impersonation canonical redirect

**Files:**
- Modify: `apps/web/app/api/v2/admin/guides/[guideId]/impersonate/route.ts`
- Create: `apps/web/tests/api/midao-guide-impersonation-redirect.test.mjs`

**RED:** approved target的canonical mode/version/display_name決定cookies與redirect；admin email normalized signed actor；legacy→guide dashboard，midao→midao root；既有admin middleware/CSRF/404/approved gate不變。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-guide-impersonation-redirect.test.mjs
```

Expected RED：canonical redirect/actor cookie missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-guide-impersonation-redirect.test.mjs \
  apps/web/tests/api/admin-guide-impersonation.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-guide-impersonation-redirect.test.mjs \
  apps/web/tests/api/admin-guide-impersonation.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs
```

**Commit:** `feat: 依canonical mode代入導遊後台`。

## Task E4: 建立真實 Midao E2E guide session helper

**Problem fixed:** existing `setGuideSession()` only has fake 64-char signature and cannot pass server layout HMAC/DB guard。

**Files:**
- Modify: `supabase/seed.sql`（local-only second guide fixture）
- Modify: `apps/web/e2e/helpers.ts`
- Modify: `apps/web/playwright.config.ts`
- Create: `scripts/testing/run-midao-e2e.sh`
- Create: `apps/web/tests/security/midao-e2e-auth-seam.test.mjs`

**Fixture:** 在 `supabase/seed.sql`新增local-only user `88888888-8888-4888-8888-888888888888`與guide `99999999-9999-4999-8999-999999999999`，slug `midao-e2e-guide`、email `midao-e2e@example.invalid`、`backend_mode='midao'`、`guide_session_version=1`、approved。`guide_password_hash`使用既有可驗證的deterministic legacy salt/hash，對應明確標註的non-production test password；首次普通登入可在disposable DB透明升級scrypt。不得改Andy fixture mode，不得使用真帳密。

**RED cases:**

- `setMidaoGuideSession()`直接重用shared `signGuideSession()`，維持legacy guide HMAC bytes，不複製演算法，也不使用 `'a'.repeat(64)`。
- 新增 `setMidaoImpersonationSession()`，重用actor cookie factory，建立真guide token＋真signed actor＋visible banner cookies。
- `playwright.config.ts`的managed webServer改為 `command: 'npm run dev'`＋explicit `env`，從runner child env傳入local Supabase URL/anon/service role與同一>=32-char test secret；移除hardcoded fake anon key。
- `run-midao-e2e.sh`每次都透過 `with-midao-local-supabase.mjs --reset -- npm run test:e2e -w @tour/web -- ...`，可在沒有殘留container時獨立start/reset/seed/map env/readiness/cleanup。
- production config不能啟用test bypass；本方案沒有runtime bypass cookie、production key或 `page.route()` auth繞過。
- security test round-trip helper token經 `verifyGuideSession()`成功，actor/guide cross-protocol signatures互斥，且config不洩漏keys。

```bash
node --test --test-concurrency=1 apps/web/tests/security/midao-e2e-auth-seam.test.mjs
```

Expected RED：helper/config/seed尚未提供真實 session。

**Minimal GREEN:** 保留既有 `setGuideSession()`供legacy browser tests；新增兩個Midao helpers，改managed webServer env，runner重用共用local Supabase wrapper。不得新增全域Playwright projects或production bypass。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/security/midao-e2e-auth-seam.test.mjs \
  apps/web/tests/unit/midao-local-supabase-runner.test.mjs
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/security/midao-e2e-auth-seam.test.mjs \
  apps/web/tests/unit/midao-local-supabase-runner.test.mjs
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

## Task F3: mobile bottom navigation

**Files:**
- Create: `apps/web/src/features/midao/shell/MidaoBottomNav.tsx`
- Create: `apps/web/tests/ui/midao-bottom-nav-contract.test.mjs`

**RED:** exactly five nav items、semantic nav/labels、`aria-current`、44px targets、safe-area bottom padding、nested active state。Node test只鎖結構/props/CSS wiring；實際viewport/keyboard在F9 Playwright。

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-bottom-nav-contract.test.mjs
```

Expected RED：component missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-bottom-nav-contract.test.mjs
.claude/hooks/run-checks.sh --typecheck apps/web/tests/ui/midao-bottom-nav-contract.test.mjs
```

**Commit:** `feat: 建立 Midao手機主導航`。

## Task F4: desktop sidebar and page header

**Files:**
- Create: `apps/web/src/features/midao/shell/MidaoDesktopSidebar.tsx`
- Create: `apps/web/src/features/midao/shell/MidaoPageHeader.tsx`
- Create: `apps/web/tests/ui/midao-desktop-navigation-contract.test.mjs`

**RED:** same nav model、semantic landmark、active state、header title/action slots；不得另建第二份routes。Responsive visibility只做CSS wiring contract，實際layout在F9。

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-desktop-navigation-contract.test.mjs
```

Expected RED：components missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-desktop-navigation-contract.test.mjs
.claude/hooks/run-checks.sh --typecheck apps/web/tests/ui/midao-desktop-navigation-contract.test.mjs
```

**Commit:** `feat: 建立 Midao桌面導航`。

## Task F5: verified impersonation banner

**Files:**
- Create: `apps/web/src/features/midao/shell/MidaoImpersonationBanner.tsx`
- Create: `apps/web/tests/ui/midao-impersonation-banner-contract.test.mjs`

**RED:** only verified actor state renders；顯示代入狀態、target guide、結束代入action；不顯完整admin email/token；normal guide無banner。Browser truth/forgery在F10。

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-impersonation-banner-contract.test.mjs
```

Expected RED：component missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-impersonation-banner-contract.test.mjs
.claude/hooks/run-checks.sh --typecheck apps/web/tests/ui/midao-impersonation-banner-contract.test.mjs
```

**Commit:** `feat: 顯示可信管理員代入狀態`。

## Task F6: shell composition and basic states

**Files:**
- Create: `apps/web/src/features/midao/shell/MidaoShell.tsx`
- Create: `apps/web/src/features/midao/ui/LoadingSkeleton.tsx`
- Create: `apps/web/src/features/midao/ui/InlineError.tsx`
- Create: `apps/web/tests/ui/midao-shell-composition.test.mjs`

**RED:** shell組合desktop/mobile nav、header、verified banner、main landmark與mobile content bottom padding；loading有`aria-busy`；error保留retry action。不要在本package預做SegmentedTabs、ConflictRecoverySheet或其他未使用primitives。

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-shell-composition.test.mjs
```

Expected RED：components missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-shell-composition.test.mjs
.claude/hooks/run-checks.sh --typecheck apps/web/tests/ui/midao-shell-composition.test.mjs
```

**Commit:** `feat: 組合 Midao responsive shell`。

## Task F7: page-session guard pure boundary

**Files:**
- Create: `apps/web/src/lib/midao/page-session.ts`
- Create: `apps/web/tests/api/midao-page-session.test.mjs`

**RED:** no HMAC/session、stale version、inactive guide、legacy mode、backend flag off、valid Midao、valid/forged impersonation的deterministic outcomes；guideName只來自DB。此task不建立React layout。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-page-session.test.mjs
```

Expected RED：helper missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-page-session.test.mjs \
  apps/web/tests/api/midao-runtime-access-gateway.test.mjs
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-page-session.test.mjs \
  apps/web/tests/api/midao-runtime-access-gateway.test.mjs
```

**Commit:** `feat: 建立 Midao page session boundary`。

## Task F8: server layout and five route skeletons

**Files:**
- Create: `apps/web/app/(non-locale)/midao/layout.tsx`
- Create: `apps/web/app/(non-locale)/midao/loading.tsx`
- Create: `apps/web/app/(non-locale)/midao/error.tsx`
- Create: `apps/web/app/(non-locale)/midao/not-found.tsx`
- Create: `apps/web/app/(non-locale)/midao/page.tsx`
- Create: `apps/web/app/(non-locale)/midao/requests/page.tsx`
- Create: `apps/web/app/(non-locale)/midao/calendar/page.tsx`
- Create: `apps/web/app/(non-locale)/midao/services/page.tsx`
- Create: `apps/web/app/(non-locale)/midao/me/page.tsx`
- Create: `apps/web/tests/ui/midao-layout-wiring.test.mjs`

**RED:** layout唯一呼叫page-session boundary並組shell；pages只組placeholder screen，不查Supabase；loading/error/not-found使用basic states；safe login next；無frozen middleware改動。Browser outcomes不由source test宣稱PASS。

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-layout-wiring.test.mjs
```

Expected RED：routes/layout missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/ui/midao-layout-wiring.test.mjs \
  apps/web/tests/api/midao-page-session.test.mjs \
  apps/web/tests/ui/midao-shell-composition.test.mjs
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/ui/midao-layout-wiring.test.mjs \
  apps/web/tests/api/midao-page-session.test.mjs \
  apps/web/tests/ui/midao-shell-composition.test.mjs
```

**Commit:** `feat: 建立 Midao五頁入口`。

## Task F9: real-auth responsive navigation Playwright

**Files:**
- Create: `apps/web/e2e/midao-navigation.spec.ts`

**RED Playwright:** 使用 `setMidaoGuideSession()`與真DB guide。單一spec兩個describe blocks，分別390×844與1440×1000；不新增全域projects。驗五route、active item、mobile/desktop visibility、no horizontal overflow、safe-area spacing、keyboard navigation、focus-visible與normal guide無banner。

```bash
timeout --signal=TERM 570s bash scripts/testing/run-midao-e2e.sh e2e/midao-navigation.spec.ts
```

Expected RED：在F3–F8前因UI/route缺失；實作後GREEN。不得用`page.route()`繞過server auth。

**Commit evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/unit/midao-nav-items.test.mjs \
  apps/web/tests/ui/midao-bottom-nav-contract.test.mjs \
  apps/web/tests/ui/midao-desktop-navigation-contract.test.mjs \
  apps/web/tests/ui/midao-shell-composition.test.mjs \
  apps/web/tests/ui/midao-layout-wiring.test.mjs
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/unit/midao-nav-items.test.mjs \
  apps/web/tests/ui/midao-layout-wiring.test.mjs
```

**Commit:** `test: 驗證 Midao responsive navigation`。

## Task F10: auth, redirect and impersonation Playwright

**Files:**
- Create: `apps/web/e2e/midao-auth-and-impersonation.spec.ts`

**RED/behavior:** no cookie→guide login＋safe next；legacy fake64-char signature不能通過；valid Midao HMAC通過；forged actor cookie拒絕；`setMidaoImpersonationSession()`顯示banner並可結束；先設signed actor、GET真CSRF，再用seeded local test account走真session POST普通登入，確認兩顆actor/banner cookies被清除且audit actor回guide；login UI可另以mocked成功API response驗same-realm `redirectTo` consumption，但不得mock `/midao` server auth。

```bash
timeout --signal=TERM 570s bash scripts/testing/run-midao-e2e.sh e2e/midao-auth-and-impersonation.spec.ts
```

Expected RED before auth/layout/UI wiring；GREEN後不得有auth bypass。

**Commit evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-guide-login-clears-impersonation.test.mjs \
  apps/web/tests/api/midao-guide-login-api-redirect.test.mjs \
  apps/web/tests/ui/midao-guide-login-ui-redirect.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs \
  apps/web/tests/api/midao-impersonation-route-actor.test.mjs \
  apps/web/tests/api/midao-page-session.test.mjs \
  apps/web/tests/security/midao-e2e-auth-seam.test.mjs
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-guide-login-clears-impersonation.test.mjs \
  apps/web/tests/api/midao-page-session.test.mjs \
  apps/web/tests/security/midao-e2e-auth-seam.test.mjs
```

**Commit:** `test: 驗證 Midao登入與代入邊界`。

---

# Package gates

## Gate G1: focused Node/typecheck evidence

```bash
test "$(node -p "process.versions.node.split('.')[0]")" = "22"
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs \
  apps/web/tests/unit/midao-local-supabase-runner.test.mjs \
  apps/web/tests/api/midao-backend-mode-migration.test.mjs \
  apps/web/tests/api/midao-notification-outbox-migration.test.mjs \
  apps/web/tests/api/midao-idempotency-migration.test.mjs \
  apps/web/tests/api/midao-audit-events-migration.test.mjs \
  apps/web/tests/api/guide-session-crypto.test.mjs \
  apps/web/tests/guide-auth.test.mjs \
  apps/web/tests/security/guide-auth-env.test.mjs \
  apps/web/tests/api/midao-guide-session-version.test.mjs \
  apps/web/tests/unit/midao-feature-flags.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs \
  apps/web/tests/api/midao-impersonation-route-actor.test.mjs \
  apps/web/tests/api/midao-guide-login-clears-impersonation.test.mjs \
  apps/web/tests/api/admin-guide-impersonation.test.mjs \
  apps/web/tests/api/midao-runtime-access-gateway.test.mjs \
  apps/web/tests/api/midao-guide-route-wrapper.test.mjs \
  apps/web/tests/api/midao-backend-mode-switch-migration.test.mjs \
  apps/web/tests/api/midao-backend-mode-switch.test.mjs \
  apps/web/tests/api/midao-guide-login-api-redirect.test.mjs \
  apps/web/tests/ui/midao-guide-login-ui-redirect.test.mjs \
  apps/web/tests/api/midao-guide-impersonation-redirect.test.mjs \
  apps/web/tests/security/midao-e2e-auth-seam.test.mjs \
  apps/web/tests/ui/midao-brand-tokens.test.mjs \
  apps/web/tests/unit/midao-nav-items.test.mjs \
  apps/web/tests/ui/midao-bottom-nav-contract.test.mjs \
  apps/web/tests/ui/midao-desktop-navigation-contract.test.mjs \
  apps/web/tests/ui/midao-impersonation-banner-contract.test.mjs \
  apps/web/tests/ui/midao-shell-composition.test.mjs \
  apps/web/tests/api/midao-page-session.test.mjs \
  apps/web/tests/ui/midao-layout-wiring.test.mjs
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
timeout --signal=TERM 570s bash scripts/testing/run-midao-e2e.sh \
  e2e/midao-navigation.spec.ts \
  e2e/midao-auth-and-impersonation.spec.ts
```

Expected：responsive＋auth/impersonation specs全部PASS；不是fake middleware-only signature或runtime bypass。

## Gate G4: full regression, lint, typecheck and build

確認Node 22後，各自以tracked background執行，底層都有timeout：

```bash
timeout --signal=TERM 570s env NODE_ENV=test \
  GUIDE_SESSION_SECRET='midao-local-test-secret-at-least-32-bytes' \
  NODE_OPTIONS='--experimental-strip-types' \
  .claude/hooks/run-checks.sh --all
timeout --signal=TERM 570s npm run lint
timeout --signal=TERM 570s npm run typecheck
timeout --signal=TERM 570s env -u SUPABASE_SERVICE_ROLE_KEY \
  NODE_ENV=production \
  GUIDE_SESSION_SECRET="$(openssl rand -hex 32)" \
  ADMIN_ACCESS_TOKEN="$(openssl rand -hex 32)" \
  npm run build
```

Expected：四個commands皆exit 0。Build secrets只存在該process、不寫檔/console/worklog；若570秒不足，視為HOLD並診斷，不得把timeout報成PASS。

## Gate G5: independent review

Fresh spec reviewer逐條核對#1756 AC、read-back migration/runtime guard/actor/E2E seam，並重跑G1–G4。Fresh quality reviewer檢查security、PII、duplication、test quality、no bypass。任一FAIL回實作者修正，之後由fresh reviewer重驗。

## Definition of Done for #1756

- [ ] Five foundation migrations source-contract＋local runtime PASS。
- [ ] backend mode switch atomically updates mode/version/audit/outbox；fresh same-mode無business side effect；function只授權service_role。
- [ ] durable idempotency schema exists and is service-role-only。
- [ ] canonical guard checks HMAC/DB display_name/version/status/mode/flags。
- [ ] signed impersonation actor survives into route context；cross-protocol/forgery denied；普通登入與logout清cookies。
- [ ] forward mode switch default-off且受獨立gate；rollback不受flags阻擋。
- [ ] login/impersonation redirectTo consumed byUI。
- [ ] `/midao` server layout does not depend on frozen middleware。
- [ ] E2E uses real HMAC and seeded local DB row，no production bypass。
- [ ] five routes work on mobile/desktop with accessible shell。
- [ ] G1–G4 actual commands exit 0，包含full suite/lint/typecheck/build。
- [ ] Staged evidence verifier確認Node22、fresh evidence與無unstaged code drift。
- [ ] Independent spec＋quality reviews PASS。
- [ ] Worklog/issue contain exact commands、exit codes、commit SHA、remaining blockers。
- [ ] No push/PR/merge/deploy/production mutation without separate authorization。
