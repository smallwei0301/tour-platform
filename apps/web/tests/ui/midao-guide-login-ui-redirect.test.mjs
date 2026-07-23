import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const { resolveGuideLoginRedirect } = await import('../../src/lib/midao/login-redirect.ts');
const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, '../../app/(non-locale)/guide/login/page.tsx'), 'utf8');

const hostile = [
  'https://evil.example/guide/dashboard',
  '//evil.example/guide/dashboard',
  '/guide\\dashboard',
  '/guide/%2fdashboard',
  '/guide/%5cdashboard',
  '/guide/%252fdashboard',
  '/guide/%2525%2532%2566dashboard',
  '/guide/%',
  '/guide/%zz',
];

test('login UI consumes the server redirect and never hardcodes invite success to legacy profile', () => {
  assert.match(page, /resolveGuideLoginRedirect\(json\.data\.redirectTo, requestedNext\)/u);
  assert.doesNotMatch(page, /router\.push\(isFirstTime\s*\?/u);
  assert.doesNotMatch(page, /json\?\.data\?\.created[^]*router\.push\(['"]\/guide\/profile['"]\)/u);
});

test('server redirect is authoritative and next can only refine inside the same realm', () => {
  assert.equal(resolveGuideLoginRedirect('/midao', null), '/midao');
  assert.equal(resolveGuideLoginRedirect('/guide/profile', null), '/guide/profile');
  assert.equal(resolveGuideLoginRedirect('/guide/dashboard', '/guide/bookings?state=open#today'), '/guide/bookings?state=open#today');
  assert.equal(resolveGuideLoginRedirect('/midao', '/midao/activities?draft=1'), '/midao/activities?draft=1');
  assert.equal(resolveGuideLoginRedirect('/guide/profile', '/midao'), '/guide/profile');
  assert.equal(resolveGuideLoginRedirect('/midao', '/guide/dashboard'), '/midao');
});

test('hostile, ambiguous or malformed next values fail closed to the server redirect', () => {
  for (const next of hostile) {
    assert.equal(resolveGuideLoginRedirect('/guide/dashboard', next), '/guide/dashboard', next);
  }
  assert.equal(resolveGuideLoginRedirect('https://evil.example', '/guide/dashboard'), '/guide/dashboard');
  assert.equal(resolveGuideLoginRedirect('//evil.example', '/midao'), '/guide/dashboard');
  assert.equal(resolveGuideLoginRedirect('/admin', '/midao'), '/guide/dashboard');
});
