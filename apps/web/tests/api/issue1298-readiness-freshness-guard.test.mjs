import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Issue #1298 — the readiness snapshot silently went stale (~36h) while the
// refresh workflow reported green, because the final freshness/drift step ran
// `npm run readiness:check || true` — the `|| true` swallowed the stale signal.
// These tests lock the fix: the freshness check fails non-zero on a stale
// snapshot, and the workflow no longer swallows that failure.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const CHECK = path.join(REPO_ROOT, 'scripts/readiness/check-snapshot-freshness.mjs');
const WORKFLOW = path.join(REPO_ROOT, '.github/workflows/readiness-snapshot-refresh.yml');

function writeSnapshotFixture(ageHours) {
  const ts = new Date(Date.now() - ageHours * 3600 * 1000).toISOString();
  const dir = mkdtempSync(path.join(os.tmpdir(), 'readiness-1298-'));
  const file = path.join(dir, 'readiness-live-state-latest.md');
  writeFileSync(
    file,
    `<!-- query_timestamp: ${ts} -->\n` +
      `<!-- freshness_rule: test fixture -->\n\n# Readiness Live-State Snapshot\n\n` +
      `**Query timestamp:** ${ts}\n\n## Open PRs (0)\n\n## Open Issues (0 total)\n`,
  );
  return file;
}

function runFreshnessCheck(snapshotFile) {
  return spawnSync(process.execPath, [CHECK], {
    // GH_TOKEN empty → drift check is skipped, so the result depends only on the
    // timestamp freshness (the behavior we are guarding).
    env: { ...process.env, READINESS_SNAPSHOT_PATH: snapshotFile, GH_TOKEN: '', GITHUB_TOKEN: '' },
    encoding: 'utf8',
  });
}

test('GREEN: a fresh snapshot (<26h) → readiness:check exits 0', () => {
  // 20h：舊 12h 門檻下會誤判 stale（每日刷新節奏必然出現的年齡），新門檻下必須為 fresh（#1654）
  const res = runFreshnessCheck(writeSnapshotFixture(20));
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /\[OK\]/);
});

test('RED: a stale snapshot (>=26h) → readiness:check exits 1 (fails visible)', () => {
  const res = runFreshnessCheck(writeSnapshotFixture(48));
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stdout + res.stderr, /\[STALE\]/);
});

test('source-contract: refresh workflow runs readiness:check WITHOUT swallowing it via `|| true`', () => {
  const wf = readFileSync(WORKFLOW, 'utf8');
  assert.match(wf, /run:\s*npm run readiness:check\s*$/m, 'verify step should run readiness:check');
  assert.doesNotMatch(wf, /readiness:check\s*\|\|\s*true/, 'must not swallow the staleness signal with `|| true`');
});

test('source-contract: freshness check enforces a 26h threshold and exits non-zero on stale', () => {
  // #1654：workflow 已由每 6h 降頻為每日（05:00 UTC），門檻同步為 26h（每日 + 2h 緩衝）
  const src = readFileSync(CHECK, 'utf8');
  assert.match(src, /FRESHNESS_THRESHOLD_HOURS\s*=\s*26/);
  assert.match(src, /process\.exit\(isFresh \? 0 : 1\)/);
});

test('source-contract: refresh workflow grants issues: read（readiness:snapshot 用 gh issue list）', () => {
  const wf = readFileSync(WORKFLOW, 'utf8');
  // 宣告了 permissions 區塊就必須含 issues: read，否則 gh issue list 會 403。
  assert.match(wf, /issues:\s*read/);
});
