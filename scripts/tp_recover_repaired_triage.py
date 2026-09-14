#!/usr/bin/env python3
"""Resume one inert TRIAGE task through the official Hermes Dashboard API."""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from pathlib import Path

BOARD = "tour-platform"
HERMES_ROOT = Path("/root/.hermes/hermes-agent")
CANONICAL_PYTHON = HERMES_ROOT / "venv/bin/python3"


def ensure_canonical_runtime() -> None:
    if importlib.util.find_spec("fastapi") is not None:
        return
    if os.environ.get("TP_TRIAGE_RECOVERY_REEXEC") == "1":
        raise RuntimeError("canonical Hermes runtime still lacks fastapi")
    if not CANONICAL_PYTHON.is_file() or not os.access(CANONICAL_PYTHON, os.X_OK):
        raise RuntimeError(f"canonical Hermes Python is unavailable: {CANONICAL_PYTHON}")
    env = dict(os.environ)
    env["TP_TRIAGE_RECOVERY_REEXEC"] = "1"
    os.execve(
        str(CANONICAL_PYTHON),
        [str(CANONICAL_PYTHON), str(Path(__file__).resolve()), *sys.argv[1:]],
        env,
    )


def _latest_by_id(items: list[dict]) -> dict:
    return max(items, key=lambda item: int(item.get("id") or 0), default={})


def evaluate_recovery(payload: dict) -> dict:
    task = payload.get("task") or {}
    latest = _latest_by_id(payload.get("runs") or [])
    loop_events = [
        event for event in (payload.get("events") or [])
        if event.get("kind") == "block_loop_detected"
    ]
    loop = _latest_by_id(loop_events)
    loop_payload = loop.get("payload") or {}
    if isinstance(loop_payload, str):
        try:
            loop_payload = json.loads(loop_payload)
        except json.JSONDecodeError:
            loop_payload = {}

    source_status = loop_payload.get("source_status")
    if source_status == "review":
        target_status = "review"
    elif source_status in {None, "ready", "todo", "blocked"}:
        target_status = "ready"
    else:
        target_status = None

    review_events = [
        event for event in (payload.get("events") or [])
        if event.get("kind") == "review_requested"
    ]
    review_payload = (_latest_by_id(review_events).get("payload") or {})
    review_implementer = review_payload.get("implementer")
    review_reviewer = review_payload.get("reviewer")
    if not isinstance(review_implementer, str) or not review_implementer.strip():
        review_implementer = None
    if not isinstance(review_reviewer, str) or not review_reviewer.strip():
        review_reviewer = None

    reasons: list[str] = []
    if task.get("status") != "triage":
        reasons.append("TASK_NOT_TRIAGE")
    if task.get("current_run_id") is not None or task.get("worker_pid") is not None:
        reasons.append("TASK_NOT_INERT")
    if latest.get("outcome") != "blocked" or latest.get("ended_at") is None:
        reasons.append("LATEST_RUN_NOT_TERMINAL_BLOCK")
    if not loop or loop_payload.get("kind") not in {"capability", "transient"}:
        reasons.append("LATEST_LOOP_NOT_RECOVERABLE")
    if loop and int(loop.get("run_id") or 0) != int(latest.get("id") or -1):
        reasons.append("LOOP_RUN_MISMATCH")
    if target_status is None:
        reasons.append("INVALID_LOOP_SOURCE_STATUS")
    if target_status == "review" and (review_implementer is None or review_reviewer is None):
        reasons.append("INVALID_REVIEW_HANDOFF_PROVENANCE")

    return {
        "eligible": not reasons,
        "reasons": reasons,
        "latest_run_id": latest.get("id"),
        "loop_event_id": loop.get("id"),
        "loop_kind": loop_payload.get("kind"),
        "source_status": source_status,
        "recovery_target_status": target_status,
        "review_implementer": review_implementer,
        "review_reviewer": review_reviewer,
        "required_surface": "tp_recover_repaired_triage",
        "human_decision_required": False,
    }


def load_dashboard():
    sys.path.insert(0, str(HERMES_ROOT))
    path = HERMES_ROOT / "plugins/kanban/dashboard/plugin_api.py"
    spec = importlib.util.spec_from_file_location("official_triage_recovery_dashboard", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load official Dashboard API from {path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("task_id")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if os.environ.get("HERMES_PROFILE") != "ava" or os.environ.get("HERMES_KANBAN_TASK"):
        print(json.dumps({"ok": False, "error": "AVA_ROOT_ONLY"}))
        return 2

    ensure_canonical_runtime()
    dashboard = load_dashboard()
    before = dashboard.get_task(
        args.task_id, board=BOARD, run_state_type=None, run_state_name=None
    )
    gate = evaluate_recovery(before)
    if not gate["eligible"]:
        print(json.dumps({"ok": False, "task_id": args.task_id, "gate": gate}, ensure_ascii=False))
        return 3
    if args.dry_run:
        print(json.dumps({"ok": True, "dry_run": True, "task_id": args.task_id, "gate": gate}, ensure_ascii=False))
        return 0

    target_status = gate["recovery_target_status"]
    if target_status == "review":
        dashboard.update_task(
            args.task_id,
            dashboard.UpdateTaskBody(status="ready", assignee=gate["review_implementer"]),
            board=BOARD,
        )
        dashboard.update_task(
            args.task_id,
            dashboard.UpdateTaskBody(status="review", assignee=gate["review_reviewer"]),
            board=BOARD,
        )
    else:
        dashboard.update_task(
            args.task_id,
            dashboard.UpdateTaskBody(status=target_status),
            board=BOARD,
        )

    after = dashboard.get_task(
        args.task_id, board=BOARD, run_state_type=None, run_state_name=None
    )
    task = after.get("task") or {}
    if task.get("status") not in {target_status, "running"}:
        print(json.dumps({"ok": False, "error": "RECOVERY_READBACK_FAILED", "target_status": target_status, "status": task.get("status")}, ensure_ascii=False))
        return 4
    print(json.dumps({"ok": True, "task_id": args.task_id, "from": "triage", "target_status": target_status, "status": task.get("status"), "current_run_id": task.get("current_run_id"), "gate": gate}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
