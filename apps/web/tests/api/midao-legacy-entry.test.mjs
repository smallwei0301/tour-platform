import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  MIDAO_LEGACY_ENTRY_DESTINATIONS,
  resolveMidaoLegacyEntry,
  safeMidaoReturnPath,
} from '../../src/lib/midao/legacy-entry.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const legacyEntryRoute = resolve(root, 'app/(non-locale)/midao/legacy/[capability]/page.tsx');
const profilePage = resolve(root, 'app/(non-locale)/guide/profile/page.tsx');
const midaoReturnLinkComponent = resolve(root, 'src/components/guide/MidaoReturnLink.tsx');

test('legacy entry accepts only the public-profile capability with the Midao return path', () => {
  assert.deepEqual(MIDAO_LEGACY_ENTRY_DESTINATIONS, { 'public-profile': '/guide/profile' });
  assert.equal(safeMidaoReturnPath('/midao/me'), '/midao/me');
  assert.equal(
    resolveMidaoLegacyEntry('public-profile', '/midao/me'),
    '/guide/profile?returnTo=%2Fmidao%2Fme',
  );
});

test('legacy entry rejects hostile and non-Midao return paths plus unknown capabilities', () => {
  for (const value of [
    null,
    'https://example.invalid',
    '//example.invalid',
    '/guide/profile',
    '/midao2/me',
    '/midao\\me',
    '/midao/%0a',
  ]) {
    assert.equal(safeMidaoReturnPath(value), null, `${value} must be rejected`);
  }
  assert.equal(resolveMidaoLegacyEntry('public-profile', 'https://example.invalid'), null);
  assert.equal(resolveMidaoLegacyEntry('unknown', '/midao/me'), null);
});

test('legacy entry route uses the Midao session boundary before the fixed destination resolver', () => {
  assert.equal(existsSync(legacyEntryRoute), true, 'controlled legacy entry route must exist');
  const source = readFileSync(legacyEntryRoute, 'utf8');
  assert.match(source, /resolveMidaoPageSession/u);
  assert.match(source, /await headers\(\)/u);
  assert.match(source, /redirect\(sessionResult\.location\)/u);
  assert.match(source, /notFound\(\)/u);
  assert.match(source, /resolveMidaoLegacyEntry\(capability, typeof returnTo === 'string' \? returnTo : null\)/u);
  assert.doesNotMatch(source, /backend_mode|verifyGuideSession|api\/guide\/profile/u);
});

test('legacy profile shows the Midao return link only after shared relative-path validation', () => {
  const pageSource = readFileSync(profilePage, 'utf8');
  assert.match(pageSource, /MidaoReturnLink/u);
  assert.doesNotMatch(pageSource, /useSearchParams/u, 'searchParams reading belongs in MidaoReturnLink, not the page');

  const componentSource = readFileSync(midaoReturnLinkComponent, 'utf8');
  assert.match(componentSource, /useSearchParams/u);
  assert.match(componentSource, /safeMidaoReturnPath/u);
  assert.match(componentSource, /searchParams\.get\('returnTo'\)/u);
  assert.match(componentSource, /if \(!returnTo\) return null/u);
  assert.match(componentSource, /href=\{returnTo\}/u);
  assert.match(componentSource, /返回祕島/u);
});
