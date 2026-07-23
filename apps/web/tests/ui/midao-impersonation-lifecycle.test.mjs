import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const routePath = resolve(here, '../../app/api/guide/impersonation/route.ts');
const componentPath = resolve(here, '../../src/components/midao/ImpersonationBanner.tsx');
const guideLayout = readFileSync(resolve(here, '../../app/(non-locale)/guide/layout.tsx'), 'utf8');
const midaoLayoutPath = resolve(here, '../../app/(non-locale)/midao/layout.tsx');

test('status endpoint verifies canonical guide session and signed actor without exposing admin identity', () => {
  const route = readFileSync(routePath, 'utf8');
  assert.match(route, /export async function GET\(request: Request\)/u);
  assert.match(route, /verifyCanonicalGuideSession\(request,\s*\{\s*requireMode:\s*false/u);
  assert.match(route, /active:\s*session\.actorType === 'admin'/u);
  assert.match(route, /guideName:\s*session\.guideName/u);
  assert.doesNotMatch(route, /actorId:\s*session\.actorId/u);
});

test('dedicated end-impersonation route is CSRF protected and clears every impersonation/session cookie', () => {
  assert.equal(existsSync(routePath), true);
  const route = readFileSync(routePath, 'utf8');
  assert.match(route, /export async function DELETE\(request: Request\)/u);
  const csrf = route.indexOf('validateCsrf(request)');
  const clearSession = route.indexOf('clearGuideSessionCookies()');
  const clearActor = route.indexOf('clearImpersonationActorCookie()');
  const clearMarker = route.indexOf('guide_impersonation=;');
  assert.ok(csrf >= 0 && clearSession > csrf && clearActor > csrf && clearMarker > csrf);
  assert.match(route, /Max-Age=0/u);
  assert.match(route, /Path=\//u);
  assert.match(route, /SameSite=Lax/u);
  assert.doesNotMatch(route, /Domain=/iu);
});

test('guide and midao realms use one banner implementation and one DELETE endpoint', () => {
  assert.equal(existsSync(componentPath), true);
  assert.equal(existsSync(midaoLayoutPath), true);
  const component = readFileSync(componentPath, 'utf8');
  const midaoLayout = readFileSync(midaoLayoutPath, 'utf8');
  for (const layout of [guideLayout, midaoLayout]) assert.match(layout, /ImpersonationBanner/u);
  assert.match(component, /fetch\('\/api\/guide\/impersonation'[\s\S]*method:\s*'GET'/u);
  assert.match(component, /json\?\.data\?\.active\s*===\s*true/u);
  assert.doesNotMatch(component, /document\.cookie[\s\S]*guide_impersonation/u);
  assert.doesNotMatch(component, /midao_impersonation_actor/u);
  assert.match(component, /fetch\('\/api\/guide\/impersonation'[\s\S]*method:\s*'DELETE'/u);
  assert.match(component, /csrfHeaders\(\)/u);
  assert.match(component, /if \(!response\.ok\) throw/u);
  assert.ok(component.indexOf('if (!response.ok) throw') < component.indexOf("window.location.href = '/admin/guides'"));
});
