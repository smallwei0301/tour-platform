# Tour Platform Hermes Kanban implementation plan v2

This note is the project-level companion to the `project-kanban-controlled-loop` skill. Keep it concise and update it when loop/router/follow-up policy changes.

## 2026-06-04 TP PR / issue QA evidence chain

Every Tour Platform PR / issue follow-up, 後續盤點, post-merge self-retrospective, and operator report must apply:

```text
project-kanban-controlled-loop/references/tour-platform-pr-qa-evidence-chain.md
```

Required final/handoff fields:

```text
QA_EVIDENCE:
- automated: <commands/checks/run URLs or NOT_REQUIRED>
- manual_or_preview: <preview/live/manual evidence or NOT_AUTOMATABLE with reason>
- direct_issue_goal: <proof tied to acceptance criteria>

CURRENT_BLOCKER:
- status: none | blocked | hold | needs-review | needs-owner-approval | ci-failing | qa-missing | merge-blocked
- blocker: <one sentence>
- owner: <profile/person/system>
- unblock_condition: <exact next action/condition>
```

If a TP PR / issue report lacks either field, treat it as incomplete (`CURRENT_BLOCKER.status=qa-missing`) and create/request the smallest evidence addendum before merge/close/done.

## 2026-07-09 multi-lane dynamic workflow scheduler plan

`/tp_kanban_loop` is being upgraded from a single-next-card operator loop into a resource-safe multi-lane scheduler. The implementation plan is saved at:

```text
/root/.openclaw/workspace/notes/tp-kanban-loop-multilane-dynamic-workflow-plan.md
```

V1 policy:

- Ava may configure multiple open issues/cards per cycle via `--config-budget` (default 5), but configuration budget is separate from dispatch budget.
- Worker profiles default to one active running task per lane: `tp-planner`, `tp-builder-api`, `tp-builder-ui`, `tp-builder-fix`, `tp-reviewer`.
- The runner must cap `effective_max_dispatch` by live `lane_status.available_lane_count`, memory budget, `--max-dispatch`, `--no-dispatch`, and hard guard blockers.
- Low memory or hard guard blockers dispatch 0, preserving Hermes/Telegram/container health over throughput.
- Dynamic workflow is the deterministic manifest/scoring/planning layer; durable execution remains Hermes Kanban.

Verification commands:

```bash
cd /root/.openclaw/workspace
python3 -m py_compile scripts/kanban_router.py scripts/tp_kanban_loop_runner.py
python3 -m pytest tests/test_tp_kanban_multilane_scheduler.py tests/test_tp_kanban_loop_runner_role_audit.py tests/test_tp_kanban_tsconfig_guard.py -q
/root/.openclaw/workspace/bin/tp-kanban-loop --dry-run --max-cycles 1 --no-dispatch --no-self-repair --no-readme-refresh
```

2026-07-09 V2 candidate manifest + optional idempotent apply:

- `python3 scripts/kanban_router.py candidate-manifest --limit 20 --config-budget 5` produces a deterministic open-issue + existing-Kanban manifest for Ava.
- The manifest emits per-issue idempotency keys (`tp:github:smallwei0301/tour-platform:issue:<n>:v2`), rough risk/conflict domains, existing task references, suggested stage/assignee, and a `configuration_plan`.
- `--apply-config` is available but opt-in only: it uses `hermes kanban create --idempotency-key` to create triage or blocked cards, not executable ready cards, so batch configuration cannot accidentally fan out workers.
- The runner includes a compact `candidate_manifest` and optional apply summary in each `resource-dispatch-plan` and baton.
- Default runner behavior remains non-mutating for candidate configuration; enabling `--apply-candidate-config` in live Telegram runtime requires explicit operator approval.

2026-07-09 V3/V4 selective + exact-ID dispatch:

