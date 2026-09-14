#!/usr/bin/env python3
"""Recover an inert repaired capability-triage via official Dashboard API."""
from __future__ import annotations
import argparse, hashlib, importlib.util, json, os, re, sys
from pathlib import Path

BOARD = "tour-platform"
CANDIDATE = Path("/root/.hermes/hermes-agent")
CANONICAL_PYTHON = CANDIDATE / "venv" / "bin" / "python3"


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


def _valid_capability_receipt(comment: dict, latest: dict) -> bool:
    if comment.get("author") != "ava":
        return False
    run_id = latest.get("id")
    ended_at = int(latest.get("ended_at") or 0)
    if type(run_id) is not int or run_id <= 0 or int(comment.get("created_at") or 0) <= ended_at:
        return False
    body = str(comment.get("body") or "")
    required = (
        "CAPABILITY_BLOCK_CLEARED", f"FAILED_RUN: {run_id}", "FAILURE:",
        "ROOT_CAUSE:", "EVIDENCE:", "CONTINUATION:",
    )
    return all(marker in body for marker in required)


def _line_value(body: str, key: str) -> str | None:
    match = re.search(rf"^{re.escape(key)}:\s*(\S.*?)\s*$", body, re.MULTILINE)
    return match.group(1) if match else None


def _blocker_fingerprint(loop: dict, latest: dict) -> str:
    payload = (loop or {}).get("payload") or {}
    binding = {
        "event_id": (loop or {}).get("id"),
        "run_id": latest.get("id"),
        "kind": payload.get("kind"),
        "reason": payload.get("reason"),
        "source_status": payload.get("source_status"),
    }
    canonical = json.dumps(binding, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def _required_surface(task: dict) -> tuple[str, bool]:
    status = task.get("status")
    kind = task.get("block_kind")
    if status == "triage":
        return "tp_recover_repaired_triage", False
    if status == "blocked" and kind == "capability":
        return "kanban_controller_receipt_then_kanban_unblock", False
    if status == "blocked" and kind == "transient":
        return "kanban_recovery_receipt_then_kanban_unblock", False
    if status == "blocked" and kind == "needs_input":
        return "owner_decision_receipt_then_kanban_unblock", True
    return "no_recovery_surface", False


def evaluate_recovery(payload: dict, *, repair_witness: dict | None = None) -> dict:
    task = payload.get("task") or {}
    runs = payload.get("runs") or []
    events = payload.get("events") or []
    comments = payload.get("comments") or []
    latest = runs[-1] if runs else {}
    loop = next((e for e in reversed(events) if e.get("kind") == "block_loop_detected"), None)
    loop_payload = (loop or {}).get("payload") or {}
    loop_kind = loop_payload.get("kind")
    recurrences = loop_payload.get("recurrences")
    recurrence_limit = loop_payload.get("limit")
    source_status = loop_payload.get("source_status")
    if source_status == "review":
        recovery_target_status = "review"
    elif source_status in {None, "ready", "todo"}:
        recovery_target_status = "ready"
    else:
        recovery_target_status = None
    review_requested = next((e for e in reversed(events) if e.get("kind") == "review_requested"), None)
    review_payload = (review_requested or {}).get("payload") or {}
    review_implementer = review_payload.get("implementer")
    review_reviewer = review_payload.get("reviewer")
    if not isinstance(review_implementer, str) or not review_implementer.strip():
        review_implementer = None
    if not isinstance(review_reviewer, str) or not review_reviewer.strip():
        review_reviewer = None
    receipt = next((c for c in reversed(comments) if _valid_capability_receipt(c, latest)), None)
    receipt_body = str((receipt or {}).get("body") or "")
    blocker_event_id = (loop or {}).get("id")
    blocker_fingerprint = _blocker_fingerprint(loop or {}, latest)
    witness_task_id = _line_value(receipt_body, "REPAIR_WITNESS_TASK")
    witness_event_raw = _line_value(receipt_body, "REPAIR_WITNESS_EVENT")
    try:
        witness_event_id = int(witness_event_raw) if witness_event_raw is not None else None
    except ValueError:
        witness_event_id = None
    required_surface, human_decision_required = _required_surface(task)
    reasons = []
    if task.get("status") != "triage": reasons.append("TASK_NOT_TRIAGE")
    if task.get("current_run_id") is not None or task.get("worker_pid") is not None: reasons.append("TASK_NOT_INERT")
    if latest.get("outcome") != "blocked" or latest.get("ended_at") is None: reasons.append("LATEST_RUN_NOT_TERMINAL_BLOCK")
    if not loop or loop_kind not in {"capability", "transient"}: reasons.append("LATEST_LOOP_NOT_CAPABILITY")
    over_limit = (
        type(recurrences) is int
        and type(recurrence_limit) is int
        and recurrences > recurrence_limit
    )
    if over_limit:
        receipt_bound = bool(
            receipt
            and _line_value(receipt_body, "BLOCKER_EVENT") == str(blocker_event_id)
            and _line_value(receipt_body, "BLOCKER_FINGERPRINT") == blocker_fingerprint
            and witness_task_id
            and witness_event_id is not None
        )
        if not receipt_bound:
            reasons.append("RECURRENCE_LIMIT_EXCEEDED_REPAIR_WITNESS_REQUIRED")
        elif repair_witness is None:
            reasons.append("REPAIR_WITNESS_NOT_VERIFIED")
        else:
            witness_task = repair_witness.get("task") or {}
            witness_events = repair_witness.get("events") or []
            if witness_task.get("id") != witness_task_id:
                reasons.append("REPAIR_WITNESS_TASK_MISMATCH")
            if witness_task.get("status") not in {"done", "archived"}:
                reasons.append("REPAIR_WITNESS_TASK_NOT_TERMINAL")
            matching_witness_events = [
                event for event in witness_events
                if event.get("id") == witness_event_id
                and event.get("task_id") == witness_task_id
                and event.get("kind") == "completed"
                and int(event.get("created_at") or 0) > int(latest.get("ended_at") or 0)
            ]
            if len(matching_witness_events) != 1:
                reasons.append("REPAIR_WITNESS_EVENT_INVALID")
            referenced_tasks = set(re.findall(r"\bt_[A-Za-z0-9]+\b", str(loop_payload.get("reason") or "")))
            referenced_tasks.discard(str(task.get("id") or ""))
            if referenced_tasks and witness_task_id not in referenced_tasks:
                reasons.append("REPAIR_WITNESS_NOT_REFERENCED_BY_BLOCKER")
    if recovery_target_status is None: reasons.append("INVALID_LOOP_SOURCE_STATUS")
    if recovery_target_status == "review" and (review_implementer is None or review_reviewer is None):
        reasons.append("INVALID_REVIEW_HANDOFF_PROVENANCE")
    if receipt is None: reasons.append("NO_POST_RUN_AVA_REPAIR_RECEIPT")
    return {
        "eligible": not reasons,
        "reasons": reasons,
        "latest_run_id": latest.get("id"),
        "loop_kind": loop_kind,
        "recurrences": recurrences,
        "recurrence_limit": recurrence_limit,
        "source_status": source_status,
        "recovery_target_status": recovery_target_status,
        "review_implementer": review_implementer,
        "review_reviewer": review_reviewer,
        "receipt_created_at": (receipt or {}).get("created_at"),
        "blocker_event_id": blocker_event_id,
        "blocker_fingerprint": blocker_fingerprint,
        "repair_witness_task_id": witness_task_id,
        "repair_witness_event_id": witness_event_id,
        "required_surface": required_surface,
        "human_decision_required": human_decision_required,
    }


def load_dashboard():
    sys.path.insert(0, str(CANDIDATE))
    path = CANDIDATE / "plugins/kanban/dashboard/plugin_api.py"
    spec = importlib.util.spec_from_file_location("official_triage_recovery_dashboard", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load official Dashboard API from {path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    ap = argparse.ArgumentParser(); ap.add_argument("task_id"); ap.add_argument("--dry-run", action="store_true"); args = ap.parse_args()
    if os.environ.get("HERMES_PROFILE") != "ava" or os.environ.get("HERMES_KANBAN_TASK"):
        print(json.dumps({"ok": False, "error": "AVA_ROOT_ONLY"})); return 2
    ensure_canonical_runtime()
    dash = load_dashboard()
    before = dash.get_task(args.task_id, board=BOARD, run_state_type=None, run_state_name=None)
    gate = evaluate_recovery(before)
    witness_task_id = gate.get("repair_witness_task_id")
    if witness_task_id:
        witness = dash.get_task(
            witness_task_id, board=BOARD, run_state_type=None, run_state_name=None
        )
        gate = evaluate_recovery(before, repair_witness=witness)
    if not gate["eligible"]:
        print(json.dumps({"ok": False, "task_id": args.task_id, "gate": gate}, ensure_ascii=False)); return 3
    if args.dry_run:
        print(json.dumps({"ok": True, "dry_run": True, "task_id": args.task_id, "gate": gate}, ensure_ascii=False)); return 0
    target_status = gate["recovery_target_status"]
    if target_status == "review":
        implementer = gate["review_implementer"]
        reviewer = gate["review_reviewer"]
        dash.update_task(
            args.task_id,
            dash.UpdateTaskBody(status="ready", assignee=implementer),
            board=BOARD,
        )
        dash.update_task(
            args.task_id,
            dash.UpdateTaskBody(
                status="review",
                assignee=reviewer,
                summary="Recovered the existing same-card review after a repaired control-plane lifecycle block.",
            ),
            board=BOARD,
        )
    else:
        dash.update_task(args.task_id, dash.UpdateTaskBody(status=target_status), board=BOARD)
    after = dash.get_task(args.task_id, board=BOARD, run_state_type=None, run_state_name=None)
    task = after.get("task") or {}
    if task.get("status") not in {target_status, "running"}:
        print(json.dumps({"ok": False, "error": "RECOVERY_READBACK_FAILED", "target_status": target_status, "status": task.get("status")}, ensure_ascii=False)); return 4
    print(json.dumps({"ok": True, "task_id": args.task_id, "from": "triage", "target_status": target_status, "status": task.get("status"), "current_run_id": task.get("current_run_id"), "gate": gate}, ensure_ascii=False)); return 0

if __name__ == "__main__": raise SystemExit(main())
