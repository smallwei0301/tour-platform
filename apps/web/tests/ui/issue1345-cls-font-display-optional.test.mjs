/**
 * Issue #1345 part 2 — Noto Sans TC font swap shift.
 *
 * Round-4 Lighthouse (#1317 / PR #1342) measured CLS 0.76–1.43.
 * Part 1 (#1347) removed the SSR→client setActivities re-render and
 * brought desktop down to ~0.4–0.9, but mobile barely moved.
 *
 * Remaining root cause: `Noto_Sans_TC` is loaded with
 * `display: 'swap'`. CJK fonts are large (multi-MB) and next/font
 * only metric-matches the fallback for Latin families; for CJK the
 * fallback (sans-serif) has very different line metrics, so the swap
 * jumps every text line on every card.
 *
 * Fix: switch the CJK font to `display: 'optional'` so the browser
 * skips the swap if the font isn't cached within ~100ms. Inter (Latin)
 * keeps `display: 'swap'` because next/font's metric-matched fallback
 * already prevents shift on Latin swaps.
 *
 * Behavioural verification (CLS ≤ 0.1) requires a post-deploy
 * Lighthouse re-run — tracked in #1345 acceptance.
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

test('Noto_Sans_TC (中文字體) 用 display: optional 避免 swap-shift CLS', async () => {
  const src = await readSrc('src/components/layout/RootDocument.tsx');
  // Find the Noto_Sans_TC config block and check the display value.
  const match = src.match(/Noto_Sans_TC\(\s*\{([\s\S]*?)\}\)/);
  assert.ok(match, 'expected a Noto_Sans_TC({...}) configuration block in src/components/layout/RootDocument.tsx');
  const body = match[1];
  assert.match(
    body,
    /display:\s*['"]optional['"]/,
    'Noto_Sans_TC must use display: "optional" so CJK font swap does not jump line-heights — see #1345',
  );
});

test('Inter (Latin font) 保留 display: swap (next/font 對拉丁字體已 metric-match fallback)', async () => {
  const src = await readSrc('src/components/layout/RootDocument.tsx');
  const match = src.match(/Inter\(\s*\{([\s\S]*?)\}\)/);
  assert.ok(match, 'expected an Inter({...}) configuration block');
  const body = match[1];
  assert.match(
    body,
    /display:\s*['"]swap['"]/,
    'Inter keeps display: "swap" — next/font auto metric-matches Latin fallbacks so swap does not shift layout',
  );
});

test('--font-noto-sans-tc variable 保留以便 globals.css font-family 仍 work', async () => {
  const src = await readSrc('src/components/layout/RootDocument.tsx');
  assert.match(
    src,
    /variable:\s*['"]--font-noto-sans-tc['"]/,
    'CSS variable must stay so globals.css `font-family: Noto Sans TC, ...` keeps resolving',
  );
});
