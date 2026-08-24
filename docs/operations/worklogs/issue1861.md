# Issue #1861 worklog

## 2026-08-24 P2-C Builder — in progress

- Worktree: `/root/.hermes/worktrees/tour-platform/issue-1861-p2c-claim-schema-rls-acl`
- Branch: `builder/issue-1861-p2c-claim-schema-rls-acl`
- Base: `d8f4edf5ccbfb97ba7a92c695dd28b19e9a11039`; inherited reviewed P1 head: `c77cc58f3b20aa9ee6609f175210fec09e32ec63`.
- Migration collision scans before authoring and immediately before local-harness attempt found no Issue #1861/claim/mapping filename or ledger collision. The live open-PR scan returned one migration-touching PR (#1372), limited to `20260611_issue1365_payout_items_order_unique.sql`.
- Selected additive migration prefix: `20260824135300` (Asia/Taipei local time at scan: `20260824135214`).
- Implemented candidate scope: dedicated exact-32-byte base64url pepper validation; isolated HMAC claim token handling; production env admission; request+claim issuance RPC; bridge RPC with forced RLS, service-role-only grants, idempotency, mapping uniqueness, and generic unavailable result; public issuer and authenticated bridge route.
- RED evidence: claim helper export test failed with `createMidaoRequestClaimToken` absent; environment admission test failed because invalid peppers were accepted; migration contract test failed because migration was absent.
- GREEN evidence: Node 22 focused test command passed 17/17 for claim helper/env/migration/P1 adapter; `git diff --check` passed.
- Disposable local Supabase harness attempt: `timeout 600s node scripts/testing/with-midao-local-supabase.mjs apps/web/tests/integration/midao-foundation-schema-postgres.test.mjs` reached `MIDAO_STAGE=ready`, then exited 1 with `[REDACTED_ERROR]`; cleanup stages executed. No Production, GitHub, deployment, or credential mutation occurred.

## Blocked follow-up

The current harness redacts the actionable failure. Do not claim DB/RLS/concurrency acceptance or commit/review until a local, non-Production diagnostic path identifies and resolves this failure, then a purpose-built `midao-request-claim*` integration test proves the required races, role ACLs, and rollback behavior.

## 2026-08-24 P2-C rollback regression — blocked

- Disposable DB RED: a revoked claim returned `{ status: 'unavailable' }` but left one `midao_idempotency_records` row in `processing` state (`1 !== 0`).
- Candidate migration now deletes its own just-created processing idempotency row on all subsequent unavailable branches (revoked/expired, foreign claimant, foreign mapping, and missing canonical traveler), leaving pre-existing replay records untouched.
- Required expected-terminal transaction was regenerated under the approved Node `v22.23.1`: transaction `712213b71bde2909be20bf9ae115f5650c62ac8358afbf39fa961ed4c02df7ad`, exit `0`.
- The immediately following exact disposable harness command returned exit `1` with only `[REDACTED_ERROR]` and no stages. Per the active failure rule, it was not retried; no commit/review was requested.
- Production/GitHub/credential mutations remain `0`.

## 2026-08-24 P2-C disposable evidence recovered

- Canary-local diagnostic identified a stale expected-terminal migration digest in `scripts/database-baseline/verify-manifest.mjs`; the authorized Issue #1861 entry now matches the candidate migration SHA-256 `dc7d8b4c55dbd944864b7067ba4b2ec2902c381be4c77674cfac9579268d63e1`.
- Repository-owned expected-terminal generation under Node `v22.23.1` completed with transaction `712213b71bde2909be20bf9ae115f5650c62ac8358afbf39fa961ed4c02df7ad` (`runs=2`, atomic publication successful).
- One authorized disposable loopback harness run completed with cleanup: `apps/web/tests/integration/midao-request-claim-postgres.test.mjs` passed 4/4 (same-user replay, concurrent one winner, revoked claim rollback, forced-RLS ACL probe).
- Focused Node 22 unit/API suite passed 28/28; `.claude/hooks/run-checks.sh` recorded fresh green evidence for the same six focused test files. Docker query found no task-labelled containers, networks, or volumes after cleanup.
- No Production SQL/data/metadata, GitHub, deployment, payment/LINE, or credential-value mutation occurred.