- `python3 scripts/kanban_router.py selective-dispatch-plan --max 3` produces exact `dispatchable` / `held` ready task IDs from the live board.
- It honors canonical per-lane WIP=1 and locks conflict domains from running cards using explicit `Conflict domain:` / `Risk domain:` body fields, with title fallback.
- `python3 scripts/kanban_router.py exact-selective-dispatch --max 3 --compact` dry-runs exact-ID dispatch; adding `--apply --operator-approved` claims/spawns only the selected IDs via Hermes Kanban internals.
- The runner now includes `selective_dispatch_plan`, `exact_dispatch`, and `live_mutation_approval` in each `resource-dispatch-plan` and baton.
- The runner also prints a plain `operator-report` and writes `operator_report` into baton using fixed Telegram sections: `CONFIGURED`, `DISPATCHABLE`, `DISPATCHED`, `HELD`, `LANE_STATUS`, `POST_REPAIR_RESUME`, `APPROVAL_REQUIRED`, and `NEXT`.
- V8 post-repair dispatch resume gate: the runner records read-only Kanban DB health in `logs/tp-kanban-loop-kanban-db-health.json`; repair/rescue remains allowed when the DB is unhealthy, but worker dispatch is blocked while unhealthy and after an unhealthy→healthy repair transition until `--operator-approve-post-repair-dispatch-resume` is supplied.
- V9 conflict-domain extraction + high-risk verifier/refuter: `extract_conflict_domains()` now reads explicit domains, expected/allowed/source paths, and body/spec keywords; selective dispatch locks by domain-set intersection, and `candidate-manifest` emits `conflict_domains`, `conflict_domain_evidence`, and `verifier_refuter` metadata for high-risk payment/ECPay/auth/RLS plans.
- V10 dynamic candidate scorer + low-tier summary contract: `candidate-manifest` scores all scanned issues before applying `config_budget` using `dynamic_score_desc_then_issue_desc`; each selected candidate includes `candidate_score` reasons and a compact `low_tier_summary` with blockers, evidence pointers, unknowns, and direct-verification flags. High-risk candidates require original-source spot checks before risky dispatch/mutation decisions.
- The runner no longer relies on broad native `hermes kanban dispatch --max N` for TP multi-lane dispatch, because native first-ready ordering cannot target exact allowed IDs.
- V5 live enablement gate: router `candidate-manifest --apply-config` and `exact-selective-dispatch --apply` require `--operator-approved`; runner live card creation / exact-ID worker dispatch requires `--operator-approve-live-mutation`. Missing approval emits `operator_approval_required` and suppresses apply/spawn.
- Default Telegram/runtime safety remains unchanged: `--dry-run`, `--no-dispatch`, memory pressure, lane locks, hard guard blockers, and missing approval suppress spawns.

## 2026-05-26 role-default skill preload repair

`/tp_kanban_loop` now runs `python3 scripts/kanban_router.py apply-role-skills` before `dispatch-guard` / native dispatch. This mutates only `todo` / `ready` cards by appending role-default workflow skills while preserving any manually supplied skills.

2026-05-26 update: `apply-role-skills` now delegates to `scripts/tp_kanban_skill_selector.py`. The selector applies role defaults first, then scans the target assignee's profile-local `SKILL.md` metadata plus global fallback skills to find conservative task-specific extras. It can discover future Una/Anna/Fiora profile skills without code changes if the new skill has useful `name`, `description`, or `tags`; for example, a new `ui-ux-pro` skill in `tp-builder-ui` can be selected for a UI/UX-titled card. Dynamic extras are intentionally limited to builder/fix roles, generic umbrella/operator skills are excluded, and broad task-body boilerplate is not enough to trigger an extra skill.

2026-05-26 self-repair update: the runner's final optimization stage now writes a role-default skill optimization audit into `/root/.openclaw/workspace/logs/tp-kanban-loop-self-repair.md`. The audit lists each role's defaults from `scripts/tp_kanban_role_skills.py`, non-default skills repeatedly observed on sampled cards, high-confidence auto-promotion candidates, and weak default-skill downgrade candidates. Promotion is strict (`count >= 10`, `ratio >= 25%`, skill exists in profile/global catalog, not a generic operator skill). Downgrade is looser but protected: only non-baseline learned defaults can be removed, enough recent role tasks are required, weak title relevance (`<= 5%`) / missing catalog must appear in three consecutive audits, and governing baseline skills are never auto-removed. If the loop creates or identifies a new durable role skill, it should be synced into `ROLE_DEFAULT_SKILLS` plus tests in the same optimization pass so future Kanban cards preload it automatically; if later tasks stop supporting it, the downgrade ledger can demote it without manual intervention.

