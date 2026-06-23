/**
 * Issue #1344 — mobile LCP regression on /activities cards (10–12 s
 * vs ~2 s desktop on the same pages; round-4 Lighthouse evidence in
 * docs/operations/qa-reports/issue1317-owner-smoke-round4-2026-06-10.md).
 *
 * Root cause: the cover image in `ActivitiesContent.tsx` only applied
 * `priority`/`eager` to `idx === 0`. On mobile (1-col grid) that *is*
 * the only above-the-fold card, but `next/image` had no `sizes` hint,
 * so the browser fetched the largest variant on every breakpoint —
 * making the only-card-that-matters arrive slowly. On desktop (3-col
 * grid) all three first-row cards are above-the-fold, so only the
 * first being `priority` left the other two competing for bandwidth
 * with the lazy queue.
 *
 * Fix:
 *   - `priority={idx < 2}` + `loading={idx < 2 ? 'eager' : 'lazy'}` so
 *     the visible-on-first-paint cards are prefetched regardless of
 *     form factor.
 *   - `sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"`
 *     matching `.tp-card-grid-activities` breakpoints in globals.css,
 *     so the browser picks a variant scaled to actual column width.
 *
 * Behavioural verification (mobile LCP < 4 s) requires a post-deploy
 * Lighthouse re-run — tracked in #1344 acceptance.
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

test('activity card cover image priorities the first 2 cards (above-the-fold for 2-col desktop AND 1-col mobile)', async () => {
  const src = await readSrc('app/[locale]/activities/ActivitiesContent.tsx');
  // `.tp-card-grid-activities` renders 2 cols by default; idx < 2
  // covers the above-the-fold row across breakpoints.
  assert.match(
    src,
    /priority=\{\s*idx\s*<\s*2\s*\}/,
    'cover image must set priority={idx < 2} so the first row on every breakpoint is prefetched',
  );
  // Loading must match the priority decision — eager on the same set,
  // lazy on the rest.
  assert.match(
    src,
    /loading=\{\s*idx\s*<\s*2\s*\?\s*['"]eager['"]\s*:\s*['"]lazy['"]\s*\}/,
    'cover image must set loading=eager on the same idx < 2 set so priority and loading agree',
  );
});

test('activity card cover image carries a responsive `sizes` hint matching the 768px breakpoint', async () => {
  // Round 2 — sizes / fallback 抽到 cover-image.ts 共用常數,跟 page 層
  // SSR preload 保證一致。鎖常數內容 + 卡片引用。
  const shared = await readSrc('app/[locale]/activities/cover-image.ts');
  assert.match(
    shared,
    /CARD_IMAGE_SIZES\s*=\s*['"]\(max-width:\s*768px\)\s*100vw,\s*50vw['"]/,
    'cover-image.ts 的 CARD_IMAGE_SIZES 必須對齊 .tp-card-grid-activities 的 768px 斷點',
  );
  const src = await readSrc('app/[locale]/activities/ActivitiesContent.tsx');
  assert.match(
    src,
    /sizes=\{\s*CARD_IMAGE_SIZES\s*\}/,
    '卡片 <Image> 必須引用共用 CARD_IMAGE_SIZES（不可 inline 字串,否則跟 SSR preload 漂移）',
  );
  assert.match(
    src,
    /src=\{\s*resolveCoverSrc\(\s*a\.coverImageUrl\s*\)\s*\}/,
    '卡片 <Image> src 必須走 resolveCoverSrc 共用 fallback',
  );
});

test('SSR preload：/activities 與 /activities/[region] 都 preload 第一張卡 cover（#1344 round 2）', async () => {
  // LCP element 是第一張卡 cover,但卡片由 client component render,
  // 圖片下載要等 JS bundle → hydrate。SSR head preload 讓 HTML parse
  // 階段就開抓。imagesrcset 必須由 buildCardImageSrcSet 產生,跟
  // next/image 的 srcset 一致才會 cache-hit。
  for (const rel of ['app/[locale]/activities/page.tsx', 'app/[locale]/activities/[region]/page.tsx']) {
    const src = await readSrc(rel);
    assert.match(
      src,
      /resolveCoverSrc\(\s*initialActivities\[0\]\.coverImageUrl\s*\)/,
      `${rel} 必須從 initialActivities[0] 解析第一張卡 cover`,
    );
    assert.match(
      src,
      /imageSrcSet=\{\s*buildCardImageSrcSet\(\s*firstCover\s*\)\s*\}/,
      `${rel} 的 preload 必須用 buildCardImageSrcSet 產生 imagesrcset`,
    );
    assert.match(
      src,
      /imageSizes=\{\s*CARD_IMAGE_SIZES\s*\}/,
      `${rel} 的 preload imagesizes 必須用共用 CARD_IMAGE_SIZES`,
    );
    assert.match(
      src,
      /fetchPriority=["']high["']/,
      `${rel} 的 preload 必須 fetchPriority=high`,
    );
  }
});

test('buildCardImageSrcSet 產生跟 next/image 一致的 /_next/image 變體序列', async () => {
  const shared = await readSrc('app/[locale]/activities/cover-image.ts');
  // 實測 production srcset 的 w 序列；q 固定 60（next.config images.quality）。
  assert.match(
    shared,
    /CARD_IMAGE_WIDTHS\s*=\s*\[384,\s*640,\s*750,\s*828,\s*1080,\s*1200,\s*1920,\s*2048,\s*3840\]/,
    'CARD_IMAGE_WIDTHS 必須鏡射 next/image 實際 srcset（384–3840）',
  );
  assert.match(
    shared,
    /\/_next\/image\?url=\$\{encodeURIComponent\(src\)\}&w=\$\{w\}&q=60/,
    'srcset 項目格式必須是 /_next/image?url=<enc>&w=<w>&q=60（對應 next.config images.quality:60，跟 next/image 一致才 cache-hit）',
  );
});

test('responsive grid CSS still has the breakpoints the sizes hint targets (regression anchor)', async () => {
  const css = await readSrc('app/globals.css');
  assert.match(
    css,
    /\.tp-card-grid-activities[^{}]*\{[^{}]*grid-template-columns:\s*repeat\(\s*2,/,
    '.tp-card-grid-activities must keep the 2-col base so sizes 50vw stays accurate',
  );
  assert.match(
    css,
    /@media\s*\(\s*max-width:\s*768px\s*\)[\s\S]{0,500}?\.tp-card-grid-activities[^{}]*\{[^{}]*grid-template-columns:\s*1fr/,
    '.tp-card-grid-activities must keep the 1-col mobile rule (≤768px) so sizes 100vw stays accurate',
  );
});

test('image keeps explicit width + height (CLS guard — does not regress #1345)', async () => {
  const src = await readSrc('app/[locale]/activities/ActivitiesContent.tsx');
  // The CLS guard from #1345 lives on the intrinsic dimensions; this
  // test ensures the #1344 perf change did not strip them.
  assert.match(
    src,
    /width=\{\s*1200\s*\}\s*height=\{\s*675\s*\}/,
    'cover image must keep width={1200} height={675} so next/image reserves the slot (CLS guard)',
  );
});
