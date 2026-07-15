// #1440 回歸：後台改輪播照片／暖場評論照片後，前台不更新。
//
// 根因：詳情頁 `/activities/[region]/[slug]` 被快取的路徑用「正規化英文 region slug」
// （由 buildActivityHref 建連結），但 admin 存檔後 revalidateActivityPaths 用「raw
// 中文地區」拼路徑（且未帶 regionSlug），兩者對不上 → ISR 永遠失效不到那一頁、
// 加上詳情頁 fetchCache='force-cache'，stale 資料不被清掉，照片變更看不到。
//
// 鎖定：revalidate 算出的詳情頁路徑，必須與 buildActivityHref 建出的連結「逐字相同」。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activityRevalidationPaths,
  normalizeRegionForActivityPath,
  resolveActivityRegionSegment,
} from '../../src/lib/region-slug.mjs';
import { buildActivityHref } from '../../src/lib/activity-url.ts';
import { buildCanonicalActivityDetailPath } from '../../src/lib/db.mjs';

test('中文地區正規化成英文 slug', () => {
  assert.equal(normalizeRegionForActivityPath('高雄市'), 'kaohsiung');
  assert.equal(normalizeRegionForActivityPath('台北市'), 'taipei');
  assert.equal(normalizeRegionForActivityPath('花蓮'), 'hualien');
  // 對照表外 → ASCII 化；全空 → taiwan
  assert.equal(normalizeRegionForActivityPath('Penghu County'), 'penghu-county');
  assert.equal(normalizeRegionForActivityPath('   '), 'taiwan');
  assert.equal(normalizeRegionForActivityPath(null), 'taiwan');
});

test('resolveActivityRegionSegment：已存 regionSlug 優先，否則正規化 raw region', () => {
  assert.equal(resolveActivityRegionSegment({ regionSlug: 'kaohsiung', region: '高雄市' }), 'kaohsiung');
  assert.equal(resolveActivityRegionSegment({ region: '高雄市' }), 'kaohsiung');
  assert.equal(resolveActivityRegionSegment({ regionSlug: '  ', region: '台南市' }), 'tainan');
});

test('revalidate 詳情頁路徑 == buildActivityHref 連結（raw 中文地區、無 regionSlug）', () => {
  const activity = { region: '高雄市', slug: 'test-2' };
  const paths = activityRevalidationPaths(activity);
  const href = buildActivityHref({ region: activity.region, slug: activity.slug });

  assert.equal(href, '/activities/kaohsiung/test-2');
  assert.ok(
    paths.includes(href),
    `revalidate 路徑 ${JSON.stringify(paths)} 必須包含實際被快取的連結 ${href}`,
  );
  // 基準路徑仍在；#1488 後另需各 locale 前綴版本（實際被快取的 [locale] 路由）。
  // #1713：經典首頁自 '/' 搬至 '/home'（新 '/'＝3D 世界頁純靜態，毋須失效）。
  for (const p of ['/home', '/activities', '/activities/kaohsiung', '/activities/kaohsiung/test-2']) {
    assert.ok(paths.includes(p), `缺基準路徑 ${p}`);
  }
  assert.ok(paths.includes('/zh-Hant/activities/kaohsiung/test-2'), '缺 zh-Hant 詳情頁失效路徑');
  assert.ok(paths.includes('/en/activities/kaohsiung/test-2'), '缺 en 詳情頁失效路徑');
});

test('revalidate 詳情頁路徑 == buildActivityHref（已存 regionSlug 欄位）', () => {
  const activity = { region: '高雄市', regionSlug: 'kaohsiung', slug: 'test-2' };
  const paths = activityRevalidationPaths(activity);
  const href = buildActivityHref({
    region: activity.region,
    regionSlug: activity.regionSlug,
    slug: activity.slug,
  });
  assert.ok(paths.includes(href));
});

test('revalidate 詳情頁路徑 == db buildCanonicalActivityDetailPath（sitemap 同源）', () => {
  const activity = { region: '台北市', slug: 'night-market' };
  const paths = activityRevalidationPaths(activity);
  assert.ok(paths.includes(buildCanonicalActivityDetailPath(activity)));
});

test('缺 slug 時只失效列表＋地區頁、不產出壞掉的詳情路徑', () => {
  const noSlug = activityRevalidationPaths({ region: '高雄市' });
  // 地區頁（含各 locale）有；不得產出帶 slug 的詳情路徑，也不得有 undefined 壞路徑。
  assert.ok(noSlug.includes('/activities/kaohsiung'));
  assert.ok(noSlug.includes('/zh-Hant/activities/kaohsiung'));
  assert.ok(!noSlug.some((p) => /\/activities\/kaohsiung\/.+/.test(p)), '不得產出帶 slug 的詳情路徑');
  assert.ok(!noSlug.some((p) => /undefined/.test(p)), '不得有 undefined 壞路徑');
  // 完全無 region → taiwan fallback 列表頁（含各 locale）。
  const noRegion = activityRevalidationPaths({});
  assert.ok(noRegion.includes('/activities/taiwan'));
  assert.ok(noRegion.includes('/en/activities/taiwan'));
});
