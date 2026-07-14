#!/usr/bin/env python3
"""Minimal tour-platform Kanban router used by /tp_kanban_loop.

This restores the project router path expected by the tp-kanban-loop wrapper.
It intentionally exposes only non-destructive/read-only commands needed by the
loop. Slow paths use direct SQLite reads so timeout self-repair makes the next
run shorter instead of repeatedly waiting on heavyweight CLI calls.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

try:
    from tp_kanban_skill_selector import ensure_selected_skills
except ModuleNotFoundError:  # imported as scripts.kanban_router in tests
    from scripts.tp_kanban_skill_selector import ensure_selected_skills

BOARD = "tour-platform"
KANBAN_DB = Path(f"/root/.hermes/kanban/boards/{BOARD}/kanban.db")
HERMES = Path("/root/.local/bin/hermes")
PROFILE_ROOT = Path("/root/.hermes/profiles")
WORKSPACE = Path("/root/.openclaw/workspace")
PRIMARY_PRODUCT_CHECKOUT = WORKSPACE / "tour-platform"

SALVAGE_GUARD_ASSIGNEE = "tp-builder-fix"
SALVAGE_GUARD_REQUIRED_FIELDS = (
    "SINGLE_OBJECTIVE:",
    "ALLOWED_FILES:",
    "MAX_RUNTIME_SECONDS:",
    "STOP_AFTER:",
    "EXIT_CONDITION:",
)
SALVAGE_GUARD_TITLE_RE = re.compile(
    r"salvage|finali[sz]e|dirty|rebase|conflict|close[- ]gate|repair|regression|operator takeover|stalled",
    re.I,
)
SALVAGE_GUARD_BROAD_RE = re.compile(
    r"fix all|all blocker|all failures|close gate failures|full suite|preview close[- ]gate|rebase .* fallback|available[- ]slots .* formal|formal .* fallback .* legacy|activity detail .* booking|multiple blockers",
    re.I | re.S,
)

CANONICAL_PROFILE_ALIASES = {
    "anna": "tp-builder-api",
    "una": "tp-builder-ui",
    "fiora": "tp-builder-fix",
    "pandora": "tp-planner",
    "rita": "tp-reviewer",
    "ava": "ava",
}

WORKTREE_GUARD_ASSIGNEES = ("tp-builder-api", "tp-builder-ui", "tp-builder-fix", "tp-reviewer")
LANE_PROFILE_LIMITS = {
    "tp-planner": 1,
    "tp-builder-api": 1,
    "tp-builder-ui": 1,
    "tp-builder-fix": 1,
    "tp-reviewer": 1,
}
BODY_FIELD_PATTERNS = {
    "repo_path": [r"(?im)^\s*Repo path\s*:\s*(\S+)\s*$"],
    "worktree_path": [r"(?im)^\s*Worktree path\s*:\s*(\S+)\s*$"],
    "branch": [r"(?im)^\s*Branch\s*:\s*(\S+)\s*$"],
    "source_anchor": [r"(?im)^\s*(?:Source anchor|Source HEAD|Head commit|HEAD)\s*:\s*(\S+)\s*$"],
    "base_anchor": [r"(?im)^\s*(?:Base anchor|Base commit|Merge base)\s*:\s*(\S+)\s*$"],
}
SOURCE_PATH_PATTERNS = [
    r"(?im)^\s*(?:Required source path|Required source paths|Source path|Source paths|Source file|Source files)\s*:\s*(.+?)\s*$",
]
ISSUE_REF_RE = re.compile(r"(?:GH[- ]?|#|issues/)(\d+)\b", re.I)
HIGH_RISK_LABELS = {"payment", "ecpay", "auth", "security", "secrets", "db-migration", "supabase-rls", "billing"}
HIGH_RISK_TITLE_RE = re.compile(r"payment|ecpay|auth|security|secret|rls|supabase|billing|migration", re.I)
FRONTEND_TITLE_RE = re.compile(r"ui|frontend|browser|page|admin|dashboard|date picker|visual|copy|css|layout", re.I)
BACKEND_TITLE_RE = re.compile(r"api|backend|server|database|db|supabase|rls|payment|ecpay|callback|webhook|schema|migration", re.I)
DOCS_TITLE_RE = re.compile(r"docs?|readme|copy update|文字|documentation", re.I)
DOMAIN_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("ecpay", re.compile(r"ecpay|綠界", re.I)),
    ("payment", re.compile(r"payment|billing|checkout|付款|金流", re.I)),
    ("supabase-rls", re.compile(r"supabase|\brls\b|row[- ]level|policy|policies", re.I)),
    ("db-migration", re.compile(r"migration|migrations|schema|database|\bdb\b", re.I)),
    ("auth", re.compile(r"auth|session|login|security|secret", re.I)),
    ("booking", re.compile(r"booking|bookings|available[-_ ]slots|scheduleid|activity_schedules|activity_plans|reservation|預約", re.I)),
    ("availability", re.compile(r"availability|available[-_ ]slots|blackout|guide_slot_conflict_overrides|capacity|slots|可預約", re.I)),
    ("guide-dashboard", re.compile(r"guide|導遊|guide-dashboard", re.I)),
    ("admin", re.compile(r"admin|backoffice|dashboard|後台|管理", re.I)),
    ("frontend", re.compile(r"apps/web/app/|\.tsx\b|browser|ui|css|layout", re.I)),
    ("api", re.compile(r"apps/web/app/api/|/api/|route\.ts\b|server", re.I)),
    ("docs", re.compile(r"docs/|readme|\.md\b|documentation", re.I)),
]
DOMAIN_PRIORITY = [
    "ecpay", "payment", "supabase-rls", "db-migration", "auth",
    "booking", "availability", "guide-dashboard", "admin", "api", "frontend", "docs", "general",
]


def _env() -> dict[str, str]:
    env = os.environ.copy()
    env["HERMES_KANBAN_DB"] = str(KANBAN_DB)
    return env


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(KANBAN_DB), timeout=5)
    conn.row_factory = sqlite3.Row
    return conn


def _print_json(data: object) -> int:
    print(json.dumps(data, ensure_ascii=False, indent=2))
    return 0


def _task_row(row: sqlite3.Row) -> dict:
    return {k: row[k] for k in row.keys()}


def status() -> int:
    with _connect() as conn:
        by_status = {r["status"]: r["count"] for r in conn.execute("SELECT status, COUNT(*) AS count FROM tasks GROUP BY status")}
        by_assignee: dict[str, dict[str, int]] = {}
        for r in conn.execute("SELECT COALESCE(assignee, '') AS assignee, status, COUNT(*) AS count FROM tasks GROUP BY assignee, status"):
            by_assignee.setdefault(r["assignee"] or "unassigned", {})[r["status"]] = r["count"]
        ready = conn.execute("SELECT MIN(created_at) AS oldest FROM tasks WHERE status='ready'").fetchone()["oldest"]
    return _print_json({
        "by_status": by_status,
        "by_assignee": by_assignee,
        "oldest_ready_age_seconds": (int(time.time()) - int(ready)) if ready else None,
        "now": int(time.time()),
        "source": "minimal_kanban_router_sqlite",
    })


def blocked() -> int:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, title, assignee, status, priority, created_at, completed_at FROM tasks WHERE status='blocked' ORDER BY priority DESC, created_at ASC LIMIT 100"
        ).fetchall()
    return _print_json([_task_row(r) for r in rows])


def trial_candidates() -> int:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, title, assignee, status, priority, created_at FROM tasks WHERE status IN ('todo','ready','triage') ORDER BY priority DESC, created_at ASC LIMIT 50"
        ).fetchall()
    return _print_json([_task_row(r) for r in rows])


def lane_status_from_conn(conn: sqlite3.Connection, *, limits: dict[str, int] | None = None) -> dict:
    """Return per-profile lane capacity for resource-safe multi-card dispatch.

    V1 deliberately keeps every TP worker profile at WIP=1 by default. Ava may
    configure several cards in one cycle, but dispatch should only fill lanes
    with no currently running worker so the container does not overload.
    """
    limits = dict(limits or LANE_PROFILE_LIMITS)
    counts: dict[str, Counter[str]] = {assignee: Counter() for assignee in limits}
    rows = conn.execute(
        "SELECT COALESCE(assignee, '') AS assignee, status, COUNT(*) AS count "
        "FROM tasks WHERE assignee IS NOT NULL GROUP BY assignee, status"
    ).fetchall()
    for row in rows:
        assignee = str(row["assignee"] or "")
        if assignee not in counts:
            continue
        counts[assignee][str(row["status"] or "")] += int(row["count"] or 0)

    lanes = []
    available_lane_count = 0
    for assignee, max_running in limits.items():
        running = counts[assignee].get("running", 0)
        available_slots = max(0, int(max_running) - int(running))
        if available_slots > 0:
            available_lane_count += 1
        lanes.append({
            "assignee": assignee,
            "max_running": int(max_running),
            "running": int(running),
            "ready": int(counts[assignee].get("ready", 0)),
            "todo": int(counts[assignee].get("todo", 0)),
            "blocked": int(counts[assignee].get("blocked", 0)),
            "available_slots": available_slots,
            "policy": "per-agent WIP defaults to 1; configure many cards, dispatch only free lanes",
        })
    return {
        "policy": "multi-lane resource-safe dispatch; one active task per TP worker profile by default",
        "limits": limits,
        "available_lane_count": available_lane_count,
        "lanes": lanes,
    }


def lane_status() -> int:
    with _connect() as conn:
        result = lane_status_from_conn(conn)
    result["source"] = "minimal_kanban_router_sqlite"
    return _print_json(result)


def _issue_numbers_from_text(text: str) -> set[int]:
    return {int(m.group(1)) for m in ISSUE_REF_RE.finditer(text or "")}


def issue_chains_from_conn(conn: sqlite3.Connection) -> dict[int, list[dict]]:
    """Group existing Kanban tasks by referenced GitHub issue number."""
    rows = conn.execute(
        "SELECT id, title, assignee, status, priority, created_at, body FROM tasks ORDER BY created_at ASC"
    ).fetchall()
    chains: dict[int, list[dict]] = defaultdict(list)
    for row in rows:
        text = "\n".join(str(row[k] or "") for k in ("title", "body"))
        for issue in _issue_numbers_from_text(text):
            chains[issue].append({k: row[k] for k in row.keys() if k != "body"})
    return dict(chains)


def _label_names(issue: dict) -> set[str]:
    labels = issue.get("labels") or []
    names = set()
    for label in labels:
        if isinstance(label, dict):
            raw = label.get("name")
        else:
            raw = label
        if raw:
            names.add(str(raw).strip().lower())
    return names


def _risk_domain(title: str, labels: set[str]) -> str:
    text = " ".join([title, *sorted(labels)]).lower()
    if "ecpay" in text:
        return "ecpay"
    if "payment" in text or "billing" in text:
        return "payment"
    if "rls" in text or "supabase" in text:
        return "supabase-rls"
    if "auth" in text or "security" in text or "secret" in text:
        return "auth"
    if "booking" in text or "availability" in text or "date picker" in text:
        return "booking"
    if "guide" in text:
        return "guide-dashboard"
    if "admin" in text:
        return "admin"
    if "docs" in text or "readme" in text:
        return "docs"
    return "general"


def _normalize_domain(raw: object) -> str:
    value = re.sub(r"[^a-z0-9_.:-]+", "-", str(raw or "").strip().lower()).strip("-")
    aliases = {
        "available-slots": "availability",
        "availability-rules": "availability",
        "booking-v2": "booking",
        "guide-dashboard": "guide-dashboard",
        "supabase": "supabase-rls",
        "rls": "supabase-rls",
        "db": "db-migration",
        "database": "db-migration",
    }
    return aliases.get(value, value)


def _domains_from_blob(text: str, *, source: str) -> tuple[set[str], list[dict]]:
    domains: set[str] = set()
    evidence: list[dict] = []
    for domain, pattern in DOMAIN_RULES:
        match = pattern.search(text or "")
        if match:
            domains.add(domain)
            evidence.append({"source": source, "domain": domain, "match": match.group(0)[:160]})
    return domains, evidence


def extract_conflict_domains(title: str, body: str = "") -> dict:
    """Extract conflict domains from explicit fields, spec/body text, and paths.

    V9 expands beyond the old single `Conflict domain:` / `Risk domain:` field.
    It still prefers explicit fields, then uses expected/allowed/source paths and
    specification keywords to build a small set of lock domains.
    """
    domains: set[str] = set()
    evidence: list[dict] = []
    text = body or ""
    for pattern in (
        r"(?im)^\s*Conflict domains?\s*:\s*([^\n]+?)\s*$",
        r"(?im)^\s*Risk domains?\s*:\s*([^\n]+?)\s*$",
    ):
        for m in re.finditer(pattern, text):
            for raw in re.split(r"[,/|;]+", m.group(1)):
                domain = _normalize_domain(raw)
                if domain:
                    domains.add(domain)
                    evidence.append({"source": "explicit-field", "domain": domain, "match": m.group(0)[:160]})
    explicit_domains = set(domains)
    path_like: list[str] = []
    for line in text.splitlines():
        stripped = line.strip().lstrip("-*").strip()
        if "/" in stripped or re.search(r"\.(?:ts|tsx|js|jsx|sql|md|json)\b", stripped, re.I):
            path_like.append(stripped)
    path_domains, path_evidence = _domains_from_blob("\n".join(path_like), source="path")
    domains.update(path_domains)
    evidence.extend(path_evidence)
    if not explicit_domains and not path_domains:
        focused_lines = []
        for line in text.splitlines():
            lower = line.lower()
            if any(token in lower for token in ("risk domain", "conflict domain", "expected", "allowed", "source path", "source file", "touch", "files")):
                focused_lines.append(line)
        keyword_domains, keyword_evidence = _domains_from_blob("\n".join([title or "", *focused_lines[:24]]), source="keyword")
        domains.update(keyword_domains)
        evidence.extend(keyword_evidence)
    if not domains:
        domains.add(_risk_domain(title or "", set()))
        evidence.append({"source": "fallback-risk-domain", "domain": next(iter(domains)), "match": title[:160]})
    ordered = [d for d in DOMAIN_PRIORITY if d in domains]
    ordered.extend(sorted(domains - set(ordered)))
    return {
        "domains": ordered,
        "primary_domain": ordered[0] if ordered else "general",
        "evidence": evidence[:12],
    }


def high_risk_verifier_refuter_contract(*, risk_domain: str, labels: set[str], title: str) -> dict:
    high_risk = risk_domain in {"ecpay", "payment", "supabase-rls", "auth"} or bool(labels & HIGH_RISK_LABELS) or bool(HIGH_RISK_TITLE_RE.search(title or ""))
    if not high_risk:
        return {"status": "not_required", "dispatch_blocker": None, "questions": []}
    return {
        "status": "required",
        "dispatch_blocker": "high_risk_verifier_refuter_required",
        "questions": [
            "Does the plan name exact files/domains and acceptance criteria?",
            "Does a refuter identify what could go wrong before builder dispatch?",
            "Is Rita/reviewer evidence required before merge/close?",
        ],
    }


def _suggest_route(title: str, labels: set[str]) -> tuple[str, str, str | None]:
    text = " ".join([title, *sorted(labels)])
    high_risk = bool(labels & HIGH_RISK_LABELS) or bool(HIGH_RISK_TITLE_RE.search(text))
    if high_risk:
        return "plan", "tp-planner", "high_risk_requires_pandora_spec"
    if DOCS_TITLE_RE.search(text):
        return "plan", "tp-planner", None
    if FRONTEND_TITLE_RE.search(text):
        return "frontend", "tp-builder-ui", None
    if BACKEND_TITLE_RE.search(text):
        return "backend", "tp-builder-api", None
    return "plan", "tp-planner", "scope_unclear_requires_pandora_spec"


def _chain_state(tasks: list[dict]) -> str:
    statuses = {str(t.get("status") or "") for t in tasks}
    if statuses & {"running", "ready", "todo", "blocked", "triage"}:
        return "active_chain"
    if tasks:
        return "historical_chain"
    return "no_chain"


def low_tier_candidate_summary(issue: dict, *, risk_domain: str, conflict_domains: list[str]) -> dict:
    """Deterministic compact summary shaped like the low-tier summarizer contract.

    The real low-tier model can replace this upstream later; the router keeps a
    safe fixed schema so the main operator can spot-check risky originals.
    """
    labels = sorted(_label_names(issue))
    title = str(issue.get("title") or "").strip()
    body = str(issue.get("body") or issue.get("bodyText") or "")
    blockers = [label for label in labels if label.startswith("status:blocked") or label in {"blocked", "needs-info", "needs:owner"}]
    high_risk = risk_domain in {"ecpay", "payment", "supabase-rls", "auth"} or bool(set(labels) & HIGH_RISK_LABELS)
    pointers = [f"issue:{int(issue.get('number') or 0)}"]
    if issue.get("url"):
        pointers.append(str(issue.get("url")))
    if issue.get("updatedAt"):
        pointers.append(f"updatedAt:{issue.get('updatedAt')}")
    unknowns = []
    if high_risk:
        unknowns.append("requires_original_issue_spot_check")
    if not conflict_domains or conflict_domains == ["general"]:
        unknowns.append("conflict_domain_may_need_pandora_spec")
    summary_text = " ".join(part for part in [title, body[:240].replace("\n", " ")] if part).strip()[:360]
    return {
        "open_blockers": blockers,
        "changed_since_last_baton": bool(issue.get("updatedAt")),
        "evidence_pointers": pointers[:3],
        "unknowns": unknowns,
        "needs_direct_verification": bool(high_risk or blockers),
        "summary_text": summary_text,
    }


def score_candidate_issue(issue: dict, *, chain_state: str, risk_domain: str, labels: set[str]) -> dict:
    score = 0
    reasons: list[str] = []
    label_points = {
        "agent:now": 100,
        "priority:P0": 80,
        "priority:p0": 80,
        "priority:P1": 50,
        "priority:p1": 50,
        "agent:next": 35,
        "agent:queued": 20,
        "type:bug": 12,
        "qa": 6,
        "docs": -5,
        "agent:backlog": -20,
    }
    for label, points in label_points.items():
        if label in labels:
            score += points
            reasons.append(f"{label}:{points:+d}")
    if risk_domain in {"ecpay", "payment", "supabase-rls", "auth"}:
        score += 15
        reasons.append(f"high-risk-domain:{risk_domain}:+15")
    if chain_state == "active_chain":
        score -= 220
        reasons.append("active-chain:-220")
    elif chain_state == "historical_chain":
        score -= 20
        reasons.append("historical-chain:-20")
    if str(issue.get("updatedAt") or ""):
        score += 3
        reasons.append("updated:+3")
    return {
        "score": score,
        "reasons": reasons,
        "recommended_verification": "spot_check_original" if risk_domain in {"ecpay", "payment", "supabase-rls", "auth"} or bool(labels & HIGH_RISK_LABELS) else "summary_ok",
    }


def _candidate_sort_key(item: dict) -> tuple[int, int]:
    return (int((item.get("candidate_score") or {}).get("score") or 0), int(item.get("issue") or 0))


def build_candidate_manifest_from_conn(conn: sqlite3.Connection, *, issues: list[dict], config_budget: int = 5) -> dict:
    """Build a read-only V2/V10 manifest for Ava batch configuration planning."""
    chains = issue_chains_from_conn(conn)
    candidates = []
    for issue in issues:
        number = int(issue.get("number") or 0)
        if not number:
            continue
        title = str(issue.get("title") or "").strip()
        labels = _label_names(issue)
        tasks = chains.get(number, [])
        state = _chain_state(tasks)
        risk = _risk_domain(title, labels)
        conflict_info = extract_conflict_domains(title, str(issue.get("body") or issue.get("bodyText") or ""))
        if (conflict_info.get("primary_domain") or "general") == "general" and risk != "general":
            conflict_info = {
                **conflict_info,
                "primary_domain": risk,
                "domains": [risk],
                "evidence": [*(conflict_info.get("evidence") or []), {"source": "label-risk-domain", "domain": risk, "match": ",".join(sorted(labels))[:160]}],
            }
        elif risk != "general" and len(conflict_info.get("domains") or []) > 4:
            conflict_info = {
                **conflict_info,
                "primary_domain": risk,
                "domains": [risk],
                "evidence": [*(conflict_info.get("evidence") or []), {"source": "broad-body-domain-collapse", "domain": risk, "match": "too_many_body_domains; using label/title risk domain"}],
            }
        verifier_refuter = high_risk_verifier_refuter_contract(risk_domain=risk, labels=labels, title=title)
        candidate_score = score_candidate_issue(issue, chain_state=state, risk_domain=risk, labels=labels)
        low_tier_summary = low_tier_candidate_summary(issue, risk_domain=risk, conflict_domains=conflict_info.get("domains") or [risk])
        if state == "active_chain":
            stage, assignee, hold_reason = "monitor", None, "existing_active_chain"
            action = "monitor_existing_chain"
        elif state == "historical_chain":
            stage, assignee, hold_reason = "plan", "tp-planner", "historical_chain_needs_reconciliation"
            action = "reconcile_or_plan_followup"
        else:
            stage, assignee, hold_reason = _suggest_route(title, labels)
            action = "configure_new_chain"
        candidates.append({
            "issue": number,
            "title": title,
            "url": issue.get("url"),
            "labels": sorted(labels),
            "idempotency_key": f"tp:github:smallwei0301/tour-platform:issue:{number}:v2",
            "current_chain_state": state,
            "existing_task_ids": [str(t.get("id")) for t in tasks],
            "risk_domain": risk,
            "conflict_domain": conflict_info.get("primary_domain") or risk,
            "conflict_domains": conflict_info.get("domains") or [risk],
            "conflict_domain_evidence": conflict_info.get("evidence") or [],
            "verifier_refuter": verifier_refuter,
            "candidate_score": candidate_score,
            "low_tier_summary": low_tier_summary,
            "suggested_stage": stage,
            "suggested_assignee": assignee,
            "recommended_action": action,
            "hold_reason": hold_reason,
            "eligible_for_config": action in {"configure_new_chain", "reconcile_or_plan_followup"},
            "eligible_for_dispatch": False,
        })
    selected = sorted(candidates, key=_candidate_sort_key, reverse=True)[: max(0, int(config_budget or 0))]
    return {
        "source": "tp-kanban-loop-v2-candidate-manifest",
        "policy": "read-only manifest; Ava may configure up to config_budget cards, dispatch remains lane/resource guarded",
        "candidate_scorer": {
            "version": "v10-dynamic-score-v1",
            "selection_policy": "dynamic_score_desc_then_issue_desc",
            "scored_count": len(candidates),
            "selected_count": len(selected),
            "low_tier_summary_contract": ["open_blockers", "changed_since_last_baton", "evidence_pointers", "unknowns", "needs_direct_verification"],
        },
        "config_budget": int(config_budget or 0),
        "selected_count": len(selected),
        "candidates": selected,
    }


def build_batch_configuration_plan(manifest: dict, lane_status: dict) -> dict:
    lanes = {lane.get("assignee"): lane for lane in lane_status.get("lanes") or []}
    configured = []
    held = []
    for item in manifest.get("candidates") or []:
        assignee = item.get("suggested_assignee")
        if item.get("recommended_action") == "monitor_existing_chain":
            held.append({"issue": item.get("issue"), "reason": "existing_active_chain", "existing_task_ids": item.get("existing_task_ids", [])})
            continue
        target_status = "blocked" if item.get("hold_reason") == "high_risk_requires_pandora_spec" else "ready"
        reason = item.get("hold_reason") or "lane_available"
        lane = lanes.get(assignee)
        if lane is not None and int(lane.get("available_slots") or 0) <= 0:
            target_status = "todo"
            reason = "lane_busy_or_no_capacity"
        configured.append({
            "issue": item.get("issue"),
            "title": item.get("title"),
            "url": item.get("url"),
            "labels": item.get("labels", []),
            "idempotency_key": item.get("idempotency_key"),
            "suggested_stage": item.get("suggested_stage"),
            "assignee": assignee,
            "risk_domain": item.get("risk_domain"),
            "conflict_domain": item.get("conflict_domain"),
            "conflict_domains": item.get("conflict_domains", []),
            "verifier_refuter": item.get("verifier_refuter", {}),
            "target_status": target_status,
            "reason": reason,
            "dry_run": True,
        })
    return {
        "source": "tp-kanban-loop-v2-batch-configuration-plan",
        "policy": "plan only; no Kanban card mutation in V2 until operator/runtime gate is approved",
        "configured": configured,
        "held": held,
    }


def _card_title_for_config(item: dict) -> str:
    issue = item.get("issue")
    stage = str(item.get("suggested_stage") or "plan")
    prefix = {
        "plan": "[Spec]",
        "frontend": "[Build/UI]",
        "backend": "[Build/API]",
        "fix": "[Fix]",
        "review": "[Review]",
    }.get(stage, "[Spec]")
    raw_title = str(item.get("title") or "Untitled issue").strip()
    return f"{prefix} GH-{issue} {raw_title}"[:220]


def _card_body_for_config(item: dict) -> str:
    return "\n".join([
        f"Source issue URL: {item.get('url') or ''}",
        "Repo path: /root/.openclaw/workspace/tour-platform",
        f"Idempotency key: {item.get('idempotency_key') or ''}",
        f"Suggested stage: {item.get('suggested_stage') or ''}",
        f"Risk domain: {item.get('risk_domain') or ''}",
        f"Conflict domain: {item.get('conflict_domain') or ''}",
        f"Conflict domains: {', '.join(str(x) for x in (item.get('conflict_domains') or []) if x)}",
        f"Configuration reason: {item.get('reason') or ''}",
        "",
        "Ava V2 batch configuration card.",
        "Follow project-kanban-controlled-loop. Do not bypass Pandora/Rita gates.",
        "Do not push, merge, close GitHub issues, or mutate production data unless the card explicitly reaches that gate with evidence.",
        "For high-risk or unclear scope, produce a Pandora/spec contract before implementation.",
    ])


def kanban_create_command_for_config(item: dict) -> list[str]:
    cmd = [
        str(HERMES), "kanban", "--board", BOARD, "create", _card_title_for_config(item),
        "--body", _card_body_for_config(item),
        "--assignee", str(item.get("assignee") or "tp-planner"),
        "--idempotency-key", str(item.get("idempotency_key") or ""),
        "--created-by", "ava-v2-candidate-config",
        "--skill", "project-kanban-controlled-loop",
        "--json",
    ]
    if item.get("target_status") == "blocked":
        cmd.extend(["--initial-status", "blocked"])
    else:
        # Configure safely without making bulk-created backlog immediately executable.
        cmd.append("--triage")
    return cmd


def _run_command(cmd: list[str]) -> tuple[int, str]:
    proc = subprocess.run(cmd, cwd=str(WORKSPACE), text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=_env(), timeout=60)
    return proc.returncode, proc.stdout or ""


def apply_batch_configuration_plan(plan: dict, *, apply: bool = False, runner=None) -> dict:
    runner = runner or _run_command
    planned = []
    created = []
    errors = []
    for item in plan.get("configured") or []:
        cmd = kanban_create_command_for_config(item)
        planned.append({"issue": item.get("issue"), "cmd": cmd, "target_status": item.get("target_status"), "dry_run": not apply})
        if not apply:
            continue
        rc, out = runner(cmd)
        parsed = None
        try:
            parsed = json.loads(out or "{}")
        except Exception:
            parsed = {"raw": out[-1000:]}
        record = {"issue": item.get("issue"), "exit": rc, **(parsed if isinstance(parsed, dict) else {"raw": parsed})}
        if rc == 0:
            created.append(record)
        else:
            errors.append(record)
    return {
        "source": "tp-kanban-loop-v2-idempotent-config-apply",
        "dry_run": not apply,
        "planned_count": len(planned),
        "created_count": len(created),
        "error_count": len(errors),
        "planned_commands": planned,
        "created": created,
        "errors": errors,
        "held": plan.get("held") or [],
    }


def _conflict_domain_from_text(title: str, body: str) -> str:
    return str(extract_conflict_domains(title or "", body or "").get("primary_domain") or "general")


def _dispatch_item(row: sqlite3.Row) -> dict:
    title = str(row["title"] or "")
    body = str(row["body"] or "") if "body" in row.keys() else ""
    conflict_info = extract_conflict_domains(title, body)
    return {
        "id": row["id"],
        "title": title,
        "assignee": row["assignee"],
        "status": row["status"],
        "priority": row["priority"],
        "created_at": row["created_at"],
        "conflict_domain": conflict_info.get("primary_domain") or "general",
        "conflict_domains": conflict_info.get("domains") or [],
        "conflict_domain_evidence": conflict_info.get("evidence") or [],
    }


def selective_dispatch_plan_from_conn(conn: sqlite3.Connection, *, max_dispatch: int = 3, limits: dict[str, int] | None = None) -> dict:
    """Return deterministic ready task IDs that are safe for native dispatch.

    Native Hermes dispatch currently selects the first ready tasks itself. This
    pre-plan tells Ava whether that is safe under per-lane WIP and conflict
    domain locks, or whether dispatch must be suppressed until a selective
    dispatch primitive exists.
    """
    limits = limits or LANE_PROFILE_LIMITS
    max_dispatch = max(0, int(max_dispatch or 0))
    running_rows = conn.execute(
        "SELECT id, title, assignee, status, priority, created_at, body FROM tasks WHERE status='running' ORDER BY created_at ASC LIMIT 200"
    ).fetchall()
    ready_rows = conn.execute(
        "SELECT id, title, assignee, status, priority, created_at, body FROM tasks WHERE status='ready' ORDER BY priority DESC, created_at ASC LIMIT 200"
    ).fetchall()
    running = [_dispatch_item(r) for r in running_rows]
    running_by_assignee = Counter(str(item.get("assignee") or "") for item in running)
    locked_domains = sorted({str(domain) for item in running for domain in (item.get("conflict_domains") or [item.get("conflict_domain")]) if domain})
    locked_domain_set = set(locked_domains)
    planned_by_assignee: Counter[str] = Counter()
    planned_domains: set[str] = set()
    dispatchable: list[dict] = []
    held: list[dict] = []

    for row in ready_rows:
        item = _dispatch_item(row)
        assignee = str(item.get("assignee") or "")
        domain = str(item.get("conflict_domain") or "")
        domains = {str(d) for d in (item.get("conflict_domains") or [domain]) if d}
        limit = int(limits.get(assignee, 1))
        active_for_lane = int(running_by_assignee.get(assignee, 0)) + int(planned_by_assignee.get(assignee, 0))
        reason = None
        if active_for_lane >= limit:
            reason = "lane_busy_or_no_capacity"
        elif domains and (domains & locked_domain_set or domains & planned_domains):
            reason = "conflict_domain_locked"
        elif len(dispatchable) >= max_dispatch:
            reason = "dispatch_budget_exhausted"
        if reason:
            held_item = dict(item)
            held_item["reason"] = reason
            held.append(held_item)
            continue
        selected = dict(item)
        selected["reason"] = "selected_for_dispatch"
        dispatchable.append(selected)
        planned_by_assignee[assignee] += 1
        planned_domains.update(domains)

    blockers = sorted({item["reason"] for item in held if item.get("reason") in {"lane_busy_or_no_capacity", "conflict_domain_locked"}})
    return {
        "source": "tp-kanban-loop-v3-selective-dispatch-plan",
        "policy": "dispatch only ready tasks that pass lane WIP and running conflict-domain locks; suppress native dispatch when it cannot select exact allowed IDs",
        "max_dispatch": max_dispatch,
        "running_conflict_domains": locked_domains,
        "dispatchable": dispatchable,
        "held": held,
        "selected_count": len(dispatchable),
        "held_count": len(held),
        "safe_native_dispatch": not blockers and len(dispatchable) > 0,
        "blockers": blockers,
    }


def selective_dispatch_plan(max_dispatch: int = 3, *, compact: bool = False) -> int:
    with _connect() as conn:
        plan = selective_dispatch_plan_from_conn(conn, max_dispatch=max_dispatch)
    if compact:
        compact_plan = {
            "source": plan.get("source"),
            "max_dispatch": plan.get("max_dispatch"),
            "selected_count": plan.get("selected_count"),
            "held_count": plan.get("held_count"),
            "dispatchable_task_ids": [item.get("id") for item in plan.get("dispatchable") or []],
            "held_task_ids": [item.get("id") for item in plan.get("held") or []],
            "safe_native_dispatch": plan.get("safe_native_dispatch"),
            "blockers": plan.get("blockers", []),
            "running_conflict_domains": plan.get("running_conflict_domains", []),
        }
        print(json.dumps(compact_plan, ensure_ascii=False, separators=(",", ":")))
        return 0
    return _print_json(plan)


def _spawn_exact_task_id(task_id: str) -> dict:
    """Claim and spawn exactly one ready task by ID using Hermes Kanban internals."""
    import inspect
    import sys as _sys
    hermes_src = "/root/.hermes/hermes-agent"
    if hermes_src not in _sys.path:
        _sys.path.insert(0, hermes_src)
    from hermes_cli import kanban_db as kb  # type: ignore

    conn = kb.connect(board=BOARD)
    try:
        claimed = kb.claim_task(conn, task_id)
        if claimed is None:
            raise RuntimeError(f"cannot claim {task_id}: not ready, already claimed, or dependency-gated")
        try:
            resolved_branch_name = None
            if getattr(claimed, "workspace_kind", None) == "worktree":
                workspace, resolved_branch_name = kb._resolve_worktree_workspace(claimed, board=BOARD)
            else:
                workspace = kb.resolve_workspace(claimed, board=BOARD)
        except Exception as exc:
            kb._record_spawn_failure(conn, claimed.id, f"workspace: {exc}")
            raise
        kb.set_workspace_path(conn, claimed.id, str(workspace))
        if getattr(claimed, "workspace_kind", None) == "worktree":
            kb.set_branch_name(conn, claimed.id, resolved_branch_name or (claimed.branch_name or "").strip() or f"wt/{claimed.id}")
        kb._maybe_emit_scratch_tip(conn, claimed.id, claimed.workspace_kind)
        try:
            spawn = kb._default_spawn
            try:
                sig = inspect.signature(spawn)
                if "board" in sig.parameters:
                    pid = spawn(claimed, str(workspace), board=BOARD)
                else:
                    pid = spawn(claimed, str(workspace))
            except (TypeError, ValueError):
                pid = spawn(claimed, str(workspace))
            if pid:
                kb._set_worker_pid(conn, claimed.id, int(pid))
            return {"id": claimed.id, "assignee": claimed.assignee, "workspace": str(workspace), "pid": int(pid) if pid else None}
        except Exception as exc:
            kb._record_spawn_failure(conn, claimed.id, str(exc))
            raise
    finally:
        conn.close()


def dispatch_exact_task_ids_from_plan(plan: dict, *, apply: bool = False, runner=None) -> dict:
    dispatchable = [item for item in (plan.get("dispatchable") or []) if item.get("id")]
    held = [item for item in (plan.get("held") or []) if item.get("id")]
    planned_ids = [str(item.get("id")) for item in dispatchable]
    result = {
        "source": "tp-kanban-loop-v4-exact-id-dispatch",
        "policy": "spawn only task IDs selected by selective-dispatch-plan; never fall back to native first-ready order",
        "dry_run": not apply,
        "planned_task_ids": planned_ids,
        "held_task_ids": [str(item.get("id")) for item in held],
        "spawned": [],
        "errors": [],
        "spawned_count": 0,
        "error_count": 0,
    }
    if not apply:
        return result
    runner = runner or _spawn_exact_task_id
    for task_id in planned_ids:
        try:
            spawned = runner(task_id)
            if isinstance(spawned, dict):
                result["spawned"].append(spawned)
            else:
                result["spawned"].append({"id": task_id, "result": spawned})
        except Exception as exc:
            result["errors"].append({"id": task_id, "error": str(exc)[-1000:]})
    result["spawned_count"] = len(result["spawned"])
    result["error_count"] = len(result["errors"])
    return result


def _operator_approval_required_payload(action: str) -> dict:
    return {
        "source": "tp-kanban-loop-v5-operator-approval-gate",
        "status": "blocked",
        "reason": "operator_approval_required",
        "action": action,
        "approval_flag": "--operator-approved",
        "policy": "live card creation or worker spawn requires an explicit operator approval flag in addition to the apply flag",
    }


def exact_selective_dispatch(max_dispatch: int = 3, *, apply: bool = False, compact: bool = False, operator_approved: bool = False) -> int:
    if apply and not operator_approved:
        payload = _operator_approval_required_payload("exact-selective-dispatch --apply")
        if compact:
            print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
        else:
            _print_json(payload)
        return 3
    with _connect() as conn:
        plan = selective_dispatch_plan_from_conn(conn, max_dispatch=max_dispatch)
    dispatch_result = dispatch_exact_task_ids_from_plan(plan, apply=apply)
    payload = {
        "source": "tp-kanban-loop-v4-exact-selective-dispatch",
        "max_dispatch": max_dispatch,
        "apply": apply,
        "selective_dispatch_plan": plan,
        "exact_dispatch": dispatch_result,
    }
    if compact:
        compact_payload = {
            "source": payload["source"],
            "max_dispatch": max_dispatch,
            "apply": apply,
            "selected_count": plan.get("selected_count"),
            "held_count": plan.get("held_count"),
            "dispatchable_task_ids": [item.get("id") for item in plan.get("dispatchable") or []],
            "held_task_ids": [item.get("id") for item in plan.get("held") or []],
            "spawned_count": dispatch_result.get("spawned_count"),
            "error_count": dispatch_result.get("error_count"),
            "spawned": dispatch_result.get("spawned", []),
            "errors": dispatch_result.get("errors", []),
        }
        print(json.dumps(compact_payload, ensure_ascii=False, separators=(",", ":")))
        return 0 if int(dispatch_result.get("error_count") or 0) == 0 else 1
    _print_json(payload)
    return 0 if int(dispatch_result.get("error_count") or 0) == 0 else 1


def candidate_manifest(limit: int = 20, config_budget: int = 5, *, compact: bool = False, apply_config: bool = False, operator_approved: bool = False) -> int:
    if apply_config and not operator_approved:
        payload = _operator_approval_required_payload("candidate-manifest --apply-config")
        if compact:
            print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
        else:
            _print_json(payload)
        return 3
    issues = _gh_json([
        "gh", "issue", "list", "--repo", "smallwei0301/tour-platform", "--state", "open",
        "--limit", str(limit), "--json", "number,title,labels,updatedAt,url,body"
    ], timeout=60)
    if not isinstance(issues, list):
        issues = []
    with _connect() as conn:
        manifest = build_candidate_manifest_from_conn(conn, issues=issues, config_budget=config_budget)
        lanes = lane_status_from_conn(conn)
    plan = build_batch_configuration_plan(manifest, lanes)
    apply_result = apply_batch_configuration_plan(plan, apply=apply_config)
    manifest["lane_status"] = lanes
    manifest["configuration_plan"] = plan
    manifest["configuration_apply"] = apply_result
    if compact:
        compact_manifest = {
            "source": manifest.get("source"),
            "policy": manifest.get("policy"),
            "config_budget": manifest.get("config_budget"),
            "selected_count": manifest.get("selected_count"),
            "candidate_issues": [item.get("issue") for item in manifest.get("candidates") or []],
            "configuration_plan": {
                "configured": plan.get("configured", []),
                "held": plan.get("held", []),
            },
            "configuration_apply": {
                "dry_run": apply_result.get("dry_run"),
                "planned_count": apply_result.get("planned_count"),
                "created_count": apply_result.get("created_count"),
                "error_count": apply_result.get("error_count"),
                "created": apply_result.get("created", []),
                "errors": apply_result.get("errors", []),
            },
        }
        print(json.dumps(compact_manifest, ensure_ascii=False, separators=(",", ":")))
        return 0
    return _print_json(manifest)


def _gh_json(cmd: list[str], timeout: int = 45) -> object | None:
    try:
        p = subprocess.run(cmd, cwd=str(PRIMARY_PRODUCT_CHECKOUT), text=True, capture_output=True, timeout=timeout)
    except Exception:
        return None
    if p.returncode != 0:
        return None
    try:
        return json.loads(p.stdout or "null")
    except Exception:
        return None


def rescue() -> int:
    # Read-only stale-running summary; actual reclaim/kill remains explicit operator work.
    now = int(time.time())
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, title, assignee, status, started_at, claim_expires FROM tasks WHERE status='running' ORDER BY started_at ASC LIMIT 100"
        ).fetchall()
    running = [_task_row(r) for r in rows]
    stale = [r for r in running if r.get("claim_expires") and int(r["claim_expires"]) < now]
    return _print_json({"running": running, "stale": stale, "reclaimed": 0, "source": "minimal_kanban_router_sqlite_readonly"})


def _profile_exists(assignee: str | None) -> bool:
    if not assignee:
        return False
    if assignee == "default":
        return True
    return (PROFILE_ROOT / assignee).is_dir()


def _invalid_ready_assignees(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT id, title, assignee, status, created_at FROM tasks "
        "WHERE status IN ('ready','todo') AND assignee IS NOT NULL "
        "ORDER BY priority DESC, created_at ASC LIMIT 100"
    ).fetchall()
    invalid = []
    for r in rows:
        assignee = str(r["assignee"] or "")
        if _profile_exists(assignee):
            continue
        item = _task_row(r)
        if assignee in CANONICAL_PROFILE_ALIASES:
            item["suggested_assignee"] = CANONICAL_PROFILE_ALIASES[assignee]
            item["reason"] = "human-facing wrapper alias is not a Kanban profile slug"
        else:
            item["suggested_assignee"] = None
            item["reason"] = "assignee has no matching Hermes profile directory"
        invalid.append(item)
    return invalid


def _body_field(body: str, key: str) -> str | None:
    for pattern in BODY_FIELD_PATTERNS.get(key, []):
        m = re.search(pattern, body or "")
        if m:
            value = str(m.group(1) or "").strip().strip("`")
            if value:
                return value
    return None


def _body_source_paths(body: str) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for pattern in SOURCE_PATH_PATTERNS:
        for match in re.finditer(pattern, body or ""):
            raw = str(match.group(1) or "")
            pieces = re.split(r"[,\s]+", raw.replace("`", " ").strip())
            for piece in pieces:
                value = piece.strip()
                if not value or "/" not in value or value in seen:
                    continue
                seen.add(value)
                result.append(value)
    return result


def _requires_product_worktree_guard(
    *,
    repo_path: str | None,
    body_worktree_path: str | None,
    branch: str | None,
    source_anchor: str | None,
    base_anchor: str | None,
    source_paths: list[str],
) -> bool:
    return any(
        [
            repo_path,
            body_worktree_path,
            branch,
            source_anchor,
            base_anchor,
            bool(source_paths),
        ]
    )


def _git_output(path: Path, *args: str) -> tuple[int, str]:
    try:
        proc = subprocess.run(
            ["git", *args],
            cwd=str(path),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=20,
        )
        return proc.returncode, (proc.stdout or "").strip()
    except Exception as exc:
        return 127, f"{type(exc).__name__}: {exc}"


def _worktree_guard_violations(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT id, title, assignee, status, priority, created_at, workspace_path, body "
        "FROM tasks WHERE status IN ('ready','running') AND assignee IN (?,?,?,?) "
        "ORDER BY priority DESC, created_at ASC LIMIT 100",
        WORKTREE_GUARD_ASSIGNEES,
    ).fetchall()
    violations: list[dict] = []
    for r in rows:
        body = str(r["body"] or "")
        repo_path = _body_field(body, "repo_path")
        body_worktree_path = _body_field(body, "worktree_path")
        worktree_raw = str(r["workspace_path"] or "").strip() or (body_worktree_path or "")
        branch = _body_field(body, "branch")
        source_anchor = _body_field(body, "source_anchor")
        base_anchor = _body_field(body, "base_anchor")
        source_paths = _body_source_paths(body)
        if not _requires_product_worktree_guard(
            repo_path=repo_path,
            body_worktree_path=body_worktree_path,
            branch=branch,
            source_anchor=source_anchor,
            base_anchor=base_anchor,
            source_paths=source_paths,
        ):
            continue

        item = _task_row(r)
        item.pop("body", None)
        item["repo_path"] = repo_path
        item["branch_expected"] = branch
        item["source_anchor"] = source_anchor
        item["base_anchor"] = base_anchor
        item["required_source_paths"] = source_paths

        if not worktree_raw:
            item["reason"] = "builder/reviewer card missing Worktree path / workspace_path"
            item["unblock"] = "populate Worktree path in the card body and keep workspace_path aligned before dispatch"
            violations.append(item)
            continue

        worktree = Path(worktree_raw)
        item["workspace_path"] = str(worktree)
        primary_paths = {str(WORKSPACE), str(PRIMARY_PRODUCT_CHECKOUT)}
        if repo_path:
            primary_paths.add(str(Path(repo_path)))
        if str(worktree) in primary_paths:
            item["reason"] = "worktree path points at a primary checkout instead of a dedicated issue worktree"
            item["unblock"] = "create/repair a dedicated clean issue worktree and update the card before dispatch"
            violations.append(item)
            continue
        if not worktree.exists():
            item["reason"] = "worktree path does not exist"
            item["unblock"] = "create the declared worktree (git worktree add ...) or update the card path"
            violations.append(item)
            continue

        rc, dirty = _git_output(worktree, "status", "--porcelain")
        if rc != 0:
            item["reason"] = "worktree is not a usable git checkout"
            item["git_error"] = dirty[-500:]
            item["unblock"] = "repair the worktree so git status works before dispatch"
            violations.append(item)
            continue
        if dirty.strip():
            item["reason"] = "worktree is not clean"
            item["dirty_entries"] = dirty.splitlines()[:40]
            item["unblock"] = "clean or recreate the worktree; builder/reviewer cards must start from a clean tree"
            violations.append(item)
            continue

        if branch:
            rc, current_branch = _git_output(worktree, "branch", "--show-current")
            if rc != 0 or current_branch.strip() != branch:
                item["reason"] = "worktree branch does not match card Branch:"
                item["branch_actual"] = current_branch.strip() if rc == 0 else None
                item["git_error"] = current_branch[-500:] if rc != 0 else None
                item["unblock"] = "checkout the declared branch in the dedicated worktree or fix the card metadata"
                violations.append(item)
                continue

        anchor_failed = False
        for label, value in (("source_anchor", source_anchor), ("base_anchor", base_anchor)):
            if not value:
                continue
            rc, resolved = _git_output(worktree, "rev-parse", "--verify", value)
            if rc != 0:
                item["reason"] = f"{label} does not resolve in the worktree"
                item[f"{label}_error"] = resolved[-500:]
                item["unblock"] = "update the card anchor to a resolvable commit/ref or repair the worktree fetch state"
                violations.append(item)
                anchor_failed = True
                break
            item[f"{label}_resolved"] = resolved.splitlines()[-1].strip()
        if anchor_failed:
            continue

        missing_source_paths = [path for path in source_paths if not (worktree / path).exists()]
        if missing_source_paths:
            item["reason"] = "required source path is missing in the worktree"
            item["missing_source_paths"] = missing_source_paths
            item["unblock"] = "repair/recreate the worktree from the expected source commit so required paths exist"
            violations.append(item)
    return violations


def _parse_max_runtime_seconds(text: str) -> int | None:
    m = re.search(r"^\s*MAX_RUNTIME_SECONDS:\s*(\d+)\s*$", text, re.I | re.M)
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def _salvage_guard_violations(conn: sqlite3.Connection) -> list[dict]:
    """Find broad Fiora/fix salvage cards that must be narrowed before dispatch.

    Root cause from GH-838/PR873: broad `tp-builder-fix` salvage cards mixed
    rebase/conflict cleanup, product fallback fixes, preview close-gate symptoms,
    and full-suite repair, then repeatedly compacted or stalled with no useful
    diff. This guard makes that failure mode non-dispatchable unless the card
    has a narrow runtime contract Ava can monitor and reclaim quickly.
    """
    rows = conn.execute(
        "SELECT id, title, assignee, status, priority, created_at, body "
        "FROM tasks WHERE status = 'ready' AND assignee = ? "
        "ORDER BY priority DESC, created_at ASC LIMIT 100",
        (SALVAGE_GUARD_ASSIGNEE,),
    ).fetchall()
    violations: list[dict] = []
    for r in rows:
        title = str(r["title"] or "")
        body = str(r["body"] or "")
        text = f"{title}\n{body}"
        if not (SALVAGE_GUARD_TITLE_RE.search(title) or SALVAGE_GUARD_BROAD_RE.search(text)):
            continue
        missing = [field for field in SALVAGE_GUARD_REQUIRED_FIELDS if field not in text]
        max_runtime = _parse_max_runtime_seconds(text)
        too_long = max_runtime is None or max_runtime > 1200
        broad_signal = bool(SALVAGE_GUARD_BROAD_RE.search(text))
        if missing or too_long or broad_signal:
            item = _task_row(r)
            item.pop("body", None)
            item["reason"] = "tp-builder-fix salvage/finalize card lacks a bounded one-objective runtime contract or contains broad GH-838-style scope"
            item["missing_fields"] = missing
            item["max_runtime_seconds"] = max_runtime
            item["broad_scope_signal"] = broad_signal
            item["unblock"] = (
                "Rewrite/split the card so it has exactly one objective and includes "
                "SINGLE_OBJECTIVE, ALLOWED_FILES, MAX_RUNTIME_SECONDS<=1200, "
                "STOP_AFTER, and EXIT_CONDITION. Rebase/conflict cleanup, product fixes, "
                "CI failures, and preview close-gate must be separate cards."
            )
            violations.append(item)
    return violations


def apply_role_skills() -> int:
    """Mutation step: add role-default + profile-selected skills before dispatch."""
    with _connect() as conn:
        result = ensure_selected_skills(conn)
    result["source"] = "tp_kanban_skill_selector"
    result["policy"] = "role defaults plus task-relevant skills discovered from assignee profile/global skill metadata"
    return _print_json(result)


def dispatch_guard() -> int:
    with _connect() as conn:
        running = conn.execute("SELECT COUNT(*) AS c FROM tasks WHERE status='running'").fetchone()["c"]
        ready = conn.execute("SELECT COUNT(*) AS c FROM tasks WHERE status='ready'").fetchone()["c"]
        stale = conn.execute("SELECT COUNT(*) AS c FROM tasks WHERE status='running' AND claim_expires IS NOT NULL AND claim_expires < ?", (int(time.time()),)).fetchone()["c"]
        invalid_assignees = _invalid_ready_assignees(conn)
        salvage_violations = _salvage_guard_violations(conn)
        worktree_violations = _worktree_guard_violations(conn)
        lanes = lane_status_from_conn(conn)
    held = []
    if stale:
        held.append({"kind": "stale_running", "count": stale, "unblock": "inspect rescue output and reclaim/complete/block explicitly"})
    if invalid_assignees:
        held.append({
            "kind": "invalid_assignee",
            "count": len(invalid_assignees),
            "tasks": invalid_assignees,
            "unblock": "reassign to the canonical Hermes profile slug before native dispatch",
        })
    if salvage_violations:
        held.append({
            "kind": "broad_fix_salvage_contract_missing",
            "count": len(salvage_violations),
            "tasks": salvage_violations,
            "unblock": "split or rewrite broad Fiora/tp-builder-fix salvage cards before dispatch",
        })
    if worktree_violations:
        held.append({
            "kind": "worktree_preflight_failed",
            "count": len(worktree_violations),
            "tasks": worktree_violations,
            "unblock": "repair/update dedicated builder/reviewer worktrees so path, cleanliness, branch, anchors, and required source files all verify before dispatch",
        })
    # Do not block just because running exists; Ava dispatcher caps dispatch by free lanes.
    return _print_json({
        "status": "blocked" if held else "ok",
        "held": held,
        "running": running,
        "ready": ready,
        "lane_status": lanes,
        "available_lane_count": lanes.get("available_lane_count", 0),
        "per_agent_wip_policy": "default max 1 running task per TP worker profile",
        "source": "minimal_kanban_router_sqlite",
    })


def issue_residue(issue: str) -> int:
    """Read-only issue residue summary for post-close board hygiene."""
    issue_num = issue.lstrip("#")
    rx = re.compile(rf"(?:GH[- ]?|#|issues/){re.escape(issue_num)}\b", re.I)
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, title, assignee, status, created_at, started_at, completed_at, claim_expires, body "
            "FROM tasks ORDER BY created_at ASC"
        ).fetchall()
    matches = []
    for r in rows:
        text = " ".join(str(r[k] or "") for k in ("id", "title", "body"))
        if rx.search(text):
            item = {k: r[k] for k in r.keys() if k != "body"}
            item["body_match"] = True
            matches.append(item)
    active_statuses = {"ready", "running", "todo", "triage"}
    now = int(time.time())
    active = [m for m in matches if m.get("status") in active_statuses]
    stale = [m for m in matches if m.get("status") == "running" and m.get("claim_expires") and int(m["claim_expires"]) < now]
    duplicate_review_like = [m for m in active if re.search(r"review|rita|addendum|final", str(m.get("title", "")), re.I)]
    return _print_json({
        "issue": issue_num,
        "matches": matches,
        "active": active,
        "stale": stale,
        "duplicate_review_like_active": duplicate_review_like,
        "recommendation": "archive_or_comment_superseded_active_cards" if active else "no_active_residue",
        "source": "minimal_kanban_router_sqlite_readonly",
    })


def run_hermes(args: list[str]) -> int:
    proc = subprocess.run(
        [str(HERMES), "kanban", "--board", BOARD, *args],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=_env(),
    )
    if proc.stdout:
        print(proc.stdout.rstrip())
    return proc.returncode


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv:
        print("usage: kanban_router.py <status|rescue|blocked|lane-status|candidate-manifest [--limit N] [--config-budget N] [--compact] [--apply-config] [--operator-approved]|selective-dispatch-plan [--max N] [--compact]|exact-selective-dispatch [--max N] [--apply] [--operator-approved] [--compact]|apply-role-skills|dispatch-guard|wip-guard|trial-candidates|issue-residue ISSUE>", file=sys.stderr)
        return 2
    cmd, *rest = argv
    if cmd == "status":
        return status()
    if cmd == "rescue":
        return rescue()
    if cmd == "blocked":
        return blocked()
    if cmd == "lane-status":
        return lane_status()
    if cmd == "candidate-manifest":
        limit = 20
        config_budget = 5
        compact = False
        apply_config = False
        operator_approved = False
        it = iter(rest)
        for arg in it:
            if arg == "--limit":
                limit = int(next(it))
            elif arg == "--config-budget":
                config_budget = int(next(it))
            elif arg == "--compact":
                compact = True
            elif arg == "--apply-config":
                apply_config = True
            elif arg == "--operator-approved":
                operator_approved = True
            else:
                print(f"unsupported candidate-manifest arg: {arg}", file=sys.stderr)
                return 2
        return candidate_manifest(limit=limit, config_budget=config_budget, compact=compact, apply_config=apply_config, operator_approved=operator_approved)
    if cmd == "selective-dispatch-plan":
        max_dispatch = 3
        compact = False
        it = iter(rest)
        for arg in it:
            if arg == "--max":
                max_dispatch = int(next(it))
            elif arg == "--compact":
                compact = True
            else:
                print(f"unsupported selective-dispatch-plan arg: {arg}", file=sys.stderr)
                return 2
        return selective_dispatch_plan(max_dispatch=max_dispatch, compact=compact)
    if cmd == "exact-selective-dispatch":
        max_dispatch = 3
        compact = False
        apply = False
        operator_approved = False
        it = iter(rest)
        for arg in it:
            if arg == "--max":
                max_dispatch = int(next(it))
            elif arg == "--compact":
                compact = True
            elif arg == "--apply":
                apply = True
            elif arg == "--operator-approved":
                operator_approved = True
            else:
                print(f"unsupported exact-selective-dispatch arg: {arg}", file=sys.stderr)
                return 2
        return exact_selective_dispatch(max_dispatch=max_dispatch, apply=apply, compact=compact, operator_approved=operator_approved)
    if cmd == "apply-role-skills":
        return apply_role_skills()
    if cmd in {"dispatch-guard", "wip-guard"}:
        return dispatch_guard()
    if cmd == "trial-candidates":
        return trial_candidates()
    if cmd == "issue-residue":
        if not rest:
            print("usage: kanban_router.py issue-residue <issue-number>", file=sys.stderr)
            return 2
        return issue_residue(rest[0])
    print(f"unsupported minimal router command: {cmd}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
