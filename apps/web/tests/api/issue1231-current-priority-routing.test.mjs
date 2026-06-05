/**
 * Contract tests for Issue #1231: current issue priority routing doc must not
 * contradict the auto-generated readiness live-state snapshot.
 *
 * Static checks only — no network calls and no GitHub credentials required.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

const PRIORITY_DOC = resolve(REPO_ROOT, 'docs', 'operations', 'current-issue-priority.md');
const READINESS_SNAPSHOT = resolve(REPO_ROOT, 'docs', 'operations', 'reports', 'readiness-live-state-latest.md');

function read(path) {
  return readFileSync(path, 'utf8');
}

function p0SectionHasIssues(snapshot) {
  const match = snapshot.match(/### P0 \((\d+)\)([\s\S]*?)(?:\n### |\n---|$)/);
  if (!match) return false;
  const count = Number(match[1]);
  const body = match[2] || '';
  return count > 0 || /\| #\d+ \|/.test(body);
}

test('priority doc does not claim no open P0 when readiness snapshot has P0 issues', () => {
  const priority = read(PRIORITY_DOC);
  const snapshot = read(READINESS_SNAPSHOT);

  if (!p0SectionHasIssues(snapshot)) return;

  const forbidden = [
    /No open `?P0`? remains active today/i,
    /no open `?priority:P0`? issue/i,
    /no open P0 remains active/i,
  ];

  for (const pattern of forbidden) {
    assert.equal(
      pattern.test(priority),
      false,
      `Priority routing doc must not contain stale no-P0 wording while readiness snapshot has P0 issues: ${pattern}`
    );
  }
});

test('priority doc names the live P0 issue when readiness snapshot lists #1121', () => {
  const priority = read(PRIORITY_DOC);
  const snapshot = read(READINESS_SNAPSHOT);

  if (!snapshot.includes('#1121')) return;

  assert.match(priority, /#1121/, 'Priority doc must name #1121 while it is listed in the P0 snapshot');
  assert.match(priority, /priority:P0/, 'Priority doc must preserve the P0 business-priority signal');
  assert.match(priority, /security|secrets/i, 'Priority doc must identify the security/secrets risk domain for #1121');
});

test('priority doc points agents to live truth and stale-check protocol', () => {
  const priority = read(PRIORITY_DOC);

  assert.match(
    priority,
    /readiness-live-state-latest\.md/,
    'Priority doc must point to the canonical readiness live-state snapshot'
  );
  assert.match(
    priority,
    /gh issue list --repo smallwei0301\/tour-platform --state open/,
    'Priority doc must include the live GitHub issue query agents should rerun'
  );
  assert.match(
    priority,
    /npm run readiness:snapshot/,
    'Priority doc must include the snapshot refresh command'
  );
});

test('priority doc keeps agent routing separate from business priority', () => {
  const priority = read(PRIORITY_DOC);

  assert.match(priority, /Agent routing labels vs business priority labels/);
  assert.match(priority, /priority:P0/);
  assert.match(priority, /agent:now/);
  assert.match(priority, /Business priority labels and execution routing labels are separate signals/);
});
