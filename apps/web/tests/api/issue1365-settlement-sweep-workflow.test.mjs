import { readFileSync, existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Issue #1365 缺口 1 — settlement pipeline 自動排程 source-contract。
 *
 * Locks the settlement-sweep workflow wiring: daily schedule + dispatch,
 * graceful secret guard, and the two endpoints in the correct serial order
 * (sweep before generate-payouts, since generate reads what sweep writes).
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const WORKFLOW = path.resolve(REPO_ROOT, '.github/workflows/settlement-sweep.yml');

describe('#1365 缺口 1 — settlement-sweep workflow contract', () => {
  it('workflow file exists', () => {
    assert.ok(existsSync(WORKFLOW), 'Expected .github/workflows/settlement-sweep.yml to exist');
  });

  it('runs on a daily schedule AND supports manual dispatch', () => {
    const src = readFileSync(WORKFLOW, 'utf-8');
    assert.match(src, /^\s*schedule:/m, 'must have a schedule trigger');
    assert.match(src, /cron:\s*'0 2 \* \* \*'/, 'daily at 02:00 UTC');
    assert.match(src, /workflow_dispatch:/, 'must allow manual dispatch');
  });

  it('gates on both NEXT_PUBLIC_VERCEL_URL and INTERNAL_ALERT_TOKEN, graceful skip', () => {
    const src = readFileSync(WORKFLOW, 'utf-8');
    assert.match(src, /secrets\.NEXT_PUBLIC_VERCEL_URL != ''/);
    assert.match(src, /secrets\.INTERNAL_ALERT_TOKEN != ''/);
    assert.match(src, /skip=true/, 'missing secrets → skip, not hard fail');
    assert.match(src, /if:\s*steps\.check-secrets\.outputs\.skip != 'true'/);
  });

  it('POSTs to both settlement endpoints with x-internal-token', () => {
    const src = readFileSync(WORKFLOW, 'utf-8');
    assert.match(src, /\/api\/internal\/settlement\/sweep/);
    assert.match(src, /\/api\/internal\/settlement\/generate-payouts/);
    assert.match(src, /x-internal-token: \$\{INTERNAL_ALERT_TOKEN\}/);
  });

  it('runs sweep BEFORE generate-payouts (generate reads guide_balances sweep writes)', () => {
    const src = readFileSync(WORKFLOW, 'utf-8');
    const sweepIdx = src.indexOf('/api/internal/settlement/sweep');
    const generateIdx = src.indexOf('/api/internal/settlement/generate-payouts');
    assert.ok(sweepIdx !== -1 && generateIdx !== -1);
    assert.ok(sweepIdx < generateIdx, 'sweep must POST before generate-payouts');
  });

  it('aborts on non-200 (sweep failure must not silently continue to generate)', () => {
    const src = readFileSync(WORKFLOW, 'utf-8');
    const matches = src.match(/if \[ "\$RESPONSE" != "200" \]; then/g) || [];
    assert.ok(matches.length >= 2, 'both steps must check HTTP 200 and exit 1 on failure');
  });

  it('never hard-codes the token (only references the secret)', () => {
    const src = readFileSync(WORKFLOW, 'utf-8');
    // token only ever appears as a secret reference or the env var name
    assert.match(src, /INTERNAL_ALERT_TOKEN: \$\{\{ secrets\.INTERNAL_ALERT_TOKEN \}\}/);
    assert.doesNotMatch(src, /x-internal-token:\s*[A-Za-z0-9]{16,}/, 'no literal token in the YAML');
  });
});
