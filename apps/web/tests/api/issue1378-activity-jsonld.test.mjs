/**
 * Issue #1378 — 活動詳情頁 Product JSON-LD + OG image 用活動封面
 *
 * AC1: Product JSON-LD 含 name/description/image/offers（TWD）
 * AC2: reviewCount=0（或缺 rating）不輸出 aggregateRating
 * AC3: OG image 用活動封面，無封面 fallback 預設圖
 * AC4: 內容經 JSON.stringify（helper 回傳 plain object，由頁面 stringify）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  buildActivityProductJsonLd,
  resolveActivityOgImage,
  serialiseJsonLd,
  DEFAULT_ACTIVITY_OG_IMAGE,
} from '../../src/lib/activity-jsonld.mjs';

const BASE_ACTIVITY = {
  slug: 'kaohsiung-chaishan-cave-experience',
  region: '高雄',
  regionSlug: 'kaohsiung',
  title: '高雄柴山探洞體驗',
  shortDescription: '走進城市邊緣的地形秘境',
  coverImageUrl: 'https://images.unsplash.com/photo-test?w=800',
  priceTwd: 2000,
};

const APP_URL = 'https://midao.example';

test('AC1: Product JSON-LD 基本欄位 + Offer（TWD）', () => {
  const jsonLd = buildActivityProductJsonLd(BASE_ACTIVITY, APP_URL);
  assert.equal(jsonLd['@context'], 'https://schema.org');
  assert.equal(jsonLd['@type'], 'Product');
  assert.equal(jsonLd.name, BASE_ACTIVITY.title);
  assert.equal(jsonLd.description, BASE_ACTIVITY.shortDescription);
  assert.deepEqual(jsonLd.image, [BASE_ACTIVITY.coverImageUrl]);
  assert.equal(jsonLd.offers['@type'], 'Offer');
  assert.equal(jsonLd.offers.price, '2000');
  assert.equal(jsonLd.offers.priceCurrency, 'TWD');
  assert.equal(jsonLd.offers.availability, 'https://schema.org/InStock');
  assert.match(jsonLd.url, /\/activities\/kaohsiung\/kaohsiung-chaishan-cave-experience$/);
  assert.equal(jsonLd.offers.url, jsonLd.url);
});

test('AC1: 有評分時輸出 aggregateRating', () => {
  const jsonLd = buildActivityProductJsonLd(
    { ...BASE_ACTIVITY, ratingAvg: 4.8, reviewCount: 12 },
    APP_URL
  );
  assert.deepEqual(jsonLd.aggregateRating, {
    '@type': 'AggregateRating',
    ratingValue: 4.8,
    reviewCount: 12,
    bestRating: 5,
    worstRating: 1,
  });
});

test('AC2: reviewCount=0 不輸出 aggregateRating（Google 規範）', () => {
  const zero = buildActivityProductJsonLd(
    { ...BASE_ACTIVITY, ratingAvg: 5, reviewCount: 0 },
    APP_URL
  );
  assert.equal('aggregateRating' in zero, false);

  const missing = buildActivityProductJsonLd(BASE_ACTIVITY, APP_URL);
  assert.equal('aggregateRating' in missing, false);

  const nullRating = buildActivityProductJsonLd(
    { ...BASE_ACTIVITY, ratingAvg: null, reviewCount: 12 },
    APP_URL
  );
  assert.equal('aggregateRating' in nullRating, false);
});

test('AC1: 無封面時 image 欄位省略；region fallback 至 regionSlug 路徑', () => {
  const jsonLd = buildActivityProductJsonLd(
    { ...BASE_ACTIVITY, coverImageUrl: null, regionSlug: undefined, region: 'kaohsiung' },
    APP_URL
  );
  assert.equal('image' in jsonLd, false);
  assert.match(jsonLd.url, /\/activities\/kaohsiung\//);
});

test('AC3: resolveActivityOgImage 用封面、無封面 fallback 預設圖', () => {
  assert.equal(resolveActivityOgImage('https://cdn.example/cover.jpg'), 'https://cdn.example/cover.jpg');
  assert.equal(resolveActivityOgImage(null), DEFAULT_ACTIVITY_OG_IMAGE);
  assert.equal(resolveActivityOgImage(undefined), DEFAULT_ACTIVITY_OG_IMAGE);
  assert.equal(resolveActivityOgImage(''), DEFAULT_ACTIVITY_OG_IMAGE);
  assert.match(DEFAULT_ACTIVITY_OG_IMAGE, /^https:\/\//);
});

test('AC4: serialiseJsonLd 跳脫 </script>，注入點安全且 JSON 等價', () => {
  const jsonLd = buildActivityProductJsonLd(
    { ...BASE_ACTIVITY, title: '柴山 <script>alert(1)</script> "探洞"' },
    APP_URL
  );
  const serialised = serialiseJsonLd(jsonLd);
  assert.ok(!serialised.includes('</script>'), '序列化後不應出現原樣 </script>（頁面注入點安全）');
  assert.ok(serialised.includes('\\u003c'), '< 應轉為 \\u003c');
  assert.equal(JSON.parse(serialised).name, '柴山 <script>alert(1)</script> "探洞"');
});

// ── source-contract：頁面接線 ────────────────────────────────────────────────

const pageSrc = readFileSync(
  path.resolve('app/activities/[region]/[slug]/page.tsx'),
  'utf8'
);

test('接線: 詳情頁使用 buildActivityProductJsonLd 注入 Product schema', () => {
  assert.match(pageSrc, /buildActivityProductJsonLd/, '頁面應使用 helper');
  assert.match(pageSrc, /activity-jsonld\.mjs/, '應 import canonical .mjs helper');
});

test('接線: generateMetadata 透過 cache() 共用 lookup（GH-502：不得重複 DB 查詢）並有 fallback', () => {
  const metadataBlock = pageSrc
    .split('export async function generateMetadata')[1]
    ?.split('export default async function')[0] || '';
  assert.ok(!metadataBlock.includes('getActivityBySlugDb('), 'metadata 不得直接呼叫 getActivityBySlugDb（GH-502 契約）');
  assert.match(metadataBlock, /getActivityForMetadata|getActivityCached/, 'metadata 應走 cache() 共用 accessor');
  assert.match(metadataBlock, /catch/, 'lookup 失敗須 fallback，不得讓 metadata 擋下頁面');
  assert.match(metadataBlock, /resolveActivityOgImage/, 'og image 應走封面 fallback helper');
  assert.match(pageSrc, /\bcache\(/, '應使用 React cache() 去重');
});
