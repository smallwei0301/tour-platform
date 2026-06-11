# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Tour Platform (brand: **Midao / 祕島**) — a Taiwan local-guide tour marketplace. Travelers browse activities, book slots, pay (ECPay), and manage orders; guides manage availability and bookings; admins run a back-office POS/order/refund console. Most product/operations docs and code comments are in Traditional Chinese.

All web copy, colors, and tone are governed by `BRAND_BOOK.md` — consult it before writing user-facing strings.

## Language / 語言

**繁體中文（Traditional Chinese）是本專案的主要輸出語言，與使用者的所有對話回覆一律使用繁體中文。** 同樣預設用繁體中文：寫入 repo 的維運／QA 文件、commit 說明，以及面向使用者的文案（後者仍以 `BRAND_BOOK.md` 為準）。技術識別字保留原文——程式碼、指令、檔名、API／欄位名稱、錯誤碼、log 訊息等不翻譯。程式碼註解沿用所在檔案的既有語言風格。使用者明確要求其他語言時，從其要求。

## QA 驗收標準（QA verification standards）

驗收 QA issue 時，務必遵守：

1. **實際達成 issue 列出的測試驗證項目。** 把 issue 的 Acceptance criteria 逐條跑出**綠燈／實測證據**，不得只靠推測或臆斷當作通過。能跑的就跑（focused `node --test`、Playwright、authenticated API smoke），不要用契約測試「代替」其實做得到的實測。
2. **進行真實 browser smoke。** 凡牽涉使用者可見頁面／流程（traveler、guide、admin），務必用**真實瀏覽器**驗證：優先 Playwright E2E（必要時用 `e2e/helpers.ts` 的 `adminLogin`／`setGuideSession`、或對 preview 實際登入），不得只做 source-contract 而宣稱前端已驗。本環境資源足以跑 `next dev` + Playwright；若真的被環境阻擋，需在報告明確標 `NOT_AUTOMATABLE`／`NOT_VERIFIED-live` 並附最接近的安全替代與 blocker 原因。
3. **只有在確實無法安全執行時**（例如需要 operator-only secret、會寄真實信件／動到正式付款或營運資料）才標 `NOT_VERIFIED-live`／`NOT_PROD_EXECUTED`，並說明 blocker、替代證據與下一步；不得用未驗證結果當 pass。
4. **驗收文件用繁體中文**寫入 `docs/operations/qa-reports/`，記錄環境 URL、deploy/commit SHA、Asia/Taipei 時間、逐條 AC 證據、判定（PASS／HOLD／FAIL），且不得含密鑰／cookie／token／service-role key／完整付款 payload／未遮蔽 PII。
5. **標準流程:** 開 PR → 盯 CI → merge → 逐條檢查 AC 清單 → 留 sign-off 留言 → 關閉 issue → 挑下一個 QA issue。

## Commands

Node 22 is required and pinned (`.nvmrc` + `engines`). Run `npm install` once at the repo root (npm workspaces).

Root scripts proxy to the `@tour/web` workspace:

- `npm run dev` — Next.js dev server
- `npm run build` — production build (CI also runs this)
- `npm run lint` — ESLint (flat config disabled via `ESLINT_USE_FLAT_CONFIG=false`). **Run on Node 22**: a pre-lint guard (`scripts/check-lint-node.mjs`) fails fast on Node ≥24, where ESLint 9.x + `eslint-config-next` crash with an upstream circular-config error (env-only; CI uses Node 22 and stays green).
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — unit/integration tests

Tests use the **Node built-in test runner** on `.mjs` files (not Jest/Vitest):