## 2026-08-24 Phase 3 Builder — canonical inquiry conversion adapter

- Worktree: `/root/.hermes/worktrees/tour-platform/issue-1861-phase3-midao2-guide-conversion`; branch: `builder/issue-1861-phase3-midao2-guide-conversion`.
- Candidate commit `4b1e6338ee07808c96b57251cd8994dbc25b3cb9` adds the read-only mapped canonical-inquiry projection, session-derived route envelope, `/midao2` reuse of the sole convert command, unit/API contracts, disposable PostgreSQL bridge evidence, and browser spec.
- Fresh verification: focused Node suite passed 41/41; disposable local PostgreSQL convergence passed 1/1; `git diff --check` passed before the final type narrowing fix.
- `run-checks.sh --typecheck` initially exposed `TS2339` on the Phase 3 catch value. The builder narrowed it with `error instanceof Error`; the same hook runner then passed focused 41/41 plus `tsc --noEmit`.
- Browser verification used only `scripts/testing/with-midao-local-supabase.mjs --playwright` and `/usr/bin/chromium`. It reached the real `/midao2/requests/[id]` compilation, but Next dev repeatedly timed out its local requests and Playwright reported a detached frame at `page.goto`; mark `NOT_AUTOMATABLE_LOCAL_WATCHERS` for the browser evidence. No plain dev server, production resource, credential, GitHub, payment, or LINE mutation was performed.

## 2026-08-24 Phase 3 Builder rework — canonical 409 reload

- Rita 發現 canonical convert route 回 `INQUIRY_ALREADY_CONVERTED`／409 時，`InquiryConversionSheet` 的「重新載入詳情」只呼叫 `router.refresh()`，不會重新執行 client-side request GET／`setCanonicalInquiry`，無法讀回 canonical `convertedBookingId`。
- 先新增 Playwright 409 → reload → 第二次 GET 的回歸情境，再將 request GET/state 更新抽為穩定、可 await 的 `load` callback；初始 effect、error retry 與 sheet `onReload` 共用它。第二次 canonical projection 回傳 converted booking 後，UI 顯示 `midao2-canonical-converted` 並移除轉單 action；spec 同時鎖定沒有 CRM `closed_won` 或直接 booking/order write。
- Fresh evidence: pinned Node `v22.23.1` focused suite 41/41 PASS; `npm run typecheck -w @tour/web` PASS; `.claude/hooks/run-checks.sh --typecheck` refreshed green 41/41; disposable local Supabase convergence passed 5/5 with `ready → complete → cleanup`; `git diff --check` PASS.
- Browser runner was not rerun because the card explicitly prohibits retrying the known local watcher/Chromium failure. Keep `NOT_AUTOMATABLE_LOCAL_WATCHERS` as residual risk; no production, GitHub, credential, payment, LINE, deployment, or other external mutation occurred.

## 2026-08-24 Phase 3 Builder rework — GitHub E2E smoke inclusion

- Rita identified that the existing `test:e2e:smoke` GitHub-hosted Chromium lane did not select `e2e/midao2-request-conversion.spec.ts`; local Chromium/watcher evidence remains unavailable by policy.
- RED evidence: pinned Node v22.23.1 parsed `apps/web/package.json` and failed because the exact Phase 3 spec was absent from `test:e2e:smoke`.
- Added only `e2e/midao2-request-conversion.spec.ts` to that smoke command; its four existing specs remain in their original order and no product writer/RPC/migration behavior changed.
- A remote execution still requires explicit Owner authorization for push/PR/workflow dispatch. Until then this browser AC is `HOLD_AWAITING_REMOTE_CI_AUTHORIZATION`; no GitHub, production, credential, deployment, payment, or LINE mutation was performed.

## 2026-08-24 Phase 3 Builder rework — E2E summary auth probe

