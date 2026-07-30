import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (name) => readFileSync(path.join(root, name), 'utf8');

test('local preflight and CI PR lane call explicit source mode', () => {
  assert.match(read('scripts/preflight-check.sh'), /check-migration-source-gate\.mjs\s+--mode\s+source/u);
  assert.match(read('.github/workflows/ci.yml'), /check-migration-source-gate\.mjs --mode source/u);
});

test('drift workflow separates source contract from verified release gate', () => {
  const yml = read('.github/workflows/migration-drift-detect.yml');
  assert.match(yml, /check-migration-source-gate\.mjs --mode source/u);
  assert.match(yml, /check-migration-ledger\.mjs --mode verified/u);
  for (const required of [
    'supabase/baselines/**', 'scripts/database-baseline/**',
    'apps/web/tests/unit/migration-source-gate.test.mjs',
    'apps/web/tests/unit/migration-gate-callers.test.mjs',
  ]) assert.match(yml, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
});

test('verified CLI mode is explicit and cannot use baseline publication ledger as production apply ledger', () => {
  const source = read('scripts/check-migration-ledger.mjs');
  assert.match(source, /--mode/u);
  assert.match(source, /verified/u);
  assert.match(source, /baseline-ledger\.json/u);
});
