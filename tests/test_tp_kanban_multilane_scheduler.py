import importlib.util
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER_PATH = ROOT / "scripts" / "kanban_router.py"
RUNNER_PATH = ROOT / "scripts" / "tp_kanban_loop_runner.py"

router_spec = importlib.util.spec_from_file_location("kanban_router", ROUTER_PATH)
assert router_spec is not None and router_spec.loader is not None
router = importlib.util.module_from_spec(router_spec)
router_spec.loader.exec_module(router)

runner_spec = importlib.util.spec_from_file_location("tp_kanban_loop_runner_for_multilane", RUNNER_PATH)
assert runner_spec is not None and runner_spec.loader is not None
runner = importlib.util.module_from_spec(runner_spec)
runner_spec.loader.exec_module(runner)


def make_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute(
        "CREATE TABLE tasks ("
        "id TEXT, title TEXT, assignee TEXT, status TEXT, priority INTEGER, "
        "created_at INTEGER, body TEXT, workspace_path TEXT)"
    )
    return conn


def insert_task(conn, task_id, assignee, status, *, title="Task", body="", priority=0, workspace_path=""):
    conn.execute(
        "INSERT INTO tasks (id, title, assignee, status, priority, created_at, body, workspace_path) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (task_id, title, assignee, status, priority, 1000, body, workspace_path),
    )


def lane_by_assignee(status, assignee):
    return next(lane for lane in status["lanes"] if lane["assignee"] == assignee)


def test_lane_status_counts_free_and_busy_lanes():
    conn = make_conn()
    insert_task(conn, "t_api_running", "tp-builder-api", "running")
    insert_task(conn, "t_ui_ready", "tp-builder-ui", "ready")
    insert_task(conn, "t_planner_todo", "tp-planner", "todo")

    status = router.lane_status_from_conn(conn)

    assert status["available_lane_count"] == 4
    api = lane_by_assignee(status, "tp-builder-api")
    assert api["running"] == 1
    assert api["available_slots"] == 0
    ui = lane_by_assignee(status, "tp-builder-ui")
    assert ui["ready"] == 1
    assert ui["available_slots"] == 1


def test_lane_status_honors_custom_one_slot_limits():
    conn = make_conn()
    insert_task(conn, "t_ui_running_1", "tp-builder-ui", "running")
    insert_task(conn, "t_ui_running_2", "tp-builder-ui", "running")

    status = router.lane_status_from_conn(conn, limits={"tp-builder-ui": 1})

    assert status["available_lane_count"] == 0
    assert lane_by_assignee(status, "tp-builder-ui")["available_slots"] == 0


def test_effective_dispatch_auto_caps_by_free_lanes_and_memory():
    assert runner.calculate_effective_dispatch_budget(
        mem_available_mb=5000,
        min_mem_mb=600,
        requested_max_dispatch=0,
        no_dispatch=False,
        available_lane_count=5,
        guard_blocked=False,
    ) == 3
    assert runner.calculate_effective_dispatch_budget(
        mem_available_mb=1500,
        min_mem_mb=600,
        requested_max_dispatch=0,
        no_dispatch=False,
        available_lane_count=5,
        guard_blocked=False,
    ) == 1


def test_effective_dispatch_never_exceeds_available_lanes_or_fixed_max():
    assert runner.calculate_effective_dispatch_budget(
        mem_available_mb=5000,
        min_mem_mb=600,
        requested_max_dispatch=4,
        no_dispatch=False,
        available_lane_count=2,
        guard_blocked=False,
    ) == 2


def test_effective_dispatch_fail_closed_on_pressure_guard_or_no_lanes():
    base = dict(
        min_mem_mb=600,
        requested_max_dispatch=0,
        no_dispatch=False,
        available_lane_count=3,
        guard_blocked=False,
    )
    assert runner.calculate_effective_dispatch_budget(mem_available_mb=500, **base) == 0
    assert runner.calculate_effective_dispatch_budget(mem_available_mb=5000, **{**base, "guard_blocked": True}) == 0
    assert runner.calculate_effective_dispatch_budget(mem_available_mb=5000, **{**base, "available_lane_count": 0}) == 0
    assert runner.calculate_effective_dispatch_budget(mem_available_mb=5000, **{**base, "no_dispatch": True}) == 0


