import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const runnerPath = path.join(repoRoot, 'scripts/qa/daily-health-check-runner.mjs');
const runnerSource = fs.readFileSync(runnerPath, 'utf8');

test('runner exposes the canonical current-main provenance contract', () => {
  for (const field of [
    'SCAN_INVALID_BASELINE',
    'origin/main',
    'alignedWithOriginMain',
    'testedSha',
    'baseSha',
    'nodeVersion',
    'npmVersion',
    'dirtySummary',
    'commands',
    'timestamp',
    'timezone',
  ]) {
    assert.match(runnerSource, new RegExp(field.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')));
  }
  assert.match(runnerSource, /git[\s\S]+worktree/);
  assert.doesNotMatch(runnerSource, /gh\s+issue\s+create/);
});

test('invalid baseline is checked before health commands and product classification', () => {
  const nodeGuard = runnerSource.indexOf('nodeMajor');
  const checkCommands = runnerSource.indexOf('const results =');
  const productClassification = runnerSource.lastIndexOf('productRegressionCandidate');
  assert.notEqual(nodeGuard, -1);
  assert.ok(checkCommands > nodeGuard, 'health commands must follow baseline guards');
  assert.ok(productClassification > checkCommands, 'product classification must follow successful guards');
  assert.match(runnerSource, /expectedNodeMajor\s*=\s*22/);
});

test('cleanup is registered for both successful and failing runs', () => {
  assert.match(runnerSource, /finally\s*\{/);
  assert.match(runnerSource, /git[\s\S]+worktree[\s\S]+remove/);
});
