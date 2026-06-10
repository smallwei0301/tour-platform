import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { spawnNodeEsm, WEB_ROOT } from '../helpers/spawn-node.mjs';

// Issue #1281 — child-process specs that spawn a Node ESM child importing
// `next` could fail with `ERR_MODULE_NOT_FOUND: Cannot find package 'next'` when
// the child inherited a cwd from which the hoisted root node_modules was not on
// the resolution chain (the local-sandbox F1 artifact in
// docs/operations/qa-reports/post-merge-qa-1236-cutoff-2026-06-05.md).
//
// The fix: a shared spawn helper (tests/helpers/spawn-node.mjs) that pins the
// child's cwd to apps/web (WEB_ROOT), so bare specifiers resolve deterministically.

const NEXT_IMPORT = "await import('next/server.js'); console.log('NEXT_RESOLVED');";

test('RED control: spawning the next import from a non-workspace cwd fails to resolve next', () => {
  // Reproduces the failure class: cwd outside the repo → bare `next` is not on
  // the resolution chain → ERR_MODULE_NOT_FOUND.
  const control = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', NEXT_IMPORT],
    { cwd: os.tmpdir(), env: process.env, encoding: 'utf8' },
  );
  assert.notEqual(control.status, 0, 'expected the non-workspace cwd spawn to fail');
  assert.match(
    control.stderr,
    /Cannot find package 'next'|ERR_MODULE_NOT_FOUND/,
    'expected a next module-resolution error from the control spawn',
  );
});

test('GREEN: spawnNodeEsm pins cwd to the workspace so next resolves regardless of caller cwd', () => {
  const fixed = spawnNodeEsm(NEXT_IMPORT);
  assert.equal(fixed.status, 0, fixed.stderr);
  assert.match(fixed.stdout, /NEXT_RESOLVED/);
});

test('helper pins cwd to WEB_ROOT (apps/web) and exposes it', () => {
  assert.equal(path.basename(WEB_ROOT), 'web');
  const helperSrc = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../helpers/spawn-node.mjs'),
    'utf8',
  );
  assert.match(helperSrc, /cwd:\s*WEB_ROOT/);
});

test('source-contract: child-process specs use the shared helper, not a cwd-less spawnSync', () => {
  const specs = [
    'tests/api/csrf-route-scope.test.mjs',
    'tests/security/utm-sanitization.test.mjs',
    'tests/security/guide-auth-env.test.mjs',
    'tests/security/email-failure-contract.test.mjs',
  ];
  for (const rel of specs) {
    const src = readFileSync(path.join(WEB_ROOT, rel), 'utf8');
    assert.match(src, /from '\.\.\/helpers\/spawn-node\.mjs'/, `${rel} should import the shared helper`);
    assert.match(src, /spawnNodeEsm\(/, `${rel} should call spawnNodeEsm`);
    assert.doesNotMatch(
      src,
      /spawnSync\(\s*process\.execPath/,
      `${rel} should not spawn process.execPath directly (use the helper so cwd is pinned)`,
    );
  }
});
