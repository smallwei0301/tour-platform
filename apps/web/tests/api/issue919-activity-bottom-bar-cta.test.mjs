import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveBottomBarCta } from '../../src/lib/activity-bottom-bar-cta.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const bottomBarSrc = readFileSync(
  path.resolve(ROOT, 'src/components/activity/ActivityBottomBar.tsx'),
  'utf-8',
);
const datePlanSectionSrc = readFileSync(
  path.resolve(ROOT, 'src/components/activity/DatePlanSection.tsx'),
  'utf-8',
);
const detailPageSrc = readFileSync(
  path.resolve(ROOT, 'app/[locale]/activities/[region]/[slug]/page.tsx'),
  'utf-8',
);

describe('GH-919 resolveBottomBarCta', () => {
  const baseArgs = {
    activitySlug: 'activity-1780038051379',
    useBookingV2: true,
    planSectionId: 'section-plan',
  };

  it('selected plan -> book mode, href carries plan id, label is 立即預約', () => {
    const cta = resolveBottomBarCta({
      ...baseArgs,
      selected: { id: 'half-day-morning', label: 'A. 早鳥半日探秘', price: 1800, priceType: 'per_person' },
    });
    assert.equal(cta.mode, 'book');
    assert.equal(cta.label, '立即預約');
    assert.match(cta.href, /\/booking\/activity-1780038051379\?/);
    assert.match(cta.href, /plan=half-day-morning/);
  });

  it('selected plan with date + scheduleId -> href carries them too', () => {
    const cta = resolveBottomBarCta({
      ...baseArgs,
      selected: {
        id: 'full-day-complete',
        label: 'B. 全日深度探秘',
        price: 3000,
        priceType: 'per_person',
        date: '2026-06-01',
        scheduleId: 'sched-1',
      },
    });
    assert.equal(cta.mode, 'book');
    assert.match(cta.href, /plan=full-day-complete/);
    assert.match(cta.href, /date=2026-06-01/);
    assert.match(cta.href, /scheduleId=sched-1/);
  });

  it('no selection but directBookingHref has plan= -> book mode (single-plan activity, no regression)', () => {
    const cta = resolveBottomBarCta({
      ...baseArgs,
      selected: null,
      directBookingHref: '/booking/activity-1780038051379?plan=only-plan&date=2026-06-01',
    });
    assert.equal(cta.mode, 'book');
    assert.equal(cta.href, '/booking/activity-1780038051379?plan=only-plan&date=2026-06-01');
    assert.equal(cta.label, '選擇方案');
  });

  it('no selection and directBookingHref omits plan= -> scroll mode targets the plan section', () => {
    const cta = resolveBottomBarCta({
      ...baseArgs,
      selected: null,
      directBookingHref: '/booking/activity-1780038051379?date=2026-06-01',
    });
    assert.equal(cta.mode, 'scroll');
    assert.equal(cta.targetId, 'section-plan');
    assert.equal(cta.label, '選擇方案');
  });

  it('no selection and directBookingHref absent -> scroll mode', () => {
    const cta = resolveBottomBarCta({ ...baseArgs, selected: null });
    assert.equal(cta.mode, 'scroll');
    assert.equal(cta.targetId, 'section-plan');
  });

  it('selection with empty id falls back to scroll (defensive)', () => {
    const cta = resolveBottomBarCta({
      ...baseArgs,
      selected: { id: '   ', label: 'x', price: 0, priceType: 'per_person' },
    });
    assert.equal(cta.mode, 'scroll');
  });

  it('plan=<empty> in directBookingHref is treated as missing -> scroll', () => {
    const cta = resolveBottomBarCta({
      ...baseArgs,
      selected: null,
      directBookingHref: '/booking/activity-1780038051379?plan=&date=2026-06-01',
    });
    assert.equal(cta.mode, 'scroll');
  });
});

describe('GH-919 source contract — bottom bar / plan section / detail page wiring', () => {
  it('ActivityBottomBar imports and uses useSelectedPlan + resolveBottomBarCta', () => {
    assert.match(bottomBarSrc, /from '\.\/SelectedPlanContext'/);
    assert.match(bottomBarSrc, /useSelectedPlan\(\)/);
    assert.match(bottomBarSrc, /from '\.\.\/\.\.\/lib\/activity-bottom-bar-cta\.mjs'/);
    assert.match(bottomBarSrc, /resolveBottomBarCta\(/);
  });

  it('ActivityBottomBar shows selected plan label + price when selected', () => {
    assert.match(bottomBarSrc, /selected!\.label/);
    assert.match(bottomBarSrc, /selected!\.price\.toLocaleString\(\)/);
  });

  it('ActivityBottomBar renders a scroll button when cta.mode is scroll', () => {
    assert.match(bottomBarSrc, /cta\.mode\s*===\s*'book'/);
    assert.match(bottomBarSrc, /scrollTo\(\{\s*top:\s*y,\s*behavior:\s*'smooth'\s*\}\)/);
  });

  it('DatePlanSection imports useSelectedPlan and calls setSharedSelectedPlan in click handlers', () => {
    assert.match(datePlanSectionSrc, /from '\.\/SelectedPlanContext'/);
    assert.match(datePlanSectionSrc, /useSelectedPlan\(\)/);
    // Both write paths exist (card onClick + 立即預約 Link onClick).
    const writeMatches = datePlanSectionSrc.match(/setSharedSelectedPlan\(\{/g) || [];
    assert.ok(writeMatches.length >= 2, `expected setSharedSelectedPlan to be called from both handlers (got ${writeMatches.length})`);
    // Snapshot carries the price + priceType + date + scheduleId
    assert.match(datePlanSectionSrc, /price:\s*planPrice/);
    assert.match(datePlanSectionSrc, /priceType:\s*plan\.priceType === 'per_group' \? 'per_group' : 'per_person'/);
  });

  it('activity detail page wraps the tree in SelectedPlanProvider', () => {
    assert.match(detailPageSrc, /import\s*\{\s*SelectedPlanProvider\s*\}\s*from\s*'[^']*SelectedPlanContext'/);
    // Both DatePlanSection and ActivityBottomBar appear inside the provider:
    // the provider wraps the outer <main>...</main>.
    assert.match(detailPageSrc, /<SelectedPlanProvider>\s*\n\s*<main\b/);
    assert.match(detailPageSrc, /<\/main>\s*\n\s*<\/SelectedPlanProvider>/);
  });
});
