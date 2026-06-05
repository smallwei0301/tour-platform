/**
 * GH-1195 regression guard — eslint-config-next major must track next major.
 *
 * 2026-06-04 frontend daily check reported `TypeError: Converting circular
 * structure to JSON` when ESLint loaded `apps/web/.eslintrc.json`'s
 * `next/core-web-vitals` extend. Root cause was a major-version drift:
 * `next@15.x` installed alongside `eslint-config-next@16.x`. The 16.x config
 * uses a flat-config plugin shape that the 15.x ESLint legacy loader can
 * not serialize, producing the circular-structure error during the legacy
 * config resolver pass.
 *
 * Current state (verified on this commit): both at major 15. Lint passes.
 *
 * This guard locks the contract so a future bump of either dependency that
 * crosses a major boundary without bumping the other will fail this test
 * BEFORE it breaks `npm run lint` in CI / daily check.
 *
 * Rule:
 *   semverMajor(eslint-config-next) === semverMajor(next)
 *
 * No runtime / production behavior is locked here — this is purely a
 * dependency-pin contract for the toolchain.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPS_WEB_PKG = resolve(__dirname, '../../package.json');
const ESLINTRC = resolve(__dirname, '../../.eslintrc.json');
const ROOT_PKG = resolve(__dirname, '../../../../package.json');

function parseMajor(spec) {
  // Accepts "^15.5.3", "~15.0", ">=15", "15.5.x", "15.x", "15.5.3" → 15.
  const cleaned = String(spec || '').trim().replace(/^[\^~>=<]+/, '');
  const m = cleaned.match(/^(\d+)/);
  if (!m) throw new Error(`could not parse semver major from "${spec}"`);
  return Number(m[1]);
}

describe('GH-1195 — toolchain version pin contract (eslint-config-next ↔ next major parity)', () => {
  const pkg = JSON.parse(readFileSync(APPS_WEB_PKG, 'utf8'));
  const nextSpec = pkg.dependencies?.next ?? pkg.devDependencies?.next;
  const eslintConfigNextSpec = pkg.devDependencies?.['eslint-config-next'] ?? pkg.dependencies?.['eslint-config-next'];

  test('apps/web package.json declares both `next` and `eslint-config-next`', () => {
    assert.ok(nextSpec, '`next` should be declared in apps/web/package.json');
    assert.ok(eslintConfigNextSpec, '`eslint-config-next` should be declared in apps/web/package.json');
  });

  test('eslint-config-next major version matches next major version', () => {
    const nextMajor = parseMajor(nextSpec);
    const eslintConfigNextMajor = parseMajor(eslintConfigNextSpec);
    assert.equal(
      eslintConfigNextMajor,
      nextMajor,
      `eslint-config-next major (${eslintConfigNextMajor}, from "${eslintConfigNextSpec}") must match next major (${nextMajor}, from "${nextSpec}"). ` +
      `A mismatch produces "TypeError: Converting circular structure to JSON" when ESLint loads .eslintrc.json's "next/core-web-vitals" extend. See GH-1195 for the original repro.`,
    );
  });

  test('apps/web/.eslintrc.json still extends next/core-web-vitals (so the version pin is meaningful)', () => {
    const rc = JSON.parse(readFileSync(ESLINTRC, 'utf8'));
    const extendsArr = Array.isArray(rc.extends) ? rc.extends : [rc.extends];
    assert.ok(
      extendsArr.includes('next/core-web-vitals'),
      `.eslintrc.json should still extend "next/core-web-vitals" — if this is removed, the GH-1195 version pin is no longer required and this guard should be removed too. extends=${JSON.stringify(rc.extends)}`,
    );
  });

  test('GH-1233 — root package.json overrides pins eslint-config-next to a 15.x version (resolution lockdown across npm/node versions)', () => {
    // GH-1233 reported the same circular-structure error on a daily-check
    // env (node v24 + npm 11) despite GH-1195 / PR #1210 being merged. Root
    // cause was that `^15.5.3` allows any 15.x minor/patch; that env had
    // somehow installed 16.x at some point (stale node_modules / cache /
    // peer-dep churn). The fix is to use npm `overrides` which apply to ALL
    // resolution paths regardless of declared range, preventing 16.x from
    // ever being installed even on a clean `rm -rf node_modules && npm
    // install` in any supported env.
    const root = JSON.parse(readFileSync(ROOT_PKG, 'utf8'));
    const override = root.overrides?.['eslint-config-next'];
    assert.ok(
      override,
      `root package.json must set overrides["eslint-config-next"] to a 15.x version (see GH-1233). Current overrides: ${JSON.stringify(root.overrides ?? null)}`,
    );
    const overrideMajor = parseMajor(override);
    assert.equal(
      overrideMajor,
      parseMajor(nextSpec),
      `root overrides["eslint-config-next"] major (${overrideMajor}, from "${override}") must match next major (${parseMajor(nextSpec)}). The override is what blocks node-version-sensitive resolution churn from picking 16.x.`,
    );
  });
});
