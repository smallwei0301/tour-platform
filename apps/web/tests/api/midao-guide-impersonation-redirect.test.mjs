import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const route = readFileSync(resolve(here, '../../app/api/v2/admin/guides/[guideId]/impersonate/route.ts'), 'utf8');

test('impersonation reads canonical mode/name/version and returns its canonical realm redirect', () => {
  assert.match(route, /backend_mode:\s*'legacy'\s*\|\s*'midao'/u);
  const select = route.match(/\.select<GuideImpersonationProfile>\('([^']+)'\)/u)?.[1] || '';
  for (const column of ['id', 'display_name', 'guide_session_version', 'verification_status', 'backend_mode']) {
    assert.equal(select.split(/,\s*/u).includes(column), true, column);
  }
  assert.match(route, /const redirectTo = guide\.backend_mode === 'midao' \? '\/midao' : '\/guide\/dashboard'/u);
  assert.match(route, /jsonOk\(\{[^}]*redirectTo/u);
});

test('canonical admin actor and approved target security boundaries remain unchanged', () => {
  assert.match(route, /String\(pickAdminCredentials\(request\)\.email[^]*\.trim\(\)\.toLowerCase\(\)/u);
  assert.doesNotMatch(route, /request\.json\(/u);
  assert.match(route, /guide\.verification_status !== 'approved'/u);
  assert.match(route, /createImpersonationActorCookie\(\{[^]*adminEmail[^]*targetGuideId:\s*guide\.id/u);
});
