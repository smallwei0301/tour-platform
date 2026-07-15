/**
 * GH-1086 — booking/[activityId]/page must have h1 and BreadcrumbList JSON-LD in both render paths.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, '../../app/(non-locale)/booking/[activityId]/page.tsx'), 'utf8');

describe('GH-1086 — booking page a11y and SEO', () => {
  test('page has at least one h1 element', () => {
    const h1Matches = source.match(/<h1[\s>]/g) ?? [];
    assert.ok(h1Matches.length >= 1, `Expected at least 1 h1, found ${h1Matches.length}`);
  });
  test('page has BreadcrumbList JSON-LD schema', () => {
    assert.ok(
      source.includes('BreadcrumbList'),
      'Booking page must include BreadcrumbList JSON-LD for SEO'
    );
  });
});