## 2026-05-31 post-merge retrospective / owner-impact hard gate

After any `/tp_kanban_loop` PR merge or GitHub issue close, the loop is not complete until Ava has produced both:

- `loop-retrospective` output for the just-finished PR/issue/window, including `這輪主要耗時 / fail 點`, applied skill/script fixes, and verification evidence.
- Owner-facing plain-language impact notes for 木村哥:
  - `修改前`
  - `修改後`
  - `手動測試` with exact URL + steps + expected result per test item
  - `網站`
  - `注意事項`

If Ava already merged/closed but has not done this, the correct final wording is `merged/closed but retrospective pending` plus exact resume scope; do not say 完成/收斂完成. This rule is duplicated in the thin `tp_kanban_loop` alias because operators may read the alias first and miss the deeper umbrella section.

Verification markers:

```text
skill_view('tp_kanban_loop') contains: Hard completion gate after PR merge
skill_view('project-kanban-controlled-loop') contains: Operator hard stop
```

Role defaults:

```text
ava → project-kanban-controlled-loop
tp-planner → project-kanban-controlled-loop + test-driven-development
tp-builder-api, tp-builder-fix → project-kanban-controlled-loop + test-driven-development + systematic-debugging
tp-builder-ui → project-kanban-controlled-loop + ui-task-router + ui-image-implementation-qa-workflow + systematic-debugging + test-driven-development
tp-reviewer → project-kanban-controlled-loop + github-code-review + test-driven-development
```

Verification commands:

```bash
cd /root/.openclaw/workspace
python3 -m pytest tests/test_tp_kanban_skill_selector.py tests/test_tp_kanban_role_skills.py tests/test_tp_kanban_loop_runner_role_audit.py -q
python3 -m py_compile scripts/tp_kanban_skill_selector.py scripts/tp_kanban_role_skills.py scripts/kanban_router.py scripts/tp_kanban_loop_runner.py
python3 scripts/kanban_router.py apply-role-skills
/root/.openclaw/workspace/bin/tp-kanban-loop --max-cycles 1 --no-dispatch --no-readme-refresh
```

## 2026-05-26 GH-787 web-test resource lesson

GH-787/PR823 exposed two separate slow-run causes:

- A focused behavioral `getAvailableSlots` harness timed out after ~125s before the route-handler/date stepping fix; treat new behavioral harnesses as suspect until proven bounded, always wrap them in `timeout 120s`, and inspect loops/promises before increasing timeouts.
- Broad `apps/web` Node tests can amplify memory pressure when agents are running. The `apps/web` `npm test` script is now memory-capped and sequential: `NODE_OPTIONS=${NODE_OPTIONS:---max-old-space-size=768} node --test --test-concurrency=1 tests/**/*.test.mjs`. Agents should still prefer focused files first.
- Local browser smoke may fail for environment reasons (`ENOSPC: System limit for number of file watchers reached`, or `next dev` accepts a port but page curl times out). `/tp_kanban_loop` now runs `scripts/tp_browser_smoke_guard.py` at startup and writes `logs/tp-browser-smoke-preflight.json`; if host/container sysctl cannot raise inotify limits, Rita/local smoke should use the bounded wrapper `python3 scripts/tp_next_local_smoke.py --json`, which forces `NODE_ENV=development`, polling exports, `NODE_OPTIONS=--max-old-space-size=768`, readiness polling, page curls, and cleanup. If smoke still fails, kill stale Next/Playwright processes if safe, stop retrying local browser smoke, and route verification to preview/live evidence or report `NOT_AUTOMATABLE_LOCAL_WATCHERS`.
- Fixed TP workflow rules after GH-787: focused+timeout first for behavioral tests; bug-fix loops broaden focused → smoke → full suite/CI; no infinite browser-smoke retries; worker crash/no-heartbeat beyond 15–20 minutes gets dirty diff + stall note + narrow salvage card; browser ENOSPC is preflighted before Rita gets the task.

