# /tp-kanban-loop Multi-Lane Dynamic Workflow Implementation Plan

> **For Hermes:** This plan upgrades `/tp-kanban-loop` from a single-next-card operator loop into a resource-safe multi-lane Kanban scheduler. It must preserve Hermes/Telegram responsiveness and must not overload the container.

**Created:** 2026-07-09 10:57:16 +0800

**Goal:** Let Ava configure and safely advance multiple open issues/cards per loop cycle while keeping each worker profile to one active task by default and preventing cross-card interference.

**Architecture:** Use dynamic-workflow principles for deterministic state compression and batch planning, then keep durable execution in Hermes Kanban. The runner produces compact lane/resource/conflict manifests; Ava uses those manifests to create/promote cards; native Kanban dispatch remains bounded by per-agent WIP, memory pressure, and guard blockers.

**Tech Stack:** Python runner/router scripts in `/root/.openclaw/workspace/scripts`, Hermes Kanban SQLite board `tour-platform`, existing `/root/.openclaw/workspace/bin/tp-kanban-loop` wrapper, pytest smoke tests.

---

## Non-negotiable safety rules

1. **Container safety first.** If memory is low or stale/high-risk workers are present, dispatch 0 and only monitor/rescue/configure.
2. **Per-agent WIP default is 1.** `tp-planner`, `tp-builder-api`, `tp-builder-ui`, `tp-builder-fix`, and `tp-reviewer` should each run at most one card by default.
3. **Batch configuration is not batch dispatch.** Ava may configure several issue chains in one cycle, but only dispatch lanes that are free and resource-safe.
4. **Conflict domains are locks.** Builder/fix cards in the same product domain must not run concurrently unless explicitly overridden later.
5. **Kanban remains the durable runtime.** Dynamic workflow is used for manifest/scoring/planning, not as a replacement for durable Kanban tasks.
6. **No gateway restart without owner approval.** Disk changes are tested with CLI/dry-run only; live Ava gateway reload requires explicit approval.

---

## Desired flow

```text
Cycle start
  -> deterministic state scan
  -> lane_status + resource_status + candidate_manifest
  -> Ava batch plan / config_budget selection
  -> create/promote Kanban cards by stage
  -> dispatch only free lanes within safe budget
  -> write baton + compact Telegram report
```

Example safe concurrent state:

```text
Issue A -> tp-builder-api backend card running
Issue B -> tp-planner plan card dispatched
Issue C -> tp-builder-ui frontend card dispatched
Issue D -> tp-reviewer review card held because Rita lane busy
Issue E -> tp-builder-fix salvage card held because missing bounded contract
```

---

## V1 scope for this implementation pass

V1 focuses on safe scheduler primitives, not full GitHub bulk-import automation yet.

### Task 1: Add lane status introspection

**Objective:** Make the runner/router report which worker lanes are busy/free and how many ready cards exist per assignee.

**Files:**
- Modify: `scripts/kanban_router.py`
- Modify: `scripts/tp_kanban_loop_runner.py`
- Test: `tests/test_tp_kanban_multilane_scheduler.py`

**Implementation details:**
- Add canonical lane config:
  - `tp-planner`
  - `tp-builder-api`
  - `tp-builder-ui`
  - `tp-builder-fix`
  - `tp-reviewer`
- Default `max_running = 1` per lane.
- Count `running`, `ready`, `todo`, `blocked` by assignee from SQLite.
- Report `available_slots = max(0, max_running - running)`.

**Verification:**
```bash
cd /root/.openclaw/workspace
python3 -m pytest tests/test_tp_kanban_multilane_scheduler.py -q
python3 scripts/kanban_router.py lane-status
```

### Task 2: Add resource-safe dispatch budget calculation

**Objective:** Compute `effective_max_dispatch` from memory, guard blockers, available lanes, and user flags.

**Files:**
- Modify: `scripts/tp_kanban_loop_runner.py`
- Test: `tests/test_tp_kanban_multilane_scheduler.py`

**Rules:**
- If `MemAvailable < min_mem_mb`, dispatch 0.
- If guard blockers exist, dispatch 0.
- If `--no-dispatch`, dispatch 0.
- If `--max-dispatch N > 0`, cap by `N` and free lanes.
- If `--max-dispatch 0`, use auto: `min(3, free_lanes, memory_budget)`.
- `memory_budget = max(1, mem_available_mb // 900)` when memory is known and healthy.

**Verification:** unit tests for high memory, low memory, fixed max, and no free lanes.

### Task 3: Add config-budget CLI flag and reporting skeleton

**Objective:** Separate card configuration budget from dispatch budget so Ava can plan multiple issues without spawning too many workers.

**Files:**
- Modify: `scripts/tp_kanban_loop_runner.py`
- Test: `tests/test_tp_kanban_multilane_scheduler.py`

