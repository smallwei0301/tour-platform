/**
 * Issue #1345 — universal CLS > 0.25 on /activities (round-4 Lighthouse:
 * 0.76–1.43 across all 5 runs).
 *
 * Root cause: `ActivitiesContent.tsx` was hydrated with `initialActivities`
 * via #1249's SSR data path, but the existing `useEffect(..., [query])`
 * fetch effect still ran at mount time, re-fetching `/api/activities` and
 * calling `setActivities` with a potentially-differently-ordered result.
 * Every card re-rendered, every position shifted → catastrophic CLS.
 *
 * Fix: a `useRef` flag (`skipInitialFetch`) initialised true when SSR data
 * is present, consumed on the first effect run, so user-driven filter /
 * search changes after mount still fall through normally.
 *
 * This test pins:
 *   1. The ref + initial value tying to `initialActivities`.
 *   2. The early-return guard inside the fetch effect.
 *   3. The CSS aspect-ratio + width:100% on `.tp-card-img` (independent
 *      CLS guard — if a future refactor strips them, the per-image slot
 *      collapse path comes back).
 *
 * Behavioural verification (CLS ≤ 0.1) requires a Lighthouse re-run after
 * deploy; tracked in the issue's acceptance criteria.
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

test('ActivitiesContent imports useRef and tracks `skipInitialFetch` keyed off initialActivities', async () => {
  const src = await readSrc('app/[locale]/activities/ActivitiesContent.tsx');
  // useRef must be imported alongside the other React hooks.
  assert.match(
    src,
    /import\s*\{[^}]*\buseRef\b[^}]*\}\s*from\s*['"]react['"]/,
    'useRef must be imported from react so the skip-initial-fetch flag exists',
  );
  // The ref must be initialised true exactly when SSR shipped cards.
  // #1380: SSR initialActivities 不含 date/price 過濾，URL 帶這些參數時
  // 不可 skip 首次 fetch — 條件擴充為 initialActivities 存在「且」無 server-side 過濾參數。
  assert.match(
    src,
    /const\s+skipInitialFetch\s*=\s*useRef\(\s*\n?\s*initialActivities\s*!==\s*undefined[\s\S]*?searchParams\.get\('date'\)[\s\S]*?searchParams\.get\('priceMin'\)[\s\S]*?searchParams\.get\('priceMax'\)[\s\S]*?\)/,
    'skipInitialFetch must be keyed off initialActivities AND absence of date/price URL filters (#1380)',
  );
});

test('fetch effect short-circuits on the first run when SSR data is fresh', async () => {
  const src = await readSrc('app/[locale]/activities/ActivitiesContent.tsx');
  // The guard pattern: consume the ref and return early.
  assert.match(
    src,
    /if\s*\(\s*skipInitialFetch\.current\s*\)\s*\{[\s\S]*?skipInitialFetch\.current\s*=\s*false[\s\S]*?return;?[\s\S]*?\}/,
    'fetch effect must short-circuit when skipInitialFetch.current is true, then flip the flag so user-driven query changes still fetch',
  );
});

test('subsequent query changes still trigger /api/activities — guard is one-shot', async () => {
  const src = await readSrc('app/[locale]/activities/ActivitiesContent.tsx');
  // The fetch call must still exist (the guard short-circuits only once).
  assert.match(
    src,
    /fetch\(\s*[`'"]\/api\/activities/,
    'the fetch on /api/activities must remain so post-mount filter/search interactions still refresh the list',
  );
  // And the effect must still depend on query (a refactor that drops it would
  // freeze the list at SSR data — wrong direction). #1380 extends the deps to
  // [query, dateFilter, priceMin, priceMax] — query must remain the first dep.
  assert.match(
    src,
    /\}, \[query, dateFilter, priceMin, priceMax\]\);/,
    'fetch effect must depend on query + #1380 filters so all server-side filters re-run the fetch',
  );
});

test('.tp-card-img keeps width:100% + aspect-ratio so per-card image slot does not collapse', async () => {
  const css = await readSrc('app/globals.css');
  // Match an aspect-ratio that contains 16/9 in either spaced form;
  // multiple rules exist (line 55 + 266) and either is acceptable.
  assert.match(
    css,
    /\.tp-card-img\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9[^}]*\}/,
    '.tp-card-img must keep aspect-ratio: 16 / 9 so the image slot has reserved space before the bytes arrive',
  );
  assert.match(
    css,
    /\.tp-card-img\s*\{[^}]*width:\s*100%/,
    '.tp-card-img must keep width: 100% so the image slot expands to fill its column at every breakpoint',
  );
});