## 2026-05-25 README context/readback requirement

`/tp_kanban_loop` now treats the root Tour Platform `README.md` as the human-facing project priority baseline.

Runner behavior now required:

- At startup, read `/root/.openclaw/workspace/tour-platform/README.md` and write compact context to `/root/.openclaw/workspace/logs/tp-kanban-loop-readme-context.json`.
- Print a compact `readme-context` line so the operator can see the current status heading and priority markers before dispatch.
- After the loop and self-repair finish, run a best-effort README refresh and write the result to `/root/.openclaw/workspace/logs/tp-kanban-loop-readme-update.md`.
- The deterministic refresh may update only stable live-marker lines: project status date, latest merged PR line, and open PR count line.
- If README changed, review the diff and commit/PR it through the normal final-sanity gate. Do not silently treat README edits as merged.
- Use `--no-readme-refresh` only for exceptional diagnostics.

Verification command:

```bash
/root/.openclaw/workspace/bin/tp-kanban-loop --dry-run --max-cycles 1 --no-dispatch --no-self-repair
```

## 2026-05-22 GH-621 loop optimization lesson

Observed window: roughly 08:48–14:22 Asia/Taipei, GH #621 Booking/Availability V2 primary traveler-flow code slice through PR #674. The later manual recovery/merge phase was roughly 12:44–14:22.

### Friction observed

- `scripts/tp_kanban_import_issue.py` was missing and `/root/.openclaw/workspace/bin/tp-kanban-loop` still pointed at a stale archived skill script. The loop would have stalled if it insisted on wrapper repair before issue progress.
- Native `hermes kanban show/log` timed out repeatedly during long worker runs; bounded watcher exits had to be reconciled with SQLite, PID, and git worktree status.
- The first API worker suffered provider/network interruptions and left useful artifacts before the final review-required handoff was recovered.
- Rita correctly found multiple hidden traveler-flow blockers across desktop, booking shell, direct-entry fallback, and mobile sticky CTA; this was valuable, but each BLOCK needed narrow fix cards and fresh Rita review instead of treating one PASS/BLOCK as final.
- A reviewer-created fix card used `workspace=scratch`; Ava blocked it and created a replacement with the dedicated #621 worktree, preserving Tour Platform worktree policy.
- PR body initially risked closing a broader rollout issue; final sanity had to re-read the live issue body and change `Closes #621` to `Refs #621` before merge.

### Optimizations now in force

- Treat project helper scripts and the `tp-kanban-loop` wrapper as optional helpers: verify they exist before use. If missing/stale, preserve Pandora/spec + dedicated worktree policy and create the necessary cards with native `hermes kanban --board tour-platform create ... --workspace dir:<worktree>` commands. Log wrapper repair separately instead of blocking product progress.
- When `hermes kanban show/log` times out, switch to fast probes: router status/rescue/dispatch-guard, direct read-only SQLite task rows/events, PID checks, and `git status` inside the task worktree. Do not blindly redispatch until useful artifacts and terminal state are reconciled.
- `review-required` builder handoffs may be made terminal only with explicit Ava bookkeeping language that says this is not approval and names the next gate.
- If Rita creates a follow-up with scratch workspace for a Tour Platform code change, block/supersede it and recreate an equivalent card using the issue-specific dedicated worktree.
- Before merging any PR tied to a broad rollout/cutover issue, re-read the live issue body. If remaining production flag, smoke, monitoring, rollback, deprecation, or rollout gates exist, use `Refs #N`, verify the issue stays open after merge, and comment with remaining gates.

## 2026-05-21 assignee slug / router guard lesson

