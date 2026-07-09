#!/usr/bin/env python3
"""Tour Platform Kanban loop runner.

Stable local runner for /root/.openclaw/workspace/bin/tp-kanban-loop.
It intentionally lives in workspace/scripts so the wrapper does not depend on
archived skill directories such as tour-platform-kanban-loop/scripts/.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

WORKSPACE = Path('/root/.openclaw/workspace')
REPO = WORKSPACE / 'tour-platform'
README = REPO / 'README.md'
LOG_DIR = WORKSPACE / 'logs'
BATON = LOG_DIR / 'tp-kanban-loop-baton.json'
FAIL_LEDGER = LOG_DIR / 'tp-kanban-loop-failures.jsonl'
SELF_REPAIR_MD = LOG_DIR / 'tp-kanban-loop-self-repair.md'
README_CONTEXT_JSON = LOG_DIR / 'tp-kanban-loop-readme-context.json'
README_UPDATE_MD = LOG_DIR / 'tp-kanban-loop-readme-update.md'
KANBAN_DB_HEALTH_STATE = LOG_DIR / 'tp-kanban-loop-kanban-db-health.json'
HERMES = '/root/.local/bin/hermes'
BOARD = 'tour-platform'
KANBAN_DB = Path(f'/root/.hermes/kanban/boards/{BOARD}/kanban.db')
ROLE_SKILLS_SCRIPT = WORKSPACE / 'scripts' / 'tp_kanban_role_skills.py'
BROWSER_SMOKE_GUARD_SCRIPT = WORKSPACE / 'scripts' / 'tp_browser_smoke_guard.py'
PROFILE_GITHUB_AUTH_SCRIPT = WORKSPACE / 'scripts' / 'tp_profile_github_auth.py'
BROWSER_SMOKE_PREFLIGHT_JSON = LOG_DIR / 'tp-browser-smoke-preflight.json'
TSCONFIG_GUARD_PATHS = [
    REPO / 'apps' / 'web' / 'tsconfig.json',
    WORKSPACE / 'apps' / 'web' / 'tsconfig.json',
]
TSCONFIG_REQUIRED_INCLUDE = {
    'next-env.d.ts',
    'global.d.ts',
    'instrumentation*.ts',
    'middleware.ts',
    'playwright.config.ts',
    'sentry*.config.ts',
    'app/**/*.ts',
    'app/**/*.tsx',
    'src/**/*.ts',
    'src/**/*.tsx',
    'tests/**/*.ts',
    'tests/**/*.tsx',
    'e2e/**/*.ts',
    'e2e/**/*.tsx',
    'scripts/**/*.ts',
    '.next/types/**/*.ts',
}
TSCONFIG_REQUIRED_EXCLUDE = {
    'node_modules',
    'test-results',
    'playwright-report',
    'evidence',
    'public',
    'coverage',
}
TSCONFIG_FORBIDDEN_BROAD_INCLUDE = {'**/*.ts', '**/*.tsx'}
ROLE_DEFAULT_AUDIT_EXCLUDES = {
    'kanban-worker',
    'tour-platform-kanban-loop',
    'hermes-agent',
    'github-issues',
    'github-auth',
    'plan',
    'requesting-code-review',
}
ROLE_SKILL_PROMOTION_MIN_COUNT = 10
ROLE_SKILL_PROMOTION_MIN_RATIO = 0.25
# Downgrade is intentionally looser than promotion, but still protected by:
# - baseline skills that are never auto-removed,
# - a minimum sample size,
# - three consecutive weak-signal audits before removal.
ROLE_SKILL_DOWNGRADE_MIN_TASKS = 20
ROLE_SKILL_DOWNGRADE_MAX_SUPPORT_RATIO = 0.05
ROLE_SKILL_DOWNGRADE_STRIKES = 3
ROLE_SKILL_LEARNING_STATE = LOG_DIR / 'tp-kanban-role-skill-learning.json'
ROLE_DEFAULT_BASELINE_SKILLS: dict[str, set[str]] = {
    'ava': {'project-kanban-controlled-loop'},
    'tp-planner': {'project-kanban-controlled-loop'},
    'tp-builder-api': {'project-kanban-controlled-loop', 'test-driven-development', 'systematic-debugging', 'system-resource-guardian'},
    'tp-builder-ui': {'project-kanban-controlled-loop', 'ui-task-router', 'ui-image-implementation-qa-workflow', 'systematic-debugging', 'system-resource-guardian'},
    'tp-builder-fix': {'project-kanban-controlled-loop', 'test-driven-development', 'systematic-debugging', 'system-resource-guardian'},
    'tp-reviewer': {'project-kanban-controlled-loop', 'github-code-review', 'system-resource-guardian'},
}
TW = timezone(timedelta(hours=8))

CN_NUM = {
    '零': 0, '〇': 0, '一': 1, '二': 2, '兩': 2, '俩': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
}


def now_iso() -> str:
    return datetime.now(TW).isoformat(timespec='seconds')


def cn_to_num(s: str) -> float:
    s = s.strip()
    if not s:
        return 0
    if s in CN_NUM:
        return float(CN_NUM[s])
    if '半' in s and len(s) <= 2:
        return 0.5
    if '十' in s:
        left, _, right = s.partition('十')
        tens = CN_NUM.get(left, 1) if left else 1
        ones = CN_NUM.get(right, 0) if right else 0
        return float(tens * 10 + ones)
    total = 0
    for ch in s:
        total = total * 10 + CN_NUM.get(ch, 0)
    return float(total)


def parse_duration(text: str | None) -> int | None:
    if not text:
        return None
    s = text.strip().lower().replace('個', '').replace(' ', '')
    if not s:
        return None
    if s.isdigit():
        return int(s)
    total = 0.0
    for m in re.finditer(r'(\d+(?:\.\d+)?|[零〇一二兩俩三四五六七八九十半]+)(小時|小时|分鐘|分钟|分|秒|hours?|hrs?|hr|h|minutes?|mins?|min|m|seconds?|secs?|sec|s)', s):
        raw, unit = m.groups()
        val = float(raw) if re.match(r'\d', raw) else cn_to_num(raw)
        if unit in ('小時', '小时', 'hour', 'hours', 'hr', 'hrs', 'h'):
            total += val * 3600
        elif unit in ('分鐘', '分钟', '分', 'minute', 'minutes', 'min', 'mins', 'm'):
            total += val * 60
        else:
            total += val
    # special: 一小時半 / 一小时半
    m = re.match(r'(.+?)(小時|小时)半$', s)
    if m:
        total = cn_to_num(m.group(1)) * 3600 + 1800
    return int(total) if total > 0 else None


def mem_available_mb() -> int:
    try:
        for line in Path('/proc/meminfo').read_text().splitlines():
            if line.startswith('MemAvailable:'):
                return int(line.split()[1]) // 1024
    except Exception:
        pass
    return -1


def candidate_kanban_tsconfig_paths() -> list[Path]:
    """Return tsconfig paths for Kanban cards that could be dispatched soon."""
    if not KANBAN_DB.exists():
        return []
    candidates: list[Path] = []
    seen: set[str] = set()

    def add_worktree(raw: object) -> None:
        if not raw:
            return
        text = str(raw).strip()
        if not text or text.startswith('/tmp/'):
            # Review temp worktrees are not dispatch targets for product workers.
            return
        path = Path(text)
        if path.name == 'tsconfig.json':
            tsconfig = path
        elif path.name == 'web' and path.parent.name == 'apps':
            tsconfig = path / 'tsconfig.json'
        else:
            tsconfig = path / 'apps' / 'web' / 'tsconfig.json'
        key = str(tsconfig)
        if key not in seen:
            seen.add(key)
            candidates.append(tsconfig)

    conn = None
    try:
        conn = sqlite3.connect(str(KANBAN_DB))
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT id, body, workspace_path
            FROM tasks
            WHERE status IN ('ready', 'todo')
            """
        ).fetchall()
    except Exception:
        return []
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass

    for row in rows:
        add_worktree(row['workspace_path'])
        body = row['body'] or ''
        for match in re.finditer(r'(?im)^\s*(?:Worktree path|worktree|Repo path)\s*:\s*(\S+)\s*$', body):
            add_worktree(match.group(1))
    return candidates


