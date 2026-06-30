import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Source-contract：附加地區顯示到前台詳情頁，且詳情資料層帶出 regions。
// 篩選（旅客以附加地區搜尋也會看到）已由 activityMatchesRegion 單元測試 +
// listPublishedActivitiesDb wiring 覆蓋；本檔鎖定「詳情頁顯示」這條鏈。

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');

test('getActivityBySlugDb：select 與 mapper 都帶出 regions', () => {
  const db = read('src/lib/db.mjs');
  // minimalSelect 取出 regions 欄位
  assert.match(db, /region, region_slug, regions, category/);
  // 中央 mapper 回傳 regions
  assert.match(db, /regions: Array\.isArray\(act\.regions\) \? act\.regions : \[\]/);
  // 兩個 fixtures fallback 也帶出 regions
  assert.match(db, /regions: Array\.isArray\(a\.regions\) \? a\.regions : \[\]/);
  assert.match(db, /regions: Array\.isArray\(fixture\.regions\) \? fixture\.regions : \[\]/);
});

test('詳情頁：正規化附加地區並渲染（含連結到地區頁）與 areaServed JSON-LD', () => {
  const page = read('app/[locale]/activities/[region]/[slug]/page.tsx');
  assert.match(page, /import \{ normalizeAdditionalRegions \} from/);
  assert.match(page, /const additionalRegions = normalizeAdditionalRegions\(activityData\.regions, activityData\.region\)/);
  // 渲染區塊（含 testid 與地區頁連結）
  assert.match(page, /data-testid="activity-additional-regions"/);
  assert.match(page, /\/activities\/\$\{normalizeRegionForActivityPath\(r\)\}/);
  // JSON-LD areaServed 帶上主要 + 附加地區
  assert.match(page, /"areaServed"/);
  assert.match(page, /\[activity\.region, \.\.\.additionalRegions\]/);
});
