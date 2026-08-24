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
