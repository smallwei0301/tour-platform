import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const guidesContentSrc = readFileSync(path.join(ROOT, 'app/guides/GuidesContent.tsx'), 'utf8');
const guidePageSrc = readFileSync(path.join(ROOT, 'app/guides/page.tsx'), 'utf8');

describe('issue #1027 — guides listing filter URL persistence', () => {
  test('GuidesContent.tsx uses useSearchParams and useRouter', () => {
    assert.ok(guidesContentSrc.includes("'use client'"), 'must be a client component');
    assert.ok(guidesContentSrc.includes('useSearchParams'), 'must use useSearchParams');
    assert.ok(guidesContentSrc.includes('useRouter'), 'must use useRouter');
  });

  test('GuidesContent.tsx updates URL on filter toggle', () => {
    assert.ok(
      guidesContentSrc.includes('router.push') || guidesContentSrc.includes('router.replace'),
      'must update URL on filter change'
    );
  });

  test('GuidesContent.tsx derives filter options from data', () => {
    assert.ok(
      guidesContentSrc.includes('useMemo') || guidesContentSrc.includes('new Set'),
      'must derive filter options from guide data'
    );
  });

  test('page.tsx wraps GuidesContent in Suspense', () => {
    assert.ok(guidePageSrc.includes('Suspense'), 'page.tsx must wrap GuidesContent in Suspense');
    assert.ok(guidePageSrc.includes('GuidesContent'), 'page.tsx must import and render GuidesContent');
  });

  test('page.tsx passes guides prop to GuidesContent', () => {
    assert.ok(
      guidePageSrc.includes('guides={guides') || guidePageSrc.includes('guides={'),
      'page.tsx must pass guides as prop to GuidesContent'
    );
  });

  test('GuidesContent.tsx has functional sort (rating-desc and reviews-desc)', () => {
    assert.ok(
      guidesContentSrc.includes('rating-desc'),
      'must support sort by rating descending'
    );
    assert.ok(
      guidesContentSrc.includes('reviews-desc'),
      'must support sort by review count descending'
    );
    assert.ok(
      guidesContentSrc.includes('handleSort'),
      'must have a handleSort handler wired to the select onChange'
    );
  });

  test('GuidesContent.tsx has text search with debounced URL persistence', () => {
    assert.ok(
      guidesContentSrc.includes('setQuery') && guidesContentSrc.includes('query'),
      'must have query state for text search'
    );
    assert.ok(
      guidesContentSrc.includes('type="search"') || guidesContentSrc.includes("type='search'"),
      'must have a search input with type=search'
    );
    assert.ok(
      guidesContentSrc.includes('setTimeout') && guidesContentSrc.includes('500'),
      'must debounce URL updates with 500ms timeout'
    );
    assert.ok(
      guidesContentSrc.includes("params.set('q', q)") || guidesContentSrc.includes('params.set("q"'),
      'must persist query in URL as ?q='
    );
  });
});
