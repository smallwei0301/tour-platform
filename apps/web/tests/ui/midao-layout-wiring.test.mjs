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

test('four route skeletons stay presentation-only and use the canonical labels', () => {
  const routes = new Map([
    ['page.tsx', '首頁'],
    ['requests/page.tsx', '需求'],
    ['calendar/page.tsx', '行事曆'],
  ]);
  for (const [path, label] of routes) {
    const source = read(path);
    assert.ok(source.includes(label), `${path} missing ${label}`);
    assert.doesNotMatch(source, /supabase|getGuideRuntimeAccessDb|fetch\(/iu);
  }
});

test('me route composes the real capability centre with only the approved read boundaries', () => {
  const page = read('me/page.tsx');
  const shell = readFileSync(resolve(root, 'src/features/midao/me/MidaoMeShell.tsx'), 'utf8');
  const centre = readFileSync(resolve(root, 'src/features/midao/me/MidaoMeCapabilityCenter.tsx'), 'utf8');

  assert.ok(page.includes("import { MidaoMeShell } from '../../../../src/features/midao/me/MidaoMeShell';"));
  assert.match(page, /return <MidaoMeShell \/>;/u);
  assert.equal((page.match(/MidaoMeShell/g) || []).length, 3);
  assert.match(shell, /<section className="midao-me-screen" aria-labelledby="midao-me-title">/u);
  assert.match(shell, />我的祕島</u);
  assert.match(shell, /<h2 id="midao-me-title" className="midao-heading">我的頁面<\/h2>/u);
  assert.match(shell, /MidaoMeCapabilityCenter/u);
  assert.doesNotMatch(shell, /即將推出/u);

  assert.match(centre, /'use client'/u);
  assert.match(centre, /LoadingSkeleton/u);
  assert.match(centre, /InlineError/u);
  assert.match(centre, /服務管理/u);
  assert.match(centre, /預約與需求/u);
  assert.match(centre, /公開頁面與通知/u);
  assert.match(centre, /href="\/midao\/services"/u);
  assert.match(centre, /href="\/midao\/requests"/u);
  assert.match(centre, /href="\/midao\/legacy\/public-profile\?returnTo=%2Fmidao%2Fme"/u);
  assert.match(centre, /fetch\('\/api\/v2\/guide\/home'/u);
  assert.match(centre, /fetch\('\/api\/v2\/guide\/services\?page=1&pageSize=1&status=all'/u);
  assert.equal((centre.match(/fetch\(/g) || []).length, 2, 'only the two approved GET reads are allowed');
  assert.doesNotMatch(centre, /midao2|supabase|\/api\/guide\/profile|method:\s*['"](?:POST|PATCH|PUT|DELETE)/iu);
});

test('services route stays a thin composition boundary for ServiceListScreen', () => {
  const source = read('services/page.tsx');
  assert.match(
    source,
    /import \{ ServiceListScreen \} from '\.\.\/\.\.\/\.\.\/\.\.\/src\/features\/midao\/services\/ServiceListScreen';/u,
  );
  assert.match(source, /return <ServiceListScreen \/>;/u);
  assert.doesNotMatch(source, /supabase|getGuideRuntimeAccessDb|fetch\(/iu);
});

test('loading, error and not-found routes use the basic states', () => {
  assert.match(read('loading.tsx'), /LoadingSkeleton/u);
  assert.match(read('error.tsx'), /'use client'/u);
  assert.match(read('error.tsx'), /InlineError/u);
  assert.match(read('error.tsx'), /reset/u);
  assert.match(read('not-found.tsx'), /找不到這個頁面/u);
  assert.match(read('not-found.tsx'), /href="\/midao"/u);
});
