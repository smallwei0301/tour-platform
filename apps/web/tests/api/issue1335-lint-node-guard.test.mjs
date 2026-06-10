import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Issue #1335 — pre-lint Node guard: turn the cryptic ESLint circular-config
// crash on Node >=24 into an actionable "run on Node 22" message, without
// touching ESLint config (CI on Node 22 stays green).

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const GUARD = path.join(REPO_ROOT, 'scripts/check-lint-node.mjs');

function runGuard(majorOverride) {
  return spawnSync(process.execPath, [GUARD], {
    env: { ...process.env, LINT_NODE_MAJOR_OVERRIDE: String(majorOverride) },
    encoding: 'utf8',
  });
}

test('guard fails fast with an actionable Node-22 message on Node >=24', () => {
  const r = runGuard('24');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Node 22/);
  assert.match(r.stderr, /nvm/);
  // actionable, not the cryptic upstream error verbatim as the only signal
  assert.match(r.stderr, /pins Node 22|Run lint on Node 22/);
});

test('guard is a no-op (exit 0) on the pinned Node 22', () => {
  const r = runGuard('22');
  assert.equal(r.status, 0, r.stderr);
});

test('guard also blocks Node 26+ (any future >=24)', () => {
  assert.equal(runGuard('26').status, 1);
});

test('source-contract: lint script runs the guard before eslint', () => {
  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'apps/web/package.json'), 'utf8'));
  const lint = pkg.scripts?.lint || '';
  assert.match(lint, /check-lint-node\.mjs/, 'lint should invoke the Node guard');
  assert.ok(
    lint.indexOf('check-lint-node.mjs') < lint.indexOf('eslint'),
    'the guard must run before eslint',
  );
});