**Behavior:**
- Add `--config-budget`, default `5`.
- Include it in baton and `resource-dispatch-plan` output.
- V1 does not bulk-create issue chains yet; it establishes the contract for Ava and future importer/scorer.

### Task 4: Integrate lane-status into router dispatch guard

**Objective:** Make `dispatch-guard` expose lane status so Ava can see busy/free lanes and held work.

**Files:**
- Modify: `scripts/kanban_router.py`
- Test: `tests/test_tp_kanban_multilane_scheduler.py`

**Behavior:**
- `dispatch-guard` output includes:
  - `lane_status`
  - `available_lane_count`
  - `per_agent_wip_policy`
- Do not hard-block merely because a lane is busy; the runner caps dispatch by free lanes.
- Future V2 may add selective dispatch or temporary holds to prevent native dispatcher from taking a busy-lane card first.

### Task 5: Dry-run smoke and documentation update

**Objective:** Verify no syntax/test regressions and document the new policy.

**Files:**
- Modify: `notes/tour-platform-hermes-kanban-implementation-plan-v2.md`
- Verify: runner dry-run

**Commands:**
```bash
cd /root/.openclaw/workspace
python3 -m py_compile scripts/kanban_router.py scripts/tp_kanban_loop_runner.py
python3 -m pytest tests/test_tp_kanban_multilane_scheduler.py tests/test_tp_kanban_loop_runner_role_audit.py tests/test_tp_kanban_tsconfig_guard.py -q
/root/.openclaw/workspace/bin/tp-kanban-loop --dry-run --max-cycles 1 --no-dispatch --no-self-repair --no-readme-refresh
```

---

## V2 follow-up scope

V2 is implemented as a safe planning layer plus an optional explicit apply path. By default it does not create Kanban cards.

Implemented V2 primitives:

1. `python3 scripts/kanban_router.py candidate-manifest --limit N --config-budget N`
   - reads open GitHub issues with `gh issue list`;
   - groups existing Kanban tasks by `GH-123`, `#123`, and `issues/123` references;
   - emits per-issue idempotency keys;
   - classifies rough `risk_domain` / `conflict_domain`;
   - routes high-risk issues to `tp-planner` with a blocked/spec reason;
   - routes frontend-looking issues to `tp-builder-ui`, backend-looking issues to `tp-builder-api`, unclear/docs to `tp-planner`;
   - emits a `configuration_plan` that chooses `ready`, `todo`, or `blocked` based on lane capacity and risk.
2. `--apply-config` can create idempotent Kanban configuration cards using `hermes kanban create --idempotency-key`, but this is opt-in only.
   - Non-blocked configured cards are created with `--triage`, not immediately executable `ready`, to avoid accidental fan-out.
   - High-risk cards are created with `--initial-status blocked`.
   - Every generated card preloads `project-kanban-controlled-loop`.
3. Runner includes `candidate_manifest` and optional apply summary in `resource-dispatch-plan` and baton.
4. Exact-ID selective dispatch wrapper is now implemented:
   - `python3 scripts/kanban_router.py exact-selective-dispatch --max N --compact` dry-runs the exact IDs selected by `selective-dispatch-plan`;
   - `--apply` claims/spawns only those selected task IDs and never falls back to native first-ready order;
   - the runner uses this wrapper instead of broad native `hermes kanban dispatch --max N` when dispatch is allowed.
5. Operator approval gate is now enforced for live mutations:
   - router `candidate-manifest --apply-config` requires `--operator-approved`;
   - router `exact-selective-dispatch --apply` requires `--operator-approved`;
   - runner live card creation / worker spawn requires `--operator-approve-live-mutation`;
   - without approval, live mode reports `operator_approval_required` and suppresses apply/spawn.
6. Still pending before broader autonomy:
   - stronger conflict-domain extraction from full spec/body artifacts beyond current explicit `Conflict domain:` / title classifier;

Original V2 target list:

1. Candidate manifest builder for open GitHub issues and existing Kanban chains. ✅ read-only implemented
2. Idempotency keys for issue -> spec/build/review chain creation. ✅ key emitted and used by explicit apply path
3. Conflict-domain extraction from card body/title/spec. ⚠️ rough title/label classifier only
4. Multi-issue batch configuration command path:
   - `--config-budget 5`
   - selected issues/cards
   - configured/promoted/held report
   - ✅ opt-in `--apply-config` creates triage/blocked cards idempotently; autonomous runtime enablement pending approval
5. Optional verifier/refuter pass for high-risk batch plans. pending

---

## V3 follow-up scope

Implemented V3/V4 primitives:

1. `python3 scripts/kanban_router.py selective-dispatch-plan --max N`
   - reads live `running` and `ready` Kanban cards;
   - extracts conflict domains from `Conflict domain:` / `Risk domain:` card body fields, falling back to title classification;
   - honors canonical per-lane WIP limits;
   - returns exact `dispatchable` and `held` task IDs;
   - marks native dispatch unsafe when any ready card is held by lane capacity or conflict-domain lock.
