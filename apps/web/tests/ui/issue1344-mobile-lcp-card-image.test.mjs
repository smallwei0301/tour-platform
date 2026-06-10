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
  const src = await readSrc('app/activities/ActivitiesContent.tsx');
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
  const src = await readSrc('app/activities/ActivitiesContent.tsx');
  // `.tp-card-grid-activities` is 2-col default, 1-col under 768px.
  assert.match(
    src,
    /sizes=["']\(max-width:\s*768px\)\s*100vw,\s*50vw["']/,
    'cover image must declare sizes matching .tp-card-grid-activities (768px split)',
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
  const src = await readSrc('app/activities/ActivitiesContent.tsx');
  // The CLS guard from #1345 lives on the intrinsic dimensions; this
  // test ensures the #1344 perf change did not strip them.
  assert.match(
    src,
    /width=\{\s*1200\s*\}\s*height=\{\s*675\s*\}/,
    'cover image must keep width={1200} height={675} so next/image reserves the slot (CLS guard)',
  );
});
