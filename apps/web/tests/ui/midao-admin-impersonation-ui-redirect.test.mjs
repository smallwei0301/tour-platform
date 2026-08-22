import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const { resolveGuideLoginRedirect, sanitizeGuideRealmRedirect } = await import('../../src/lib/midao/login-redirect.ts');
const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, '../../app/(non-locale)/admin/guides/[guideId]/page.tsx'), 'utf8');

test('admin page keeps API realm authoritative while allowing the midao2 sub-route', () => {
  assert.match(page, /resolveGuideLoginRedirect\(json\.data\.redirectTo, target\)/u);
  assert.doesNotMatch(page, /window\.location\.href\s*=\s*['"]\/guide\/dashboard['"]/u);
  assert.equal(resolveGuideLoginRedirect('/midao', '/midao2'), '/midao2');
  assert.equal(resolveGuideLoginRedirect('/guide/dashboard', '/midao2'), '/guide/dashboard');
});

test('admin impersonation redirect accepts only guide or midao same-origin relative realms', () => {
  for (const allowed of ['/midao', '/midao/activities', '/midao2', '/midao2/requests', '/guide/dashboard', '/guide/bookings?open=1']) {
    assert.equal(sanitizeGuideRealmRedirect(allowed), allowed);
  }
  for (const hostile of [undefined, '', '/admin', '/traveler', '//evil.example', 'https://evil.example/midao', '/midao\\x', '/midao/%2fx', '/guide/%5cx', '/guide/%252fdashboard', '/guide/%']) {
    assert.equal(sanitizeGuideRealmRedirect(hostile), '/guide/dashboard', String(hostile));
  }
});