- All tests: `npm test` → `node --test tests/**/*.test.mjs`
- Single file: `node --test apps/web/tests/api/booking-state.test.mjs`
- By name: `node --test --test-name-pattern='Blackout' apps/web/tests/slot-generator.test.mjs`
- Targeted smoke suites are defined as scripts in `apps/web/package.json` (e.g. `test:smoke:v2-core`, `test:smoke:guide-blackout`, `test:smoke:admin-pos-line`).
- E2E (Playwright): `npm run test:e2e -w @tour/web` (also `:ui`, `:headed`).
- E2E smoke lane (CI): `npm run test:e2e:smoke -w @tour/web` runs a bounded, backend-mocked allowlist via the `e2e-smoke` workflow (`.github/workflows/e2e-smoke.yml`) on `workflow_dispatch` + daily schedule + path-filtered PRs (booking/guide/e2e). Add a launch-critical browser spec to the lane by appending it to the `test:e2e:smoke` script (only specs that mock the backend via `page.route()` and need no real Supabase/payment/PII). `ci.yml` stays lint → typecheck → node test → build → preflight (no Playwright).

CI (`.github/workflows/ci.yml`) runs, in order: lint → typecheck → test → build → `scripts/preflight-check.sh`. The build runs with `NODE_ENV=production`, so security-env guards require strong non-default secrets (CI injects `GUIDE_SESSION_SECRET` / `ADMIN_ACCESS_TOKEN`).

`npm run readiness:snapshot` regenerates `docs/operations/reports/readiness-live-state-latest.md` (live issue/PR state is intentionally NOT hand-written into the README — it auto-refreshes every 6h via CI).

## Architecture

**Monorepo:** npm workspaces — `apps/web` (the entire Next.js app), `packages/config`, `packages/ui`. Almost all real code lives in `apps/web`.

**Stack:** Next.js 15 (App Router) + React 19, TypeScript, Supabase (Postgres) backend, Sentry, deployed on Vercel.

