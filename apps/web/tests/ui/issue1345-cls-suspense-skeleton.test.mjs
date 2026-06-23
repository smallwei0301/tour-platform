/**
 * Issue #1345 part 3 — Suspense fallback streaming shift.
 *
 * Parts 1 + 2 (PR #1347 / #1349) closed the SSR-then-client setActivities
 * re-render and the CJK font swap. Lighthouse against the deployed
 * `258f964` still showed CLS 0.43–0.94. Playwright PerformanceObserver
 * (sources field) pinned the remaining shift on `<div id="main-content">`
 * + `<footer>`: the Suspense fallback was a single-line "載入中⋯" string
 * (or `null` on /activities/[region]), and when the real
 * `<ActivitiesContent>` streamed in, main-content grew from ~60 px to
 * ~1500 px in a single chunk.
 *
 * Production HTML confirms — `data-testid="activity-card"` count is 0
 * in the initial SSR document; the cards arrive only on the streamed
 * RSC chunk, hence the height jump.
 *
 * Fix: a same-footprint skeleton (6 fake cards in the same grid) so
 * the stream-in replaces same-sized boxes — shift distance ≈ 0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');

async function readSrc(rel) {
  return readFile(path.join(WEB_ROOT, rel), 'utf8');
}

test('/activities Suspense 用 ActivitiesSkeleton 而不是 「載入中⋯」單行 fallback', async () => {
  const src = await readSrc('app/[locale]/activities/page.tsx');
  assert.match(
    src,
    /import\s+ActivitiesSkeleton\s+from\s+['"]\.\/ActivitiesSkeleton['"]/,
    '/activities 必須 import ActivitiesSkeleton',
  );
  assert.match(
    src,
    /<Suspense\s+fallback=\{<ActivitiesSkeleton\s*\/>\}>/,
    'Suspense fallback 必須是 <ActivitiesSkeleton />，不能再用「載入中⋯」字串',
  );
  // The string-based fallback must be gone.
  assert.doesNotMatch(
    src,
    /Suspense\s+fallback=\{\s*<div[^>]*>\s*載入中/,
    '舊的 "載入中⋯" 單行 fallback 不能再殘留',
  );
});

test('/activities/[region] Suspense 也用 ActivitiesSkeleton（不再是 null）', async () => {
  const src = await readSrc('app/[locale]/activities/[region]/page.tsx');
  assert.match(
    src,
    /import\s+ActivitiesSkeleton\s+from\s+['"]\.\.\/ActivitiesSkeleton['"]/,
    '/activities/[region] 必須 import ActivitiesSkeleton',
  );
  assert.match(
    src,
    /<Suspense\s+fallback=\{<ActivitiesSkeleton\s*\/>\}>/,
    'Suspense fallback 必須是 <ActivitiesSkeleton />',
  );
  assert.doesNotMatch(
    src,
    /Suspense\s+fallback=\{\s*null\s*\}/,
    '舊的 fallback={null} 不能再殘留',
  );
});

test('ActivitiesSkeleton 渲染 6 張 same-footprint 卡片在相同 grid', async () => {
  const src = await readSrc('app/[locale]/activities/ActivitiesSkeleton.tsx');
  // 同樣的 grid container class，這樣 streaming 替換時 grid 高度不變。
  assert.match(
    src,
    /className=["']tp-card-grid\s+tp-card-grid-activities["']/,
    'skeleton 必須用 tp-card-grid + tp-card-grid-activities 跟真實 listing 同 grid',
  );
  // Array.from length 至少 6，確保視覺上 above-the-fold 都填滿。
  assert.match(
    src,
    /Array\.from\(\{\s*length:\s*6\s*\}\)/,
    'skeleton 必須 render 6 張卡片佔位（above-the-fold 兩列 × 2-3 欄）',
  );
  // Skeleton 對 a11y / SEO 不可見。
  assert.match(
    src,
    /aria-hidden=["']true["']/,
    'skeleton 卡片必須 aria-hidden 讓 screen reader / SEO 略過',
  );
});

test('globals.css 有 .tp-card-skeleton 跟 .tp-card-img-skeleton 樣式（reserve 空間）', async () => {
  const css = await readSrc('app/globals.css');
  assert.match(
    css,
    /\.tp-card-skeleton\s*\{/,
    '.tp-card-skeleton 樣式必須存在',
  );
  assert.match(
    css,
    /\.tp-card-img-skeleton\s*\{/,
    '.tp-card-img-skeleton 樣式必須存在（佔住卡片圖片區的 aspect-ratio）',
  );
  // tp-card-img CSS 既有的 aspect-ratio + width:100% 由 #1345 part 1
  // 鎖過,這裡只追加 skeleton 樣式不重複鎖。
});

test('loading.tsx 存在於 /activities 與 /activities/[region]（page-level streaming fallback）', async () => {
  // Part 5 — async page 的 await 在 JSX return 之前,dynamic rendering
  // 時外層 boundary 的 fallback 是 loading.tsx 不是 page JSX 內的
  // <Suspense>。region 頁實測過缺 loading.tsx 時 fallback 全空 →
  // footer 從視窗頂端被推下 ~1300px → CLS 0.52。
  const regionLoading = await readSrc('app/[locale]/activities/[region]/loading.tsx');
  assert.match(
    regionLoading,
    /import\s+ActivitiesSkeleton\s+from\s+['"]\.\.\/ActivitiesSkeleton['"]/,
    '[region]/loading.tsx 必須 render ActivitiesSkeleton',
  );
  assert.match(regionLoading, /<ActivitiesSkeleton\s*\/>/);

  const rootLoading = await readSrc('app/[locale]/activities/loading.tsx');
  assert.match(
    rootLoading,
    /import\s+ActivitiesSkeleton\s+from\s+['"]\.\/ActivitiesSkeleton['"]/,
    '/activities/loading.tsx 必須 render ActivitiesSkeleton（防未來轉 dynamic rendering）',
  );
  assert.match(rootLoading, /<ActivitiesSkeleton\s*\/>/);
});

test('.tp-card-skeleton 設 min-height ≈ real card 高度（防 region page 等小集合的 CLS）', async () => {
  const css = await readSrc('app/globals.css');
  // Part 4 — Playwright getBoundingClientRect 量到 production real card
  // 高度 441–462px。skeleton 設 min-height >=420 即可把高度差距收進
  // CLS 0.1 budget。
  const m = css.match(/\.tp-card-skeleton\s*\{[^}]*min-height:\s*(\d+)px/);
  assert.ok(m, '.tp-card-skeleton 必須設 min-height 反映 real card 真實高度');
  const v = parseInt(m[1], 10);
  assert.ok(v >= 420 && v <= 500, `.tp-card-skeleton min-height 應在 420–500px 區間（real card ≈ 441-462px）；目前 ${v}px`);
});