def test_lane_status_from_steps_prefers_dispatch_guard_payload():
    step = {
        "name": "dispatch-guard",
        "tail": '{"lane_status":{"available_lane_count":2,"lanes":[{"assignee":"tp-planner"}]}}',
    }

    assert runner._lane_status_from_steps([step])["available_lane_count"] == 2


def test_candidate_manifest_dedupes_existing_issue_chain_and_routes_new_issues():
    conn = make_conn()
    insert_task(
        conn,
        "t_1674_plan",
        "tp-planner",
        "done",
        title="[Spec] GH-1674 RLS grants preflight",
        body="Source issue URL: https://github.com/smallwei0301/tour-platform/issues/1674\nRisk domain: supabase-rls",
    )
    insert_task(
        conn,
        "t_1674_build",
        "tp-builder-api",
        "running",
        title="[Build/API] GH-1674 RLS grants preflight helper",
        body="Conflict domain: supabase-rls",
    )
    issues = [
        {"number": 1674, "title": "RLS grants preflight helper", "labels": [{"name": "security"}], "url": "https://github.com/smallwei0301/tour-platform/issues/1674"},
        {"number": 1700, "title": "Admin booking date picker visual bug", "labels": [{"name": "type:bug"}], "url": "https://github.com/smallwei0301/tour-platform/issues/1700"},
        {"number": 1701, "title": "Payment callback auth hardening", "labels": [{"name": "payment"}], "url": "https://github.com/smallwei0301/tour-platform/issues/1701"},
    ]

    manifest = router.build_candidate_manifest_from_conn(conn, issues=issues, config_budget=5)

    by_issue = {item["issue"]: item for item in manifest["candidates"]}
    assert by_issue[1674]["current_chain_state"] == "active_chain"
    assert by_issue[1674]["recommended_action"] == "monitor_existing_chain"
    assert by_issue[1700]["suggested_stage"] == "frontend"
    assert by_issue[1700]["suggested_assignee"] == "tp-builder-ui"
    assert by_issue[1701]["suggested_stage"] == "plan"
    assert by_issue[1701]["suggested_assignee"] == "tp-planner"
    assert by_issue[1701]["hold_reason"] == "high_risk_requires_pandora_spec"
    assert manifest["selected_count"] == 3


def test_batch_configuration_plan_respects_lane_capacity_and_config_budget():
    conn = make_conn()
    insert_task(conn, "t_ui_busy", "tp-builder-ui", "running", title="[Build/UI] GH-1690 busy UI card")
    issues = [
        {"number": 1700, "title": "Admin booking date picker visual bug", "labels": [{"name": "type:bug"}], "url": "u1700"},
        {"number": 1702, "title": "Guide dashboard copy update", "labels": [{"name": "docs"}], "url": "u1702"},
    ]

    manifest = router.build_candidate_manifest_from_conn(conn, issues=issues, config_budget=1)
    plan = router.build_batch_configuration_plan(manifest, router.lane_status_from_conn(conn))

    assert manifest["selected_count"] == 1
    assert plan["configured"][0]["issue"] == 1700
    assert plan["configured"][0]["target_status"] == "todo"
    assert plan["configured"][0]["reason"] == "lane_busy_or_no_capacity"


def test_candidate_configuration_dry_run_renders_safe_idempotent_create_commands():
    plan = {
        "configured": [
            {
                "issue": 1701,
                "title": "Payment callback auth hardening",
                "url": "https://github.com/smallwei0301/tour-platform/issues/1701",
                "idempotency_key": "tp:github:smallwei0301/tour-platform:issue:1701:v2",
                "suggested_stage": "plan",
                "assignee": "tp-planner",
                "risk_domain": "payment",
                "conflict_domain": "payment",
                "target_status": "blocked",
                "reason": "high_risk_requires_pandora_spec",
            },
            {
                "issue": 1700,
                "title": "Admin booking date picker visual bug",
                "url": "https://github.com/smallwei0301/tour-platform/issues/1700",
                "idempotency_key": "tp:github:smallwei0301/tour-platform:issue:1700:v2",
                "suggested_stage": "frontend",
                "assignee": "tp-builder-ui",
                "risk_domain": "booking",
                "conflict_domain": "booking",
                "target_status": "ready",
                "reason": "lane_available",
            },
        ],
        "held": [],
    }

    result = router.apply_batch_configuration_plan(plan, apply=False)

    assert result["dry_run"] is True
    assert result["created_count"] == 0
    assert len(result["planned_commands"]) == 2
    blocked_cmd = result["planned_commands"][0]["cmd"]
    assert "--idempotency-key" in blocked_cmd
    assert "tp:github:smallwei0301/tour-platform:issue:1701:v2" in blocked_cmd
    assert "--initial-status" in blocked_cmd
    assert "blocked" in blocked_cmd
    ready_cmd = result["planned_commands"][1]["cmd"]
    assert "--triage" in ready_cmd
    assert "--skill" in ready_cmd
    assert "project-kanban-controlled-loop" in ready_cmd


