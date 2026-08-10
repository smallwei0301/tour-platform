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
  assert.match(source, /timeout-minutes:\s*60/u);
  assert.match(source, /node-version:\s*'22\.23\.1'/u);
  assert.match(source, /concurrency:/u);
  assert.match(source, /cancel-in-progress:\s*true/u);
  assert.match(source, /Generate ephemeral guide session secret/u);
  assert.match(source, /randomBytes\(32\)/u);
  assert.match(source, /::add-mask::%s/u);
  assert.match(source, /GUIDE_SESSION_SECRET=%s/u);
  assert.match(source, /GITHUB_ENV/u);
  assert.doesNotMatch(source, /fetch-depth:\s*0/u);
  assert.doesNotMatch(source, /GUIDE_SESSION_SECRET:\s*\S+/u);
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
  assert.match(source, /timeout --signal=TERM --kill-after=30s 1200s bash scripts\/testing\/run-midao-e2e\.sh/u);
  assert.match(source, /apps\/web\/e2e\/midao-navigation\.spec\.ts/u);
  assert.match(source, /apps\/web\/e2e\/midao-auth-and-impersonation\.spec\.ts/u);
  assert.match(source, /timeout --signal=TERM --kill-after=30s 1200s bash scripts\/testing\/run-midao-legacy-e2e-compat\.sh/u);
  assert.match(source, /apps\/web\/e2e\/t1-login\.spec\.ts/u);
  assert.match(source, /playwright install --with-deps chromium/u);
});

test('CI runs the decision RPC runtime lane serially with redacted artifact metadata', () => {
  const source = workflowSource();
  assert.match(source, /supabase\/migrations\/\*\*/u);
  assert.match(
    source,
    /timeout --signal=TERM --kill-after=30s 1200s\s+node scripts\/testing\/with-midao-local-supabase\.mjs --postgrest\s+apps\/web\/tests\/integration\/midao-booking-decision-postgrest\.test\.mjs/u,
  );
  assert.match(source, /Run Task20B booking decision PostgreSQL and PostgREST runtime contracts/u);
  assert.match(source, /if:\s+failure\(\)/u);
  assert.match(source, /midao-baseline-e2e-/u);
  assert.doesNotMatch(source, /DATABASE_URL\s*[:=]|SUPABASE_SERVICE_ROLE_KEY\s*[:=]/u);
});

test('CI records the #1811 transaction runtime result before expected-terminal artifact promotion', () => {
  const source = workflowSource();
  const redStep = 'Prove #1811 public required-write fault was RED on the historical route';
  const greenStep = 'Run #1811 booking-order transaction PostgreSQL and PostgREST runtime contract';
  const runtimeCommand = /timeout --signal=TERM --kill-after=30s 1200s(?:\s*\\)?\s+node scripts\/testing\/with-midao-local-supabase\.mjs --postgrest(?:\s*\\)?\s+apps\/web\/tests\/integration\/midao-issue1811-order-transaction-postgrest\.test\.mjs/gu;
  assert.match(source, /268f2356cf809548800ecbb2b197b7c12cd5f461/u);
  assert.match(source, /github\.event\.pull_request\.number == 1818/u);
  assert.match(source, /github\.head_ref == 'agent\/issue-1811-order-transaction'/u);
  assert.match(source, /git fetch --no-tags --depth=20 origin "refs\/heads\/\$GITHUB_HEAD_REF"/u);
  assert.match(source, /test "\$\(git rev-parse FETCH_HEAD\)" = "\$PR_HEAD_SHA"/u);
  assert.match(source, /git merge-base --is-ancestor "\$red_commit" FETCH_HEAD/u);
  assert.match(source, /ISSUE1811_PUBLIC_RED_PROBE=1/u);
  assert.match(source, /ISSUE1811_PUBLIC_RED_PROBE:\s*'0'/u);
  assert.match(source, /ISSUE1811_PUBLIC_REQUIRED_WRITE_FAULT_RED/u);
  assert.match(source, /ISSUE1811_PUBLIC_REQUIRED_WRITE_FAULT_REACHED/u);
  assert.match(source, /ISSUE1811_ORDER_ITEMS_BOOM\|public draft route fails closed\|AssertionError/u);
  assert.match(source, /test "\$status" -ne 1/u);
  assert.match(source, /git diff --exit-code -- "\$route"/u);
  assert.equal(source.match(runtimeCommand)?.length, 2, 'the same public runtime file must run once RED and once GREEN');
  assert.ok(
    source.indexOf(redStep) < source.indexOf(greenStep),
    '#1811 historical public behavior must be proven RED before the current route runs GREEN',
  );
  assert.ok(
    source.indexOf(greenStep)
      < source.indexOf('Verify deterministic expected-terminal artifacts are committed'),
    '#1811 runtime contract must run before the intentionally stale artifact diff gate',
  );
});
