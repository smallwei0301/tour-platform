#!/usr/bin/env node
// Detect conflicting owner / status / agent-routing label combinations on
// open GitHub issues. Source of truth: docs/ISSUE_ROUTING_AND_CLASSIFICATION_SOP.md
// (lines 130-205). Rule ids are stable; tests in
// tests/integrity/taxonomy-check-labels.test.mjs lock the set.
//
// Usage (manual / on-demand; not wired into CI):
//   gh auth status            # one-time
//   npm run taxonomy:check    # or: node scripts/taxonomy/check-labels.mjs
// Exits 0 when no conflicts, 1 otherwise.

import { execSync } from 'node:child_process';

const OWNER_LABELS = ['owner:human-decision', 'owner:ai-agent', 'owner:mixed'];
const STATUS_LABELS = [
  'status:ready', 'status:needs-repro', 'status:needs-info',
  'status:needs-decision', 'status:blocked', 'status:in-progress',
  'status:needs-review', 'status:verified',
];
const AGENT_LABELS = ['agent:now', 'agent:next', 'agent:queued', 'agent:backlog'];

export function findConflicts(labels) {
  const set = new Set(labels);
  const conflicts = [];

  const owners = OWNER_LABELS.filter((l) => set.has(l));
  if (owners.length > 1) {
    conflicts.push({ rule: 'multiple-owner', detail: owners.join(', ') });
  }

  const statuses = STATUS_LABELS.filter((l) => set.has(l));
  if (statuses.length > 1) {
    conflicts.push({ rule: 'multiple-status', detail: statuses.join(', ') });
  }

  const agents = AGENT_LABELS.filter((l) => set.has(l));
  if (agents.length > 1) {
    conflicts.push({ rule: 'multiple-agent-routing', detail: agents.join(', ') });
  }

  if (set.has('owner:human-decision') && set.has('agent:now')) {
    conflicts.push({
      rule: 'human-decision-with-agent-now',
      detail: 'SOP line 162: owner:human-decision should not have agent:now',
    });
  }

  if (set.has('status:needs-decision') && set.has('status:ready')) {
    conflicts.push({
      rule: 'needs-decision-with-ready',
      detail: 'status:needs-decision and status:ready signal opposite intent',
    });
  }

  return conflicts;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  let raw;
  try {
    raw = execSync(
      'gh issue list --state open --json number,title,labels --limit 200',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
    );
  } catch (err) {
    console.error('gh CLI failed. Run `gh auth status` first.');
    process.exit(2);
  }

  const issues = JSON.parse(raw);
  let flagged = 0;
  for (const issue of issues) {
    const names = (issue.labels || []).map((l) => l.name);
    const conflicts = findConflicts(names);
    if (conflicts.length > 0) {
      flagged += 1;
      console.log(`#${issue.number} ${issue.title}`);
      for (const c of conflicts) {
        console.log(`  - ${c.rule}: ${c.detail}`);
      }
    }
  }
  console.log(`\n${flagged}/${issues.length} open issue(s) with taxonomy conflicts`);
  process.exit(flagged > 0 ? 1 : 0);
}
