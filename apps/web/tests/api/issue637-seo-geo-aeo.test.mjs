/**
 * Tests for Issue #637: SEO/GEO/AEO optimization
 *
 * AC#1: docs/operations/seo-geo-aeo-launch-checklist.md exists
 * AC#2: Activity detail page source contains application/ld+json script tag
 * AC#3: Activity detail page JSON-LD uses TouristAttraction schema
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = new URL('../../../../', import.meta.url).pathname.replace(/\/$/, '');

// ── AC#1: Docs file exists ──────────────────────────────────────────────────

test('seo-geo-aeo launch checklist docs file exists', () => {
  const docPath = join(REPO_ROOT, 'docs/operations/seo-geo-aeo-launch-checklist.md');
  assert.ok(existsSync(docPath), `Expected ${docPath} to exist`);
});

test('seo-geo-aeo launch checklist contains SEO, GEO, and AEO sections', () => {
  const docPath = join(REPO_ROOT, 'docs/operations/seo-geo-aeo-launch-checklist.md');
  const content = readFileSync(docPath, 'utf8');
  assert.ok(content.includes('SEO'), 'Docs should mention SEO');
  assert.ok(content.includes('GEO'), 'Docs should mention GEO');
  assert.ok(content.includes('AEO'), 'Docs should mention AEO');
});

test('seo-geo-aeo launch checklist covers structured data (JSON-LD)', () => {
  const docPath = join(REPO_ROOT, 'docs/operations/seo-geo-aeo-launch-checklist.md');
  const content = readFileSync(docPath, 'utf8');
  assert.ok(content.includes('JSON-LD') || content.includes('json-ld'), 'Docs should cover JSON-LD structured data');
});

// ── AC#2: Activity detail page has application/ld+json ─────────────────────

test('activity detail page contains application/ld+json script element', () => {
  const pagePath = join(REPO_ROOT, 'apps/web/app/activities/[region]/[slug]/page.tsx');
  assert.ok(existsSync(pagePath), `Expected ${pagePath} to exist`);
  const source = readFileSync(pagePath, 'utf8');
  assert.ok(
    source.includes('application/ld+json'),
    'Activity detail page should include a <script type="application/ld+json"> element',
  );
});

// ── AC#3: JSON-LD uses TouristAttraction schema ─────────────────────────────

test('activity detail page JSON-LD references TouristAttraction schema type', () => {
  const pagePath = join(REPO_ROOT, 'apps/web/app/activities/[region]/[slug]/page.tsx');
  const source = readFileSync(pagePath, 'utf8');
  assert.ok(
    source.includes('TouristAttraction'),
    'Activity detail page JSON-LD should use @type TouristAttraction',
  );
});

test('activity detail page JSON-LD includes address with addressCountry TW', () => {
  const pagePath = join(REPO_ROOT, 'apps/web/app/activities/[region]/[slug]/page.tsx');
  const source = readFileSync(pagePath, 'utf8');
  assert.ok(
    source.includes('PostalAddress'),
    'Activity detail JSON-LD should include a PostalAddress for the address field',
  );
  assert.ok(
    source.includes('"TW"'),
    'Activity detail JSON-LD address should specify addressCountry TW',
  );
});

test('activity detail page JSON-LD includes priceRange field', () => {
  const pagePath = join(REPO_ROOT, 'apps/web/app/activities/[region]/[slug]/page.tsx');
  const source = readFileSync(pagePath, 'utf8');
  assert.ok(
    source.includes('priceRange'),
    'Activity detail JSON-LD should include priceRange for AEO price answer support',
  );
});