Observed issue: Rita-created follow-up `t_8e661359` was initially created with `assignee=una`, then sat unspawned until it was reassigned to canonical `tp-builder-ui`.

Rule now in force:

```text
Anna → tp-builder-api
Una → tp-builder-ui
Fiora → tp-builder-fix
Pandora → tp-planner
Rita → tp-reviewer
Ava → ava
```

Kanban task `assignee` must use the canonical profile slug, not the human-facing wrapper name. The project router dispatch guard now flags `ready`/`todo` cards whose assignee has no matching `/root/.hermes/profiles/<assignee>` directory and suggests the canonical slug for known aliases.

## 2026-05-20 GH-623 loop optimization lesson

Observed window: 09:23–11:08 Asia/Taipei, GH #623 post-#610 admin/payment QA close-gate.

### Friction observed

- Rita first review `t_c4d1cc82` spent two runs: first run crashed after ~9m, second completed after ~7m.
- Admin auth unblock card `t_abc23407` spent ~16m rediscovering auth contract and credential artifact gaps after Rita had already isolated the blocker to invalid/missing admin smoke credentials.
- The bounded watcher exited with stall code while the worker was still active because it only tracked task status/summary, not log-tail activity.
- A duplicate Rita addendum card `t_9140f8fc` was created after `t_02de4d16` already existed/running.
- PR checks via `gh pr checks` failed due PAT/statusCheckRollup scope; fallback to commit status REST was required.
- `npm run typecheck` produced `apps/web/tsconfig.tsbuildinfo`; restore it before PR/merge gates.

### Optimizations now in force

- Use `/root/.openclaw/workspace/scripts/tp_admin_smoke_sanitized.py` for admin smoke evidence instead of ad-hoc JS/Python snippets. It prints only base URL, cookie names, endpoint path, HTTP status, ok flags, JSON shape/counts, and page render hints.
- Timebox credential discovery: one sanitized env inventory plus one sanitized smoke attempt. If no valid admin token/storageState is available, classify as external/operator HOLD and ask for exactly the missing artifact.
- For preview-session evidence, smoke the same preview deployment and send exactly one Rita final addendum asking whether preview evidence is sufficient. Ava must not self-approve.
- Before creating a reviewer addendum, search the board for an existing ready/todo/running addendum for the same issue/decision. Reuse/comment/archive duplicates instead of dispatching both.
- Use `/root/.openclaw/workspace/scripts/kanban_watch_until_terminal.py` for bounded watching; it now samples log-tail changes so active workers are not misclassified as stalled merely because status/summary did not change.
- For GitHub checks, if `gh pr checks` is blocked by token scope, fall back to `gh api repos/<owner>/<repo>/commits/<sha>/status`; treat Vercel commit status as authoritative when present.
- Before PR creation/merge, restore generated `apps/web/tsconfig.tsbuildinfo` if dirty and verify PR files remain bounded.
- Postmortem/self-repair rule: do not update only Ava's skill. Classify each lesson by affected role and update the corresponding profile-local skills/references:
  - Ava/controller: dispatch sequencing, board hygiene, final sanity, GitHub/PR follow-up.
  - Pandora/planner: decomposition, task body fields, acceptance criteria, dependency/risk classification.
  - Rita/reviewer: PASS/BLOCK standards, evidence requirements, production/preview equivalence decisions.
  - Fiora/fix builder: credential-vs-code triage, regression-first repair, safe fix boundaries.
  - Anna/API builder: backend/API/DB/payment contract tests and implementation conventions.
  - Una/UI builder: admin UI, Playwright/page smoke, UI auth session evidence.
- When a retrospective lesson must affect future workers, propagate or specialize the profile-local skill files, verify hashes only for intentionally shared files, and create read-only Kanban smoke cards that prove each worker read its own profile skill path.

### Final GH-623 outcome evidence

- PR #636 merged at merge commit `7ab503244fccdca150db3400c2c45aa40c645ddf`.
- GH #623 closed.
- Post-merge Vercel commit status succeeded.
- Board had no running/stale/ready/todo #623 cards after archiving superseded residue.