- Remote GitHub `e2e-smoke` evidence for `e2f0ec2fe71b398dc22c2779812710952ca65b6c` found the canonical 409 reload test timed out on its first attempt and passed only on retry. The stable root cause was the unmocked `Midao2Layout` GET `/api/v2/guide/midao/summary`: its 401 branch redirects the page to `/guide/login?next=/midao2` before the request-detail test can interact with its mocked canonical routes.
- Updated only `apps/web/e2e/midao2-request-conversion.spec.ts`: a reusable `mockMidaoGuideSummary(page)` installs a successful safe-envelope route before `page.goto` in both tests. It avoids timeout/retry expansion and leaves the canonical conversion/CRM-write assertions unchanged.
- RED evidence is the authoritative remote first-attempt timeout plus a pre-change source check that found no summary route mock in this spec. GREEN local evidence: `NODE_ENV=test npx --no-install playwright test --list e2e/midao2-request-conversion.spec.ts` listed exactly two Chromium tests; `.claude/hooks/run-checks.sh --typecheck` passed 41/41 and `tsc --noEmit` under pinned Node 22.
- Browser execution was intentionally not repeated locally: the card prohibits rerunning the known unavailable Chromium/local watcher lane. A new GitHub-hosted E2E smoke run still needs explicit Owner authorization for the next exact commit; no push, PR, workflow dispatch, production, credential, deployment, payment, or LINE mutation occurred.

## 2026-08-24 PR #1865 CI baseline contract repair

- Dedicated non-primary worktree `/root/.hermes/worktrees/tour-platform/issue-1861-pr-ci-convergence` began clean at `7642f981fab108e43aa21cc928e62f81df63e219` on `builder/issue-1861-phase3-midao2-guide-conversion`.
- RED evidence: Node `v22.23.1` ran the two failing baseline contracts and produced the expected four failures: the verified release-gate missing list omitted `20260824135300_issue1861_midao_request_claims_bridge.sql`; the baseline materializer's exact manifest and copied source inventory omitted the same filename/digest.
- Minimal repair updates only those two tests: the release-gate remains `hold` and now explicitly lists the #1861 migration as missing; the materializer contract now pins its actual SHA-256 `dc7d8b4c55dbd944864b7067ba4b2ec2902c381be4c77674cfac9579268d63e1`. No migration, generated baseline/ledger, application, or Production state changed.
- GREEN evidence: `.claude/hooks/run-checks.sh --typecheck` passed 30/30 focused test cases across the two repaired baseline contracts plus Phase 3 API/projection/integration contracts, followed by `tsc --noEmit`; the local PostgreSQL convergence suite remained an explicit `# SKIP` because no disposable DB harness was invoked. `git diff --check` passed.
- The CI browser/e2e smoke receipt remains unchanged: GitHub-hosted Midao2 smoke is 11/11 PASS, retry=0/flaky=0. No GitHub, Production, credential, deployment, payment, or LINE mutation has occurred in this repair phase.

## 2026-08-25 PR #1865 CI convergence repair

- Dedicated non-primary worktree `/root/.hermes/worktrees/tour-platform/issue-1861-pr-ci-convergence`; starting HEAD `f64ec296e445d7af8acf5c0ece83ec0c9c8dfd31`.
- RED evidence: CI Web lane had nine stale Midao2/env/response-architecture assertions; baseline lane had six exact-history failures because `20260824135300_issue1861_midao_request_claims_bridge.sql` was absent from the test-side expected history. A focused baseline replay exposed the final stale `164` history count after adding the 35th suffix entry.
- Repair: moved the claim-pepper environment reader to `src/config/security-env.mjs`; both claim routes consume it. The authenticated bridge now uses `jsonOk`/`jsonError` and `handleRouteError`; public request behaviour is unchanged. Contract fixtures now pin the current two-state UI, claim issuance, production pepper, 35-migration suffix, and published expected-terminal transaction/manifest.
- GREEN evidence: full Web suite under Node `v22.23.1` passed `5,800/5,800` (0 failures); baseline targeted suite passed `22/22`; `.claude/hooks/run-checks.sh --typecheck` passed `57/57` plus `tsc --noEmit`, with fresh commit-gate evidence at `2026-08-25 00:23:10 CST`; `git diff --check` passed.
- Local Node-22 lint is `NOT_VERIFIED`: direct `npm run lint` ran host Node 24 and correctly failed its Node-version guard; the formal Node wrapper intentionally allowlists only test/typecheck, and a direct canonical npm invocation was blocked by the gateway command safety policy. This is a tooling capability constraint, not a source lint result.
- No Production SQL/data/metadata, GitHub, deployment, payment/LINE, or credential-value mutation occurred.
