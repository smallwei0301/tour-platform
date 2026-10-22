import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// tour-platform 移植差異（docs/metrics/README.md）：預設 repository、來源標頭與 CLI 生命週期。
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const ported = ['run-ledger-v2.mjs', 'scorecard-readiness.mjs', 'score-run-current.mjs', 'run-ledger.mjs', 'score-run.mjs', 'score-run-v2.mjs', 'agent-wip-policy.mjs'];
const node = (args, options = {}) => spawnSync(process.execPath, args, { encoding: 'utf8', cwd: repoRoot, ...options });

test('每個移植檔都標明同一個 VibeAI 來源 SHA', () => {
  const shas = ported.map((file) => {
    const text = fs.readFileSync(path.join(repoRoot, 'scripts/agents', file), 'utf8');
    const match = text.match(/smallwei0301\/vibeaico-admin-rebuild@([0-9a-f]{40}) scripts\/agents\//);
    assert.ok(match, `${file} 缺少來源標頭`);
    return match[1];
  });
  assert.equal(new Set(shas).size, 1);
  const readme = fs.readFileSync(path.join(repoRoot, 'docs/metrics/README.md'), 'utf8');
  assert.ok(readme.includes(shas[0]), 'docs/metrics/README.md 必須記錄同一個來源 SHA');
});

test('未設定 GITHUB_REPOSITORY 時只承認 tour-platform 的 Issue 證據', () => {
  const env = { ...process.env };
  delete env.GITHUB_REPOSITORY;
  const probe = [
    "import { canonicalIssueSubject } from './scripts/agents/score-run-v2.mjs';",
    "console.log(JSON.stringify([",
    "  canonicalIssueSubject('https://github.com/smallwei0301/tour-platform/issues/1761'),",
    "  canonicalIssueSubject('https://github.com/smallwei0301/vibeaico-admin-rebuild/issues/1761'),",
    "  canonicalIssueSubject('#1761'),",
    "]));",
  ].join('\n');
  const result = node(['--input-type=module', '-e', probe], { env });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['issue#1761', null, 'issue#1761']);
});

test('init → validate → readiness 走完新 Run 的 CLI 生命週期且不覆寫既有帳本', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tour-agent-run-'));
  try {
    const ledger = path.join(dir, '2026-10-22-tour-port-smoke.json');
    const init = node(['scripts/agents/run-ledger-v2.mjs', 'init', '--run-id', '2026-10-22-tour-port-smoke', '--closeout-owner', 'PRODUCT_MAIN_SESSION', '--started-at', '2026-10-22T00:00:00Z', '--output', ledger]);
    assert.equal(init.status, 0, init.stderr);
    const run = JSON.parse(fs.readFileSync(ledger, 'utf8'));
    assert.equal(run.deliveryTruthVersion, 4);
    assert.equal(run.closeout.state, 'OPEN');

    const validate = node(['scripts/agents/run-ledger-v2.mjs', 'validate', ledger]);
    assert.equal(validate.status, 0, validate.stderr);

    // readiness 只檢查 raw-event 一致性；terminal 欄位在 active Run 列為 pending，不算失敗。
    const readiness = node(['scripts/agents/scorecard-readiness.mjs', ledger, '--json']);
    assert.equal(readiness.status, 0, readiness.stderr);
    const report = JSON.parse(readiness.stdout);
    assert.equal(report.validLedger, true);
    assert.equal(report.scoreProfileTarget, 'OBSERVED_V1');
    assert.ok(report.terminalOnlyPending.includes('closeout.state'));
    assert.equal(report.observed.taskCount, 0);

    // 未關帳、沒有 Completion Truth 的 Run 不得產生分數。
    const score = node(['scripts/agents/score-run-current.mjs', ledger]);
    assert.equal(score.status, 0, score.stderr);
    assert.match(score.stdout, /評分狀態：\*\*NOT_GRADED\*\*/);

    const again = node(['scripts/agents/run-ledger-v2.mjs', 'init', '--run-id', '2026-10-22-tour-port-smoke', '--closeout-owner', 'PRODUCT_MAIN_SESSION', '--output', ledger]);
    assert.notEqual(again.status, 0);
    assert.match(again.stderr, /refusing to overwrite existing ledger/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
