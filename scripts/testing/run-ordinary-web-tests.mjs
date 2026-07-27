#!/usr/bin/env node

import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = join(repoRoot, 'apps/web');
const ordinaryDirectories = ['api', 'config', 'docs', 'e2e', 'ops', 'qa', 'security', 'ui', 'unit'];

export const INFRASTRUCTURE_TESTS = Object.freeze([
  'tests/unit/midao-baseline-cutoff-artifact.test.mjs',
  'tests/unit/midao-baseline-frozen-history.test.mjs',
  'tests/unit/midao-baseline-manifest.test.mjs',
  'tests/unit/midao-baseline-materializer.test.mjs',
  'tests/unit/midao-baseline-ownership.test.mjs',
  'tests/unit/midao-baseline-publisher.test.mjs',
  'tests/unit/midao-baseline-toolchain-lock.test.mjs',
  'tests/unit/midao-catalog-comparator.test.mjs',
  'tests/unit/midao-catalog-extractor-contract.test.mjs',
  'tests/unit/midao-catalog-normalizer.test.mjs',
  'tests/unit/midao-ci-command-runner.test.mjs',
  'tests/unit/midao-e2e-ci-workflow.test.mjs',
  'tests/unit/midao-existing-runner-contract.test.mjs',
  'tests/unit/midao-expected-terminal-artifact.test.mjs',
  'tests/unit/midao-expected-terminal-builder.test.mjs',
  'tests/unit/midao-expected-terminal-publisher.test.mjs',
  'tests/unit/midao-fresh-runner-contract.test.mjs',
  'tests/unit/midao-local-supabase-runner.test.mjs',
  'tests/unit/midao-production-catalog-capture.test.mjs',
  'tests/unit/midao-staged-evidence-verifier.test.mjs',
]);

export const HOST_BOUND_INFRASTRUCTURE_TESTS = Object.freeze([
  'tests/unit/midao-baseline-publisher.test.mjs',
  'tests/unit/midao-baseline-toolchain-lock.test.mjs',
  'tests/unit/midao-ci-command-runner.test.mjs',
  'tests/unit/midao-expected-terminal-publisher.test.mjs',
  'tests/unit/midao-production-catalog-capture.test.mjs',
]);

const hostBoundInfrastructure = new Set(HOST_BOUND_INFRASTRUCTURE_TESTS);
export const PORTABLE_INFRASTRUCTURE_TESTS = Object.freeze(
  INFRASTRUCTURE_TESTS.filter((file) => !hostBoundInfrastructure.has(file)),
);

export function listOrdinaryTests() {
  const excluded = new Set(INFRASTRUCTURE_TESTS);
  return ordinaryDirectories.flatMap((directory) => {
    const absolute = join(webRoot, 'tests', directory);
    return readdirSync(absolute, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
      .map((entry) => relative(webRoot, join(absolute, entry.name)));
  }).filter((file) => !excluded.has(file)).sort();
}

export function buildInvocation(mode = 'ordinary') {
  if (mode === 'ordinary') return ['--test', ...listOrdinaryTests()];
  if (mode === 'infrastructure') return ['--test', '--test-concurrency=1', ...INFRASTRUCTURE_TESTS];
  if (mode === 'portable-infrastructure') return ['--test', '--test-concurrency=1', ...PORTABLE_INFRASTRUCTURE_TESTS];
  throw new Error(`UNKNOWN_WEB_TEST_MODE:${mode}`);
}

export function main(argv = process.argv.slice(2)) {
  const allowed = new Set(['--infrastructure', '--portable-infrastructure']);
  if (argv.length > 1 || (argv.length === 1 && !allowed.has(argv[0]))) {
    throw new Error('UNKNOWN_WEB_TEST_ARGUMENTS');
  }
  const mode = argv[0] === '--infrastructure'
    ? 'infrastructure'
    : argv[0] === '--portable-infrastructure' ? 'portable-infrastructure' : 'ordinary';
  const child = spawnSync(process.execPath, buildInvocation(mode), {
    cwd: webRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (child.error) throw child.error;
  if (child.signal) {
    process.kill(process.pid, child.signal);
    return 1;
  }
  return child.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
