import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const README = readFileSync('/root/.openclaw/workspace/tour-platform/README.md', 'utf-8');
const DOCS_README = readFileSync('/root/.openclaw/workspace/tour-platform/docs/README.md', 'utf-8');

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
