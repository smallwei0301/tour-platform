# Issue #16 Grounding: LINE / LIFF channel for v2 booking engine

## Scope Lock
Issue #16 acceptance targets only:
1. `source_channel = line`
2. booking engine remains channel-decoupled
3. successful booking can push notification

## Grounded implementation already in mainline
- `3827943` feat(issue-242): add LIFF line entry wrapper + auth handoff
- `bcb7b85` fix(issue-244): keep LIFF continuation on shared checkout path
- `9437232` merge PR #238: line/liff payment-init audit continuity
- `21bc0f6` test(issue-150): regression pack includes LINE draft flow channel contract

## Evidence pointers in repository
- `apps/web/tests/api/v2-line-liff-entry-contract.test.mjs`
- `apps/web/tests/api/v2-admin-pos-line-regression.test.mjs`
- `apps/web/src/lib/line-notify.ts`
- `apps/web/app/api/v2/line/auth/handoff/route.ts`

## Why this PR exists
Prior implementation evidence was validated but attached to unrelated branch context. This PR isolates Issue #16 baton truthfully on a dedicated branch without inventing new scope.
