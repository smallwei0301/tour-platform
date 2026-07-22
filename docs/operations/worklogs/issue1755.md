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

- Fresh-context TDD/dependency reviewer: running.
- Fresh-context repo-path/governance reviewer: running.
- #1756 remains `status:blocked + agent:next` until both reviewers report no unresolved FAIL.
- #1757–#1761 remain `status:blocked + agent:queued`.
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