def test_candidate_configuration_apply_uses_runner_and_parses_created_ids():
    calls = []

    def fake_runner(cmd):
        calls.append(cmd)
        return 0, '{"id":"t_new","deduped":false}'

    plan = {
        "configured": [
            {
                "issue": 1700,
                "title": "Admin booking date picker visual bug",
                "url": "u1700",
                "idempotency_key": "tp:github:smallwei0301/tour-platform:issue:1700:v2",
                "suggested_stage": "frontend",
                "assignee": "tp-builder-ui",
                "risk_domain": "booking",
                "conflict_domain": "booking",
                "target_status": "ready",
                "reason": "lane_available",
            }
        ],
        "held": [],
    }

    result = router.apply_batch_configuration_plan(plan, apply=True, runner=fake_runner)

    assert calls
    assert result["dry_run"] is False
    assert result["created_count"] == 1
    assert result["created"][0]["id"] == "t_new"


def test_conflict_domains_extract_from_full_spec_body_paths_and_keywords():
    body = """
Pandora/spec output:
Expected changed files or domains:
- apps/web/app/api/bookings/available-slots/route.ts
- apps/web/app/[locale]/activities/[slug]/booking/page.tsx
Allowed files:
- apps/web/src/lib/availability/guide_slot_conflict_overrides.ts
Notes: activity_plans and activity_schedules must stay consistent.
"""

    result = router.extract_conflict_domains("[Build/API] GH-1800 booking availability resolver", body)

    assert "booking" in result["domains"]
    assert "availability" in result["domains"]
    assert result["primary_domain"] == "booking"
    assert any(src["source"] == "path" for src in result["evidence"])


def test_selective_dispatch_plan_locks_path_derived_overlapping_conflict_domains():
    conn = make_conn()
    insert_task(
        conn,
        "t_booking_running",
        "tp-builder-api",
        "running",
        title="[Build/API] GH-1801 available-slots resolver",
        body="Expected changed files:\n- apps/web/app/api/bookings/available-slots/route.ts\n- apps/web/src/lib/availability/rules.ts",
    )
    insert_task(
        conn,
        "t_booking_ready",
        "tp-builder-ui",
        "ready",
        title="[Build/UI] GH-1802 booking date picker slots",
        body="Allowed files:\n- apps/web/app/[locale]/activities/[slug]/booking/page.tsx\nAcceptance: visible slots match available-slots API",
        priority=20,
    )
    insert_task(
        conn,
        "t_docs_ready",
        "tp-planner",
        "ready",
        title="[Spec] GH-1803 README status update",
        body="Allowed files:\n- docs/operations/current-issue-priority.md",
        priority=10,
    )

    plan = router.selective_dispatch_plan_from_conn(conn, max_dispatch=3)

    assert [item["id"] for item in plan["dispatchable"]] == ["t_docs_ready"]
    held = {item["id"]: item for item in plan["held"]}
    assert held["t_booking_ready"]["reason"] == "conflict_domain_locked"
    assert "booking" in held["t_booking_ready"]["conflict_domains"]
    assert "booking" in plan["running_conflict_domains"]


def test_candidate_manifest_adds_high_risk_verifier_refuter_contract():
    conn = make_conn()
    issues = [
        {"number": 1810, "title": "Payment callback auth hardening", "labels": [{"name": "payment"}], "url": "u1810"},
        {"number": 1811, "title": "Admin copy typo", "labels": [{"name": "type:bug"}], "url": "u1811"},
    ]

    manifest = router.build_candidate_manifest_from_conn(conn, issues=issues, config_budget=5)
    by_issue = {item["issue"]: item for item in manifest["candidates"]}

    assert by_issue[1810]["verifier_refuter"]["status"] == "required"
    assert by_issue[1810]["verifier_refuter"]["dispatch_blocker"] == "high_risk_verifier_refuter_required"
    assert by_issue[1810]["eligible_for_dispatch"] is False
    assert by_issue[1811]["verifier_refuter"]["status"] == "not_required"


