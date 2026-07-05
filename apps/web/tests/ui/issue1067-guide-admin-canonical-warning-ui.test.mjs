import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

// #1615：兩頁已拆出 src/components/availability/** 子元件（純結構搬移、零行為
// 變更），canonical 警示文案分散在頁面與其子元件；來源契約改讀「頁面＋其
// 子元件」串接內容，斷言意圖不變（這些警示仍由該頁組裝渲染）。
const GUIDE_PAGE_SOURCES = [
  'app/guide/availability/page.tsx',
  'src/components/availability/guide-sections.tsx',
  'src/components/availability/rule-form-fields.tsx',
].map((rel) => path.resolve(ROOT, rel));
const ADMIN_PAGE_SOURCES = [
  'app/admin/guides/[guideId]/availability/page.tsx',
  'src/components/availability/admin-sections.tsx',
  'src/components/availability/rule-form-fields.tsx',
].map((rel) => path.resolve(ROOT, rel));
const UI_HELPER = path.resolve(ROOT, 'src/lib/availability-v2/canonical-availability-ui.ts');

function read(pathname) {
  return readFileSync(pathname, 'utf8');
}

function readAll(pathnames) {
  return pathnames.map(read).join('\n');
}

test('GH-1067 RED: canonical availability UI helper formats plan season status and preview labels', async () => {
  const mod = await import(`${pathToFileURL(UI_HELPER).href}?t=${Date.now()}`);

  const yearRound = mod.describePlanSeasonStatus({
    isYearRound: true,
    activeSeasonSummaries: [],
  });
  assert.equal(yearRound.badge, '全年開放');
  assert.match(yearRound.description, /已明確設定全年開放/);

  const seasonal = mod.describePlanSeasonStatus({
    isYearRound: false,
    activeSeasonSummaries: [
      { startMonth: 11, startDay: 1, endMonth: 4, endDay: 30, label: '每年 11/1 - 4/30' },
    ],
  });
  assert.equal(seasonal.badge, '指定季節');
  assert.match(seasonal.description, /每年 11\/1 - 4\/30/);

  const missingSeason = mod.describePlanSeasonStatus({
    isYearRound: false,
    activeSeasonSummaries: [],
  });
  assert.equal(missingSeason.badge, '尚未設定季節');
  assert.match(missingSeason.description, /此方案尚未設定開放季節/);

  const outsideSeason = mod.describePreviewReason({
    previewCanonicalState: 'outside_season',
    previewSeasonGate: 'outside_season',
  });
  assert.match(outsideSeason.label, /不在方案開放季節內/);

  const noActiveSeason = mod.describePreviewReason({
    previewCanonicalState: 'outside_season',
    previewSeasonGate: 'no_active_season',
  });
  assert.match(noActiveSeason.label, /尚未設定開放季節/);

  const explicitYearRound = mod.describePreviewReason({
    previewCanonicalState: 'available',
    previewSeasonGate: 'explicit_year_round',
  });
  assert.match(explicitYearRound.label, /全年開放/);

  const blockedByConflict = mod.describePreviewReason({
    previewCanonicalState: 'blocked_by_conflict',
    previewSeasonGate: null,
  });
  assert.match(blockedByConflict.label, /既有衝突/);

  const adminOverride = mod.describePreviewReason({
    previewCanonicalState: 'allowed_with_admin_override',
    previewSeasonGate: null,
  });
  assert.equal(adminOverride.tone, 'warning');
  assert.match(adminOverride.label, /管理員覆寫/);
});

test('GH-1067 RED: UI helper warns when weekly or single-day rules fall outside plan season', async () => {
  const mod = await import(`${pathToFileURL(UI_HELPER).href}?t=${Date.now()}`);
  const seasons = [{ startMonth: 11, startDay: 1, endMonth: 4, endDay: 30, label: '每年 11/1 - 4/30' }];

  const weekly = mod.describeRuleSeasonConflict({
    ruleMode: 'weekly',
    effectiveFrom: '2026-10-20',
    effectiveTo: '2026-11-10',
    singleDate: '',
    activeSeasonSummaries: seasons,
    isYearRound: false,
  });
  assert.match(weekly.message, /你設定的日期包含方案非開放季節/);

  const seasonStartBoundary = mod.describeRuleSeasonConflict({
    ruleMode: 'weekly',
    effectiveFrom: '2026-11-01',
    effectiveTo: '2026-11-01',
    singleDate: '',
    activeSeasonSummaries: seasons,
    isYearRound: false,
  });
  assert.equal(seasonStartBoundary, null);

  const seasonEndBoundaryOutside = mod.describeRuleSeasonConflict({
    ruleMode: 'weekly',
    effectiveFrom: '2026-05-01',
    effectiveTo: '2026-05-01',
    singleDate: '',
    activeSeasonSummaries: seasons,
    isYearRound: false,
  });
  assert.match(seasonEndBoundaryOutside?.message ?? '', /你設定的日期包含方案非開放季節/);

  const singleDay = mod.describeRuleSeasonConflict({
    ruleMode: 'single-day',
    effectiveFrom: '',
    effectiveTo: '',
    singleDate: '2026-07-10',
    activeSeasonSummaries: seasons,
    isYearRound: false,
  });
  assert.match(singleDay.message, /這一天不在方案開放季節內/);
});

test('GH-1067 RED: guide availability page surfaces canonical season warnings and preview reason labels', () => {
  const src = readAll(GUIDE_PAGE_SOURCES);

  for (const required of [
    'isYearRound',
    'activeSeasonSummaries',
    'previewCanonicalState',
    'previewSeasonGate',
    'describePlanSeasonStatus',
    'describePreviewReason',
    'describeRuleSeasonConflict',
    '方案開放季節',
    '此方案尚未設定開放季節',
    '你設定的日期包含方案非開放季節',
    '這一天不在方案開放季節內',
    '管理員覆寫',
    '已有衝突',
  ]) {
    assert.match(src, new RegExp(required), `guide page missing canonical warning surface: ${required}`);
  }
});

test('GH-1067 RED: admin availability page surfaces canonical season status and blocked preview copy', () => {
  const src = readAll(ADMIN_PAGE_SOURCES);

  for (const required of [
    'isYearRound',
    'activeSeasonSummaries',
    'previewCanonicalState',
    'previewSeasonGate',
    'describePlanSeasonStatus',
    'describePreviewReason',
    '方案開放季節',
    '此方案尚未設定開放季節',
    '管理員覆寫',
    '已有衝突',
    '此期間無產生可預約時段',
  ]) {
    assert.match(src, new RegExp(required), `admin page missing canonical warning surface: ${required}`);
  }
});
