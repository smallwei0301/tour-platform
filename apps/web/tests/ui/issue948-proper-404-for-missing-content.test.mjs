/**
 * Tests for PR #948 — proper 404 for missing blog articles and experience slugs.
 *
 * Source-level contract tests verifying the pages call notFound() for unknown content.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dirname, '../../app');

const blogSlugSrc = readFileSync(resolve(appDir, '[locale]/blog/[slug]/page.tsx'), 'utf8');
const experienceSlugSrc = readFileSync(resolve(appDir, '[locale]/experiences/[slug]/page.tsx'), 'utf8');

describe('issue #948/#960 — proper 404 for missing blog articles', () => {
  test('blog/[slug]/page.tsx imports notFound from next/navigation', () => {
    assert.ok(blogSlugSrc.includes("from 'next/navigation'"), 'must import from next/navigation');
    assert.ok(blogSlugSrc.includes('notFound'), 'must use notFound');
  });

  test('blog generateMetadata rejects missing slug with notFound() to preserve HTTP 404 contract', () => {
    const metadataFnMatch = blogSlugSrc.match(/export\s+async\s+function\s+generateMetadata[\s\S]*?\n}\n/);
    assert.ok(metadataFnMatch, 'generateMetadata function must exist');

    const metadataFn = metadataFnMatch[0];
    assert.match(
      metadataFn,
      /if\s*\(!article\)\s*\{?[\s\S]*notFound\(\)/,
      'generateMetadata must call notFound() for missing slugs instead of returning fallback metadata'
    );
  });

  test('blog page calls notFound() when article is missing (not custom 200 message)', () => {
    // Should call notFound() — not return a custom 200 response
    assert.ok(blogSlugSrc.includes('notFound()'), 'must call notFound() for missing articles');
    // Must NOT return a 200 with stale content when article is missing
    const hasStale200 = blogSlugSrc.includes('文章不存在') &&
      blogSlugSrc.includes('return (') &&
      blogSlugSrc.match(/if\s*\(!article\)\s*\{[\s\S]*?文章不存在[\s\S]*?\}/);
    assert.ok(!hasStale200, 'must not return HTTP 200 with "文章不存在" message in page component');
  });

  test('blog route statically enumerates valid slugs so unknown slugs are true HTTP 404', () => {
    assert.match(
      blogSlugSrc,
      /export\s+const\s+dynamicParams\s*=\s*false/,
      'dynamicParams=false must make unknown blog slugs a route-level 404 instead of a streamed 200 fallback'
    );
    assert.match(
      blogSlugSrc,
      /export\s+function\s+generateStaticParams\s*\(\s*\)[\s\S]*Object\.keys\(articles\)\.map\(\(slug\)\s*=>\s*\(\{\s*slug\s*\}\)\)/,
      'generateStaticParams must enumerate article slugs for valid blog pages'
    );
  });
});

describe('issue #948 — proper 404 for unknown experience slugs', () => {
  test('experiences/[slug]/page.tsx imports notFound from next/navigation', () => {
    assert.ok(
      experienceSlugSrc.includes("from 'next/navigation'") ||
      experienceSlugSrc.includes("import('next/navigation')"),
      'must import or dynamically import from next/navigation'
    );
  });

  test('experience page calls notFound() when slug not found in API response', () => {
    assert.ok(
      experienceSlugSrc.includes('notFound'),
      'must call notFound for unknown slugs when API succeeds'
    );
  });

  test('experience page preserves fallback when API fails (error tolerance)', () => {
    // The catch() on the fetch preserves the fallback for DB errors
    assert.ok(experienceSlugSrc.includes('fallbackExperience'), 'fallback must be preserved for API errors');
    assert.ok(experienceSlugSrc.includes('.catch('), 'fetch must have error handling');
  });
});
