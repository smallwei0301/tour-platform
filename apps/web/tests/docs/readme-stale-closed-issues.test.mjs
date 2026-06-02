import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve paths relative to this test file: tests/docs/ -> ../../.. -> repo root
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

const README = readFileSync(join(REPO_ROOT, 'README.md'), 'utf-8');
const DOCS_README = readFileSync(join(REPO_ROOT, 'docs', 'README.md'), 'utf-8');

const CLOSED_ISSUES = [621, 787, 640, 641, 586, 588];

// Looks for "#NNN" appearing as an active task item (bullet or header requirement)
// Pattern: "- #NNN", "* #NNN", "1. #NNN", or "**#NNN**" without CLOSED/已結案/~~
// NOT a match if the mention is clearly "已關閉 #NNN" or "#NNN CLOSED" or "~~#NNN~~"
function hasActiveMentionAsTask(src, issueNum) {
  // Check for mention in an active context (bullet list as a task, or bold as a requirement)
  const bulletPattern = new RegExp(
    `^\\s*[-*\\d.]+\\s+(?:(?!CLOSED|~~|已結案|已關閉|已完成|已合併|merged|closed|done).)*#${issueNum}(?!.*(?:CLOSED|~~|已結案|已關閉))`,
    'mi'
  );
  return bulletPattern.test(src);
}

describe('README stale-issue guard — closed issues not in active task lists', () => {
  for (const issueNum of CLOSED_ISSUES) {
    it(`#${issueNum} not in active bullet-list items in README.md`, () => {
      const active = hasActiveMentionAsTask(README, issueNum);
      assert.ok(!active, `README.md has #${issueNum} in an active task list item`);
    });
  }
  
  for (const issueNum of CLOSED_ISSUES) {
    it(`#${issueNum} not in active bullet-list items in docs/README.md`, () => {
      const active = hasActiveMentionAsTask(DOCS_README, issueNum);
      assert.ok(!active, `docs/README.md has #${issueNum} in an active task list item`);
    });
  }
});
