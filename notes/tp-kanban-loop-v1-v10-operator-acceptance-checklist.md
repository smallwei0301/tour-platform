# TP Kanban Loop V1–V10 Operator Acceptance Checklist

Date: 2026-07-09 Asia/Taipei
Scope: `/tp-kanban-loop` resource-aware multi-lane scheduler hardening from V1 through V10.

## Change inventory

Relevant V1–V10 files:

- `scripts/kanban_router.py`
- `scripts/tp_kanban_loop_runner.py`
- `tests/test_tp_kanban_multilane_scheduler.py`
- `notes/tp-kanban-loop-multilane-dynamic-workflow-plan.md`
- `notes/tour-platform-hermes-kanban-implementation-plan-v2.md`
- `notes/tp-kanban-loop-v1-v10-operator-acceptance-checklist.md`
- `notes/tp-kanban-loop-v1-v10-diff-review.md`
- Skill update: `project-kanban-controlled-loop`

Known unrelated workspace noise to keep out of the checkpoint/PR:

- `apps/web/tsconfig.tsbuildinfo`
- broad pre-existing untracked workspace directories/files such as `.claude/`, `.pnpm-store/`, `tour-platform/`, secrets/env/QA artifacts, logs, backups, worktrees, screenshots, and profile folders.

## Acceptance gates

### 1. Safety / mutation boundaries

- [x] Dry-run remains non-mutating for candidate card creation and worker dispatch.
- [x] Router `candidate-manifest --apply-config` requires `--operator-approved`.
- [x] Router `exact-selective-dispatch --apply` requires `--operator-approved`.
- [x] Runner live card creation / exact worker spawn requires `--operator-approve-live-mutation`.
- [x] Runner post-repair dispatch resume requires `--operator-approve-post-repair-dispatch-resume` after unhealthy -> healthy DB transition.
- [x] No fallback to broad native `hermes kanban dispatch --max N` for TP multi-lane dispatch.

### 2. Resource / lane scheduling

- [x] Each canonical TP worker profile defaults to WIP=1.
- [x] `effective_max_dispatch` is capped by memory, free lanes, guard blockers, and exact selected ready IDs.
- [x] Lane capacity blocks busy assignees before dispatch.
- [x] Selective dispatch emits exact `dispatchable_task_ids` and `held_task_ids`.

### 3. Conflict-domain safety

- [x] Conflict domains are extracted from explicit fields, source/allowed/expected paths, and body/spec keywords.
- [x] Ready/running domain set intersections are held as `conflict_domain_locked`.
- [x] High-risk payment/ECPay/auth/RLS/security items emit verifier/refuter requirements.
- [x] High-risk items remain non-dispatchable until a spec/refuter contract exists.

### 4. Candidate scoring / summary

- [x] `candidate-manifest` scores all scanned issues before applying `config_budget`.
- [x] Candidate score includes priority/agent labels, high-risk domain, recency, and active-chain penalty.
- [x] Selected candidates include compact `low_tier_summary` with blockers, evidence pointers, unknowns, and direct-verification flag.
- [x] High-risk candidates set `recommended_verification=spot_check_original`.
- [x] Low-tier summary is explicitly treated as entrance summary only, not source of truth.

### 5. Operator observability

- [x] Runner writes compact `resource-dispatch-plan`.
- [x] Runner writes baton with `operator_report`.
- [x] Operator report includes `CONFIGURED`, `DISPATCHABLE`, `DISPATCHED`, `HELD`, `LANE_STATUS`, `POST_REPAIR_RESUME`, `APPROVAL_REQUIRED`, and `NEXT`.
- [x] Kanban DB health state is written to `logs/tp-kanban-loop-kanban-db-health.json`.

### 6. Verification commands

Required before checkpoint / PR:

```bash
cd /root/.openclaw/workspace
python3 -m py_compile scripts/kanban_router.py scripts/tp_kanban_loop_runner.py
python3 -m pytest \
  tests/test_tp_kanban_multilane_scheduler.py \
  tests/test_tp_kanban_loop_runner_role_audit.py \
  tests/test_tp_kanban_tsconfig_guard.py \
  tests/test_tp_kanban_role_skills.py \
  -q
python3 scripts/kanban_router.py candidate-manifest --limit 6 --config-budget 2 --compact
/root/.openclaw/workspace/bin/tp-kanban-loop \
  --dry-run \
  --max-cycles 1 \
  --no-dispatch \
  --no-self-repair \
  --no-readme-refresh \
  --issue-scan-limit 6 \
  --config-budget 2
```

## Pre-checkpoint file list

Stage only these files for a checkpoint commit unless a later review explicitly expands scope:

```bash
git add \
  scripts/kanban_router.py \
  scripts/tp_kanban_loop_runner.py \
  tests/test_tp_kanban_multilane_scheduler.py \
  notes/tp-kanban-loop-multilane-dynamic-workflow-plan.md \
  notes/tour-platform-hermes-kanban-implementation-plan-v2.md \
  notes/tp-kanban-loop-v1-v10-operator-acceptance-checklist.md \
  notes/tp-kanban-loop-v1-v10-diff-review.md
```

Do not stage:

```bash
apps/web/tsconfig.tsbuildinfo
```

Do not stage broad workspace artifacts, secrets, logs, QA credentials, screenshots, backups, worktrees, or profile folders.

## Decision recommendation

Recommended next state: create a local checkpoint commit after verification passes, then run 2–3 dry-run cycles before opening a PR.

Rationale:

- V1–V10 now forms one coherent scheduler hardening package.
- The workspace has massive unrelated untracked noise; a narrow checkpoint prevents losing the known-good state.
- Opening a PR immediately is premature until the checkpoint diff is isolated and at least a few dry-run cycles confirm runtime stability.

Operator decision options:

1. Local checkpoint commit only — recommended now.
2. Open draft PR after checkpoint + 2–3 dry-run cycles.
3. Continue dry-run observation without commit — safest operationally, but risks losing a large untracked change set.