def check_tsconfig_scope(paths: list[Path] | None = None) -> dict:
    """Hard pre-dispatch guard against broad TypeScript project graphs.

    A broad `apps/web/tsconfig.json` (`**/*.ts` / `**/*.tsx`) has repeatedly let
    `tsc --noEmit` and LSP workers scan stale artifacts and spike RAM.  The loop
    must block dispatch until the primary repo config and candidate worktree
    configs are scoped, so dispatch cannot recreate memory pressure.
    """
    if paths is None:
        paths = [*TSCONFIG_GUARD_PATHS, *candidate_kanban_tsconfig_paths()]
    checked: list[dict] = []
    blockers: list[dict] = []
    for path in paths:
        item = {'path': str(path), 'exists': path.exists()}
        if not path.exists():
            item['status'] = 'blocked'
            item['reason'] = 'missing tsconfig'
            blockers.append(item.copy())
            checked.append(item)
            continue
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
        except Exception as exc:
            item['status'] = 'blocked'
            item['reason'] = f'invalid json: {exc}'
            blockers.append(item.copy())
            checked.append(item)
            continue
        include = set(data.get('include') or [])
        exclude = set(data.get('exclude') or [])
        forbidden = sorted(include & TSCONFIG_FORBIDDEN_BROAD_INCLUDE)
        missing_include = sorted(TSCONFIG_REQUIRED_INCLUDE - include)
        missing_exclude = sorted(TSCONFIG_REQUIRED_EXCLUDE - exclude)
        item.update({
            'include_count': len(include),
            'exclude_count': len(exclude),
            'forbidden_broad_include': forbidden,
            'missing_required_include': missing_include,
            'missing_required_exclude': missing_exclude,
        })
        if forbidden or missing_include or missing_exclude:
            item['status'] = 'blocked'
            item['reason'] = 'broad_or_incomplete_tsconfig_scope'
            blockers.append(item.copy())
        else:
            item['status'] = 'pass'
        checked.append(item)
    return {
        'status': 'blocked' if blockers else 'pass',
        'kind': 'broad_tsconfig_scope',
        'checked': checked,
        'blockers': blockers,
    }


def browser_smoke_preflight() -> dict:
    """Record local browser-smoke watcher readiness before dispatch cycles.

    Low inotify limits caused GH-787 local Next smoke to hit ENOSPC.  The guard
    writes a compact JSON report and tells workers to use polling-mode exports
    when the kernel/container cannot raise watcher limits.
    """
    if not BROWSER_SMOKE_GUARD_SCRIPT.exists():
        return {'available': False, 'reason': 'guard script missing'}
    try:
        p = subprocess.run(
            [sys.executable, str(BROWSER_SMOKE_GUARD_SCRIPT), '--json', '--write-log'],
            cwd=str(WORKSPACE),
            text=True,
            capture_output=True,
            timeout=20,
        )
        if p.returncode != 0:
            return {'available': False, 'exit': p.returncode, 'tail': ((p.stdout or '') + (p.stderr or ''))[-1000:]}
        report = json.loads(p.stdout or '{}')
        report['path'] = str(BROWSER_SMOKE_PREFLIGHT_JSON)
        return report
    except Exception as exc:
        return {'available': False, 'error': str(exc)}


def run_step(name: str, cmd: list[str], timeout: int = 120, dry_run: bool = False) -> dict:
    if dry_run:
        return {'name': name, 'cmd': cmd, 'skipped': True, 'dry_run': True, 'exit': 0, 'elapsed': 0, 'tail': ''}
    started = time.time()
    try:
        p = subprocess.run(cmd, cwd=str(WORKSPACE), text=True, capture_output=True, timeout=timeout)
        out = (p.stdout or '') + (p.stderr or '')
        result = {
            'name': name,
            'cmd': cmd,
            'exit': p.returncode,
            'elapsed': round(time.time() - started, 1),
            'tail': out[-4000:],
        }
    except subprocess.TimeoutExpired as e:
        def _to_text(value: object) -> str:
            if value is None:
                return ''
            if isinstance(value, bytes):
                return value.decode('utf-8', errors='replace')
            return str(value)
        out = _to_text(e.stdout) + _to_text(e.stderr)
        result = {'name': name, 'cmd': cmd, 'exit': 124, 'elapsed': round(time.time() - started, 1), 'tail': ('TIMEOUT\n' + out)[-4000:]}
    if result['exit'] != 0:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        with FAIL_LEDGER.open('a', encoding='utf-8') as f:
            f.write(json.dumps({'ts': now_iso(), **result}, ensure_ascii=False) + '\n')
    return result


def _json_from_step_tail(step: dict) -> object | None:
    tail = str(step.get('tail') or '').strip()
    if not tail:
        return None
    try:
        return json.loads(tail)
    except Exception:
        pass
    # Some commands may prepend warnings before JSON. Try from the first object.
    for marker in ('{', '['):
        idx = tail.find(marker)
        if idx >= 0:
            try:
                return json.loads(tail[idx:])
            except Exception:
                continue
    return None


def _dispatch_guard_blocks_dispatch(step: dict) -> tuple[bool, list[str]]:
    data = _json_from_step_tail(step)
    if not isinstance(data, dict):
        return False, []
    if data.get('status') != 'blocked':
        return False, []
    kinds = [str(item.get('kind')) for item in data.get('held') or [] if isinstance(item, dict)]
    hard_kinds = {'stale_running', 'invalid_assignee', 'broad_fix_salvage_contract_missing', 'worktree_preflight_failed'}
    blockers = [kind for kind in kinds if kind in hard_kinds]
    return bool(blockers), blockers


def _lane_status_from_steps(steps: list[dict]) -> dict:
    """Return the newest lane_status payload emitted by router steps."""
    for step in reversed(steps):
        data = _json_from_step_tail(step)
        if not isinstance(data, dict):
            continue
        if isinstance(data.get('lane_status'), dict):
            return data['lane_status']
        if data.get('lanes') and 'available_lane_count' in data:
            return data
    return {'available_lane_count': 0, 'lanes': [], 'policy': 'lane status unavailable; fail closed'}


def _candidate_manifest_from_steps(steps: list[dict]) -> dict:
    for step in reversed(steps):
        if step.get('name') != 'candidate-manifest':
            continue
        data = _json_from_step_tail(step)
        if isinstance(data, dict):
            return data
    return {'selected_count': 0, 'candidates': [], 'configuration_plan': {'configured': [], 'held': []}}


def _selective_dispatch_plan_from_steps(steps: list[dict]) -> dict:
    for step in reversed(steps):
        if step.get('name') != 'selective-dispatch-plan':
            continue
        data = _json_from_step_tail(step)
        if isinstance(data, dict):
            return data
    return {
        'selected_count': 0,
        'held_count': 0,
        'safe_native_dispatch': False,
        'blockers': ['selective_dispatch_plan_unavailable'],
        'dispatchable_task_ids': [],
        'held_task_ids': [],
    }


def _exact_dispatch_from_steps(steps: list[dict]) -> dict:
    for step in reversed(steps):
        if step.get('name') != 'exact-selective-dispatch':
            continue
        data = _json_from_step_tail(step)
        if isinstance(data, dict):
            return data
    return {'spawned_count': 0, 'error_count': 0, 'dispatchable_task_ids': [], 'held_task_ids': []}


def live_mutation_approval_state(args: argparse.Namespace) -> dict:
    """Decide whether live card creation / worker spawning is allowed this run."""
    dry_run = bool(getattr(args, 'dry_run', False))
    no_dispatch = bool(getattr(args, 'no_dispatch', False))
    requested_config_apply = bool(getattr(args, 'apply_candidate_config', False))
    approved = bool(getattr(args, 'operator_approve_live_mutation', False)) and not dry_run
    blockers: list[str] = []
    if not dry_run and not approved and (requested_config_apply or not no_dispatch):
        blockers.append('operator_approval_required')
    return {
        'source': 'tp-kanban-loop-v5-operator-approval-gate',
        'approved': approved,
        'dry_run': dry_run,
        'approval_flag': '--operator-approve-live-mutation',
        'blockers': blockers,
        'allow_candidate_apply': bool(requested_config_apply and approved),
        'allow_exact_dispatch_apply': bool((not dry_run) and (not no_dispatch) and approved),
    }


