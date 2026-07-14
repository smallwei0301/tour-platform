import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dirname, '../../app');
const localizedAppDir = resolve(appDir, '[locale]');

const INDEXABLE_ROUTE_SOURCES = [
  'page.tsx',
  'about/page.tsx',
  'activities/page.tsx',
  'activities/[region]/page.tsx',
  'activities/[region]/[slug]/page.tsx',
  'blog/page.tsx',
  'blog/[slug]/page.tsx',
  'contact/page.tsx',
  'experiences/[slug]/page.tsx',
  'faq/page.tsx',
  'guides/page.tsx',
  'guides/[slug]/page.tsx',
  'legal/privacy/page.tsx',
  'legal/refund/page.tsx',
  'legal/terms/page.tsx',
  'theme/cave-exploration/page.tsx',
  'theme/culture-history/page.tsx',
  'theme/ecology/page.tsx',
  'theme/mountain-wilderness/page.tsx',
  'theme/river-trekking/page.tsx',
  'why-choose-us/page.tsx',
];

test('every indexable localized route declares canonical + hreflang metadata through buildAlternates', () => {
  const missing = INDEXABLE_ROUTE_SOURCES.filter((relativePath) => {
    const source = readFileSync(resolve(localizedAppDir, relativePath), 'utf8');
    return !source.includes('buildAlternates(');
  });

  assert.deepEqual(missing, [], `Missing buildAlternates metadata: ${missing.join(', ')}`);
});
