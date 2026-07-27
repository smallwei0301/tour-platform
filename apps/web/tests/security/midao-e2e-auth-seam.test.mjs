import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const webRoot = resolve(repoRoot, 'apps/web');
const testSecret = 'midao-e2e-local-guide-secret-0123456789abcdef';
const guideId = '99999999-9999-4999-8999-999999999999';
const guideName = 'Midao E2E Guide';

process.env.GUIDE_SESSION_SECRET = testSecret;
process.env.NEXT_PUBLIC_BASE_URL = 'http://127.0.0.1:43127';

const helpersSource = readFileSync(resolve(webRoot, 'e2e/helpers.ts'), 'utf8');
const configSource = readFileSync(resolve(webRoot, 'playwright.config.ts'), 'utf8');
const seedSource = readFileSync(resolve(repoRoot, 'supabase/seed.sql'), 'utf8');
const e2eSeedSource = readFileSync(resolve(repoRoot, 'scripts/testing/midao-e2e-seed.sql'), 'utf8');
const localRunnerSource = readFileSync(resolve(repoRoot, 'scripts/testing/with-midao-local-supabase.mjs'), 'utf8');
const authSpecSource = readFileSync(resolve(webRoot, 'e2e/midao-auth-and-impersonation.spec.ts'), 'utf8');
const navigationSpecSource = readFileSync(resolve(webRoot, 'e2e/midao-navigation.spec.ts'), 'utf8');

async function importFresh(path) {
  return import(`${pathToFileURL(path).href}?e4=${Date.now()}-${Math.random()}`);
}

test('Midao helpers mint real guide and signed actor cookies with shared production codecs', async () => {
  assert.match(helpersSource, /import\s*\{\s*signGuideSession\s*\}/u);
  assert.match(helpersSource, /import\s*\{\s*createImpersonationActorCookie\s*\}/u);
  assert.match(helpersSource, /setMidaoGuideSession[\s\S]{0,800}signGuideSession\(input\.guideId, input\.sessionVersion\)/u);
  assert.match(helpersSource, /setMidaoImpersonationSession[\s\S]{0,1200}createImpersonationActorCookie\(/u);
  assert.doesNotMatch(helpersSource, /setMidaoGuideSession[\s\S]{0,800}repeat\(64\)/u);

  const crypto = await importFresh(resolve(webRoot, 'src/lib/guide/session-crypto.ts'));
  const guideAuth = await importFresh(resolve(webRoot, 'src/lib/guide-auth.ts'));
  const actorCodec = await importFresh(resolve(webRoot, 'src/lib/midao/impersonation-actor.ts'));
  const signature = crypto.signGuideSession(guideId, 1);
  const guideCookieHeader = [
    `guide_token=${encodeURIComponent(`${guideId}:1:${signature}`)}`,
    `guide_id=${encodeURIComponent(guideId)}`,
    `guide_name=${encodeURIComponent(guideName)}`,
  ].join('; ');
  assert.deepEqual(
    guideAuth.verifyGuideSession(new Request('http://127.0.0.1/midao', { headers: { cookie: guideCookieHeader } })),
    { guideId, guideName, sessionVersion: 1, isNew: false },
  );

  const actorSetCookie = actorCodec.createImpersonationActorCookie({
    adminEmail: 'Admin@Example.Invalid',
    targetGuideId: guideId,
    issuedAt: 1_800_000_000_000,
  });
  const actorPair = actorSetCookie.split(';', 1)[0];
  assert.equal(actorCodec.verifyImpersonationActorCookie(actorPair, {
    targetGuideId: guideId,
    now: 1_800_000_000_500,
  })?.actorId, 'admin@example.invalid');
});

test('managed Midao Playwright lane is explicit, local-only, non-reusing, and secret-safe', () => {
  for (const required of [
    'MIDAO_E2E_LOCAL', 'PLAYWRIGHT_NO_WEBSERVER', 'reuseExistingServer: false',
    'MIDAO_E2E_PORT', 'SUPABASE_SERVICE_ROLE_KEY', 'GUIDE_SESSION_SECRET',
    'ADMIN_ACCESS_TOKEN', 'ADMIN_EMAIL_ALLOWLIST',
    "NODE_OPTIONS: '--max-old-space-size=512'", "CHOKIDAR_USEPOLLING: '1'",
    "WATCHPACK_POLLING: 'true'", "CHOKIDAR_INTERVAL: '1000'", "NEXT_TELEMETRY_DISABLED: '1'",
  ]) assert.ok(configSource.includes(required), `missing ${required}`);
  assert.match(configSource, /MIDAO_E2E_LOCAL[\s\S]*SUPABASE_ANON_KEY:[\s\S]*requireEnv\('SUPABASE_ANON_KEY'\)/u);
  assert.match(configSource, /command:\s*'npm run dev'/u);
  assert.match(configSource, /env:/u);
  assert.match(configSource, /url:\s*`\$\{baseURL\}\/images\/placeholder-avatar\.svg`/u);

  for (const runner of ['run-midao-e2e.sh', 'run-midao-legacy-e2e-compat.sh']) {
    const source = readFileSync(resolve(repoRoot, 'scripts/testing', runner), 'utf8');
    assert.match(source, /e2e\//u);
    assert.doesNotMatch(source, /PLAYWRIGHT_NO_WEBSERVER=1/u);
  }
});

test('local runner verifies capture and expected transactions before materializing baseline seed and E2E payloads', () => {
  assert.match(localRunnerSource, /verifyCaptureTransaction/u);
  assert.match(localRunnerSource, /verifyExpectedTerminalTransaction/u);
  assert.match(localRunnerSource, /materializeFreshWorkdir/u);
  assert.match(localRunnerSource, /captureTransactionId/u);
  assert.match(localRunnerSource, /captureManifestSha256/u);
  assert.doesNotMatch(localRunnerSource, /FOUNDATION_BOOTSTRAP_SQL/u);
});

test('transaction-bound canonical seed remains intact and local overlay contains a separate approved Midao guide', () => {
  assert.match(seedSource, /insert into auth\.users/u);
  assert.doesNotMatch(seedSource, /midao-e2e-guide/u);
  assert.match(e2eSeedSource, /insert into auth\.users[\s\S]{0,500}88888888-8888-4888-8888-888888888888/u);
  assert.match(e2eSeedSource, /id, user_id, slug, display_name, guide_email, guide_password_hash/u);
  for (const value of [
    '88888888-8888-4888-8888-888888888888',
    guideId,
    'midao-e2e-guide',
    'midao-e2e@example.invalid',
    "backend_mode = 'midao'",
    "verification_status = 'approved'",
    'guide_session_version = 1',
    '77777777-7777-4777-8777-777777777777',
    '00000000-0000-4000-8000-000000000001',
    'legacy-e2e-guide',
    'legacy-e2e@example.invalid',
    "backend_mode = 'legacy'",
  ]) assert.ok(e2eSeedSource.includes(value), `E2E seed overlay missing ${value}`);
  assert.doesNotMatch(e2eSeedSource, /andy-lee/u);
});

test('Midao browser session versions match the canonical seeded guide row', () => {
  assert.match(e2eSeedSource, /guide_session_version = 1;/u);
  assert.match(authSpecSource, /sessionVersion: 1,/u);
  assert.match(navigationSpecSource, /sessionVersion: 1,/u);
  assert.doesNotMatch(authSpecSource, /sessionVersion: 7,/u);
  assert.doesNotMatch(navigationSpecSource, /sessionVersion: 7,/u);
});