def calculate_effective_dispatch_budget(
    *,
    mem_available_mb: int,
    min_mem_mb: int,
    requested_max_dispatch: int,
    no_dispatch: bool,
    available_lane_count: int,
    guard_blocked: bool,
) -> int:
    """Resource-safe dispatch cap for multi-lane /tp-kanban-loop.

    `requested_max_dispatch=0` means auto.  The result is always capped by free
    worker lanes so Ava can configure many cards without overloading one agent
    profile or the container.
    """
    if no_dispatch or guard_blocked:
        return 0
    if 0 <= mem_available_mb < min_mem_mb:
        return 0
    free_lanes = max(0, int(available_lane_count or 0))
    if free_lanes <= 0:
        return 0
    if requested_max_dispatch > 0:
        return min(int(requested_max_dispatch), free_lanes)
    memory_budget = 1
    if mem_available_mb > 0:
        memory_budget = max(1, mem_available_mb // 900)
    return min(3, free_lanes, memory_budget)


def read_project_readme_context() -> dict:

    """Read README.md once at loop start and save compact context for operators/workers."""
    context = {
        'ts': now_iso(),
        'path': str(README),
        'exists': README.exists(),
        'headings': [],
        'current_status_lines': [],
        'priority_lines': [],
    }
    if not README.exists():
        context['error'] = 'README.md not found'
        return context

    text = README.read_text(encoding='utf-8', errors='replace')
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith('#') and len(context['headings']) < 16:
            context['headings'].append(stripped)
        if any(token in stripped for token in ('專案現況', '最新 merge', '目前主線焦點', 'open PR 目前', 'readiness-live-state')):
            if len(context['current_status_lines']) < 24:
                context['current_status_lines'].append(stripped)
        if any(token in stripped for token in ('第一優先', '第二優先', '第三優先', '#621', '#787', '#642', '#784', '#704')):
            if len(context['priority_lines']) < 32:
                context['priority_lines'].append(stripped)

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    README_CONTEXT_JSON.write_text(json.dumps(context, ensure_ascii=False, indent=2), encoding='utf-8')
    return context


def _gh_json(cmd: list[str], timeout: int = 45) -> object | None:
    try:
        p = subprocess.run(cmd, cwd=str(REPO), text=True, capture_output=True, timeout=timeout)
    except Exception:
        return None
    if p.returncode != 0:
        return None
    try:
        return json.loads(p.stdout or 'null')
    except Exception:
        return None


def refresh_project_readme_after_loop(dry_run: bool = False) -> dict:
    """Best-effort README refresh after a loop finishes.

    Updates only stable live-marker lines. Broader priority rewrites still need
    operator review and the normal PR/final-sanity gate.
    """
    result = {
        'ts': now_iso(),
        'path': str(README),
        'dry_run': dry_run,
        'changed': False,
        'updates': [],
        'warnings': [],
    }
    if not README.exists():
        result['warnings'].append('README.md not found')
        return result

    latest_pr = _gh_json([
        'gh', 'pr', 'list', '--repo', 'smallwei0301/tour-platform', '--state', 'merged',
        '--limit', '1', '--json', 'number,title,mergedAt'
    ])
    open_prs = _gh_json([
        'gh', 'pr', 'list', '--repo', 'smallwei0301/tour-platform', '--state', 'open',
        '--limit', '100', '--json', 'number'
    ])
    today = datetime.now(TW).strftime('%Y-%m-%d')
    text = README.read_text(encoding='utf-8', errors='replace')
    new_text = text

    new_text, n = re.subn(r'## 1\. 專案現況（[^）]+）', f'## 1. 專案現況（{today}）', new_text, count=1)
    if n:
        result['updates'].append(f'專案現況 date -> {today}')

    if isinstance(latest_pr, list) and latest_pr:
        pr = latest_pr[0]
        title = str(pr.get('title') or '').strip()
        number = pr.get('number')
        repl = f'- 最新 merge（截至 {today}）：PR #{number}（{title}）'
        new_text, n = re.subn(r'- 最新 merge（截至 [^）]+）：PR #\d+（[^\n]+）', repl, new_text, count=1)
        if n:
            result['updates'].append(f'latest merged PR -> #{number}')
        else:
            result['warnings'].append('latest merge line not found; skipped')
    else:
        result['warnings'].append('could not read latest merged PR via gh')

    if isinstance(open_prs, list):
        count = len(open_prs)
        repl = f'- open PR 目前為 {count}；主線工作集中在 open issues 與下一批 PR'
        new_text, n = re.subn(r'- open PR 目前為 \d+；主線工作集中在 open issues 與下一批 PR', repl, new_text, count=1)
        if n:
            result['updates'].append(f'open PR count -> {count}')
        else:
            result['warnings'].append('open PR count line not found; skipped')
    else:
        result['warnings'].append('could not read open PR count via gh')

    result['changed'] = new_text != text
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    if result['changed'] and not dry_run:
        README.write_text(new_text, encoding='utf-8')
        check = subprocess.run(['git', 'diff', '--check', '--', 'README.md'], cwd=str(REPO), text=True, capture_output=True, timeout=30)
        result['diff_check_exit'] = check.returncode
        if check.returncode != 0:
            result['warnings'].append(('git diff --check failed: ' + (check.stdout or '') + (check.stderr or ''))[-1000:])
    README_UPDATE_MD.write_text(
        '# tp-kanban-loop README refresh\n\n'
        + json.dumps(result, ensure_ascii=False, indent=2)
        + '\n\nOperator note: if README changed, review/commit it through the normal PR/final-sanity gate.\n',
        encoding='utf-8',
    )
    return result


def write_baton(state: dict) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    tmp = BATON.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(BATON)


def _join_ids(values: list | tuple | None) -> str:
    ids = [str(v) for v in (values or []) if str(v).strip()]
    return ','.join(ids) if ids else 'none'


def read_kanban_db_health_state(path: Path = KANBAN_DB_HEALTH_STATE) -> dict:
    try:
        if not path.exists():
            return {}
        data = json.loads(path.read_text(encoding='utf-8'))
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        return {'status': 'unknown', 'read_error': str(exc)}


def inspect_kanban_db_health(db_path: Path = KANBAN_DB) -> dict:
    """Return a compact health snapshot for the durable Kanban DB.

    This probe is read-only. It allows repair/rescue flows to run, but gives the
    runner enough evidence to prevent dispatch while the DB is unhealthy or right
    after it transitions from unhealthy back to healthy.
    """
    snapshot = {'path': str(db_path), 'ts': now_iso()}
    try:
        if not db_path.exists():
            snapshot.update({'status': 'missing', 'exists': False})
            return snapshot
        st = db_path.stat()
        snapshot.update({'exists': True, 'size': st.st_size, 'mtime': st.st_mtime})
        conn = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
        try:
            quick = conn.execute('PRAGMA quick_check').fetchone()
            quick_text = str(quick[0]) if quick else 'unknown'
            snapshot['quick_check'] = quick_text
            snapshot['status'] = 'healthy' if quick_text.lower() == 'ok' else 'malformed'
        finally:
            conn.close()
    except sqlite3.DatabaseError as exc:
        snapshot.update({'status': 'malformed', 'error': str(exc)})
    except Exception as exc:
        snapshot.update({'status': 'error', 'error': str(exc)})
    return snapshot


def post_repair_dispatch_resume_state(args: argparse.Namespace, *, current_health: dict | None = None, previous_health: dict | None = None) -> dict:
    """Gate worker dispatch after Kanban DB repair without blocking repair itself.

    Ava may still diagnose and repair Kanban when the DB is unhealthy. The gate
    only controls whether worker dispatch may resume after an unhealthy->healthy
    transition, or while a prior run has a persisted resume requirement.
    """
    current_health = current_health or {}
    previous_health = previous_health or {}
    status = str(current_health.get('status') or 'unknown')
    prev_status = str(previous_health.get('status') or 'unknown')
    approved = bool(getattr(args, 'operator_approve_post_repair_dispatch_resume', False))
    unhealthy_statuses = {'malformed', 'missing', 'error', 'unhealthy'}
    current_unhealthy = status in unhealthy_statuses
    recovered_now = status == 'healthy' and prev_status in unhealthy_statuses
    persisted_required = bool(previous_health.get('resume_required'))
    repair_recent = bool(current_health.get('repair_detected')) or recovered_now or (status == 'healthy' and persisted_required)

    state = {
        'source': 'tp-kanban-loop-v8-post-repair-dispatch-resume-gate',
        'repair_allowed': True,
        'current_status': status,
        'previous_status': prev_status,
        'repair_recent': repair_recent,
        'approved': approved,
        'approval_flag': '--operator-approve-post-repair-dispatch-resume',
        'resume_allowed': True,
        'resume_required': False,
        'blockers': [],
        'reason': 'not_required',
    }
    if current_unhealthy:
        state.update({
            'repair_recent': False,
            'resume_allowed': False,
            'resume_required': True,
            'blockers': ['kanban_db_unhealthy'],
            'reason': 'kanban_db_unhealthy',
        })
        return state
    if repair_recent and not approved:
        state.update({
            'resume_allowed': False,
            'resume_required': True,
            'blockers': ['post_repair_dispatch_resume_required'],
            'reason': 'post_repair_dispatch_resume_required',
        })
        return state
    if repair_recent and approved:
        state['reason'] = 'approved'
    return state


def write_kanban_db_health_state(current_health: dict, resume_state: dict, path: Path = KANBAN_DB_HEALTH_STATE) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    payload = dict(current_health or {})
    payload['resume_required'] = bool((resume_state or {}).get('resume_required'))
    payload['post_repair_dispatch_resume'] = resume_state or {}
    payload['updated_at'] = now_iso()
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(path)


def format_operator_report(state: dict) -> str:
    """Plain Telegram/operator report for the resource dispatch decision."""
    candidate = state.get('candidate_manifest') or {}
    selective = state.get('selective_dispatch_plan') or {}
    exact = state.get('exact_dispatch') or {}
    lane_status = state.get('lane_status') or {}
    approval = state.get('live_mutation_approval') or {}
    post_repair = state.get('post_repair_dispatch_resume') or {}

    lines: list[str] = []
    lines.append('CONFIGURED:')
    lines.append(
        f"configured={int(candidate.get('configured_count') or 0)} "
        f"created={int(candidate.get('created_count') or 0)} "
        f"apply_requested={bool(candidate.get('apply_requested'))}"
    )
    lines.append('DISPATCHABLE:')
    lines.append(_join_ids(selective.get('dispatchable_task_ids') or exact.get('dispatchable_task_ids')))
    lines.append('DISPATCHED:')
    lines.append(
        f"spawned={int(exact.get('spawned_count') or 0)} "
        f"ids={_join_ids(exact.get('dispatchable_task_ids'))}"
    )
    lines.append('HELD:')
    held_ids = selective.get('held_task_ids') or exact.get('held_task_ids')
    blockers = [str(b) for b in (selective.get('blockers') or state.get('guard_blockers') or [])]
    lines.append(f"ids={_join_ids(held_ids)} blockers={','.join(blockers) if blockers else 'none'}")
    lines.append('LANE_STATUS:')
    lines.append(f"available_lanes={int(lane_status.get('available_lane_count') or 0)}")
    for lane in lane_status.get('lanes') or []:
        if not isinstance(lane, dict):
            continue
        lines.append(
            f"- {lane.get('assignee')} running={int(lane.get('running') or 0)} "
            f"ready={int(lane.get('ready') or 0)} slots={int(lane.get('available_slots') or 0)}"
        )
    lines.append('POST_REPAIR_RESUME:')
    post_blockers = [str(b) for b in (post_repair.get('blockers') or [])]
    if post_blockers:
        lines.append(
            f"resume_allowed=false repair_recent={bool(post_repair.get('repair_recent'))} "
            f"blockers={','.join(post_blockers)} flag={post_repair.get('approval_flag') or '--operator-approve-post-repair-dispatch-resume'}"
        )
    else:
        lines.append(
            f"resume_allowed={str(bool(post_repair.get('resume_allowed', True))).lower()} "
            f"repair_recent={bool(post_repair.get('repair_recent'))}"
        )
    lines.append('APPROVAL_REQUIRED:')
    approval_blockers = [str(b) for b in (approval.get('blockers') or [])]
    if approval_blockers:
        lines.append(f"yes blockers={','.join(approval_blockers)} flag={approval.get('approval_flag') or '--operator-approve-live-mutation'}")
    elif approval.get('approved'):
        lines.append('no approved=true')
    else:
        lines.append('no')
    lines.append('NEXT:')
    lines.append(str(state.get('next_action') or 'review resource-dispatch-plan'))
    return '\n'.join(lines)


def one_cycle(args: argparse.Namespace, cycle: int) -> dict:
    mem = mem_available_mb()
    pressure = 0 <= mem < args.min_mem_mb
    previous_db_health = read_kanban_db_health_state()
    current_db_health = inspect_kanban_db_health()
    post_repair_resume = post_repair_dispatch_resume_state(
        args,
        current_health=current_db_health,
        previous_health=previous_db_health,
    )
    # Provisional value before router lane/guard probes. Final dispatch budget is
    # recomputed after `dispatch-guard` so it is capped by free lanes and hard blockers.
    max_dispatch = 0 if args.no_dispatch or pressure else 1
    live_approval = live_mutation_approval_state(args)
    candidate_manifest_cmd = [
        'python3', 'scripts/kanban_router.py', 'candidate-manifest',
        '--limit', str(args.issue_scan_limit),
        '--config-budget', str(args.config_budget),
        '--compact',
    ]
    if live_approval.get('allow_candidate_apply'):
        candidate_manifest_cmd.extend(['--apply-config', '--operator-approved'])

    steps = []
    for name, cmd, timeout in [
        ('status', ['python3', 'scripts/kanban_router.py', 'status'], 90),
        ('rescue', ['python3', 'scripts/kanban_router.py', 'rescue'], 90),
        ('blocked', ['python3', 'scripts/kanban_router.py', 'blocked'], 90),
        ('lane-status', ['python3', 'scripts/kanban_router.py', 'lane-status'], 90),
        ('candidate-manifest', candidate_manifest_cmd, 90),
        ('selective-dispatch-plan', ['python3', 'scripts/kanban_router.py', 'selective-dispatch-plan', '--max', str(max(1, args.max_dispatch or 3)), '--compact'], 90),
        # Mutation before dispatch: make existing/imported todo/ready cards carry
        # their role-default skills even when the importer did not pass --skill.
        ('apply-role-skills', ['python3', 'scripts/kanban_router.py', 'apply-role-skills'], 90),
        # Profile-local HOME values do not inherit root/Ava GitHub auth.  Keep
        # worker gh/git push auth healthy before dispatch so Fiora/Anna/Una/Rita
        # do not finish product work and then fail only at push/PR handoff.
        ('github-auth-preflight', ['python3', 'scripts/tp_profile_github_auth.py'], 120),
        # Safe post-merge hygiene: remove/trash only closed-issue worktrees that
        # are clean or contain allowlisted mechanical tsconfig drift. Product
        # diffs are preserved and reported as skipped by the cleanup script.
        ('post-merge-worktree-cleanup', ['python3', 'scripts/tp_post_merge_worktree_cleanup.py', '--apply', '--json', '--max-remove', '20'], 180),
        # Artifact hygiene: inactive worktrees may still be useful as source, but
        # must not keep node_modules/.next/test-results forever. Until the owner
        # approves the first generated-artifact cleanup, keep this as audit-only.
        # After approval, switch this command to include --apply.
        ('inactive-worktree-artifact-cleanup', ['python3', 'scripts/tp_worktree_artifact_cleanup.py', '--json'], 300),
        ('tsconfig-scope-guard', [], 0),
        # Token/cost automation guards requested by 木村哥:
        # - stale-autospawn-guard catches empty paid worker sessions and missing/primary worktrees before more dispatch.
        # - large-skill-lazy-guard keeps token-heavy role startup visible so reviewers use compact references/reducers first.
        ('stale-autospawn-guard', ['python3', 'scripts/tp_stale_autospawn_guard.py', '--window-minutes', '180', '--apply'], 60),
        ('large-skill-lazy-guard', ['python3', 'scripts/tp_large_skill_lazy_guard.py'], 60),
        ('dispatch-guard', ['python3', 'scripts/kanban_router.py', 'dispatch-guard'], 90),
        # Token/context governance (木村哥 asks #1,#2,#4,#5): record how much context
        # the reducer keeps out of the model and snapshot gate state for handoff.
        # Both are read-only/local and safe in dry-run; counts feed the daily report.
        ('reducer-ledger', ['python3', 'scripts/tp_reducer_ledger.py'] + (['--dry-run'] if args.dry_run else []), 60),
        ('gate-baton', ['python3', 'scripts/tp_gate_baton.py', '--output', 'logs/tp-gate-baton.json'], 90),
    ]:
        if name == 'post-merge-worktree-cleanup' and args.no_post_merge_cleanup:
            steps.append({'name': name, 'cmd': cmd, 'exit': 0, 'elapsed': 0, 'tail': 'skipped by --no-post-merge-cleanup'})
            continue
        if name == 'inactive-worktree-artifact-cleanup' and args.no_artifact_cleanup:
            steps.append({'name': name, 'cmd': cmd, 'exit': 0, 'elapsed': 0, 'tail': 'skipped by --no-artifact-cleanup'})
            continue
        if name == 'tsconfig-scope-guard':
            guard = check_tsconfig_scope()
            steps.append({
                'name': name,
                'cmd': ['internal', 'check_tsconfig_scope'],
                'exit': 0 if guard['status'] == 'pass' else 1,
                'elapsed': 0,
                'tail': json.dumps(guard, ensure_ascii=False),
            })
            continue
        # Read-only probes must run even in loop dry-run so resource/lane planning
        # reflects the live board. Mutating steps still honor dry-run.
        if name in ('status', 'rescue', 'blocked', 'lane-status', 'candidate-manifest', 'selective-dispatch-plan', 'dispatch-guard', 'reducer-ledger', 'gate-baton'):
            steps.append(run_step(name, cmd, timeout=timeout, dry_run=False))
            continue
        steps.append(run_step(name, cmd, timeout=timeout, dry_run=args.dry_run))

    guard_blockers: list[str] = []
    for blocker in post_repair_resume.get('blockers') or []:
        if blocker not in guard_blockers:
            guard_blockers.append(str(blocker))
    for blocker in live_approval.get('blockers') or []:
        if blocker not in guard_blockers:
            guard_blockers.append(str(blocker))
    for s in steps:
        if s.get('name') != 'tsconfig-scope-guard':
            continue
        data = _json_from_step_tail(s)
        if isinstance(data, dict) and data.get('status') == 'blocked':
            guard_blockers.append(str(data.get('kind') or 'broad_tsconfig_scope'))
            max_dispatch = 0
    stale_guard_steps = [s for s in steps if s.get('name') == 'stale-autospawn-guard']
    if stale_guard_steps:
        data = _json_from_step_tail(stale_guard_steps[-1])
        if isinstance(data, dict) and data.get('status') == 'blocked':
            kinds = sorted({str(item.get('kind')) for item in data.get('findings') or [] if isinstance(item, dict) and item.get('kind')})
            for blocker in kinds or ['stale_autospawn_guard']:
                if blocker not in guard_blockers:
                    guard_blockers.append(blocker)
            max_dispatch = 0
    guard_steps = [s for s in steps if s.get('name') == 'dispatch-guard']
    if guard_steps:
        blocked, dispatch_guard_blockers = _dispatch_guard_blocks_dispatch(guard_steps[-1])
        if blocked:
            for blocker in dispatch_guard_blockers:
                if blocker not in guard_blockers:
                    guard_blockers.append(blocker)
    lane_status = _lane_status_from_steps(steps)
    candidate_manifest = _candidate_manifest_from_steps(steps)
    candidate_apply = candidate_manifest.get('configuration_apply') or {}
    selective_plan = _selective_dispatch_plan_from_steps(steps)
    if not selective_plan.get('safe_native_dispatch') and int(selective_plan.get('held_count') or 0) > 0:
        for blocker in selective_plan.get('blockers') or ['selective_dispatch_required']:
            blocker = str(blocker)
            if blocker not in guard_blockers:
                guard_blockers.append(blocker)
    max_dispatch = calculate_effective_dispatch_budget(
        mem_available_mb=mem,
        min_mem_mb=args.min_mem_mb,
        requested_max_dispatch=args.max_dispatch,
        no_dispatch=args.no_dispatch,
        available_lane_count=int(lane_status.get('available_lane_count') or 0),
        guard_blocked=bool(guard_blockers),
    )
    if max_dispatch > 0:
        selected_count = int(selective_plan.get('selected_count') or 0)
        max_dispatch = min(max_dispatch, selected_count)
        if selected_count <= 0:
            max_dispatch = 0
    if guard_blockers and max_dispatch == 0:
        steps.append({
            'name': 'dispatch-suppressed-by-guard',
            'cmd': [],
            'exit': 0,
            'elapsed': 0,
            'tail': json.dumps({'guard_blockers': guard_blockers}, ensure_ascii=False),
        })

    exact_dispatch = None
    if max_dispatch > 0:
        exact_cmd = [
            'python3', 'scripts/kanban_router.py', 'exact-selective-dispatch',
            '--max', str(max_dispatch), '--compact',
        ]
        if live_approval.get('allow_exact_dispatch_apply'):
            exact_cmd.extend(['--apply', '--operator-approved'])
        exact_dispatch = run_step(
            'exact-selective-dispatch',
            exact_cmd,
            timeout=args.dispatch_timeout,
            dry_run=False,
        )
        steps.append(exact_dispatch)
    exact_dispatch_result = _exact_dispatch_from_steps(steps)

    state = {
        'ts': now_iso(),
        'cycle': cycle,
        'deadline_epoch': args.deadline_epoch,
        'mem_available_mb': mem,
        'min_mem_mb': args.min_mem_mb,
        'memory_pressure': pressure,
        'config_budget': args.config_budget,
        'issue_scan_limit': args.issue_scan_limit,
        'kanban_db_health': current_db_health,
        'post_repair_dispatch_resume': post_repair_resume,
        'live_mutation_approval': live_approval,
        'candidate_manifest': {
            'selected_count': candidate_manifest.get('selected_count', 0),
            'configured_count': len((candidate_manifest.get('configuration_plan') or {}).get('configured') or []),
            'held_count': len((candidate_manifest.get('configuration_plan') or {}).get('held') or []),
            'apply_requested': bool(live_approval.get('allow_candidate_apply')),
            'apply_dry_run': candidate_apply.get('dry_run', True),
            'created_count': candidate_apply.get('created_count', 0),
            'error_count': candidate_apply.get('error_count', 0),
            'path': 'inline:steps.candidate-manifest.tail',
        },
        'selective_dispatch_plan': {
            'selected_count': selective_plan.get('selected_count', 0),
            'held_count': selective_plan.get('held_count', 0),
            'safe_native_dispatch': selective_plan.get('safe_native_dispatch', False),
            'blockers': selective_plan.get('blockers', []),
            'dispatchable_task_ids': selective_plan.get('dispatchable_task_ids', []),
            'held_task_ids': selective_plan.get('held_task_ids', []),
        },
        'exact_dispatch': {
            'apply_requested': bool(max_dispatch > 0 and live_approval.get('allow_exact_dispatch_apply')),
            'spawned_count': exact_dispatch_result.get('spawned_count', 0),
            'error_count': exact_dispatch_result.get('error_count', 0),
            'dispatchable_task_ids': exact_dispatch_result.get('dispatchable_task_ids', []),
            'held_task_ids': exact_dispatch_result.get('held_task_ids', []),
            'path': 'inline:steps.exact-selective-dispatch.tail' if exact_dispatch else None,
        },
        'effective_max_dispatch': max_dispatch,
        'lane_status': lane_status,
        'guard_blockers': guard_blockers,
        'steps': [{'name': s['name'], 'exit': s['exit'], 'elapsed': s['elapsed']} for s in steps],
        'next_action': 'continue next cycle' if args.deadline_epoch and time.time() < args.deadline_epoch else 'loop finished or one-shot complete',
    }
    state['operator_report'] = format_operator_report(state)
    write_kanban_db_health_state(current_db_health, post_repair_resume)
    write_baton(state)
    return {'state': state, 'steps': steps}


def role_default_skill_optimization_audit(conn: sqlite3.Connection | None = None, *, sample_limit: int = 200) -> dict:
    """Summarize role-default skill improvement opportunities for final self-repair.

    The audit is intentionally read-only. It reminds the operator that any newly
    created durable role workflow skill must be synced into
    scripts/tp_kanban_role_skills.py so future Kanban cards preload it.
    """
    try:
        from tp_kanban_role_skills import ROLE_DEFAULT_SKILLS, _parse_existing_skills
    except ModuleNotFoundError:
        from scripts.tp_kanban_role_skills import ROLE_DEFAULT_SKILLS, _parse_existing_skills
    try:
        from tp_kanban_skill_selector import discover_profile_skills, skill_slug_tokens, _score_skill
    except ModuleNotFoundError:
        from scripts.tp_kanban_skill_selector import discover_profile_skills, skill_slug_tokens, _score_skill

    close_conn = False
    if conn is None:
        if not KANBAN_DB.exists():
            return {
                'available': False,
                'reason': f'Kanban DB not found: {KANBAN_DB}',
                'role_defaults': ROLE_DEFAULT_SKILLS,
                'sync_rule': 'When a new durable role workflow skill is created, add it to ROLE_DEFAULT_SKILLS in scripts/tp_kanban_role_skills.py and tests/test_tp_kanban_role_skills.py.',
            }
        conn = sqlite3.connect(str(KANBAN_DB))
        conn.row_factory = sqlite3.Row
        close_conn = True
    try:
        rows = conn.execute(
            "SELECT id, title, assignee, status, skills FROM tasks WHERE assignee IS NOT NULL ORDER BY updated_at DESC LIMIT ?",
            (sample_limit,),
        ).fetchall()
    except sqlite3.OperationalError:
        rows = conn.execute(
            "SELECT id, title, assignee, status, skills FROM tasks WHERE assignee IS NOT NULL LIMIT ?",
            (sample_limit,),
        ).fetchall()
    finally:
        if close_conn:
            # Defer close until after row objects are consumed for sqlite.Row safety.
            pass

    role_extra_counts: dict[str, Counter[str]] = defaultdict(Counter)
    role_task_counts: Counter[str] = Counter()
    role_titles: dict[str, list[str]] = defaultdict(list)
    examples: dict[str, dict[str, str]] = {}
    for row in rows:
        assignee = str(row['assignee'] or '').strip()
        if not assignee:
            continue
        role_task_counts[assignee] += 1
        role_titles[assignee].append(str(row['title'] or ''))
        defaults = set(ROLE_DEFAULT_SKILLS.get(assignee, []))
        for skill in _parse_existing_skills(row['skills']):
            if skill not in defaults and skill not in ROLE_DEFAULT_AUDIT_EXCLUDES:
                role_extra_counts[assignee][skill] += 1
                examples.setdefault(f'{assignee}:{skill}', {'task_id': str(row['id']), 'title': str(row['title'] or '')[:160]})

    roles = []
    discovered_by_role = {role: {skill.name: skill for skill in discover_profile_skills(role)} for role in ROLE_DEFAULT_SKILLS}
    for assignee, defaults in sorted(ROLE_DEFAULT_SKILLS.items()):
        extras = role_extra_counts.get(assignee, Counter())
        top_extras = [
            {
                'skill': skill,
                'count': count,
                'example': examples.get(f'{assignee}:{skill}', {}),
            }
            for skill, count in extras.most_common(8)
        ]
        recommendations = []
        for item in top_extras:
            sampled = max(1, role_task_counts.get(assignee, 0))
            ratio = item['count'] / sampled
            item['promotion_candidate'] = item['count'] >= ROLE_SKILL_PROMOTION_MIN_COUNT and ratio >= ROLE_SKILL_PROMOTION_MIN_RATIO
            item['ratio'] = round(ratio, 3)
            if item['promotion_candidate']:
                recommendations.append(
                    f"Auto-promote candidate: {item['skill']} for {assignee} appeared {item['count']} times ({ratio:.0%} of sampled role tasks); sync into ROLE_DEFAULT_SKILLS unless blocked by policy."
                )
        downgrade_candidates = []
        sampled_for_role = role_task_counts.get(assignee, 0)
        baseline = ROLE_DEFAULT_BASELINE_SKILLS.get(assignee, set()) | ROLE_DEFAULT_AUDIT_EXCLUDES
        for skill in defaults:
            if skill in baseline:
                continue
            support_count = 0
            missing_catalog = False
            summary = discovered_by_role.get(assignee, {}).get(skill)
            if summary is None:
                missing_catalog = True
            else:
                for title in role_titles.get(assignee, []):
                    title_tokens = skill_slug_tokens(title)
                    score, _ = _score_skill(summary, title_tokens, title_tokens, assignee)
                    if score >= 4:
                        support_count += 1
            support_ratio = support_count / max(1, sampled_for_role)
            is_candidate = sampled_for_role >= ROLE_SKILL_DOWNGRADE_MIN_TASKS and (
                missing_catalog or support_ratio <= ROLE_SKILL_DOWNGRADE_MAX_SUPPORT_RATIO
            )
            downgrade_candidates.append({
                'skill': skill,
                'sampled_tasks': sampled_for_role,
                'title_support_count': support_count,
                'title_support_ratio': round(support_ratio, 3),
                'missing_catalog': missing_catalog,
                'downgrade_candidate': is_candidate,
                'policy': f'three consecutive weak audits required; baseline skills protected; threshold <= {ROLE_SKILL_DOWNGRADE_MAX_SUPPORT_RATIO:.0%}',
            })
        roles.append({
            'assignee': assignee,
            'default_skills': defaults,
            'sampled_tasks': role_task_counts.get(assignee, 0),
            'top_non_default_skills': top_extras,
            'downgrade_candidates': downgrade_candidates,
            'recommendations': recommendations,
        })

    if close_conn:
        conn.close()
    return {
        'available': True,
        'ts': now_iso(),
        'sample_limit': sample_limit,
        'role_defaults_path': str(ROLE_SKILLS_SCRIPT),
        'test_path': str(WORKSPACE / 'tests' / 'test_tp_kanban_role_skills.py'),
        'sync_rule': 'Final optimization lets profiles learn from repeated Kanban work. High-confidence repeated non-default skills are promoted automatically. Looser downgrade candidates are demoted only after three consecutive weak-signal audits; baseline/governing skills are protected.',
        'excluded_from_recommendations': sorted(ROLE_DEFAULT_AUDIT_EXCLUDES),
        'roles': roles,
    }


def _skill_exists_for_role(assignee: str, skill: str) -> bool:
    roots = [Path('/root/.hermes/profiles') / assignee / 'skills', Path('/root/.hermes/skills')]
    for root in roots:
        if not root.exists():
            continue
        for md in root.rglob('SKILL.md'):
            if '.archive' in md.parts:
                continue
            try:
                head = md.read_text(encoding='utf-8', errors='replace')[:1200]
            except Exception:
                continue
            if re.search(rf'^name:\s*["\']?{re.escape(skill)}["\']?\s*$', head, re.MULTILINE) or md.parent.name == skill:
                return True
    return False


def _render_role_defaults_code(role_defaults: dict[str, list[str]]) -> str:
    lines = ['ROLE_DEFAULT_SKILLS: dict[str, list[str]] = {']
    for role, skills in role_defaults.items():
        lines.append(f'    {role!r}: [')
        for skill in skills:
            lines.append(f'        {skill!r},')
        lines.append('    ],')
    lines.append('}')
    return '\n'.join(lines)


def _load_role_skill_learning_state() -> dict:
    if not ROLE_SKILL_LEARNING_STATE.exists():
        return {'downgrade_strikes': {}}
    try:
        data = json.loads(ROLE_SKILL_LEARNING_STATE.read_text(encoding='utf-8'))
        if isinstance(data, dict):
            data.setdefault('downgrade_strikes', {})
            return data
    except Exception:
        pass
    return {'downgrade_strikes': {}}


def _write_role_defaults(role_defaults: dict[str, list[str]]) -> bool:
    text = ROLE_SKILLS_SCRIPT.read_text(encoding='utf-8')
    new_block = _render_role_defaults_code(role_defaults)
    new_text, n = re.subn(
        r'ROLE_DEFAULT_SKILLS: dict\[str, list\[str\]\] = \{.*?\n\}',
        new_block,
        text,
        count=1,
        flags=re.DOTALL,
    )
    if n != 1:
        return False
    ROLE_SKILLS_SCRIPT.write_text(new_text, encoding='utf-8')
    return True


def apply_role_default_skill_promotions(audit: dict) -> dict:
    """Automatically sync high-confidence repeated role skills into defaults."""
    if not audit.get('available') or not ROLE_SKILLS_SCRIPT.exists():
        return {'applied': [], 'skipped': [{'reason': 'audit unavailable or ROLE_SKILLS_SCRIPT missing'}]}
    try:
        from tp_kanban_role_skills import ROLE_DEFAULT_SKILLS
    except ModuleNotFoundError:
        from scripts.tp_kanban_role_skills import ROLE_DEFAULT_SKILLS

    role_defaults = {role: list(skills) for role, skills in ROLE_DEFAULT_SKILLS.items()}
    applied: list[dict] = []
    skipped: list[dict] = []
    for role in audit.get('roles', []):
        assignee = str(role.get('assignee') or '')
        defaults = role_defaults.setdefault(assignee, [])
        for item in role.get('top_non_default_skills') or []:
            skill = str(item.get('skill') or '').strip()
            if not item.get('promotion_candidate'):
                continue
            if not skill or skill in defaults:
                continue
            if not _skill_exists_for_role(assignee, skill):
                skipped.append({'assignee': assignee, 'skill': skill, 'reason': 'skill not found in assignee profile/global catalog'})
                continue
            defaults.append(skill)
            applied.append({'assignee': assignee, 'skill': skill, 'count': item.get('count'), 'ratio': item.get('ratio')})
    if not applied:
        return {'applied': [], 'skipped': skipped}

    if not _write_role_defaults(role_defaults):
        return {'applied': [], 'skipped': [*skipped, {'reason': 'could not locate ROLE_DEFAULT_SKILLS block'}]}
    return {'applied': applied, 'skipped': skipped, 'path': str(ROLE_SKILLS_SCRIPT)}


def apply_role_default_skill_downgrades(audit: dict) -> dict:
    """Loosely demote weak auto-learned defaults after consecutive weak audits."""
    if not audit.get('available') or not ROLE_SKILLS_SCRIPT.exists():
        return {'applied': [], 'watched': [], 'skipped': [{'reason': 'audit unavailable or ROLE_SKILLS_SCRIPT missing'}]}
    try:
        from tp_kanban_role_skills import ROLE_DEFAULT_SKILLS
    except ModuleNotFoundError:
        from scripts.tp_kanban_role_skills import ROLE_DEFAULT_SKILLS

    state = _load_role_skill_learning_state()
    strikes = state.setdefault('downgrade_strikes', {})
    role_defaults = {role: list(skills) for role, skills in ROLE_DEFAULT_SKILLS.items()}
    applied: list[dict] = []
    watched: list[dict] = []
    skipped: list[dict] = []
    active_candidate_keys: set[str] = set()
    for role in audit.get('roles', []):
        assignee = str(role.get('assignee') or '')
        defaults = role_defaults.setdefault(assignee, [])
        baseline = ROLE_DEFAULT_BASELINE_SKILLS.get(assignee, set()) | ROLE_DEFAULT_AUDIT_EXCLUDES
        for item in role.get('downgrade_candidates') or []:
            skill = str(item.get('skill') or '').strip()
            if not skill:
                continue
            key = f'{assignee}:{skill}'
            if skill in baseline:
                strikes.pop(key, None)
                skipped.append({'assignee': assignee, 'skill': skill, 'reason': 'baseline/protected skill'})
                continue
            if not item.get('downgrade_candidate'):
                strikes.pop(key, None)
                continue
            active_candidate_keys.add(key)
            record = strikes.get(key, {'count': 0})
            count = int(record.get('count') or 0) + 1
            strikes[key] = {
                'count': count,
                'last_seen': now_iso(),
                'sampled_tasks': item.get('sampled_tasks'),
                'title_support_ratio': item.get('title_support_ratio'),
                'missing_catalog': item.get('missing_catalog'),
            }
            if count >= ROLE_SKILL_DOWNGRADE_STRIKES:
                if skill in defaults:
                    defaults.remove(skill)
                    applied.append({'assignee': assignee, 'skill': skill, 'strikes': count, 'reason': 'consecutive weak relevance audits'})
                    strikes.pop(key, None)
                else:
                    skipped.append({'assignee': assignee, 'skill': skill, 'reason': 'skill already absent from defaults'})
            else:
                watched.append({'assignee': assignee, 'skill': skill, 'strikes': count, 'needed': ROLE_SKILL_DOWNGRADE_STRIKES, 'title_support_ratio': item.get('title_support_ratio')})
    # Drop stale strike entries for skills no longer weak this run.
    for key in list(strikes.keys()):
        if key not in active_candidate_keys:
            strikes.pop(key, None)
    ROLE_SKILL_LEARNING_STATE.parent.mkdir(parents=True, exist_ok=True)
    state['updated_at'] = now_iso()
    ROLE_SKILL_LEARNING_STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    if applied and not _write_role_defaults(role_defaults):
        return {'applied': [], 'watched': watched, 'skipped': [*skipped, {'reason': 'could not locate ROLE_DEFAULT_SKILLS block'}]}
    return {'applied': applied, 'watched': watched, 'skipped': skipped, 'state_path': str(ROLE_SKILL_LEARNING_STATE), 'path': str(ROLE_SKILLS_SCRIPT) if applied else None}


def self_repair_summary() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    lines = [f'# tp-kanban-loop self-repair summary\n', f'Last update: {now_iso()}\n']
    if FAIL_LEDGER.exists():
        recent = FAIL_LEDGER.read_text(errors='replace').splitlines()[-10:]
        lines.append('\nRecent failures recorded:\n')
        for line in recent:
            try:
                d = json.loads(line)
                lines.append(f"- {d.get('ts')} {d.get('name')} exit={d.get('exit')} elapsed={d.get('elapsed')}s\n")
            except Exception:
                lines.append(f'- {line[:200]}\n')
    else:
        lines.append('\nNo failure ledger yet.\n')

    audit = role_default_skill_optimization_audit()
    promotion_result = apply_role_default_skill_promotions(audit)
    downgrade_result = apply_role_default_skill_downgrades(audit)
    lines.append('\n## Role default skill optimization audit\n')
    lines.append(f"\nSync rule: {audit.get('sync_rule')}\n")
    if not audit.get('available'):
        lines.append(f"\nAudit unavailable: {audit.get('reason')}\n")
    else:
        lines.append(f"\nRole defaults source: `{audit.get('role_defaults_path')}`\n")
        lines.append(f"Tests: `{audit.get('test_path')}`\n")
        for role in audit.get('roles', []):
            lines.append(f"\n### {role.get('assignee')}\n")
            lines.append('Default skills: ' + ', '.join(role.get('default_skills') or []) + '\n')
            lines.append(f"Sampled tasks: {role.get('sampled_tasks')}\n")
            extras = role.get('top_non_default_skills') or []
            if extras:
                lines.append('Top non-default skills seen on sampled cards:\n')
                for item in extras[:5]:
                    ex = item.get('example') or {}
                    lines.append(f"- {item.get('skill')} x{item.get('count')} (example {ex.get('task_id')}: {ex.get('title')})\n")
            else:
                lines.append('Top non-default skills seen on sampled cards: none\n')
            weak = [item for item in (role.get('downgrade_candidates') or []) if item.get('downgrade_candidate')]
            if weak:
                lines.append('Weak default-skill downgrade candidates:\n')
                for item in weak[:5]:
                    lines.append(f"- {item.get('skill')} support={item.get('title_support_count')}/{item.get('sampled_tasks')} ratio={item.get('title_support_ratio')} missing_catalog={item.get('missing_catalog')}\n")
            for rec in role.get('recommendations') or []:
                lines.append(f"Recommendation: {rec}\n")
        lines.append('\n## Auto-applied role default skill promotions\n')
        applied = promotion_result.get('applied') or []
        skipped = promotion_result.get('skipped') or []
        if applied:
            lines.append(f"Updated: `{promotion_result.get('path')}`\n")
            for item in applied:
                lines.append(f"- {item.get('assignee')}: added {item.get('skill')} (count={item.get('count')}, ratio={item.get('ratio')})\n")
            lines.append('Next verification: run role-skill tests and py_compile; future cards will receive these defaults via apply-role-skills.\n')
        else:
            lines.append('No high-confidence promotions applied this run.\n')
        if skipped:
            lines.append('Skipped candidates:\n')
            for item in skipped:
                lines.append(f"- {item}\n")
        lines.append('\n## Auto-applied role default skill downgrades\n')
        demoted = downgrade_result.get('applied') or []
        watched = downgrade_result.get('watched') or []
        downgrade_skipped = downgrade_result.get('skipped') or []
        if demoted:
            lines.append(f"Updated: `{downgrade_result.get('path')}`\n")
            for item in demoted:
                lines.append(f"- {item.get('assignee')}: removed {item.get('skill')} after {item.get('strikes')} weak audits ({item.get('reason')})\n")
        else:
            lines.append('No role default skills demoted this run.\n')
        if watched:
            lines.append(f"Watching weak candidates in `{downgrade_result.get('state_path')}`:\n")
            for item in watched[:8]:
                lines.append(f"- {item.get('assignee')}: {item.get('skill')} strike {item.get('strikes')}/{item.get('needed')} support_ratio={item.get('title_support_ratio')}\n")
        if downgrade_skipped:
            lines.append('Downgrade skipped/protected:\n')
            for item in downgrade_skipped[:8]:
                lines.append(f"- {item}\n")
    token_retro = run_step(
        'token-retrospective',
        ['python3', 'scripts/tp_loop_token_retrospective.py', '--limit', '3'],
        timeout=90,
        dry_run=False,
    )
    lines.append('\n## Token/cost retrospective automation audit\n')
    lines.append(f"Step exit={token_retro.get('exit')} elapsed={token_retro.get('elapsed')}s\n")
    if token_retro.get('tail'):
        lines.append(f"Output: `{token_retro.get('tail')}`\n")
    token_md = LOG_DIR / 'tp-loop-token-retrospective.md'
    if token_md.exists():
        lines.append(f"Report: `{token_md}`\n")
        token_text = token_md.read_text(encoding='utf-8', errors='replace')
        # Keep the self-repair summary compact while preserving the full report path.
        marker = '## Findings / optimization candidates'
        if marker in token_text:
            lines.append('\n' + token_text[token_text.index(marker):][:2500].rstrip() + '\n')
        else:
            lines.append('\n' + token_text[:1800].rstrip() + '\n')
    else:
        lines.append('Report missing; token retrospective did not produce markdown output.\n')
    SELF_REPAIR_MD.write_text(''.join(lines), encoding='utf-8')


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description='Tour Platform Kanban loop runner')
    ap.add_argument('duration', nargs='?', help='Examples: 1小時, 30分鐘, 2h, 90m. Omit for one cycle.')
    ap.add_argument('--deadline-epoch', type=float, default=None)
    ap.add_argument('--interval-seconds', type=int, default=60)
    ap.add_argument('--max-cycles', type=int, default=None)
    ap.add_argument('--max-dispatch', type=int, default=0, help='0=memory-aware auto, 1+=fixed max')
    ap.add_argument('--config-budget', type=int, default=5, help='Max issue/card configuration candidates per cycle; separate from dispatch budget')
    ap.add_argument('--issue-scan-limit', type=int, default=20, help='Max open GitHub issues to read for the V2 candidate manifest')
    ap.add_argument('--apply-candidate-config', action='store_true', help='Actually create idempotent Kanban configuration cards from the V2 manifest; requires --operator-approve-live-mutation and is ignored in --dry-run')
    ap.add_argument('--operator-approve-live-mutation', action='store_true', help='Explicit operator approval gate for live Kanban card creation and exact-ID worker dispatch')
    ap.add_argument('--operator-approve-post-repair-dispatch-resume', action='store_true', help='Allow worker dispatch to resume after a Kanban DB unhealthy-to-healthy repair transition')
    ap.add_argument('--no-dispatch', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--no-self-repair', action='store_true')
    ap.add_argument('--no-readme-refresh', action='store_true', help='Skip post-loop README live-marker refresh')
    ap.add_argument('--no-post-merge-cleanup', action='store_true', help='Skip safe closed-issue worktree cleanup during each loop cycle')
    ap.add_argument('--no-artifact-cleanup', action='store_true', help='Skip inactive worktree generated-artifact cleanup during each loop cycle')
    ap.add_argument('--min-mem-mb', type=int, default=600)
    ap.add_argument('--dispatch-timeout', type=int, default=300)
    args = ap.parse_args(argv)

    if args.deadline_epoch is None:
        dur = parse_duration(args.duration)
        if dur:
            args.deadline_epoch = time.time() + dur

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    print(f'tp-kanban-loop start ts={now_iso()} deadline_epoch={args.deadline_epoch} dry_run={args.dry_run}', flush=True)
    readme_context = read_project_readme_context()
    smoke_guard = browser_smoke_preflight()
    print('browser-smoke-preflight ' + json.dumps({
        'status': smoke_guard.get('status'),
        'limits': smoke_guard.get('limits'),
        'polling_mode_recommended': smoke_guard.get('polling_mode_recommended'),
        'polling_exports': smoke_guard.get('polling_exports'),
        'node_options': smoke_guard.get('node_options'),
        'resource_policy': smoke_guard.get('resource_policy'),
        'recommended_resource_cleanup': smoke_guard.get('recommended_resource_cleanup'),
        'recommended_wrapper': smoke_guard.get('recommended_wrapper'),
        'agent_checklist': smoke_guard.get('agent_checklist'),
        'path': smoke_guard.get('path'),
    }, ensure_ascii=False), flush=True)
    print('readme-context ' + json.dumps({
        'exists': readme_context.get('exists'),
        'headings': readme_context.get('headings', [])[:4],
        'current_status_lines': readme_context.get('current_status_lines', [])[:6],
        'context_file': str(README_CONTEXT_JSON),
    }, ensure_ascii=False), flush=True)

    cycle = 0
    while True:
        cycle += 1
        result = one_cycle(args, cycle)
        st = result['state']
        print('resource-dispatch-plan ' + json.dumps({
            'cycle': cycle,
            'mem_available_mb': st['mem_available_mb'],
            'memory_pressure': st['memory_pressure'],
            'config_budget': st.get('config_budget'),
            'issue_scan_limit': st.get('issue_scan_limit'),
            'kanban_db_health': st.get('kanban_db_health'),
            'post_repair_dispatch_resume': st.get('post_repair_dispatch_resume'),
            'candidate_manifest': st.get('candidate_manifest'),
            'live_mutation_approval': st.get('live_mutation_approval'),
            'selective_dispatch_plan': st.get('selective_dispatch_plan'),
            'exact_dispatch': st.get('exact_dispatch'),
            'lane_status': st.get('lane_status'),
            'effective_max_dispatch': st['effective_max_dispatch'],
            'guard_blockers': st.get('guard_blockers', []),
            'steps': st['steps'],
        }, ensure_ascii=False), flush=True)
        print('operator-report\n' + str(st.get('operator_report') or format_operator_report(st)), flush=True)

        if args.max_cycles and cycle >= args.max_cycles:
            break
        if not args.deadline_epoch:
            break
        if time.time() >= args.deadline_epoch:
            break
        sleep_for = max(1, min(args.interval_seconds, int(args.deadline_epoch - time.time())))
        time.sleep(sleep_for)

    if not args.no_self_repair:
        self_repair_summary()
    if not args.no_readme_refresh:
        readme_update = refresh_project_readme_after_loop(dry_run=args.dry_run)
        print('readme-refresh ' + json.dumps({
            'changed': readme_update.get('changed'),
            'updates': readme_update.get('updates', []),
            'warnings': readme_update.get('warnings', []),
            'update_file': str(README_UPDATE_MD),
        }, ensure_ascii=False), flush=True)
    print(f'tp-kanban-loop done ts={now_iso()} cycles={cycle} baton={BATON}', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