### Data layer with in-memory fallback
`apps/web/src/lib/db.mjs` is the data gateway. `hasSupabaseEnv()` checks for `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; when absent (local dev / tests) it falls back to an in-memory store (`store.mjs`, `services.mjs`, `admin.mjs`). This is why much code is written so it works with no database — tests rely on the fallback. The service-role Supabase client is for server/admin work; traveler-facing auth uses the SSR anon client (`src/lib/supabase/{server,client}.ts`).

### Three auth realms (see `apps/web/middleware.ts`)
Edge middleware is the single front door and routes by path prefix:
- **Traveler** — Supabase auth cookies; middleware refreshes the session (with a timeout, fail-open). Marketing/activity pages stay public and cacheable.
- **Guide** — `guide_token` HMAC cookie. Middleware does a *lightweight format check only* (edge has no Node crypto); full HMAC verification happens in API routes via `verifyGuideSession()`.
- **Admin** — token + email allowlist + session-version check (`isAdminAuthorized`). Credentials are never read from URL query params.

CSRF: double-submit token (`tp_csrf` cookie vs `x-csrf-token` header) is enforced in middleware for cookie-authenticated mutations on `/api/{admin,guide,me,orders,reviews}` (issuance/login endpoints exempt).

### Soft-launch / kill-switch
Middleware's `applyPublicPausedGuard` reads `soft_launch_controls` (via anon client). When `public_paused` is set, non-exempt requests get a 503 (API) or redirect to `/maintenance` (pages), unless whitelisted. Fail-open on any error. Admin/guide/auth routes are always exempt.

### Booking V2 vs legacy
The platform is mid-migration from a static-schedule model to an availability/slots **Booking V2** engine (Phase 12, issue #621). Feature flags live in `apps/web/src/config/feature-flags.mjs`; `NEXT_PUBLIC_BOOKING_V2_ENABLED` **defaults ON** and `=0` rolls back to legacy. V2 API routes live under `apps/web/app/api/v2/**`; availability logic under `src/lib/availability-v2/` and `slot-generator.ts`. Booking-state and order/payment chains span three layers (booking → order → payment) that must stay consistent; ECPay callbacks must be idempotent (`checkout-idempotency.ts`, `payment-reconciliation.ts`).

### `.ts` vs `.mjs` in `src/lib`
Logic that must be importable by edge middleware or run without TS compilation (auth, sessions, soft-launch, store) is authored as `.mjs`; the rest is `.ts`. TypeScript `strict` is on but full strictness is still being expanded across booking-critical modules (issue #68) — match the style of the file you are editing.

### Database migrations
`supabase/migrations/` — early ones are numbered (`001_…`–`022_…`), newer ones are timestamped (`20260409…`); **new migrations must use the timestamp naming scheme**（見 `supabase/migrations/README.md`）. For the canonical migration and rollback procedure, see `docs/operations/booking-v2-rollback-runbook.md`. （Root 目錄的 legacy one-shot scratch scripts 已於 #1377 移除。）

## Conventions

- New API work should target the `v2` routes/contracts unless fixing legacy behavior; check `docs/04-tech/04-tech-architecture/10-api-spec-v2-booking-pos.md` for the V2 contract.
- Keep readiness/ops docs in sync with real state via `npm run readiness:snapshot` rather than editing live counts by hand.
- Secrets are guarded at startup (`src/config/security-env.mjs`, `startup-env.mjs`) and by a CI secret-scan workflow — never commit real secrets or weaken these guards.

## Testing policy

**Match the test style to the layer being changed. Always reuse existing fixtures/helpers before writing new ones.**

**db.mjs strangler 準則（#1385）**：之後凡修改 `db.mjs` 某函式，順手把其中可獨立的業務邏輯（狀態機、金額計算、資格判斷）抽到 `src/lib/` 純函式並補單測 — 不開大重構 PR，逐函式漸進。audit log 寫入一律用 `src/lib/audit-log.mjs`（單一實作）；refund 狀態機在 `src/lib/refund-transition.mjs`。

**新增或修改 `db.mjs` gateway 函式時，必須同步 in-memory fallback 並補契約測試**（「同輸入 → 同輸出 shape／同狀態轉移」，範本：`tests/api/issue1384-flow-contract.test.mjs`）— fallback 與 Supabase 實作沒有契約測試時，測試綠燈不代表 production 正確（#1376 即實例）。payment callback 的原子性假設見 `docs/04-tech/04-tech-architecture/12-payment-callback-atomicity.md`（新 RPC 鎖序必須遵循 orders → bookings → activity_schedules）。

### Backend tasks → TDD with `node --test`
Server routes, `src/lib/**` helpers, DB gateways, evaluators, validators, schedulers, payment/refund pipelines, anything that doesn't render a DOM.

1. **Red first**: write `apps/web/tests/{api,unit,services}/issueNNNN-*.test.mjs` covering the new behavior; run it and see it fail.
2. **Green**: write the minimum code to make the test pass. Prefer extracting pure helpers under `src/lib/` so the unit can be tested without Supabase — the in-memory fallback (`hasSupabaseEnv()` false branch) is the existing seam.
3. **Refactor + regression**: rerun the targeted file (`node --test apps/web/tests/api/issueNNNN-*.test.mjs`) and then `npm test` for the whole suite before committing.
4. **Source-contract tests** (read source via `fs.readFileSync` + regex) are acceptable for locking down route wiring (import order, `.eq('status', …)` shape, helper-call-before-`.insert(`). Recent examples: `tests/api/issue1072-admin-qa-status-helper.test.mjs`, `tests/api/issue1110-plan-schedule-mismatch.test.mjs`.

### Frontend / frontend-interaction tasks → Playwright E2E
Pages under `apps/web/app/**`, client components, navigation, filters, forms, fee detail / price rendering, anything users see or click.

1. **Add a spec under `apps/web/e2e/issueNNNN-*.spec.ts`** following the existing file naming (`issue1072-admin-qa-pending-tab.spec.ts`, `issue1073-activities-region-listing.spec.ts` are the templates).
2. **Reuse `apps/web/e2e/helpers.ts`** — it already provides `adminLogin()` and the `authedPage` fixture for admin-authed pages. Don't re-implement auth; extend `helpers.ts` only if a shared concept is genuinely missing (e.g. a new auth realm, a new shared fixture). Traveler-authed pages（`/me/**`，client-side `supabase.auth.getUser()` gate）的可用 pattern：假 `sb-127-auth-token` session cookie + `page.route('**/auth/v1/user**')` 攔截回傳 user — 範本見 `e2e/issue1379-traveler-review.spec.ts` 的 `setTravelerSession`；第二個 spec 需要時請把它抽進 `helpers.ts`。
3. **Mock backend via `page.route('**/api/**', …)`** so tests don't depend on Supabase seed. See `e2e/issue1073-activities-region-listing.spec.ts` for the pattern (mocked `/api/activities` + `/api/me/wishlist/ids`).
4. **Always keep the new spec file committed.** Do not delete or rewrite existing specs (`t0-*.spec.ts` … `t7-t8-*.spec.ts`, `funnel-*.spec.ts`, deeplink/booking-flow suites). If an existing spec needs to change to match a new contract, update assertions surgically and explain why in the PR.
5. **Run locally** with `npm run test:e2e -w @tour/web -- e2e/issueNNNN-…spec.ts` against the dev server (`npm run dev` in another terminal — the config has no `webServer` block and assumes one is running).
6. **Pair with backend unit tests** when the frontend bug is driven by a backend behavior — e.g. issue #1108 ships both `tests/ui/issue1108-…` source-contract tests (locking the helper integration) and the page change.

