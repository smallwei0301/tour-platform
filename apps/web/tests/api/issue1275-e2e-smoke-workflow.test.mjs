import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Issue #1275 — add a focused Playwright smoke lane for launch-critical browser
// flows WITHOUT changing the mandatory ci.yml lane. These source-contract tests
// lock both halves of the contract.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const CI = readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
const SMOKE_PATH = path.join(REPO_ROOT, '.github/workflows/e2e-smoke.yml');
const PKG = JSON.parse(readFileSync(path.join(REPO_ROOT, 'apps/web/package.json'), 'utf8'));

test('ci.yml keeps its lint/typecheck/test/build/preflight lane and does NOT run Playwright', () => {
  for (const step of [
    'npm run lint -w @tour/web',
    'npm run typecheck -w @tour/web',
    'npm run test -w @tour/web',
    'npm run build -w @tour/web',
    'scripts/preflight-check.sh',
  ]) {
    assert.ok(CI.includes(step), `ci.yml should still run: ${step}`);
  }
  assert.doesNotMatch(CI, /playwright|test:e2e/i, 'ci.yml must not run the Playwright/e2e lane');
});

test('a dedicated e2e-smoke workflow exists with bounded, safe execution shape', () => {
  assert.ok(existsSync(SMOKE_PATH), 'e2e-smoke.yml should exist');
  const wf = readFileSync(SMOKE_PATH, 'utf8');
  assert.match(wf, /workflow_dispatch/, 'should be manually dispatchable');
  assert.match(wf, /schedule:/, 'should have a scheduled cadence');
  assert.match(wf, /pull_request:/, 'should run on path-filtered PRs');
  assert.match(wf, /paths:/, 'PR trigger should be path-filtered (focused lane)');
  assert.match(wf, /timeout-minutes:/, 'should bound runtime');
  assert.match(wf, /npm run test:e2e:smoke/, 'should run the bounded smoke script');
  assert.match(wf, /playwright install --with-deps chromium/, 'should install the browser');
  assert.match(wf, /upload-artifact/, 'should upload the report on failure');
  // dummy/non-production env only — never reference real secrets here.
  assert.doesNotMatch(wf, /SUPABASE_SERVICE_ROLE_KEY|ECPAY_HASH|secrets\./, 'must not use production secrets');
});

test('test:e2e:smoke runs a bounded allowlist of existing specs under --workers=1', () => {
  const script = PKG.scripts?.['test:e2e:smoke'];
  assert.ok(script, 'apps/web/package.json should define test:e2e:smoke');
  assert.match(script, /--workers=1/, 'smoke lane should pin a single worker for stability');
  const specs = script.match(/e2e\/[\w.-]+\.spec\.ts/g) || [];
  assert.ok(specs.length >= 1, 'allowlist should contain at least one spec');
  for (const spec of specs) {
    assert.ok(existsSync(path.join(REPO_ROOT, 'apps/web', spec)), `allowlisted spec must exist: ${spec}`);
  }
});
