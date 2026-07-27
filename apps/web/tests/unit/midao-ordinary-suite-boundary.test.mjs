import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const webPackage = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8'));
const root = resolve(import.meta.dirname, '../../../..');
const e2eWorkflow = readFileSync(resolve(root, '.github/workflows/midao-baseline-e2e.yml'), 'utf8');
const d3Runner = readFileSync(resolve(root, 'scripts/testing/run-midao-foundation-postgres.sh'), 'utf8');
const ordinaryRunner = readFileSync(resolve(root, 'scripts/testing/run-ordinary-web-tests.mjs'), 'utf8');
const runner = await import(pathToFileURL(resolve(root, 'scripts/testing/run-ordinary-web-tests.mjs')).href);

test('ordinary web suite is deterministic and excludes infrastructure integration tests', () => {
  const command = webPackage.scripts.test;
  assert.equal(command, 'node ../../scripts/testing/run-ordinary-web-tests.mjs');
  assert.match(ordinaryRunner, /mode === 'ordinary'/u);
  assert.match(ordinaryRunner, /!excluded\.has\(file\)/u);
  assert.doesNotMatch(ordinaryRunner, /tests\/integration/u);
  for (const directory of ['api', 'config', 'docs', 'e2e', 'ops', 'qa', 'security', 'ui', 'unit']) {
    assert.match(ordinaryRunner, new RegExp(`['\"]${directory}['\"]`, 'u'));
  }
  const ordinary = runner.listOrdinaryTests();
  assert.ok(ordinary.length > 0);
  assert.equal(ordinary.some((file) => file.startsWith('tests/integration/')), false);
  assert.deepEqual(ordinary.filter((file) => runner.INFRASTRUCTURE_TESTS.includes(file)), []);
  assert.deepEqual(runner.buildInvocation('ordinary'), ['--test', ...ordinary]);
});

test('Midao infrastructure coverage remains on bounded dedicated runners', () => {
  assert.match(e2eWorkflow, /run-midao-e2e\.sh/u);
  assert.match(e2eWorkflow, /run-midao-legacy-e2e-compat\.sh/u);
  assert.match(e2eWorkflow, /run-ordinary-web-tests\.mjs --infrastructure/u);
  assert.match(ordinaryRunner, /--test-concurrency=1/u);
  assert.match(ordinaryRunner, /midao-baseline-publisher\.test\.mjs/u);
  assert.match(ordinaryRunner, /midao-production-catalog-capture\.test\.mjs/u);
  assert.match(ordinaryRunner, /midao-ci-command-runner\.test\.mjs/u);
  assert.deepEqual(
    runner.buildInvocation('infrastructure'),
    ['--test', '--test-concurrency=1', ...runner.INFRASTRUCTURE_TESTS],
  );
  assert.throws(() => runner.buildInvocation('unknown'), /UNKNOWN_WEB_TEST_MODE/u);
  assert.match(d3Runner, /tests\/integration\/midao-foundation-schema-postgres\.test\.mjs/u);
  assert.match(d3Runner, /tests\/integration\/midao-mode-switch-postgres\.test\.mjs/u);
  assert.match(d3Runner, /tests\/integration\/midao-mode-switch-concurrency-postgres\.test\.mjs/u);
});
