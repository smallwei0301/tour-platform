import test from 'node:test';
import assert from 'node:assert/strict';

import { findConflicts } from '../../scripts/taxonomy/check-labels.mjs';

// Fixture builders -----------------------------------------------------------

function labels(...names) {
  return names;
}

// Rule coverage --------------------------------------------------------------

test('returns empty array for an issue with one owner / one status / one agent', () => {
  const conflicts = findConflicts(labels(
    'triaged', 'priority:P2', 'type:bug',
    'owner:ai-agent', 'status:ready', 'agent:queued',
  ));
  assert.deepEqual(conflicts, []);
});

test('returns empty array for an issue with no taxonomy labels at all', () => {
  const conflicts = findConflicts(labels('triaged', 'documentation'));
  assert.deepEqual(conflicts, []);
});

test('detects multiple owner:* labels', () => {
  const conflicts = findConflicts(labels(
    'triaged', 'owner:human-decision', 'owner:ai-agent', 'status:ready',
  ));
  const rules = conflicts.map((c) => c.rule);
  assert.ok(rules.includes('multiple-owner'), `expected multiple-owner, got ${JSON.stringify(rules)}`);
  const detail = conflicts.find((c) => c.rule === 'multiple-owner').detail;
  assert.match(detail, /owner:human-decision/);
  assert.match(detail, /owner:ai-agent/);
});

test('detects multiple status:* labels', () => {
  const conflicts = findConflicts(labels(
    'owner:ai-agent', 'status:ready', 'status:in-progress',
  ));
  const rules = conflicts.map((c) => c.rule);
  assert.ok(rules.includes('multiple-status'), `expected multiple-status, got ${JSON.stringify(rules)}`);
});

test('detects multiple agent:* routing labels', () => {
  const conflicts = findConflicts(labels(
    'owner:ai-agent', 'status:ready', 'agent:now', 'agent:next',
  ));
  const rules = conflicts.map((c) => c.rule);
  assert.ok(rules.includes('multiple-agent-routing'), `expected multiple-agent-routing, got ${JSON.stringify(rules)}`);
});

test('detects owner:human-decision combined with agent:now (SOP line 162)', () => {
  const conflicts = findConflicts(labels(
    'triaged', 'owner:human-decision', 'status:needs-decision', 'agent:now',
  ));
  const rules = conflicts.map((c) => c.rule);
  assert.ok(rules.includes('human-decision-with-agent-now'),
    `expected human-decision-with-agent-now, got ${JSON.stringify(rules)}`);
});

test('does not flag owner:human-decision with agent:next/queued/backlog', () => {
  for (const routing of ['agent:next', 'agent:queued', 'agent:backlog']) {
    const conflicts = findConflicts(labels(
      'owner:human-decision', 'status:needs-decision', routing,
    ));
    const rules = conflicts.map((c) => c.rule);
    assert.ok(!rules.includes('human-decision-with-agent-now'),
      `should not flag ${routing} (SOP line 162 only restricts agent:now)`);
  }
});

test('detects status:needs-decision combined with status:ready', () => {
  // This is a specific instance of multiple-status, but also has its own rule
  // because the combination explicitly contradicts agent routing intent.
  const conflicts = findConflicts(labels(
    'owner:mixed', 'status:needs-decision', 'status:ready',
  ));
  const rules = conflicts.map((c) => c.rule);
  assert.ok(rules.includes('needs-decision-with-ready'),
    `expected needs-decision-with-ready, got ${JSON.stringify(rules)}`);
  assert.ok(rules.includes('multiple-status'),
    `expected multiple-status (parent rule), got ${JSON.stringify(rules)}`);
});

test('#828 historical fixture (per issue #830 body) triggers expected conflicts', () => {
  // Snapshot from issue #830 body: #828 at 2026-05-27 audit
  // (Note: #828 was reconciled before this script existed; fixture preserves the case.)
  const conflicts = findConflicts(labels(
    'triaged', 'priority:P1', 'qa',
    'owner:human-decision', 'owner:ai-agent',
    'status:needs-decision', 'status:ready',
    'type:decision', 'type:qa',
    'agent:queued',
  ));
  const rules = conflicts.map((c) => c.rule);
  assert.ok(rules.includes('multiple-owner'), 'expected multiple-owner');
  assert.ok(rules.includes('multiple-status'), 'expected multiple-status');
  assert.ok(rules.includes('needs-decision-with-ready'), 'expected needs-decision-with-ready');
  // agent:queued alone is fine — no agent:now/next/backlog alongside
  assert.ok(!rules.includes('multiple-agent-routing'), 'no multiple-agent-routing for single agent:queued');
  assert.ok(!rules.includes('human-decision-with-agent-now'),
    'human-decision-with-agent-now only triggers on agent:now');
});

test('each conflict carries a stable rule id from a closed set', () => {
  const allowedRules = new Set([
    'multiple-owner',
    'multiple-status',
    'multiple-agent-routing',
    'human-decision-with-agent-now',
    'needs-decision-with-ready',
  ]);
  const conflicts = findConflicts(labels(
    'owner:human-decision', 'owner:ai-agent', 'owner:mixed',
    'status:ready', 'status:in-progress',
    'agent:now', 'agent:next',
  ));
  assert.ok(conflicts.length > 0, 'fixture must produce at least one conflict');
  for (const c of conflicts) {
    assert.ok(allowedRules.has(c.rule), `unknown rule id: ${c.rule}`);
    assert.equal(typeof c.detail, 'string', 'detail must be a string');
    assert.ok(c.detail.length > 0, 'detail must not be empty');
  }
});
