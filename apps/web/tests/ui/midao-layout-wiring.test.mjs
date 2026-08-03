import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const routeRoot = resolve(root, 'app/(non-locale)/midao');
const read = (path) => readFileSync(resolve(routeRoot, path), 'utf8');

const layout = read('layout.tsx');

test('server layout calls the page-session boundary exactly once and composes the shell', () => {
  assert.match(layout, /resolveMidaoPageSession/u);
  assert.equal((layout.match(/resolveMidaoPageSession\(/gu) || []).length, 1);
  assert.match(layout, /await headers\(\)/u);
  assert.match(layout, /redirect\(result\.location\)/u);
  assert.match(layout, /notFound\(\)/u);
  assert.match(layout, /<MidaoShell/u);
  assert.match(layout, /tokens\.css/u);
  assert.match(layout, /shell\.css/u);
  assert.match(layout, /isMidaoE2ELocal\(\)[\s\S]{0,200}MIDAO_E2E_PAGE_SESSION=\$\{result\.reason\}/u);
  assert.doesNotMatch(layout, /process\.env/u);
  assert.doesNotMatch(layout, /MIDAO_E2E_PAGE_SESSION=\$\{(?:request|incoming|session|cookie)/u);
  assert.doesNotMatch(layout, /getSupabase|guide_profiles/u);
});

test('five route skeletons stay presentation-only and use the canonical labels', () => {
  const routes = new Map([
    ['page.tsx', '首頁'],
    ['requests/page.tsx', '需求'],
    ['calendar/page.tsx', '行事曆'],
    ['services/page.tsx', '服務'],
    ['me/page.tsx', '我的頁面'],
  ]);
  for (const [path, label] of routes) {
    const source = read(path);
    assert.ok(source.includes(label), `${path} missing ${label}`);
    assert.doesNotMatch(source, /supabase|getGuideRuntimeAccessDb|fetch\(/iu);
  }
});

test('loading, error and not-found routes use the basic states', () => {
  assert.match(read('loading.tsx'), /LoadingSkeleton/u);
  assert.match(read('error.tsx'), /'use client'/u);
  assert.match(read('error.tsx'), /InlineError/u);
  assert.match(read('error.tsx'), /reset/u);
  assert.match(read('not-found.tsx'), /找不到這個頁面/u);
  assert.match(read('not-found.tsx'), /href="\/midao"/u);
});
