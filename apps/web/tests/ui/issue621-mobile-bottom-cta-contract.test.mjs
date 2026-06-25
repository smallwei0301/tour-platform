import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

test('issue621 mobile bottom CTA consumes plan/date-aware href from page contract', async () => {
  const pageSrc = await readSource('app/[locale]/activities/[region]/[slug]/page.tsx');
  const bottomBarSrc = await readSource('src/components/activity/ActivityBottomBar.tsx');

  assert.match(
    pageSrc,
    /<ActivityBottomBar[\s\S]*directBookingHref=\{directBookingHref\}/,
    'activity page should pass shared directBookingHref into mobile bottom bar'
  );

  assert.match(
    bottomBarSrc,
    /directBookingHref\?:\s*string/,
    'bottom bar props should accept optional directBookingHref for schedule-aware routing'
  );

  // Issue #919: the CTA contract evolved — the bottom bar now feeds
  // `directBookingHref` into a pure resolver (`resolveBottomBarCta`) that:
  //   - keeps direct routing when directBookingHref already carries `plan=`
  //     (single-plan activities — the original #621 behaviour),
  //   - prefers the traveler's in-page plan selection when present,
  //   - falls back to scrolling to the plan section (instead of navigating to a
  //     booking page that would error with "缺少或無法判定方案參數").
  // The resolver itself owns the single-plan auto-route path that #621
  // originally encoded as a direct href, so we assert the wiring rather than the
  // old inline `??` pattern.
  assert.match(
    bottomBarSrc,
    /resolveBottomBarCta\(\s*\{[\s\S]*?directBookingHref,/,
    'bottom bar CTA must thread directBookingHref into the resolveBottomBarCta resolver'
  );
  assert.match(
    bottomBarSrc,
    /cta\.mode\s*===\s*'book'\s*\?[\s\S]*?<Link\s+href=\{cta\.href!\}/,
    'when the resolver returns book mode, the bar must render a Link with the resolved href'
  );
});
