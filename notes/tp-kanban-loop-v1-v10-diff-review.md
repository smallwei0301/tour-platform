# TP Kanban Loop V1–V10 Diff Review

Date: 2026-07-09 Asia/Taipei
Branch: `claude/post-trip-review-invitation-email`

## Reviewed scope

Reviewed only the V1–V10 scheduler hardening files, not the large pre-existing workspace noise:

- `scripts/kanban_router.py`
- `scripts/tp_kanban_loop_runner.py`
- `tests/test_tp_kanban_multilane_scheduler.py`
- `notes/tp-kanban-loop-multilane-dynamic-workflow-plan.md`
- `notes/tour-platform-hermes-kanban-implementation-plan-v2.md`
- `notes/tp-kanban-loop-v1-v10-operator-acceptance-checklist.md`
- Skill update: `project-kanban-controlled-loop`

## Review checklist

- [x] Live mutations require explicit approval gates.
- [x] Dry-run card creation and worker dispatch stay non-mutating.
- [x] Exact-ID dispatch prevents broad native first-ready dispatch.
- [x] Per-profile WIP=1 and free-lane caps are enforced in the selective plan.
- [x] Conflict-domain locking uses domain set intersection.
- [x] High-risk candidates require verifier/refuter metadata before builder dispatch.
- [x] Post-repair dispatch resume gate allows repair but blocks worker dispatch until approval after DB unhealthy -> healthy transition.
- [x] Candidate scoring uses the full scanned issue list before applying `config_budget`.
- [x] Low-tier summaries are compact entrance summaries only; risky decisions require original-source spot checks.
- [x] Operator report and baton remain compact and Telegram-friendly.
- [x] Static scan found no hardcoded secret assignment, `shell=True`, `eval/exec`, or f-string SQL execute patterns in reviewed files.

## Finding fixed during review

### Broad issue bodies could over-expand conflict domains

Observation from live `candidate-manifest --limit 6 --config-budget 2 --compact` after adding issue body fetch:

- Daily QA checklist issues mentioned many product areas in their body.
- The V9/V10 body keyword extraction initially produced overly broad conflict domains such as payment + RLS + booking + frontend for a single auth/RLS QA issue.

Fix applied:

- Keyword extraction now focuses on title plus lines that look like risk/conflict/source/expected/allowed/touch/file contract lines.
- Candidate manifest collapses over-broad body-derived domain sets back to the label/title risk domain when risk is known.
- Added regression test: `test_candidate_manifest_collapses_overbroad_body_domains_to_label_risk_domain`.

Post-fix smoke confirms:

- GH #1673 -> `conflict_domains=["auth"]`
- GH #1661 -> `conflict_domains=["supabase-rls"]`

## Verification evidence

```bash
python3 -m py_compile scripts/kanban_router.py scripts/tp_kanban_loop_runner.py
python3 -m pytest \
  tests/test_tp_kanban_multilane_scheduler.py \
  tests/test_tp_kanban_loop_runner_role_audit.py \
  tests/test_tp_kanban_tsconfig_guard.py \
  tests/test_tp_kanban_role_skills.py \
  -q
```

Result:

```text
40 passed in 32.59s
```

Dry-run smoke:

```bash
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

Runner smoke result:

```text
tp-kanban-loop done ts=2026-07-09T16:18:47+08:00 cycles=1
candidate_manifest.selected_count=2
candidate_manifest.configured_count=2
candidate_manifest.created_count=0
exact_dispatch.spawned_count=0
effective_max_dispatch=0
kanban_db_health.status=healthy
post_repair_dispatch_resume.resume_allowed=true
```

## Recommendation

Create a narrow local checkpoint commit with only the V1–V10 scheduler files and checklist/review notes, then run 2–3 more dry-run cycles before opening a draft PR.

Do not stage unrelated workspace artifacts or `apps/web/tsconfig.tsbuildinfo`.
