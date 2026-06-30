import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Source-contract：行程「全台縣市 + 複選」跨層接線（db.mjs 寫入路徑無 in-memory
// fallback，依 CLAUDE.md 用 source-contract 鎖定 wiring；純邏輯另有單元測試）。

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');

const db = read('src/lib/db.mjs');

test('db.mjs 匯入 activity-regions 純函式', () => {
  assert.match(db, /from '\.\/activity-regions\.mjs'/);
  assert.match(db, /normalizeAdditionalRegions/);
  assert.match(db, /activityMatchesRegion/);
});

test('createActivityDb 以 normalizeAdditionalRegions 寫入 regions', () => {
  assert.match(db, /regions:\s*normalizeAdditionalRegions\(input\.regions,\s*input\.region\)/);
});

test('updateActivityDb 在收到 regions 時正規化後寫入 patch.regions', () => {
  assert.match(db, /if \(input\.regions !== undefined\)/);
  assert.match(db, /patch\.regions = normalizeAdditionalRegions\(/);
});

test('getAdminActivityByIdDb select 與回傳包含 regions', () => {
  assert.match(db, /region, region_slug, regions, category/);
  assert.match(db, /regions: Array\.isArray\(data\.regions\)/);
});

test('listPublishedActivitiesDb：fixtures 用 activityMatchesRegion 篩選', () => {
  assert.match(db, /result\.filter\(a => activityMatchesRegion\(a, filters\.region\)\)/);
});

test('listPublishedActivitiesDb：Supabase 以 .or() 同時比對 region 與 regions 包含', () => {
  assert.match(db, /\.or\(`region\.eq\.\$\{regionFilter\},regions\.cs\.\["\$\{regionFilter\}"\]`\)/);
});

test('admin 編輯頁送出 regions 並渲染複選 checkbox', () => {
  const page = read('app/admin/activities/[id]/edit/page.tsx');
  // 全台縣市來自 REGION_REGISTRY（單一真實來源）
  assert.match(page, /import \{ REGION_REGISTRY \} from/);
  assert.match(page, /Object\.values\(REGION_REGISTRY\)\.map\(r => r\.dbValue\)/);
  // 附加地區 state、載入、送出
  assert.match(page, /additionalRegions/);
  assert.match(page, /regions: additionalRegions\.filter\(r => r !== region\)/);
  // 複選 UI
  assert.match(page, /type="checkbox"/);
});

test('guide 投稿頁地區清單擴充為全台 REGION_REGISTRY', () => {
  const page = read('app/guide/new-activity/page.tsx');
  assert.match(page, /import \{ REGION_REGISTRY \} from/);
  assert.match(page, /Object\.values\(REGION_REGISTRY\)\.map\(r => r\.dbValue\)/);
});

test('遷移檔存在（新增 activities.regions + GIN index + rollback）', () => {
  const mig = 'supabase/migrations/20260630120000_activity_additional_regions.sql';
  const rollback = 'supabase/migrations/20260630120000_activity_additional_regions.rollback.sql';
  assert.ok(existsSync(join(REPO_ROOT, '..', '..', mig)), `${mig} 應存在`);
  assert.ok(existsSync(join(REPO_ROOT, '..', '..', rollback)), `${rollback} 應存在`);
  const sql = read(join('..', '..', mig));
  assert.match(sql, /ADD COLUMN IF NOT EXISTS regions jsonb/);
  assert.match(sql, /USING gin/);
});
