/**
 * Contract tests for issue #657 / #1231 — agent routing label consistency.
 *
 * Static checks only. These tests verify that the current priority doc keeps
 * routing invariants, does not route closed historical issues as active work,
 * and names the current P0 business blocker when the readiness snapshot lists it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve relative to the monorepo root (apps/web/tests/api -> ../../../../docs)
const docPath = resolve(
  __dirname,
  '../../../../docs/operations/current-issue-priority.md'
);
const readinessSnapshotPath = resolve(
  __dirname,
  '../../../../docs/operations/reports/readiness-live-state-latest.md'
);

let docContent;

function readDoc() {
  if (!docContent) docContent = readFileSync(docPath, 'utf8');
  return docContent;
}

test('current-issue-priority.md exists', () => {
  const content = readDoc();
  assert.ok(content.length > 0, 'File should not be empty');
});

test('doc contains Agent Routing Invariants section', () => {
  const content = readDoc();
  assert.ok(
    content.includes('## Agent Routing Invariants'),
    'Expected "## Agent Routing Invariants" section in the doc'
  );
});

test('doc lists invariant: agent:now on at most one OPEN issue', () => {
  const content = readDoc();
  assert.ok(
    content.includes('agent:now') && content.includes('OPEN issue'),
    'Expected invariant about agent:now being limited to one open issue'
  );
});

test('doc does not reference #619 as current agent:now', () => {
  const content = readDoc();
  // #619 is CLOSED — it must not appear as the live agent:now routing target.
  // It may still appear as a historical/closed reference, but the "Current top pointer"
  // and "Rules for agents" sections must not direct agents to pull #619 as active work.
  const lines = content.split('\n');
  for (const line of lines) {
    // Skip lines that explicitly mark it as CLOSED or historical
    if (/CLOSED/i.test(line)) continue;
    if (/removed/i.test(line)) continue;
    if (/previous label/i.test(line)) continue;
    // These are the directing phrases that should not reference #619
    if (/(Do #619 first|start from.*#619|agent:now.*#619|#619.*agent:now)/i.test(line)) {
      assert.fail(`Line directs agents to #619 (closed issue) as active work:\n  ${line}`);
    }
  }
});

test('doc does not reference #621 as the current top-priority open issue', () => {
  const content = readDoc();
  const topPointerMatch = content.match(/## Current top pointer[\s\S]*?(?=\n## )/);
  assert.ok(topPointerMatch, 'Expected "## Current top pointer" section');
  assert.equal(
    topPointerMatch[0].includes('#621'),
    false,
    'Current top pointer must not continue routing to historical #621'
  );
});

test('doc references #1121 as current P0 business blocker when readiness snapshot lists it', () => {
  const content = readDoc();
  const snapshot = readFileSync(readinessSnapshotPath, 'utf8');
  if (!snapshot.includes('#1121')) return;

  const topPointerMatch = content.match(/## Current top pointer[\s\S]*?(?=\n## )/);
  assert.ok(topPointerMatch, 'Expected "## Current top pointer" section');
  assert.match(topPointerMatch[0], /#1121/, 'Current top pointer should reference #1121');
  assert.match(topPointerMatch[0], /priority:P0|P0/, 'Current top pointer should preserve P0 context');
  assert.match(
    topPointerMatch[0],
    /not automatic agent pickup|security|secrets/i,
    'Current top pointer should warn agents not to auto-pick high-risk security/secrets work'
  );
});
