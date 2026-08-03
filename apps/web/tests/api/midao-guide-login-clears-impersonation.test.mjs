import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const routePath = resolve(here, '../../app/api/guide/auth/session/route.ts');
const actorPath = resolve(here, '../../src/lib/midao/impersonation-actor.ts');
const route = readFileSync(routePath, 'utf8');
const actor = readFileSync(actorPath, 'utf8');

const clearCall = 'appendClearImpersonationCookies(headers);';

test('route clear helper emits signed actor and visible banner deletion headers with exact scopes', () => {
  assert.match(route, /import\s*\{[^}]*clearImpersonationActorCookie[^}]*\}\s*from\s*['"][^'"]*midao\/impersonation-actor['"]/u);
  const helper = route.slice(
    route.indexOf('function appendClearImpersonationCookies'),
    route.indexOf('/** GET'),
  );
  assert.ok(helper.length > 0, 'route must define a bounded clear helper before handlers');
  assert.match(helper, /headers\.append\(\s*['"]set-cookie['"]\s*,\s*clearImpersonationActorCookie\(\)\s*\)/u);
  assert.match(helper, /guide_impersonation=/u);
  assert.match(helper, /Path=\//u);
  assert.match(helper, /SameSite=Lax/u);
  assert.match(helper, /Max-Age=0/u);
  assert.match(helper, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/u);
  assert.doesNotMatch(helper, /Domain=/iu);

  assert.match(actor, /MIDAO_IMPERSONATION_ACTOR_COOKIE_NAME\s*=\s*['"]midao_impersonation_actor['"]/u);
  assert.match(actor, /return\s+`\$\{MIDAO_IMPERSONATION_ACTOR_COOKIE_NAME\}=`/u);
  assert.match(actor, /Path=\/; HttpOnly; SameSite=Lax; Max-Age=0/u);
  assert.match(actor, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/u);
});

test('invite, email/password, and legacy guideId success each clear impersonation after new session cookies', () => {
  const creation = 'const cookies = createGuideSessionCookies';
  let cursor = 0;
  for (const flow of ['invite', 'email/password', 'legacy guideId']) {
    const start = route.indexOf(creation, cursor);
    assert.ok(start >= 0, `${flow} must create guide session cookies`);
    const end = route.indexOf('return new Response', start);
    assert.ok(end > start, `${flow} must return a success response`);
    const successBlock = route.slice(start, end);
    assert.ok(successBlock.includes(clearCall), `${flow} success must clear impersonation cookies`);
    assert.ok(successBlock.indexOf("cookies.forEach((c) => headers.append('set-cookie', c));") < successBlock.indexOf(clearCall), `${flow} must append clear headers after the new guide session`);
    cursor = end + 1;
  }
});

test('DELETE logout clears impersonation while error paths do not call the clear helper', () => {
  const deleteStart = route.indexOf('export async function DELETE');
  const deleteBody = route.slice(deleteStart);
  assert.ok(deleteBody.includes(clearCall), 'logout must clear impersonation cookies');
  assert.ok(deleteBody.indexOf('clearGuideSessionCookies()') < deleteBody.indexOf(clearCall));

  const calls = route.match(/appendClearImpersonationCookies\(headers\);/gu) || [];
  assert.equal(calls.length, 4, 'only three successful login paths and successful logout may clear impersonation');
  const firstCall = route.indexOf(clearCall);
  assert.ok(route.indexOf("fail('INVALID_TOKEN'") < firstCall, 'invite errors must remain before success-only clearing');
  assert.ok(route.indexOf("fail('INVALID_CREDENTIALS'") < route.indexOf(clearCall, firstCall + 1), 'credential errors must remain before success-only clearing');
});