def test_dynamic_candidate_scorer_prioritizes_agent_now_high_priority_over_input_order():
    conn = make_conn()
    issues = [
        {"number": 1901, "title": "Nice to have README cleanup", "labels": [{"name": "agent:backlog"}, {"name": "docs"}], "url": "u1901", "body": "low priority docs"},
        {"number": 1902, "title": "Payment callback auth hardening", "labels": [{"name": "agent:now"}, {"name": "priority:P0"}, {"name": "payment"}], "url": "u1902", "body": "callback can fail; needs exact files and verifier"},
        {"number": 1903, "title": "Admin copy typo", "labels": [{"name": "agent:queued"}, {"name": "type:bug"}], "url": "u1903", "body": "small UI copy"},
    ]

    manifest = router.build_candidate_manifest_from_conn(conn, issues=issues, config_budget=1)

    assert manifest["selected_count"] == 1
    selected = manifest["candidates"][0]
    assert selected["issue"] == 1902
    assert selected["candidate_score"]["score"] > 0
    assert selected["candidate_score"]["recommended_verification"] == "spot_check_original"
    assert selected["low_tier_summary"]["needs_direct_verification"] is True
    assert selected["low_tier_summary"]["evidence_pointers"] == ["issue:1902", "u1902"]


def test_candidate_scorer_penalizes_existing_active_chain_for_config_slots():
    conn = make_conn()
    insert_task(conn, "t_1904_running", "tp-builder-api", "running", title="[Build/API] GH-1904 active", body="Conflict domain: auth")
    issues = [
        {"number": 1904, "title": "Active auth chain", "labels": [{"name": "agent:now"}, {"name": "priority:P0"}, {"name": "auth"}], "url": "u1904"},
        {"number": 1905, "title": "Queued booking regression", "labels": [{"name": "agent:queued"}, {"name": "priority:P1"}, {"name": "traveler-booking"}], "url": "u1905"},
    ]

    manifest = router.build_candidate_manifest_from_conn(conn, issues=issues, config_budget=1)

    assert manifest["candidates"][0]["issue"] == 1905
    assert manifest["candidate_scorer"]["selection_policy"] == "dynamic_score_desc_then_issue_desc"


def test_low_tier_summary_contract_is_compact_and_decision_safe():
    issue = {
        "number": 1906,
        "title": "Supabase RLS grants are failing",
        "labels": [{"name": "security"}, {"name": "status:blocked"}],
        "url": "u1906",
        "body": "x" * 5000,
        "updatedAt": "2026-07-09T12:00:00Z",
    }

    summary = router.low_tier_candidate_summary(issue, risk_domain="supabase-rls", conflict_domains=["supabase-rls"])

    assert set(summary) == {"open_blockers", "changed_since_last_baton", "evidence_pointers", "unknowns", "needs_direct_verification", "summary_text"}
    assert summary["needs_direct_verification"] is True
    assert "status:blocked" in summary["open_blockers"]
    assert len(summary["summary_text"]) <= 360


def test_candidate_manifest_collapses_overbroad_body_domains_to_label_risk_domain():
    conn = make_conn()
    issue = {
        "number": 1910,
        "title": "Daily auth QA checklist",
        "labels": [{"name": "auth"}, {"name": "qa"}],
        "url": "u1910",
        "body": "Expected files/domains: payment ecpay supabase rls migration booking availability guide dashboard admin frontend api docs",
    }

    manifest = router.build_candidate_manifest_from_conn(conn, issues=[issue], config_budget=1)
    item = manifest["candidates"][0]

    assert item["conflict_domain"] == "auth"
    assert item["conflict_domains"] == ["auth"]
    assert any(e.get("source") == "broad-body-domain-collapse" for e in item["conflict_domain_evidence"])


