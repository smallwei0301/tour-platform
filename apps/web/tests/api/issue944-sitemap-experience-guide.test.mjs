/**
 * Tests for PR #944 — experience detail pages + guide profiles in sitemap.xml
 *
 * Source-level contract tests verifying the sitemap additions are correctly wired.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sitemapSrc = readFileSync(resolve(__dirname, '../../app/sitemap.ts'), 'utf8');
const robotsSrc = readFileSync(resolve(__dirname, '../../app/robots.ts'), 'utf8');

describe('issue #944 — experience + guide pages in sitemap', () => {
  test('sitemap.ts defines EXPERIENCE_SLUGS with known slugs', () => {
    assert.ok(sitemapSrc.includes('EXPERIENCE_SLUGS'), 'sitemap.ts must define EXPERIENCE_SLUGS');
    assert.ok(sitemapSrc.includes('kaohsiung-chaishan-cave-experience'), 'EXPERIENCE_SLUGS must include cave experience');
    assert.ok(sitemapSrc.includes('dadadaocheng-walk'), 'EXPERIENCE_SLUGS must include Dadaocheng walk');
  });

  test('sitemap.ts maps EXPERIENCE_SLUGS to /experiences/ URLs', () => {
    assert.ok(sitemapSrc.includes('/experiences/${slug}'), 'sitemap must generate /experiences/[slug] URLs');
  });

  test('sitemap.ts imports and calls listPublishedGuidesDb for guide profiles', () => {
    assert.ok(sitemapSrc.includes('listPublishedGuidesDb'), 'sitemap.ts must import listPublishedGuidesDb');
    assert.ok(sitemapSrc.includes('/guides/${'), 'sitemap.ts must generate /guides/[slug] URLs');
  });

  test('sitemap.ts guide entries use priority 0.7 (same as guides listing)', () => {
    // Guide profile pages should have same priority as the guides listing
    const guideSection = sitemapSrc.slice(sitemapSrc.indexOf('listPublishedGuidesDb'));
    assert.ok(guideSection.includes('0.7'), 'guide sitemap entries should have priority 0.7');
  });

  test('sitemap.ts catches DB errors for guide entries (fail-safe)', () => {
    assert.ok(sitemapSrc.includes('.catch(() => [])'), 'guide query must be error-tolerant with .catch(() => [])');
  });
});

describe('issue #945 — robots.txt allows /experiences paths', () => {
  test('robots.ts explicitly allows /experiences in allow list', () => {
    assert.ok(robotsSrc.includes("'/experiences'") || robotsSrc.includes('"/experiences"'),
      'robots.ts must include /experiences in the allow list');
  });

  test('robots.ts allows /experiences/ (with trailing slash) for path prefix matching', () => {
    assert.ok(robotsSrc.includes("'/experiences/'") || robotsSrc.includes('"/experiences/"'),
      'robots.ts must include /experiences/ in the allow list');
  });
});
