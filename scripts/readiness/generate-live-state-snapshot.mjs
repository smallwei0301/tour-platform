#!/usr/bin/env node
/**
 * generate-live-state-snapshot.mjs
 *
 * Generates docs/operations/reports/readiness-live-state-latest.md with a
 * live-state snapshot of the repository: open issues, open PRs, recent
 * merged PRs, and the current git commit SHA.
 *
 * Usage: node scripts/readiness/generate-live-state-snapshot.mjs
 * npm:   npm run readiness:snapshot
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const OUTPUT_PATH = resolve(REPO_ROOT, 'docs', 'operations', 'reports', 'readiness-live-state-latest.md');
const REPO = 'smallwei0301/tour-platform';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', cwd: REPO_ROOT }).trim();
}

function ghJson(cmd) {
  try {
    return JSON.parse(run(cmd));
  } catch (e) {
    console.error(`Failed to run: ${cmd}\n${e.message}`);
    process.exit(1);
  }
}

// ── Pure functions (exported for testability) ───────────────────────────────

export function labelNames(issue) {
  return (issue.labels || []).map((l) => l.name);
}

/**
 * Maps an issue to its priority bucket.
 *
 * Precedence (highest to lowest):
 *   1. Human-Decision — by label (human-decision) OR title prefix [Human-Decision]
 *   2. New label format: priority:P0 / priority:P1 / priority:P2
 *   3. Legacy label format: P0 / P1 / P2
 *   4. Other
 */
export function priorityBucket(issue) {
  const labels = labelNames(issue);

  // Human-Decision: label match (old format) or title prefix
  if (labels.some((l) => l.toLowerCase().includes('human-decision'))) return 'Human-Decision';
  if (issue.title && issue.title.startsWith('[Human-Decision]')) return 'Human-Decision';

  // New label format: priority:P*
  if (labels.includes('priority:P0')) return 'P0';
  if (labels.includes('priority:P1')) return 'P1';
  if (labels.includes('priority:P2')) return 'P2';

  // Legacy label format: P0 / P1 / P2
  if (labels.includes('P0')) return 'P0';
  if (labels.includes('P1')) return 'P1';
  if (labels.includes('P2')) return 'P2';

  return 'Other';
}

// ── Side-effect entrypoint guard ────────────────────────────────────────────
// Only run the snapshot generation when this file is executed directly,
// not when imported by tests.

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], 'file:///').href;

if (isMain) {
  // ── Fetch data ───────────────────────────────────────────────────────────

  const timestamp = new Date().toISOString();
  const commitSha = run('git rev-parse HEAD');

  const openIssues = ghJson(
    `gh issue list --repo ${REPO} --state open --limit 200 --json number,title,labels,updatedAt,url`
  );

  const openPRs = ghJson(
    `gh pr list --repo ${REPO} --state open --limit 50 --json number,title,headRefName,baseRefName,isDraft,updatedAt,url`
  );

  const mergedPRs = ghJson(
    `gh pr list --repo ${REPO} --state merged --limit 10 --json number,title,mergedAt,headRefName,url`
  );

  // ── Group issues by priority label ────────────────────────────────────────

  const buckets = { P0: [], P1: [], P2: [], 'Human-Decision': [], Other: [] };
  for (const issue of openIssues) {
    buckets[priorityBucket(issue)].push(issue);
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  function issueRow(issue) {
    const lbls = labelNames(issue).join(', ') || '—';
    return `| #${issue.number} | [${issue.title}](${issue.url}) | ${lbls} |`;
  }

  function issueTable(issues) {
    if (issues.length === 0) return '_none_\n';
    return [
      '| # | Title | Labels |',
      '|---|-------|--------|',
      ...issues.map(issueRow),
    ].join('\n') + '\n';
  }

  function prRow(pr) {
    const draft = pr.isDraft ? ' _(draft)_' : '';
    return `| #${pr.number} | [${pr.title}](${pr.url})${draft} | \`${pr.headRefName}\` |`;
  }

  function mergedPrRow(pr) {
    const mergedAt = pr.mergedAt ? pr.mergedAt.slice(0, 10) : '—';
    return `| #${pr.number} | [${pr.title}](${pr.url}) | ${mergedAt} |`;
  }

  // ── Build markdown ─────────────────────────────────────────────────────────

  const lines = [];

  lines.push(`# Readiness Live-State Snapshot`);
  lines.push('');
  lines.push(`> This file is auto-generated. Run \`npm run readiness:snapshot\` to refresh.`);
  lines.push('');
  lines.push(`**Query timestamp:** ${timestamp}  `);
  lines.push(`**Commit SHA:** \`${commitSha}\``);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Open PRs
  lines.push(`## Open PRs (${openPRs.length})`);
  lines.push('');
  if (openPRs.length === 0) {
    lines.push('_none_');
  } else {
    lines.push('| # | Title | Branch |');
    lines.push('|---|-------|--------|');
    for (const pr of openPRs) {
      lines.push(prRow(pr));
    }
  }
  lines.push('');

  // Open Issues by priority
  lines.push(`## Open Issues (${openIssues.length} total)`);
  lines.push('');

  for (const [bucket, issues] of Object.entries(buckets)) {
    lines.push(`### ${bucket} (${issues.length})`);
    lines.push('');
    lines.push(issueTable(issues));
  }

  // Recent merged PRs
  lines.push('---');
  lines.push('');
  lines.push(`## Recent Merged PRs (last 10)`);
  lines.push('');
  if (mergedPRs.length === 0) {
    lines.push('_none_');
  } else {
    lines.push('| # | Title | Merged |');
    lines.push('|---|-------|--------|');
    for (const pr of mergedPRs) {
      lines.push(mergedPrRow(pr));
    }
  }
  lines.push('');

  // ── Write output ───────────────────────────────────────────────────────────

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, lines.join('\n'), 'utf8');

  console.log(`Snapshot written to: ${OUTPUT_PATH}`);
  console.log(`  Timestamp : ${timestamp}`);
  console.log(`  Commit    : ${commitSha}`);
  console.log(`  Open PRs  : ${openPRs.length}`);
  console.log(`  Open Issues: ${openIssues.length}`);
  console.log(`  Merged PRs (last 10): ${mergedPRs.length}`);
}