def test_selective_dispatch_plan_locks_running_conflict_domains():
    conn = make_conn()
    insert_task(
        conn,
        "t_auth_running",
        "tp-builder-api",
        "running",
        title="[Build/API] GH-1705 auth callback hardening",
        body="Conflict domain: auth",
    )
    insert_task(
        conn,
        "t_auth_ready",
        "tp-planner",
        "ready",
        title="[Spec] GH-1706 auth session cleanup",
        body="Conflict domain: auth",
        priority=20,
    )
    insert_task(
        conn,
        "t_booking_ready",
        "tp-builder-ui",
        "ready",
        title="[Build/UI] GH-1707 booking date picker",
        body="Conflict domain: booking",
        priority=10,
    )

    plan = router.selective_dispatch_plan_from_conn(conn, max_dispatch=3)

    assert [item["id"] for item in plan["dispatchable"]] == ["t_booking_ready"]
    held = {item["id"]: item for item in plan["held"]}
    assert held["t_auth_ready"]["reason"] == "conflict_domain_locked"
    assert held["t_auth_ready"]["conflict_domain"] == "auth"
    assert plan["selected_count"] == 1


def test_selective_dispatch_plan_respects_lane_capacity_before_native_dispatch():
    conn = make_conn()
    insert_task(conn, "t_ui_running", "tp-builder-ui", "running", title="[Build/UI] GH-1708 active UI", body="Conflict domain: booking")
    insert_task(conn, "t_ui_ready", "tp-builder-ui", "ready", title="[Build/UI] GH-1709 ready UI", body="Conflict domain: admin")
    insert_task(conn, "t_api_ready", "tp-builder-api", "ready", title="[Build/API] GH-1710 ready API", body="Conflict domain: api")

    plan = router.selective_dispatch_plan_from_conn(conn, max_dispatch=2)

    assert [item["id"] for item in plan["dispatchable"]] == ["t_api_ready"]
    held = {item["id"]: item for item in plan["held"]}
    assert held["t_ui_ready"]["reason"] == "lane_busy_or_no_capacity"
    assert plan["safe_native_dispatch"] is False


def test_exact_selective_dispatch_dry_run_uses_only_dispatchable_ids():
    plan = {
        "dispatchable": [
            {"id": "t_api_ready", "assignee": "tp-builder-api"},
            {"id": "t_ui_ready", "assignee": "tp-builder-ui"},
        ],
        "held": [{"id": "t_auth_ready", "reason": "conflict_domain_locked"}],
    }

    result = router.dispatch_exact_task_ids_from_plan(plan, apply=False)

    assert result["dry_run"] is True
    assert result["planned_task_ids"] == ["t_api_ready", "t_ui_ready"]
    assert result["spawned_count"] == 0
    assert result["held_task_ids"] == ["t_auth_ready"]


def test_exact_selective_dispatch_apply_invokes_runner_only_for_allowed_ids():
    calls = []

    def fake_runner(task_id):
        calls.append(task_id)
        return {"id": task_id, "assignee": "tp-builder-api", "workspace": f"/tmp/{task_id}", "pid": 1234}

    plan = {
        "dispatchable": [
            {"id": "t_api_ready", "assignee": "tp-builder-api"},
        ],
        "held": [{"id": "t_ui_ready", "reason": "lane_busy_or_no_capacity"}],
    }

    result = router.dispatch_exact_task_ids_from_plan(plan, apply=True, runner=fake_runner)

    assert calls == ["t_api_ready"]
    assert result["dry_run"] is False
    assert result["spawned_count"] == 1
    assert result["spawned"][0]["id"] == "t_api_ready"
    assert result["held_task_ids"] == ["t_ui_ready"]


def test_router_live_apply_requires_operator_approval_before_board_reads(capsys):
    rc = router.exact_selective_dispatch(max_dispatch=1, apply=True, compact=True, operator_approved=False)

    assert rc == 3
    out = capsys.readouterr().out
    assert "operator_approval_required" in out
    assert "exact-selective-dispatch --apply" in out


def test_runner_live_mutation_approval_state_blocks_unapproved_apply_flags():
    class Args:
        dry_run = False
        apply_candidate_config = True
        no_dispatch = False
        operator_approve_live_mutation = False

    state = runner.live_mutation_approval_state(Args())

    assert state["approved"] is False
    assert "operator_approval_required" in state["blockers"]
    assert state["allow_candidate_apply"] is False
    assert state["allow_exact_dispatch_apply"] is False


