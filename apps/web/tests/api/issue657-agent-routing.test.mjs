/**
 * Contract tests for issue #657 — agent routing label consistency.
 *
 * These are static/structural tests that verify:
 * 1. The current-issue-priority.md doc exists.
 * 2. The doc mentions routing invariants.
 * 3. The doc does NOT reference #619 as agent:now (since #619 is closed).
 *
 * These tests do not make network calls. They only read the local file system.
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

let docContent;

test('current-issue-priority.md exists', () => {
  try {
    docContent = readFileSync(docPath, 'utf8');
  } catch {
    assert.fail(`File not found: ${docPath}`);
  }
  assert.ok(docContent.length > 0, 'File should not be empty');
});

test('doc contains Agent Routing Invariants section', () => {
  if (!docContent) docContent = readFileSync(docPath, 'utf8');
  assert.ok(
    docContent.includes('## Agent Routing Invariants'),
    'Expected "## Agent Routing Invariants" section in the doc'
  );
});

test('doc lists invariant: agent:now on at most one OPEN issue', () => {
  if (!docContent) docContent = readFileSync(docPath, 'utf8');
  assert.ok(
    docContent.includes('agent:now') && docContent.includes('OPEN issue'),
    'Expected invariant about agent:now being limited to one open issue'
  );
});

test('doc does not reference #619 as current agent:now', () => {
  if (!docContent) docContent = readFileSync(docPath, 'utf8');
  // #619 is CLOSED — it must not appear as the live agent:now routing target.
  // It may still appear as a historical/closed reference, but the "Current top pointer"
  // and "Rules for agents" sections must not direct agents to pull #619 as active work.
  const lines = docContent.split('\n');
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

test('doc references #621 as the current top-priority open issue', () => {
  if (!docContent) docContent = readFileSync(docPath, 'utf8');
  assert.ok(
    docContent.includes('#621'),
    'Expected doc to mention #621 as priority issue'
  );
  // The "Current top pointer" should say #621, not #619
  const topPointerMatch = docContent.match(/## Current top pointer[\s\S]*?(?=\n## )/);
  assert.ok(topPointerMatch, 'Expected "## Current top pointer" section');
  assert.ok(
    topPointerMatch[0].includes('#621'),
    'Current top pointer section should reference #621'
  );
  assert.ok(
    !topPointerMatch[0].match(/\*\*Do #619 first\.\*\*/),
    'Current top pointer should not say "Do #619 first"'
  );
});