2. `python3 scripts/kanban_router.py exact-selective-dispatch --max N --compact`
   - dry-runs the exact task IDs selected by the selective plan;
   - with `--apply`, claims/spawns only those exact IDs through Hermes Kanban internals;
   - never falls back to native first-ready `dispatch --max N`.
3. Runner now includes `selective_dispatch_plan`, `exact_dispatch`, and `live_mutation_approval` in `resource-dispatch-plan` / baton.
4. Runner uses exact-ID dispatch wrapper when dispatch is allowed, while `--dry-run`, memory pressure, lane locks, hard guard blockers, and missing operator approval still suppress spawns.
5. V5 live enablement gate:
   - router apply commands require `--operator-approved`;
   - runner live mutation/spawn requires `--operator-approve-live-mutation`;
   - `operator_approval_required` is a hard blocker, not a warning.
6. V6 operator report is now printed after the JSON `resource-dispatch-plan` and written into baton as `operator_report`:

```text
CONFIGURED:
DISPATCHABLE:
DISPATCHED:
HELD:
LANE_STATUS:
POST_REPAIR_RESUME:
APPROVAL_REQUIRED:
NEXT:
```

7. V8 post-repair dispatch resume gate is implemented in the runner:
   - read-only Kanban DB health is recorded in `logs/tp-kanban-loop-kanban-db-health.json`;
   - if the DB transitions from unhealthy/malformed/missing/error to healthy, worker dispatch is blocked by `post_repair_dispatch_resume_required` until `--operator-approve-post-repair-dispatch-resume` is supplied;
   - repair/rescue remains allowed while the DB is unhealthy, but worker spawn remains blocked as `kanban_db_unhealthy`;
   - the gate is included in `resource-dispatch-plan`, baton, and `operator_report` as `POST_REPAIR_RESUME`.
8. V9 conflict-domain extraction + high-risk verifier/refuter contract is implemented in the router:
   - `extract_conflict_domains()` reads explicit `Conflict domain(s):` / `Risk domain(s):`, expected/allowed/source paths, and body/spec keywords;
   - dispatch locking now compares domain set intersection, so path-derived overlaps such as `bookings/available-slots` versus booking UI are held even without an explicit field;
   - `candidate-manifest` emits `conflict_domains`, `conflict_domain_evidence`, and `verifier_refuter` metadata;
   - high-risk issues such as payment/ECPay/auth/RLS get `verifier_refuter.status=required` and remain non-dispatchable until plan/refuter evidence exists.

9. V10 dynamic workflow candidate scorer + low-tier summarization contract is implemented in `candidate-manifest`:
   - every scanned issue gets a deterministic `candidate_score` with explicit reasons for `agent:now`, `priority:P0/P1`, queue labels, high-risk domains, recency, and active-chain penalties;
   - the manifest now scores the full issue input and selects `config_budget` candidates by `dynamic_score_desc_then_issue_desc`, instead of blindly taking the first N issues;
   - every selected candidate includes a compact `low_tier_summary` schema (`open_blockers`, `changed_since_last_baton`, `evidence_pointers`, `unknowns`, `needs_direct_verification`, `summary_text`);
   - high-risk candidates mark `recommended_verification=spot_check_original`, so Ava/main model must verify the original source before risky dispatch/mutation decisions.

Still pending:

1. No planned TP multi-lane scheduler phases remain from the V1-V10 improvement roadmap. Future work should be driven by live loop evidence/retrospectives, not broad speculative expansion.
2. Acceptance hardening is tracked in `notes/tp-kanban-loop-v1-v10-operator-acceptance-checklist.md`; diff review evidence is tracked in `notes/tp-kanban-loop-v1-v10-diff-review.md`; use both before checkpoint commit, draft PR, or live enablement.

---

## Rollback plan

If V1 causes unexpected behavior:

1. Run with `--no-dispatch` to disable spawns immediately.
2. Revert only `scripts/kanban_router.py`, `scripts/tp_kanban_loop_runner.py`, and new tests/docs.
3. Do not restart gateways until the revert is verified.
4. If Ava gateway was already reloaded, ask for approval before targeted Ava gateway restart after revert.

---

## Completion criteria for V1

- [ ] Plan saved in `notes/tp-kanban-loop-multilane-dynamic-workflow-plan.md`.
- [ ] Router can print lane status.
- [ ] Runner baton/resource-dispatch-plan includes lane status and config budget.
- [ ] Effective dispatch never exceeds free lane count.
- [ ] Low memory still dispatches 0.
- [ ] Tests and dry-run smoke pass.
- [ ] No gateway restart performed without explicit approval.
