import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const webPackage = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8'));
const root = resolve(import.meta.dirname, '../../../..');
const e2eWorkflow = readFileSync(resolve(root, '.github/workflows/midao-baseline-e2e.yml'), 'utf8');
const d3Runner = readFileSync(resolve(root, 'scripts/testing/run-midao-foundation-postgres.sh'), 'utf8');

test('ordinary web suite is deterministic and excludes infrastructure integration tests', () => {
  const command = webPackage.scripts.test;
  assert.doesNotMatch(command, /--test-concurrency=1/u);
  assert.doesNotMatch(command, /tests\/integration/u);
  assert.doesNotMatch(command, /tests\/\*\*\/\*\.test\.mjs/u);
  for (const directory of ['api', 'config', 'docs', 'e2e', 'ops', 'qa', 'security', 'ui', 'unit']) {
    assert.match(command, new RegExp(`tests/${directory}/\\*\\.test\\.mjs`, 'u'));
  }
});

test('Midao infrastructure coverage remains on bounded dedicated runners', () => {
  assert.match(e2eWorkflow, /run-midao-e2e\.sh/u);
  assert.match(e2eWorkflow, /run-midao-legacy-e2e-compat\.sh/u);
  assert.match(d3Runner, /tests\/integration\/midao-foundation-schema-postgres\.test\.mjs/u);
  assert.match(d3Runner, /tests\/integration\/midao-mode-switch-postgres\.test\.mjs/u);
  assert.match(d3Runner, /tests\/integration\/midao-mode-switch-concurrency-postgres\.test\.mjs/u);
});
