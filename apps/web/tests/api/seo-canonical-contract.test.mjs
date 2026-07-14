import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPublicPath } from '../../src/lib/seo-path.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localizedAppDir = resolve(__dirname, '../../app/[locale]');

function findPageSources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return findPageSources(fullPath);
    return entry.name === 'page.tsx' ? [fullPath] : [];
  });
}

const DYNAMIC_METADATA_SOURCES = [
  'activities/[region]/page.tsx',
  'activities/[region]/[slug]/page.tsx',
  'blog/[slug]/page.tsx',
  'experiences/[slug]/page.tsx',
  'guides/[slug]/page.tsx',
];

test('every localized public page declares canonical plus hreflang in generateMetadata', () => {
  const missing = findPageSources(localizedAppDir)
    .map((sourcePath) => ({ sourcePath, source: readFileSync(sourcePath, 'utf8') }))
    .filter(({ source }) => !/alternates:\s*buildAlternates\(/.test(source))
    .map(({ sourcePath }) => sourcePath.slice(localizedAppDir.length + 1));

  assert.deepEqual(missing, [], `Missing canonical/hreflang metadata: ${missing.join(', ')}`);
});

test('dynamic public metadata delegates path segments to the encoded path builder', () => {
  const missing = DYNAMIC_METADATA_SOURCES.filter((relativePath) => {
    const source = readFileSync(join(localizedAppDir, relativePath), 'utf8');
    return !source.includes('buildPublicPath(');
  });

  assert.deepEqual(missing, [], `Unencoded dynamic metadata path: ${missing.join(', ')}`);
});

test('public canonical paths encode dynamic path segments instead of treating them as URL syntax', () => {
  assert.equal(buildPublicPath('/experiences', ['bad?utm=attacker']), '/experiences/bad%3Futm%3Dattacker');
  assert.equal(buildPublicPath('/experiences', ['bad#fragment']), '/experiences/bad%23fragment');
  assert.equal(buildPublicPath('/guides', ['space slug']), '/guides/space%20slug');
  assert.equal(buildPublicPath('/activities', ['台北', 'guided/walk']), '/activities/%E5%8F%B0%E5%8C%97/guided%2Fwalk');
});

test('experience metadata validates the published slug before emitting alternates', () => {
  const source = readFileSync(join(localizedAppDir, 'experiences/[slug]/page.tsx'), 'utf8');
  assert.match(source, /listPublishedActivitiesDb/, 'metadata must use the published-only activity catalog');
  assert.match(source, /if \(!experience\) notFound\(\)/, 'unknown or unavailable experiences must not emit SEO metadata');
  assert.match(source, /buildPublicPath\('\/experiences', \[slug\]\)/, 'experience canonical must encode the slug segment');
});
