/**
 * Tests for Issue #675: Fix live-state snapshot priority bucket taxonomy.
 *
 * The priorityBucket() function must:
 *   AC1 — Recognize new label format: priority:P0, priority:P1, priority:P2
 *   AC2 — Still support legacy label format: P0, P1, P2
 *   AC3 — Detect Human-Decision by title prefix when label is absent
 *   AC4 — Human-Decision takes precedence over priority bucket
 *
 * Static checks — no network calls, no gh CLI required.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Import the exported priorityBucket from the script.
// The script must export this function for testability.
const SCRIPT_PATH = new URL(
  '../../../../scripts/readiness/generate-live-state-snapshot.mjs',
  import.meta.url
);

let priorityBucket;

// Load the module — we expect a named export { priorityBucket }
try {
  const mod = await import(SCRIPT_PATH);
  priorityBucket = mod.priorityBucket;
} catch (e) {
  // Module-load error will cause all tests to fail clearly
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeIssue({ labels = [], title = 'Test Issue' } = {}) {
  return {
    number: 1,
    title,
    url: 'https://github.com/test/repo/issues/1',
    labels: labels.map((name) => ({ name })),
  };
}

// ── AC1: New label taxonomy is recognized ────────────────────────────────────

test('AC1a: priorityBucket returns P0 for label "priority:P0"', () => {
  assert.ok(typeof priorityBucket === 'function', 'priorityBucket must be exported from the script');
  const issue = makeIssue({ labels: ['priority:P0', 'bug'] });
  assert.strictEqual(priorityBucket(issue), 'P0');
});

test('AC1b: priorityBucket returns P1 for label "priority:P1"', () => {
  assert.ok(typeof priorityBucket === 'function', 'priorityBucket must be exported from the script');
  const issue = makeIssue({ labels: ['priority:P1', 'enhancement'] });
  assert.strictEqual(priorityBucket(issue), 'P1');
});

test('AC1c: priorityBucket returns P2 for label "priority:P2"', () => {
  assert.ok(typeof priorityBucket === 'function', 'priorityBucket must be exported from the script');
  const issue = makeIssue({ labels: ['priority:P2'] });
  assert.strictEqual(priorityBucket(issue), 'P2');
});

// ── AC2: Legacy label format remains supported ───────────────────────────────

test('AC2a: priorityBucket returns P0 for legacy label "P0"', () => {
  assert.ok(typeof priorityBucket === 'function', 'priorityBucket must be exported from the script');
  const issue = makeIssue({ labels: ['P0'] });
  assert.strictEqual(priorityBucket(issue), 'P0');
});

test('AC2b: priorityBucket returns P1 for legacy label "P1"', () => {
  assert.ok(typeof priorityBucket === 'function', 'priorityBucket must be exported from the script');
  const issue = makeIssue({ labels: ['P1'] });
  assert.strictEqual(priorityBucket(issue), 'P1');
});

test('AC2c: priorityBucket returns P2 for legacy label "P2"', () => {
  assert.ok(typeof priorityBucket === 'function', 'priorityBucket must be exported from the script');
  const issue = makeIssue({ labels: ['P2'] });
  assert.strictEqual(priorityBucket(issue), 'P2');
});

// ── AC3: Human-Decision detected by title prefix when label absent ───────────

test('AC3a: priorityBucket returns Human-Decision for title prefix "[Human-Decision]" with no label', () => {
  assert.ok(typeof priorityBucket === 'function', 'priorityBucket must be exported from the script');
  const issue = makeIssue({
    title: '[Human-Decision][Phase 11][Ops] Approve payout schedule',
    labels: [],
  });
  assert.strictEqual(priorityBucket(issue), 'Human-Decision');
});

test('AC3b: priorityBucket returns Human-Decision for title prefix "[Human-Decision]" even with unrelated labels', () => {
  assert.ok(typeof priorityBucket === 'function', 'priorityBucket must be exported from the script');
  const issue = makeIssue({
    title: '[Human-Decision] Confirm DNS migration',
    labels: ['docs'],
  });
  assert.strictEqual(priorityBucket(issue), 'Human-Decision');
});

// ── AC4: Human-Decision takes precedence over priority bucket ────────────────

test('AC4: Human-Decision title prefix takes precedence over priority:P1 label', () => {
  assert.ok(typeof priorityBucket === 'function', 'priorityBucket must be exported from the script');
  const issue = makeIssue({
    title: '[Human-Decision] Some decision needed',
    labels: ['priority:P1'],
  });
  assert.strictEqual(priorityBucket(issue), 'Human-Decision');
});

// ── Edge cases ───────────────────────────────────────────────────────────────

test('issues with no priority label and no Human-Decision title fall into Other', () => {
  assert.ok(typeof priorityBucket === 'function', 'priorityBucket must be exported from the script');
  const issue = makeIssue({ labels: ['bug', 'help wanted'], title: 'A normal issue' });
  assert.strictEqual(priorityBucket(issue), 'Other');
});

test('human-decision label (old format) still triggers Human-Decision bucket', () => {
  assert.ok(typeof priorityBucket === 'function', 'priorityBucket must be exported from the script');
  const issue = makeIssue({ labels: ['human-decision'], title: 'Some issue' });
  assert.strictEqual(priorityBucket(issue), 'Human-Decision');
});
