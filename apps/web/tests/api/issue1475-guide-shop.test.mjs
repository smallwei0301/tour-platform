// #1475 — 導遊商店頁聚合：buildGuideShopView 純函式行為 + getGuideShopDb 委派 + 路由契約
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, '..', '..');

const { buildGuideShopView, mapShopPlans } = await import('../../src/lib/guide-shop.mjs');

const GUIDE = {
  id: 'g1', slug: 'wu-luo-qing', displayName: '吳洛晴', region: '高雄',
  bio: '安安', profilePhotoUrl: 'p.jpg', heroImageUrl: 'h.jpg', ratingAvg: 5, reviewCount: 3,
  // 故意混入不公開欄位，驗證不會被投影出去
  bank_name: '某銀行', account_number: '0000',
};

test('mapShopPlans 僅保留 active 方案並正規化欄位', () => {
  const plans = mapShopPlans([
    { id: 'p1', label: '漂漂', basePrice: 610, priceType: 'per_person', duration: '1小時10分鐘', minParticipants: 1, maxParticipants: 4, status: 'active' },
    { id: 'p2', label: '停用', basePrice: 500, status: 'inactive' },
    { id: '', label: '無 id' },
  ]);
  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0], {
    id: 'p1', name: '漂漂', basePrice: 610, priceType: 'per_person',
    duration: '1小時10分鐘', minParticipants: 1, maxParticipants: 4,
  });
});

test('buildGuideShopView 依地區分組、略過無 active 方案的行程', () => {
  const view = buildGuideShopView(GUIDE, [
    { summary: { id: 'a1', slug: 'power', title: '力量', region: '高雄', regionSlug: 'kaohsiung', status: 'published' },
      plans: [{ id: 'p1', label: '漂漂', basePrice: 610, priceType: 'per_person', status: 'active' }] },
    { summary: { id: 'a2', slug: 'no-plan', title: '無方案', region: '高雄', status: 'published' }, plans: [] },
    { summary: { id: 'a3', slug: 'archived', title: '已下架', region: '台北', status: 'archived' },
      plans: [{ id: 'p9', label: 'x', status: 'active' }] },
    { summary: { id: 'a4', slug: 'taipei', title: '台北遊', region: '台北', status: 'published' },
      plans: [{ id: 'p4', label: '方案', basePrice: 300, status: 'active' }] },
  ]);
  assert.equal(view.guide.displayName, '吳洛晴');
  const regions = view.activitiesByRegion.map((r) => r.region);
  assert.deepEqual(regions, ['高雄', '台北']);
  const kh = view.activitiesByRegion.find((r) => r.region === '高雄');
  assert.deepEqual(kh.activities.map((a) => a.slug), ['power']); // no-plan 被略過
  const tp = view.activitiesByRegion.find((r) => r.region === '台北');
  assert.deepEqual(tp.activities.map((a) => a.slug), ['taipei']); // archived 被略過
});

test('buildGuideShopView 不外洩任何不公開匯款欄位', () => {
  const view = buildGuideShopView(GUIDE, []);
  const json = JSON.stringify(view);
  for (const leak of ['bank_name', 'account_name', 'account_number', 'transfer_note', '某銀行']) {
    assert.equal(json.includes(leak), false, `不得包含 ${leak}`);
  }
});

test('buildGuideShopView(null) → null', () => {
  assert.equal(buildGuideShopView(null, []), null);
});

test('getGuideShopDb 委派 buildGuideShopView，找不到導遊回 null', async () => {
  const { getGuideShopDb } = await import('../../src/lib/db.mjs');
  // node --test 下 fixtures(.ts) 走 db 內部 extensionless import 不解析 → null（runtime 由 Next bundler 解析）。
  const data = await getGuideShopDb('no-such-guide-xyz');
  assert.equal(data, null);
  const src = readFileSync(join(webRoot, 'src/lib/db.mjs'), 'utf8');
  assert.match(src, /return buildGuideShopView\(guide, details\)/);
});

test('shop 路由：flag off → 404；flag on → 委派 getGuideShopDb', () => {
  const src = readFileSync(join(webRoot, 'app/api/guides/[slug]/shop/route.ts'), 'utf8');
  assert.match(src, /isGuideShopEnabled\(\)/);
  assert.match(src, /status:\s*404/);
  assert.match(src, /getGuideShopDb\(/);
});

test('book wizard 取可預約時段的視窗 ≤31 天（available-slots API 上限）', () => {
  const src = readFileSync(join(webRoot, 'app/guides/[slug]/shop/book/page.tsx'), 'utf8');
  // 不可再用 60 天（會被 available-slots 的 31 天上限擋下 →「無可預約日期」）
  assert.doesNotMatch(src, /60 \* 86400000/);
  assert.match(src, /30 \* 86400000/);
});

test('getGuideShopDb 不再對每個行程逐一呼叫 getActivityBySlugDb（避免 N+1）', () => {
  const src = readFileSync(join(webRoot, 'src/lib/db.mjs'), 'utf8');
  const fnStart = src.indexOf('export async function getGuideShopDb');
  const fnEnd = src.indexOf('export async function getGuideTransferInfoForBookingDb');
  const body = src.slice(fnStart, fnEnd);
  // Supabase 路徑用批次 activity_plans 查詢
  assert.match(body, /from\('activity_plans'\)[\s\S]*\.in\('activity_id'/);
  assert.match(body, /selectPublicActivityDetailPlans\(/);
});

test('shop 路由：成功回應加 s-maxage=60 邊緣快取', () => {
  const src = readFileSync(join(webRoot, 'app/api/guides/[slug]/shop/route.ts'), 'utf8');
  assert.match(src, /s-maxage=60/);
  assert.match(src, /stale-while-revalidate/);
  // 快取只掛在成功回應（ok(data)）上
  assert.match(src, /Response\.json\(ok\(data\),\s*\{\s*headers:\s*\{\s*'Cache-Control'/);
});

test('book wizard 取商店資料不帶 no-store（讓 CDN 邊緣快取生效）', () => {
  const src = readFileSync(join(webRoot, 'app/guides/[slug]/shop/book/page.tsx'), 'utf8');
  assert.doesNotMatch(src, /\/api\/guides\/\$\{slug\}\/shop`,\s*\{\s*cache:\s*'no-store'/);
});

test('db：getGuideBySlugDb 公開查詢不 select 匯款欄位', () => {
  const src = readFileSync(join(webRoot, 'src/lib/db.mjs'), 'utf8');
  const fnStart = src.indexOf('export async function getGuideBySlugDb');
  const fnEnd = src.indexOf('export async function getGuideShopDb');
  assert.ok(fnStart >= 0 && fnEnd > fnStart);
  const body = src.slice(fnStart, fnEnd);
  for (const col of ['bank_name', 'account_name', 'account_number', 'transfer_note']) {
    assert.equal(body.includes(col), false, `getGuideBySlugDb 不得讀取 ${col}`);
  }
});
