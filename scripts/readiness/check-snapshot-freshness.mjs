#!/usr/bin/env node
/**
 * check-snapshot-freshness.mjs
 *
 * Checks whether the readiness live-state snapshot is fresh (< 26h old).
 * Optionally checks drift between snapshot header counts and live GitHub data
 * when GH_TOKEN is available.
 *
 * Exit codes:
 *   0 — snapshot is within the freshness threshold (< 26h)
 *   1 — snapshot is stale (>= 26h old) or unreadable
 *
 * Usage: node scripts/readiness/check-snapshot-freshness.mjs
 * npm:   npm run readiness:check
 *
 * Never commits, pushes, or writes any file.
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
// Path can be overridden via READINESS_SNAPSHOT_PATH (used by the freshness
// guard test to point at fresh/stale fixtures); defaults to the committed file.
const SNAPSHOT_PATH = process.env.READINESS_SNAPSHOT_PATH
  ? resolve(process.env.READINESS_SNAPSHOT_PATH)
  : resolve(REPO_ROOT, 'docs', 'operations', 'reports', 'readiness-live-state-latest.md');

// stale threshold: 26h（每日 05:00 UTC 刷新一次 + 2h 緩衝；#1654 由 12h 對齊每日節奏）
// — snapshot older than this triggers exit code 1
const FRESHNESS_THRESHOLD_HOURS = 26;

// ── Read snapshot ─────────────────────────────────────────────────────────────

if (!existsSync(SNAPSHOT_PATH)) {
  console.error(`[ERROR] Snapshot file not found: ${SNAPSHOT_PATH}`);
  console.error('  Run: npm run readiness:snapshot');
  process.exit(1);
}

const content = readFileSync(SNAPSHOT_PATH, 'utf8');

// ── Parse timestamp ───────────────────────────────────────────────────────────
// Supports both formats:
//   <!-- query_timestamp: 2026-05-22T14:52:59Z -->
//   **Query timestamp:** 2026-05-22T14:52:59.153Z

let snapshotTime = null;

const htmlCommentMatch = content.match(/<!--\s*query_timestamp:\s*([^\s>]+)\s*-->/);
const markdownMatch = content.match(/\*\*Query timestamp:\*\*\s*([0-9T:.Z+-]+)/);

if (htmlCommentMatch) {
  snapshotTime = new Date(htmlCommentMatch[1]);
} else if (markdownMatch) {
  snapshotTime = new Date(markdownMatch[1]);
}

if (!snapshotTime || isNaN(snapshotTime.getTime())) {
  console.error('[ERROR] Could not parse timestamp from snapshot.');
  console.error('  Expected: <!-- query_timestamp: ... --> or **Query timestamp:** ...');
  process.exit(1);
}

// ── Parse open PR / issue counts from snapshot header ────────────────────────

let snapshotOpenPRs = null;
let snapshotOpenIssues = null;

const prCountMatch = content.match(/##\s+Open PRs\s+\((\d+)\)/);
const issueCountMatch = content.match(/##\s+Open Issues\s+\((\d+)\s+total\)/);

if (prCountMatch) snapshotOpenPRs = parseInt(prCountMatch[1], 10);
if (issueCountMatch) snapshotOpenIssues = parseInt(issueCountMatch[1], 10);

// ── Compute age ───────────────────────────────────────────────────────────────

const now = new Date();
const ageMs = now.getTime() - snapshotTime.getTime();
const ageHours = ageMs / (1000 * 60 * 60);
const ageDisplay = ageHours.toFixed(1);

const isFresh = ageHours < FRESHNESS_THRESHOLD_HOURS;

if (isFresh) {
  console.log(
    `[OK] snapshot is ${ageDisplay}h old (freshness threshold: ${FRESHNESS_THRESHOLD_HOURS}h)`
  );
} else {
  console.log(
    `[STALE] snapshot is ${ageDisplay}h old — threshold exceeded (${FRESHNESS_THRESHOLD_HOURS}h)`
  );
  console.log(`  Snapshot timestamp : ${snapshotTime.toISOString()}`);
  console.log(`  Current time       : ${now.toISOString()}`);
  console.log(`  Run: npm run readiness:snapshot`);
}

// ── Drift check (GH_TOKEN required) ──────────────────────────────────────────

const hasToken = typeof process.env.GH_TOKEN === 'string' && process.env.GH_TOKEN.length > 0;

if (!hasToken) {
  console.log('(drift check skipped — GH_TOKEN not set)');
} else {
  console.log('');
  console.log('── Drift check ─────────────────────────────────────────────');

  let livePRs = null;
  let liveIssues = null;

  try {
    const prJson = execSync(
      'gh pr list --state open --limit 1 --json number',
      { encoding: 'utf8', cwd: REPO_ROOT }
    );
    const issueJson = execSync(
      'gh issue list --state open --limit 1 --json number',
      { encoding: 'utf8', cwd: REPO_ROOT }
    );

    // gh returns an array; for count we need the full list — use a sentinel count approach:
    // gh --limit 1 only returns 1 item; for total count we'd need --limit 500 or similar.
    // Here we just note whether lists are empty or non-empty for a lightweight drift signal.
    livePRs = JSON.parse(prJson).length;
    liveIssues = JSON.parse(issueJson).length;

    // Re-run with higher limits to get actual counts
    const prFull = execSync(
      'gh pr list --state open --limit 200 --json number',
      { encoding: 'utf8', cwd: REPO_ROOT }
    );
    const issueFull = execSync(
      'gh issue list --state open --limit 200 --json number',
      { encoding: 'utf8', cwd: REPO_ROOT }
    );

    livePRs = JSON.parse(prFull).length;
    liveIssues = JSON.parse(issueFull).length;
  } catch (e) {
    console.error(`[WARN] gh CLI drift check failed: ${e.message}`);
    console.log('(drift check could not complete — gh CLI error)');
  }

  if (livePRs !== null && liveIssues !== null) {
    const prDrift =
      snapshotOpenPRs !== null ? livePRs - snapshotOpenPRs : 'n/a (not parsed)';
    const issueDrift =
      snapshotOpenIssues !== null ? liveIssues - snapshotOpenIssues : 'n/a (not parsed)';

    console.log('');
    console.log('  Metric        | Snapshot | Live | Drift');
    console.log('  --------------|----------|------|------');
    console.log(
      `  Open PRs      | ${String(snapshotOpenPRs ?? '?').padEnd(8)} | ${String(livePRs).padEnd(4)} | ${prDrift}`
    );
    console.log(
      `  Open Issues   | ${String(snapshotOpenIssues ?? '?').padEnd(8)} | ${String(liveIssues).padEnd(4)} | ${issueDrift}`
    );
    console.log('');

    const driftWarning =
      (typeof prDrift === 'number' && Math.abs(prDrift) > 0) ||
      (typeof issueDrift === 'number' && Math.abs(issueDrift) > 0);

    if (driftWarning) {
      console.log('[DRIFT] Snapshot counts differ from live GitHub data.');
      console.log('  Run: npm run readiness:snapshot  to refresh.');
    } else {
      console.log('[OK] Snapshot counts match live GitHub data.');
    }
  }
}

// ── Exit ──────────────────────────────────────────────────────────────────────

process.exit(isFresh ? 0 : 1);
