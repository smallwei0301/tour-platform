/**
 * Global regression guard: all public pages with a visual breadcrumb must also
 * include BreadcrumbList JSON-LD for SEO consistency.
 *
 * Pages that have a tp-breadcrumb visual element should pair it with a
 * BreadcrumbList schema. This guard scans the known public page files.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, '../../app');

const PAGES_WITH_BREADCRUMBS = [
  '[locale]/about/page.tsx',
  '[locale]/blog/page.tsx',
  '[locale]/contact/page.tsx',
  '[locale]/faq/page.tsx',
  '[locale]/why-choose-us/page.tsx',
  '[locale]/guides/[slug]/page.tsx',
  '[locale]/blog/[slug]/page.tsx',
  '[locale]/experiences/[slug]/page.tsx',
  'booking/[activityId]/page.tsx',
  'guide/apply/page.tsx',
  '[locale]/legal/privacy/page.tsx',
];

describe('Global: pages with visual breadcrumbs must have BreadcrumbList JSON-LD', () => {
  for (const rel of PAGES_WITH_BREADCRUMBS) {
    test(`${rel} has BreadcrumbList JSON-LD`, () => {
      const src = readFileSync(resolve(APP, rel), 'utf8');
      assert.ok(
        src.includes('BreadcrumbList'),
        `${rel} has a visual breadcrumb but no BreadcrumbList JSON-LD — add a <script type="application/ld+json"> with "@type":"BreadcrumbList"`
      );
    });
  }
});
