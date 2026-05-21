/**
 * Contract tests for issue #626 — SEO metadata, sitemap, robots.txt
 *
 * Static checks: verify the key files exist and contain required strings.
 * No server required.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dirname, '../../app');

function readFile(relPath) {
  return readFileSync(resolve(appDir, relPath), 'utf8');
}

describe('issue #626 — SEO: robots.ts', () => {
  it('robots.ts exists', () => {
    const src = readFile('robots.ts');
    assert.ok(src.length > 0, 'robots.ts should not be empty');
  });

  it('disallows /admin', () => {
    const src = readFile('robots.ts');
    assert.ok(src.includes('/admin'), 'robots.ts should disallow /admin');
  });

  it('disallows /api/', () => {
    const src = readFile('robots.ts');
    assert.ok(src.includes('/api/'), 'robots.ts should disallow /api/');
  });

  it('disallows /guide/', () => {
    const src = readFile('robots.ts');
    assert.ok(src.includes('/guide/'), 'robots.ts should disallow /guide/');
  });

  it('references sitemap.xml', () => {
    const src = readFile('robots.ts');
    assert.ok(src.includes('sitemap.xml'), 'robots.ts should reference sitemap.xml');
  });
});

describe('issue #626 — SEO: sitemap.ts', () => {
  it('sitemap.ts exists', () => {
    const src = readFile('sitemap.ts');
    assert.ok(src.length > 0, 'sitemap.ts should not be empty');
  });

  it('includes /activities entry', () => {
    const src = readFile('sitemap.ts');
    assert.ok(src.includes('/activities'), 'sitemap.ts should include /activities');
  });

  it('includes /guides entry', () => {
    const src = readFile('sitemap.ts');
    assert.ok(src.includes('/guides'), 'sitemap.ts should include /guides');
  });

  it('includes legal pages', () => {
    const src = readFile('sitemap.ts');
    assert.ok(src.includes('/legal/privacy'), 'sitemap.ts should include /legal/privacy');
    assert.ok(src.includes('/legal/terms'), 'sitemap.ts should include /legal/terms');
  });
});

describe('issue #626 — SEO: layout.tsx metadata', () => {
  it('has metadataBase', () => {
    const src = readFile('layout.tsx');
    assert.ok(src.includes('metadataBase'), 'layout.tsx should have metadataBase');
  });

  it('has openGraph with siteName', () => {
    const src = readFile('layout.tsx');
    assert.ok(src.includes('siteName'), 'layout.tsx openGraph should include siteName');
    assert.ok(src.includes('Midao 祕島'), 'layout.tsx should reference Midao 祕島 brand name');
  });

  it('has twitter card metadata', () => {
    const src = readFile('layout.tsx');
    assert.ok(src.includes('twitter'), 'layout.tsx should include twitter metadata');
    assert.ok(src.includes('summary_large_image'), 'layout.tsx twitter card should be summary_large_image');
  });

  it('has title template', () => {
    const src = readFile('layout.tsx');
    assert.ok(src.includes('template'), 'layout.tsx title should use template format');
  });
});

describe('issue #626 — SEO: activity detail generateMetadata', () => {
  it('generateMetadata fetches activity and returns openGraph', () => {
    const src = readFile('activities/[region]/[slug]/page.tsx');
    assert.ok(src.includes('openGraph'), 'activity page generateMetadata should include openGraph');
  });

  it('generateMetadata includes twitter card', () => {
    const src = readFile('activities/[region]/[slug]/page.tsx');
    assert.ok(src.includes('twitter'), 'activity page generateMetadata should include twitter metadata');
  });

  it('generateMetadata does not call DB (GH-502 guard)', () => {
    // Per GH-502: generateMetadata must not trigger getActivityBySlugDb to avoid render lock
    const src = readFile('activities/[region]/[slug]/page.tsx');
    const metaBlock = src.split('export async function generateMetadata')[1]?.split('export default async function')[0] ?? '';
    assert.ok(!metaBlock.includes('getActivityBySlugDb('), 'generateMetadata must not call getActivityBySlugDb (GH-502)');
  });

  it('generateMetadata uses slug for title', () => {
    const src = readFile('activities/[region]/[slug]/page.tsx');
    const metaBlock = src.split('export async function generateMetadata')[1]?.split('export default async function')[0] ?? '';
    assert.ok(metaBlock.includes('slug'), 'generateMetadata should use slug for title');
  });
});
