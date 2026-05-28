/**
 * Issue #849 — Root Booking V2 smoke script alias must resolve to v2-core.
 * RED phase: asserts `test:smoke:booking-core` is wired up on both root and
 * workspace package.json so `npm run test:smoke:booking-core` from repo root
 * chains into apps/web `test:smoke:v2-core`.
 * Static JSON assertions only (no npm spawn) — matches the AC7 pattern in
 * tests/api/phase12-full-regression-composer.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const ROOT_PKG = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
const WEB_PKG = JSON.parse(readFileSync(path.join(WEB_ROOT, 'package.json'), 'utf8'));

test('root package.json keeps the test:smoke:booking-core entry point delegating to @tour/web', () => {
  assert.ok(ROOT_PKG.scripts, 'root package.json must declare scripts');
  assert.equal(
    ROOT_PKG.scripts['test:smoke:booking-core'],
    'npm run test:smoke:booking-core -w @tour/web',
    'root test:smoke:booking-core must mirror the workspace script (consistent with test/build/lint pattern)',
  );
});

test('apps/web package.json defines test:smoke:booking-core as an alias to test:smoke:v2-core', () => {
  assert.ok(WEB_PKG.scripts, 'apps/web package.json must declare scripts');
  assert.equal(
    WEB_PKG.scripts['test:smoke:booking-core'],
    'npm run test:smoke:v2-core',
    'apps/web test:smoke:booking-core must alias to test:smoke:v2-core so root invocation chains correctly',
  );
});

test('apps/web package.json keeps test:smoke:v2-core as the canonical Booking V2 smoke pack', () => {
  assert.ok(
    WEB_PKG.scripts && WEB_PKG.scripts['test:smoke:v2-core'],
    'test:smoke:v2-core must remain defined — the booking-core alias depends on it',
  );
  assert.match(
    WEB_PKG.scripts['test:smoke:v2-core'],
    /v2-available-slots\.test\.mjs/,
    'v2-core smoke must still include v2-available-slots.test.mjs',
  );
});