def test_runner_live_mutation_approval_state_allows_explicit_approval():
    class Args:
        dry_run = False
        apply_candidate_config = True
        no_dispatch = False
        operator_approve_live_mutation = True

    state = runner.live_mutation_approval_state(Args())

    assert state["approved"] is True
    assert state["blockers"] == []
    assert state["allow_candidate_apply"] is True
    assert state["allow_exact_dispatch_apply"] is True


def test_operator_report_uses_fixed_telegram_sections_and_plain_counts():
    state = {
        "candidate_manifest": {"configured_count": 2, "created_count": 0, "apply_requested": False},
        "selective_dispatch_plan": {
            "dispatchable_task_ids": ["t_api_ready"],
            "held_task_ids": ["t_ui_held"],
            "blockers": ["lane_busy_or_no_capacity"],
        },
        "exact_dispatch": {"spawned_count": 0, "dispatchable_task_ids": ["t_api_ready"], "held_task_ids": ["t_ui_held"]},
        "lane_status": {
            "available_lane_count": 4,
            "lanes": [
                {"assignee": "tp-builder-api", "running": 0, "ready": 1, "available_slots": 1},
                {"assignee": "tp-builder-ui", "running": 1, "ready": 1, "available_slots": 0},
            ],
        },
        "live_mutation_approval": {"approved": False, "blockers": ["operator_approval_required"], "approval_flag": "--operator-approve-live-mutation"},
        "post_repair_dispatch_resume": {"repair_recent": True, "resume_allowed": False, "blockers": ["post_repair_dispatch_resume_required"]},
        "next_action": "loop finished or one-shot complete",
    }

    report = runner.format_operator_report(state)

    for heading in ["CONFIGURED:", "DISPATCHABLE:", "DISPATCHED:", "HELD:", "LANE_STATUS:", "POST_REPAIR_RESUME:", "APPROVAL_REQUIRED:", "NEXT:"]:
        assert heading in report
    assert "configured=2" in report
    assert "t_api_ready" in report
    assert "t_ui_held" in report
    assert "operator_approval_required" in report
    assert "post_repair_dispatch_resume_required" in report
    assert "--operator-approve-live-mutation" in report
    assert "tp-builder-ui running=1 ready=1 slots=0" in report


def test_post_repair_resume_gate_blocks_dispatch_after_db_repair_until_approved():
    class Args:
        operator_approve_post_repair_dispatch_resume = False

    state = runner.post_repair_dispatch_resume_state(
        Args(),
        current_health={"status": "healthy", "quick_check": "ok"},
        previous_health={"status": "malformed", "resume_required": False},
    )

    assert state["repair_allowed"] is True
    assert state["repair_recent"] is True
    assert state["resume_allowed"] is False
    assert state["resume_required"] is True
    assert "post_repair_dispatch_resume_required" in state["blockers"]


def test_post_repair_resume_gate_keeps_blocking_persisted_resume_until_approved():
    class Args:
        operator_approve_post_repair_dispatch_resume = False

    state = runner.post_repair_dispatch_resume_state(
        Args(),
        current_health={"status": "healthy", "quick_check": "ok"},
        previous_health={"status": "healthy", "resume_required": True},
    )

    assert state["resume_allowed"] is False
    assert state["resume_required"] is True
    assert state["reason"] == "post_repair_dispatch_resume_required"


def test_post_repair_resume_gate_allows_resume_with_explicit_approval():
    class Args:
        operator_approve_post_repair_dispatch_resume = True

    state = runner.post_repair_dispatch_resume_state(
        Args(),
        current_health={"status": "healthy", "quick_check": "ok"},
        previous_health={"status": "malformed", "resume_required": False},
    )

    assert state["repair_allowed"] is True
    assert state["repair_recent"] is True
    assert state["resume_allowed"] is True
    assert state["resume_required"] is False
    assert state["blockers"] == []


def test_post_repair_resume_gate_allows_repair_but_not_dispatch_when_db_unhealthy():
    class Args:
        operator_approve_post_repair_dispatch_resume = True

    state = runner.post_repair_dispatch_resume_state(
        Args(),
        current_health={"status": "malformed", "error": "database disk image is malformed"},
        previous_health={"status": "healthy", "resume_required": False},
    )

    assert state["repair_allowed"] is True
    assert state["resume_allowed"] is False
    assert state["resume_required"] is True
    assert "kanban_db_unhealthy" in state["blockers"]
