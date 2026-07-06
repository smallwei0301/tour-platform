/**
 * buildGuideShopView 信任欄位契約
 *
 * 商店首頁的信任列（審核徽章、語言、專長、證照、服務次數）需要 guide 投影
 * 帶出這些欄位；getGuideBySlugDb 的 Supabase 與 in-memory 兩分支都已回傳
 * 同名欄位，此測試鎖 buildGuideShopView 不把它們投影丟掉。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGuideShopView } from '../../src/lib/guide-shop.mjs';

const guideFixture = {
  id: 'g-1',
  slug: 'andy-lee',
  displayName: 'Andy Lee',
  region: '高雄',
  bio: '柴山二十三年。',
  profilePhotoUrl: '/avatar.jpg',
  heroImageUrl: '/hero.jpg',
  ratingAvg: 4.9,
  reviewCount: 87,
  serviceCount: 312,
  languages: ['中文', 'English'],
  specialties: ['洞穴', '夜觀'],
  certifications: ['急救證照'],
  verificationStatus: 'approved',
};

const activityDetails = [
  {
    summary: { id: 'a-1', slug: 'cave', title: '柴山洞穴', region: '高雄', status: 'published' },
    plans: [{ id: 'p-1', name: '半日', basePrice: 1200, priceType: 'per_person', status: 'active' }],
  },
];

test('guide 投影帶出信任欄位', () => {
  const view = buildGuideShopView(guideFixture, activityDetails);
  assert.ok(view, 'view 不應為 null');
  const g = view.guide;
  assert.deepEqual(g.languages, ['中文', 'English']);
  assert.deepEqual(g.specialties, ['洞穴', '夜觀']);
  assert.deepEqual(g.certifications, ['急救證照']);
  assert.equal(g.verificationStatus, 'approved');
  assert.equal(g.serviceCount, 312);
});

test('信任欄位缺席時投影為安全預設（空陣列／null），不是 undefined 汙染', () => {
  const bare = { ...guideFixture };
  delete bare.languages;
  delete bare.specialties;
  delete bare.certifications;
  delete bare.verificationStatus;
  delete bare.serviceCount;
  const view = buildGuideShopView(bare, activityDetails);
  const g = view.guide;
  assert.deepEqual(g.languages, []);
  assert.deepEqual(g.specialties, []);
  assert.deepEqual(g.certifications, []);
  assert.equal(g.verificationStatus, null);
  assert.equal(g.serviceCount, null);
});

test('fixtures 方案能流進 in-memory 商店視圖（fallback plans 契約）', async () => {
  // 1) db.mjs in-memory getActivityBySlugDb 必須投影 plans（先前漏掉 → 商店永遠空）。
  //    db.mjs 的 fixtures 動態 import 是 bundler 解析（extensionless），plain Node 無法
  //    直接執行 fallback 分支，故此段用 source-contract 鎖投影行。
  const { readFileSync } = await import('node:fs');
  const dbSource = readFileSync(new URL('../../src/lib/db.mjs', import.meta.url), 'utf8');
  assert.match(
    dbSource,
    /plans:\s*a\.plans\s*\|\|\s*null/,
    'db.mjs in-memory getActivityBySlugDb 缺 plans 投影（fallback 與 Supabase mapActivityDetailRow 契約不同步）'
  );

  // 2) fixtures 至少一個活動帶 active 方案，且能被 buildGuideShopView 收進視圖。
  const { activities } = await import('../../src/fixtures/data.ts');
  const withPlans = activities.find((a) => Array.isArray(a.plans) && a.plans.length > 0);
  assert.ok(withPlans, 'fixtures 至少一個活動需帶 plans（否則本地 dev 商店方案卡永遠空）');
  const view = buildGuideShopView(guideFixture, [
    { summary: { id: withPlans.slug, slug: withPlans.slug, title: withPlans.title, region: withPlans.region, status: 'published' }, plans: withPlans.plans },
  ]);
  const plans = view.activitiesByRegion.flatMap((r) => r.activities).flatMap((a) => a.plans);
  assert.ok(plans.length > 0, 'fixture 方案應通過 mapShopPlans 過濾（需 status active 與有效 id）');
  for (const key of ['id', 'name', 'basePrice', 'priceType', 'duration', 'minParticipants', 'maxParticipants']) {
    assert.ok(key in plans[0], `商店方案缺欄位 ${key}`);
  }
});

test('既有公開欄位投影不回歸（#1475 契約）', () => {
  const view = buildGuideShopView(guideFixture, activityDetails);
  const g = view.guide;
  assert.equal(g.slug, 'andy-lee');
  assert.equal(g.displayName, 'Andy Lee');
  assert.equal(g.ratingAvg, 4.9);
  assert.equal(g.reviewCount, 87);
  // 匯款等不公開資訊永遠不得出現在商店視圖
  assert.ok(!('paymentMethods' in g), 'guide 投影不得帶 paymentMethods');
});