### Hybrid tasks
Fix the backend layer with TDD, then add a Playwright E2E spec that exercises the visible behavior end-to-end. Don't skip the E2E spec just because the unit tests pass — the regression that gets users is almost always at the seam between layers.

## Session branch hygiene

Session work branches (e.g. `claude/<session-slug>`) are ephemeral scratch space, not long-lived feature branches.

1. **開工先對齊 main**：`git fetch origin main && git reset --hard origin/main` 後再開始改。session branch 不保留歷史包袱，diff 永遠等於「最新 main + 本輪修正」。
2. **Push 被拒、遠端有未在本地的 commit 時，不要先 rebase**：先用 `git patch-id` 比對那些遠端 commit 與 main 上的 squash-merge commit 是否同 patch：
   ```bash
   git show <remote-commit> | git patch-id
   git show <suspect-main-commit> | git patch-id
   ```
   patch-id 相同代表內容已被 squash 進 main，遠端那份是無價值的 pre-squash 殘留 — 此時 `git push --force-with-lease` 是安全的（需先取得使用者授權，因為 force-push 屬於 hard-to-reverse 動作）。patch-id 不同才真的 rebase 保留。
3. **force-push 不可用時的替代流程**（remote execution 環境的權限系統可能直接擋下 `--force-with-lease`）：先驗證 `git diff origin/<session-branch> origin/main --stat` 為空（殘留內容已全進 main），然後 `git merge origin/<session-branch> --no-edit` 把殘留歷史收回本地，再正常 `git push`。merge-base 會落在最新 main，PR diff 不會混入已 merge 的舊變更；之後每輪 squash-merge 後改用 `git merge origin/main --no-edit` 同步（取代第 1 點的 reset --hard），全程不需 force-push。
4. **絕不對 `main` force-push**，也不對非 session-owned branch force-push；force-push-with-lease 只動 session branch 自己的 ref，不影響 `main` 或他人 branch。
5. **fresh container 注意**：開工先在 repo root 跑 `npm install`（tests 依賴 `typescript` 套件做 transpile-import，沒裝會整套紅）；`npm install` 可能動到根目錄 `yarn.lock`，該檔改動不要 commit（`git checkout -- yarn.lock`）。
