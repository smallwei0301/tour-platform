/**
 * Issue #1344 — Mobile LCP regression fix: source-contract tests that lock
 * the image-quality and AVIF settings so a future refactor can't silently
 * revert to the heavyweight defaults.
 *
 * Round 3 (PRs #1347–#1358) reduced mobile LCP from 12s to 7–8s via
 * priority/sizes/preload fixes.  Round 4 (this PR) attacks the remaining
 * bytes:
 *   - quality 75 → 60: ~20-30% smaller WebP
 *   - AVIF format enabled: typically 40–50% smaller than WebP for photos
 *
 * The buildCardImageSrcSet preload URL must stay in sync with the quality
 * that the <Image> component actually requests, otherwise the preloaded
 * asset cache-misses and downloads twice.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

// ── next.config.mjs ──────────────────────────────────────────────────────────

test('#1344 next.config includes AVIF in image formats', () => {
  const src = read('apps/web/next.config.mjs');
  assert.match(
    src,
    /formats\s*:\s*\[.*image\/avif.*\]/s,
    'next.config must list image/avif in images.formats to enable AVIF optimization'
  );
});

test('#1344 next.config image quality is 60 (not the 75 default)', () => {
  const src = read('apps/web/next.config.mjs');
  assert.match(
    src,
    /quality\s*:\s*60\b/,
    'next.config must set images.quality to 60 to reduce cover-image byte size'
  );
});

// ── cover-image.ts ────────────────────────────────────────────────────────────

test('#1344 buildCardImageSrcSet uses q=60 to match config quality', () => {
  const src = read('apps/web/app/activities/cover-image.ts');
  assert.match(
    src,
    /q=60\b/,
    'buildCardImageSrcSet must embed q=60 so the preload URL matches the <Image> srcset'
  );
  assert.doesNotMatch(
    src,
    /q=75\b/,
    'buildCardImageSrcSet must not use the old q=75; it would cache-miss against the new q=60 requests'
  );
});

// ── ActivitiesContent.tsx ─────────────────────────────────────────────────────

test('#1344 cover Image has priority={idx < 2} for above-the-fold preload', () => {
  const src = read('apps/web/app/activities/ActivitiesContent.tsx');
  assert.match(src, /priority=\{idx\s*<\s*2\}/, 'first 2 cover images must be priority-loaded');
});

test('#1344 cover Image uses CARD_IMAGE_SIZES constant (not a hardcoded string)', () => {
  const src = read('apps/web/app/activities/ActivitiesContent.tsx');
  assert.match(
    src,
    /sizes=\{CARD_IMAGE_SIZES\}/,
    'sizes must reference the shared CARD_IMAGE_SIZES constant so preload URL and srcset stay in sync'
  );
});
