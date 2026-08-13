import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const subjectPath = path.join(root, 'scripts/testing/prepare-database-test-deps.mjs');

async function subject() {
  assert.equal(existsSync(subjectPath), true, 'repository-owned database-test dependency entry is missing');
  return import(`${pathToFileURL(subjectPath).href}?t=${Date.now()}`);
}

test('package exposes the database-test dependency entry for humans, CI, and Hermes workers', () => {
  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['prepare:database-test-deps'], 'node scripts/testing/prepare-database-test-deps.mjs');
});

test('database-test dependency entry installs locked dev dependencies independently of production NODE_ENV', async () => {
  const api = await subject();
  const calls = [];
  const result = await api.prepareDatabaseTestDependencies({
    projectRoot: root,
    environment: { NODE_ENV: 'production', npm_config_omit: 'dev' },
    runNpm: ({ argv, env }) => {
      calls.push({ argv, env });
      return { status: 0, signal: null, error: null };
    },
    verifyProjectLocalPg: async () => ({ loaded: true }),
  });

  assert.equal(result.verified, true);
  assert.deepEqual(calls, [{
    argv: ['ci', '--ignore-scripts', '--include=dev', '--no-audit', '--no-fund'],
    env: {
      NODE_ENV: 'production',
      npm_config_omit: '',
      npm_config_include: 'dev',
      npm_config_ignore_scripts: 'true',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
    },
  }]);
});

test('database-test dependency entry fails closed when project-local pg cannot import', async () => {
  const api = await subject();
  await assert.rejects(api.prepareDatabaseTestDependencies({
    projectRoot: root,
    environment: {},
    runNpm: () => ({ status: 0, signal: null, error: null }),
    verifyProjectLocalPg: async () => { throw new Error('Cannot find package pg'); },
  }), /project-local pg|Cannot find package pg/iu);
});
