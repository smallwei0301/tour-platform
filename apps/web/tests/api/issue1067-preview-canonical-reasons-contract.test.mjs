import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const GUIDE_PREVIEW_ROUTE = path.resolve(ROOT, 'app/api/guide/availability-preview/route.ts');
const ADMIN_PREVIEW_ROUTE = path.resolve(ROOT, 'app/api/v2/admin/guides/[guideId]/availability-preview/route.ts');
const GUIDE_ACTIVITY_PLANS_ROUTE = path.resolve(ROOT, 'app/api/guide/activities-with-plans/route.ts');
const ADMIN_ACTIVITY_PLANS_ROUTE = path.resolve(ROOT, 'app/api/v2/admin/guides/[guideId]/activity-plans/route.ts');
const PREVIEW_HELPER = path.resolve(ROOT, 'src/lib/availability-v2/preview-canonical-reasons.ts');

function read(pathname) {
  return readFileSync(pathname, 'utf8');
}

test('GH-1067 RED: preview canonical helper distinguishes year-round, no-active-season, and outside-season', async () => {
  const mod = await import(`${pathToFileURL(PREVIEW_HELPER).href}?t=${Date.now()}`);

  const yearRound = mod.resolvePreviewCanonicalReason({
    requestedDate: '2026-07-10',
    timezone: 'Asia/Taipei',
    isYearRound: true,
    seasons: [],
  });
  assert.equal(yearRound.canonicalState, 'available');
  assert.equal(yearRound.seasonGate, 'explicit_year_round');

  const noSeason = mod.resolvePreviewCanonicalReason({
    requestedDate: '2026-07-10',
    timezone: 'Asia/Taipei',
    isYearRound: false,
    seasons: [],
  });
  assert.equal(noSeason.canonicalState, 'outside_season');
  assert.equal(noSeason.seasonGate, 'no_active_season');

  const outsideSeason = mod.resolvePreviewCanonicalReason({
    requestedDate: '2026-07-10',
    timezone: 'Asia/Taipei',
    isYearRound: false,
    seasons: [
      {
        id: 'season-1',
        activity_plan_id: 'plan-1',
        start_month: 11,
        start_day: 1,
        end_month: 4,
        end_day: 30,
        timezone: 'Asia/Taipei',
        is_active: true,
      },
    ],
  });
  assert.equal(outsideSeason.canonicalState, 'outside_season');
  assert.equal(outsideSeason.seasonGate, 'outside_season');
});

test('GH-1067 RED: preview helper formats active season summaries for UI warnings', async () => {
  const mod = await import(`${pathToFileURL(PREVIEW_HELPER).href}?t=${Date.now()}`);
  const summaries = mod.summarizeActivePlanSeasons([
    {
      id: 'season-1',
      activity_plan_id: 'plan-1',
      start_month: 11,
      start_day: 1,
      end_month: 4,
      end_day: 30,
      timezone: 'Asia/Taipei',
      is_active: true,
    },
    {
      id: 'season-2',
      activity_plan_id: 'plan-1',
      start_month: 5,
      start_day: 1,
      end_month: 10,
      end_day: 31,
      timezone: 'Asia/Taipei',
      is_active: false,
    },
  ]);

  assert.deepEqual(summaries, [
    {
      startMonth: 11,
      startDay: 1,
      endMonth: 4,
      endDay: 30,
      label: '每年 11/1 - 4/30',
    },
  ]);
});

test('GH-1067 RED: guide/admin preview routes fetch plan season metadata and return canonical preview reason fields', () => {
  const guideSrc = read(GUIDE_PREVIEW_ROUTE);
  const adminSrc = read(ADMIN_PREVIEW_ROUTE);

  for (const src of [guideSrc, adminSrc]) {
    assert.match(src, /activity_plan_seasons/, 'preview route must load activity_plan_seasons');
    assert.match(src, /\bis_year_round\b/, 'preview route must load activity_plans.is_year_round');
    assert.match(src, /previewCanonicalState/, 'preview route response must expose previewCanonicalState');
    assert.match(src, /previewSeasonGate/, 'preview route response must expose previewSeasonGate');
    assert.match(src, /activeSeasonSummaries/, 'preview route response must expose activeSeasonSummaries');
  }
});

test('GH-1067 RED: guide/admin plan picker routes expose isYearRound and activeSeasonSummaries', () => {
  const guideSrc = read(GUIDE_ACTIVITY_PLANS_ROUTE);
  const adminSrc = read(ADMIN_ACTIVITY_PLANS_ROUTE);

  for (const src of [guideSrc, adminSrc]) {
    assert.match(src, /\bis_year_round\b/, 'plan picker route must select activity_plans.is_year_round');
    assert.match(src, /activity_plan_seasons/, 'plan picker route must load activity_plan_seasons');
    assert.match(src, /isYearRound/, 'plan picker route response must expose camelCase isYearRound');
    assert.match(src, /activeSeasonSummaries/, 'plan picker route response must expose activeSeasonSummaries');
  }
});
