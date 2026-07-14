# Issue 1665 worklog — available-slots protected availability reads

## 2026-07-08 19:44 CST — Anna start

Task: t_b00951a0 / branch `fix/gh-1665-available-slots-rls` / worktree `/root/.openclaw/workspace/worktrees/tour-platform/gh-1665-rls-available-slots`.

Scope:
- Fix `apps/web/app/api/v2/activities/[activityId]/available-slots/route-handler.ts` so public route keeps public validation but reads protected availability internals through controlled service-role path when Supabase env exists.
- No migration / no broad anon grants.
- Add focused regression/source-contract tests.

Initial evidence:
- `git branch --show-current` → `fix/gh-1665-available-slots-rls`
- `git status --short` → clean
- Worktree has no local `node_modules`; primary checkout has node_modules available for temporary symlink verification if needed.

RED target:
- `apps/web/tests/api/issue1665-available-slots-rls-regression.test.mjs` should fail before production fix because protected reads still go through the public SSR route client and hit PostgREST `42501` on `guide_availability_rules`.

## 2026-07-08 19:46 CST — RED confirmed

Command:
`cd apps/web && NODE_OPTIONS=--max-old-space-size=768 timeout 120s node --test --test-concurrency=1 tests/api/issue1665-available-slots-rls-regression.test.mjs`

Result: expected RED, 2/2 failed.
- Behavior test returned HTTP 500 instead of 200 because public route client hit `{ code: '42501', message: 'permission denied for table guide_availability_rules' }`.
- Source contract failed because `getProtectedReadClient` / `resolveProtectedReadClient` did not exist and rules/blackouts still used route-local client + `select('*')`.

## 2026-07-08 19:53 CST — GREEN implementation evidence

Changed:
- `apps/web/app/api/v2/activities/[activityId]/available-slots/route-handler.ts`
  - Adds injectable `getProtectedReadClient` seam.
  - Uses `getSupabase()` service-role read client when Supabase env exists; falls back to injected/public mock client only when env is absent for tests.
  - Moves `guide_availability_rules`, `guide_blackout_dates`, `bookings`, `activity_plan_seasons`, `guide_slot_conflict_overrides`, and scheduled-listing `activity_schedules` reads to the protected read client.
  - Keeps public validation/plan resolution on public route client.
  - Replaces rules/blackouts `select('*')` with explicit columns.
- `apps/web/tests/api/issue1665-available-slots-rls-regression.test.mjs`
  - Behavior regression proves protected tables do not query public client when public client would 42501.
  - Source contract locks controlled read client and no `select('*')` on rules/blackouts.

Checks:
- GREEN after fix: `cd apps/web && NODE_OPTIONS=--max-old-space-size=768 timeout 120s node --test --test-concurrency=1 tests/api/issue1665-available-slots-rls-regression.test.mjs` → 2/2 pass.
- Focused suite: `cd apps/web && NODE_OPTIONS=--max-old-space-size=768 timeout 120s node --test --test-concurrency=1 tests/api/issue1665-available-slots-rls-regression.test.mjs tests/api/v2-available-slots.test.mjs tests/api/booking-v2-public-booking-regression.test.mjs tests/api/issue602-rls-grants-preflight-contract.test.mjs` → 49 pass / 0 fail.
- Typecheck: `cd apps/web && NODE_OPTIONS=--max-old-space-size=1536 timeout 240s npx tsc --noEmit` → pass. Note: first 768MB attempt OOMed; 1536MB completed and exposed/fixed local implicit-any errors from the new seam.
- Commit evidence: `PATH=/tmp/tp-node22-wrapper:$PATH .claude/hooks/run-checks.sh apps/web/tests/api/issue1665-available-slots-rls-regression.test.mjs apps/web/tests/api/v2-available-slots.test.mjs apps/web/tests/api/booking-v2-public-booking-regression.test.mjs apps/web/tests/api/issue602-rls-grants-preflight-contract.test.mjs` → 49 pass / 0 fail; `.claude/state/last-checks.json` green.

Notes:
- Local default `node` is v24, whose `node --test` output format broke `run-checks.sh` parser. For commit evidence only, a temporary `/tmp/tp-node22-wrapper/node` wrapper invokes `npx -y node@22` so `run-checks.sh` sees TAP `# tests` output.
- `npm install --ignore-scripts` then `npm install --include=dev --ignore-scripts` were needed because the issue worktree initially had no local `node_modules`; incidental lockfile changes were reverted and are not part of the diff.
