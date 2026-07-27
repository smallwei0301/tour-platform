import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../../../..');
const workflowPath = resolve(root, '.github/workflows/midao-baseline-e2e.yml');

function workflowSource() {
  return readFileSync(workflowPath, 'utf8');
}

test('Midao baseline E2E workflow is PR-triggered, bounded, and uses Node 22', () => {
  const source = workflowSource();
  assert.match(source, /pull_request:/u);
  assert.match(source, /timeout-minutes:\s*45/u);
  assert.match(source, /node-version:\s*'22'/u);
  assert.match(source, /concurrency:/u);
  assert.match(source, /cancel-in-progress:\s*true/u);
});

test('CI provisions only the digest-bound Supabase CLI and required Docker images', () => {
  const source = workflowSource();
  assert.match(source, /v2\.87\.2\/supabase_linux_amd64\.tar\.gz/u);
  assert.match(source, /57aedd36f41297d27cc642c9d7582e89994916e2d86be3c4aca87ab079980767/u);
  assert.match(source, /e325dd50b274e88fd1416f93b9e063902827ae326d356ab7f9dc604c3eba5c59/u);
  assert.match(source, /select\(\.role == \$role\)/u);
  assert.match(source, /provision db/u);
  assert.match(source, /provision api/u);
  assert.match(source, /docker image inspect/u);
  assert.match(source, /docker tag/u);
  assert.doesNotMatch(source, /supabase\/cli@(main|master)|npm\s+exec\s+supabase|npx\s+supabase/u);
});

test('CI runs real Midao and legacy browser gates with independent hard timeouts', () => {
  const source = workflowSource();
  assert.match(source, /setfacl -m "u:\$runner_user:--x" \/root/u);
  assert.match(source, /setfacl -m "u:\$runner_user:r-x" \/root\/\.hermes\/toolchains\/supabase\/2\.87\.2\/supabase/u);
  assert.match(source, /getfacl --absolute-names/u);
  assert.doesNotMatch(source, /sudo env -i/u);
  assert.doesNotMatch(source, /sudo\s+(?:-E|--preserve-env)/u);
  assert.match(source, /timeout --signal=TERM 1200s bash scripts\/testing\/run-midao-e2e\.sh/u);
  assert.match(source, /apps\/web\/e2e\/midao-navigation\.spec\.ts/u);
  assert.match(source, /apps\/web\/e2e\/midao-auth-and-impersonation\.spec\.ts/u);
  assert.match(source, /timeout --signal=TERM 1200s bash scripts\/testing\/run-midao-legacy-e2e-compat\.sh/u);
  assert.match(source, /apps\/web\/e2e\/t1-login\.spec\.ts/u);
  assert.match(source, /playwright install --with-deps chromium/u);
});
