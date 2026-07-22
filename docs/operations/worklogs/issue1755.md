# Issue #1755 — Midao Backend Redesign Worklog

> Epic: https://github.com/smallwei0301/tour-platform/issues/1755
> Updated: 2026-07-22（Asia/Taipei）
> Current phase: implementation-plan review gate
> Current branch: `docs/midao-backend-design`
> Base: `origin/main af3963cb48afdf246035bbf746694c7de18cc2ed`

## Scope

依已批准設計，分六個垂直 package 交付新的 `/midao` 導遊後台：

- #1756 Foundation + Shell
- #1757 Requests + atomic decisions
- #1758 Services + questionnaire + direct publication
- #1759 LINE inquiry + traveler confirmation
- #1760 Global calendar + effective availability
- #1761 Public page + cutover + final verification

## Canonical artifacts

- Design spec: `docs/superpowers/specs/2026-07-22-midao-backend-design.md`
- Implementation plan: `docs/plans/2026-07-22-midao-backend-implementation.md`
- Visual references: `docs/superpowers/assets/midao-reference/01-home.jpg` through `07-public-page.jpg`
- Design commits: `e3ff0dd1`, `fc9558c1`, `89d730c3`
- Plan/assets checkpoint: `41c30eb0`

## Current evidence

- Seven reference images copied into repo and SHA-256 matched source files.
- Contact-sheet visual verification confirmed all seven semantic filenames after correcting the original cache ordering.
- Plan structural check:
  - 1,104 lines before latest worklog-only change.
  - 67 tasks.
  - 12 additive migrations ordered by package merge sequence.
  - No stale single `atomic_commands` migration reference.
  - No unresolved placeholder markers.
  - `git diff --check` passed before checkpoint commit.
- GitHub duplicate search for `Midao in:title` returned no open/closed duplicate before creation.
- GitHub issue read-back confirmed #1755–#1761 are OPEN with intended owner/status/type/priority/domain/agent labels.

## Review gate

### 2026-07-22 fresh-context review result: FAIL

兩位 reviewers 讀取 master roadmap與最新 main 後判定不能直接實作。有效阻塞包含：master tasks不是逐一可執行 TDD、缺真實 Postgres RPC/RLS驗證、durable idempotency缺 schema、admin impersonation缺可信 actor、server layout guard與 legacy fake E2E session不相容，以及後續 packages的 canonical write/public/availability 接縫不完整。

Reviewer 執行期間已先修正：migration timestamp單調、outbox早於 command、atomic backend-mode switch、重工作 tracked timeout、commit evidence規則。

本輪後續 remediation：

- Master 文件改為 roadmap，不再允許直接交給實作者。
- 新增 #1756 專用 micro-plan：`docs/plans/2026-07-22-midao-package-01-foundation-shell.md`。
- Foundation 新增 durable idempotency migration，並早於 atomic mode switch。
- 既有 `audit_logs`為 order-centric schema，欄位不足；新增 service-role-only `midao_audit_events`供 command transaction直接寫入。
- 統一 outbox欄位為 `event_name/next_attempt_at`。
- 新增 signed admin-impersonation actor契約。
- 新增 canonical runtime guard＋kill-switch contract。
- 新增 local Supabase reset／Postgres RPC-RLS-rollback-concurrency gate。
- 新增 local seed guide＋real HMAC E2E session；不使用 production bypass。

### 2026-07-22 second fresh review: FAIL/HOLD

Reviewers實跑第一版 #1756 micro-plan，發現Node 24/production env使baseline 24 pass/1 fail、canonical guideName仍可能來自public cookie、ordinary login未清殘留actor、forward mode switch缺rollout gate、RPC privileges/lock protocol含糊、Postgres verification曾是假RED且runner不自足、UI tasks過大以及final gate缺full suite。

第二輪remediation：

- 實測可用Node22 PATH方式；固定test env後四支auth baseline為38/38 PASS。
- 新增staged evidence verifier，補強frozen bash-guard的反向判斷，但不改hook。
- Guide HMAC bytes維持legacy相容；actor使用獨立domain並做cross-protocol rejection。
- Canonical runtime projection加入DB `display_name`，不信任public `guide_name`。
- 普通invite/regular/legacy login與logout全部清actor/banner cookies，admin email normalize。
- 新增default-off mode-switch rollout flag；forward受gate，rollback不受flag阻擋。
- RPC固定idempotency→profile lock→conditional writes→snapshot順序，明列function privileges/search_path/fresh same-mode語意。
- Postgres改為post-implementation verification gate，增加actual role DML/EXECUTE、fault-injection rollback及精確concurrency/idempotency cases。
- Postgres與Playwright共用self-owned local Supabase wrapper，能獨立start/reset/map env/readiness/cleanup。
- Login API/UI/impersonation與shell components拆成focused tasks；responsive/auth/a11y用兩支real-HMAC Playwright驗證。
- Final gates加入Node22 assertion、full `run-checks.sh --all`、lint、typecheck、build。

#1756仍維持 `status:blocked + agent:next`。修訂版須再次fresh review PASS；PASS前不得開始production code。

- #1757–#1761 remain `status:blocked + agent:queued`，各自需要獨立 micro-plan review。
- No product code, migration implementation, push, PR, deploy, production SQL, or backend-mode switch has been performed.

## Next action after reviewer PASS

1. Apply and commit any valid plan/spec corrections.
2. Change #1756 to `status:ready + agent:now`; remove `status:blocked + agent:next`.
3. Add an `Agent priority routing update` comment with prerequisites and safety boundaries.
4. Create a fresh Package 0 implementation worktree from the latest `origin/main`.
5. Execute Task 1 in strict RED → minimal GREEN order.

## Safety anchors

- Existing migrations are immutable; new timestamps only move forward across package merges.
- Do not modify frozen middleware, legacy orders/payments routes, protected E2E, `CLAUDE.md`, or harness files without the required override.
- Do not apply migrations or mutate production without the repo approval/ledger path.
- Do not use real traveler payment or send real LINE messages in automated verification.
