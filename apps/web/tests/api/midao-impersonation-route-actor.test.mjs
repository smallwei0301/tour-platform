import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const routePath = join(here, '../../app/api/v2/admin/guides/[guideId]/impersonate/route.ts');

function routeSource() {
  return readFileSync(routePath, 'utf8');
}

test('impersonation route signs canonical admin email from pickAdminCredentials only', () => {
  const source = routeSource();
  assert.match(source, /import\s*\{[^}]*pickAdminCredentials[^}]*\}\s*from\s*['"][^'"]*admin-auth\.mjs['"]/u);
  assert.match(source, /const\s+adminEmail\s*=\s*String\(pickAdminCredentials\(request\)\.email\s*\|\|\s*['"]['"]\)\.trim\(\)\.toLowerCase\(\)/u);
  assert.doesNotMatch(source, /request\.json\s*\(/u, 'actor identity must never come from request body');
  assert.doesNotMatch(source, /body\.(?:actor|adminEmail|email)/u);
});

test('success issues signed actor cookie for the canonical DB target and visible banner cookie', () => {
  const source = routeSource();
  assert.match(source, /import\s*\{[^}]*createImpersonationActorCookie[^}]*\}\s*from\s*['"][^'"]*midao\/impersonation-actor['"]/u);
  assert.match(source, /createImpersonationActorCookie\(\{[\s\S]*?adminEmail[\s\S]*?targetGuideId:\s*guide\.id[\s\S]*?\}\)/u);
  assert.match(source, /headers\.append\(\s*['"]set-cookie['"]\s*,\s*actorCookie\s*\)/u);
  assert.match(source, /guide_impersonation/u);

  const call = source.match(/createImpersonationActorCookie\(\{([\s\S]*?)\}\)/u)?.[1] || '';
  assert.doesNotMatch(call, /token|request|body/iu);
});

test('canonical guide target/version and existing admin/CSRF/approved boundaries remain intact', () => {
  const source = routeSource();
  assert.match(source, /pathname|\/api\/v2\/admin/u);
  assert.match(source, /guide_session_version/u);
  assert.match(source, /verification_status\s*!==\s*['"]approved['"]/u);
  assert.match(source, /createGuideSessionCookies\(guide\.id,\s*guide\.display_name,\s*sessionVersion/u);
});
