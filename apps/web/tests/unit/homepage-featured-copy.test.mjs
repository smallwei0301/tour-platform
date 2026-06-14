// 首頁精選文案覆寫純函式單測（derive / sanitize / merge）
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveEditorPickCopy,
  deriveMoreFeaturedCopy,
  sanitizeEditorPickCopy,
  sanitizeMoreFeaturedCopy,
  mergeEditorPickCopy,
  mergeMoreFeaturedCopy,
  resolveHomepageFeaturedView,
  resolveEditorPickPhotos,
  formatDurationDisplay,
} from '../../src/lib/homepage-featured-copy.mjs';

const ACTIVITY = {
  slug: 'activity-123',
  title: '高雄柴山探洞體驗｜跟著 Andy Lee 走進城市邊緣的地形秘境',
  tagline: '市區旁的秘境冒險，攀岩穿石、走懸崖古道',
  shortDescription: '高雄柴山是臺灣唯一的市區國家自然公園，珊瑚礁石灰岩地形造就絕景。',
  region: '高雄市',
  priceTwd: 1800,
  durationMinutes: 270,
  coverImageUrl: 'https://example.com/cover.jpg',
  ratingAvg: 4.6,
  reviewCount: 12,
};

test('deriveEditorPickCopy：標題取「｜」前段、自動帶入副標/簡介/地區/圖片/評分', () => {
  const c = deriveEditorPickCopy(ACTIVITY);
  assert.equal(c.title, '高雄柴山探洞體驗');
  assert.equal(c.subtitle, ACTIVITY.tagline);
  assert.equal(c.desc, ACTIVITY.shortDescription);
  assert.equal(c.tagLabel, '高雄市');
  assert.equal(c.difficulty, 2);
  assert.equal(c.imageUrl, 'https://example.com/cover.jpg');
  assert.equal(c.ratingScore, '4.6');
  assert.equal(c.ratingCount, 12);
});

test('resolveEditorPickPhotos：用行程相片集（image_urls）依序輪播並去重', () => {
  const photos = resolveEditorPickPhotos({
    imageUrls: ['https://e.com/a.jpg', 'https://e.com/a.jpg', 'https://e.com/b.jpg', '  ', null],
    coverImageUrl: 'https://e.com/cover.jpg',
  });
  assert.deepEqual(photos, ['https://e.com/a.jpg', 'https://e.com/b.jpg']);
});

test('resolveEditorPickPhotos：相片集為空時退回封面（coverImageUrl）', () => {
  assert.deepEqual(
    resolveEditorPickPhotos({ imageUrls: [], coverImageUrl: 'https://e.com/cover.jpg' }),
    ['https://e.com/cover.jpg'],
  );
});

test('resolveEditorPickPhotos：相片集／封面皆缺時退回 fixtures 的 imageUrl，仍無則空陣列', () => {
  assert.deepEqual(resolveEditorPickPhotos({ imageUrl: 'https://e.com/fix.jpg' }), ['https://e.com/fix.jpg']);
  assert.deepEqual(resolveEditorPickPhotos({}), []);
});

test('deriveEditorPickCopy：缺評分時 ratingScore 空字串、count 0', () => {
  const c = deriveEditorPickCopy({ title: 'X', tagline: 't', shortDescription: 'd', region: 'r' });
  assert.equal(c.ratingScore, '');
  assert.equal(c.ratingCount, 0);
});

test('deriveMoreFeaturedCopy：帶入標題/標語/圖片', () => {
  const c = deriveMoreFeaturedCopy(ACTIVITY);
  assert.equal(c.title, ACTIVITY.title);
  assert.equal(c.tagline, ACTIVITY.tagline);
  assert.equal(c.imageUrl, ACTIVITY.coverImageUrl);
});

test('sanitizeEditorPickCopy：空字串移除、難度夾在 1–5、count 非負整數', () => {
  const s = sanitizeEditorPickCopy({
    title: '  自訂標題  ', subtitle: '', desc: '   ', difficulty: 9, ratingCount: -3, ratingScore: '4.8',
    unknown: 'x',
  });
  assert.equal(s.title, '自訂標題');
  assert.ok(!('subtitle' in s), '空字串不應成為覆寫');
  assert.ok(!('desc' in s));
  assert.equal(s.difficulty, 5, '難度上限 5');
  assert.ok(!('ratingCount' in s), '負數 count 視為無效，不覆寫');
  assert.equal(s.ratingScore, '4.8');
  assert.ok(!('unknown' in s), '未知欄位須剔除');
});

test('sanitizeEditorPickCopy：difficulty 下限 1', () => {
  assert.equal(sanitizeEditorPickCopy({ difficulty: 0 }).difficulty, 1);
});

test('sanitizeMoreFeaturedCopy：只保留 validSlugs、剔除空 entry', () => {
  const s = sanitizeMoreFeaturedCopy(
    {
      'a': { title: '客製A', tagline: '', imageUrl: '' },
      'b': { title: '', tagline: '', imageUrl: '' },
      'ghost': { title: '不在白名單' },
    },
    ['a', 'b'],
  );
  assert.deepEqual(s, { a: { title: '客製A' } });
});

test('mergeEditorPickCopy：覆寫優先、留空回退 derived', () => {
  const derived = deriveEditorPickCopy(ACTIVITY);
  const merged = mergeEditorPickCopy(derived, { title: '手寫標題', difficulty: 4 });
  assert.equal(merged.title, '手寫標題');
  assert.equal(merged.difficulty, 4);
  assert.equal(merged.subtitle, derived.subtitle, '未覆寫欄位回退自動帶入');
  assert.equal(merged.imageUrl, derived.imageUrl);
});

test('mergeMoreFeaturedCopy：覆寫優先、留空回退 derived', () => {
  const derived = deriveMoreFeaturedCopy(ACTIVITY);
  const merged = mergeMoreFeaturedCopy(derived, { title: '客製卡片' });
  assert.equal(merged.title, '客製卡片');
  assert.equal(merged.tagline, derived.tagline);
  assert.equal(merged.imageUrl, derived.imageUrl);
});

// ── resolveHomepageFeaturedView：把 admin 設定＋真實目錄解析成首頁 view-model ──
const CATALOG = [
  { slug: 's1', title: '行程一｜長標題', tagline: '標語一', shortDescription: '簡介一', region: '高雄市', regionSlug: 'kaohsiung', priceTwd: 1800, durationMinutes: 270, coverImageUrl: 'http://img/1.jpg', ratingAvg: 4.6, reviewCount: 10 },
  { slug: 's2', title: '行程二', tagline: '標語二', shortDescription: '簡介二', region: '台北市', priceTwd: 1500, durationMinutes: 180, coverImageUrl: 'http://img/2.jpg', ratingAvg: 0, reviewCount: 0 },
  { slug: 's3', title: '行程三', tagline: '標語三', shortDescription: '簡介三', region: '花蓮縣', priceTwd: 3200, durationMinutes: 480, coverImageUrl: 'http://img/3.jpg', ratingAvg: 5, reviewCount: 3 },
];

test('resolveView: 指定 editorPick + 覆寫標題；更多精選依設定排序、排除編輯精選', () => {
  const view = resolveHomepageFeaturedView(
    { editorPickSlug: 's2', moreFeaturedSlugs: ['s2', 's3', 's1'], editorPickCopy: { title: '自訂大標' }, moreFeaturedCopy: { s3: { title: '自訂卡片' } } },
    CATALOG,
  );
  assert.equal(view.editorPickSlug, 's2');
  assert.equal(view.editorPick.activity.slug, 's2');
  assert.equal(view.editorPick.copy.title, '自訂大標', '覆寫優先');
  assert.equal(view.editorPick.copy.subtitle, '標語二', '未覆寫回退自動帶入');
  // s2 是編輯精選自動排除，剩 s3、s1
  assert.deepEqual(view.tours.map((t) => t.activity.slug), ['s3', 's1']);
  assert.equal(view.tours[0].copy.title, '自訂卡片');
  assert.equal(view.tours[1].copy.title, '行程一｜長標題', '更多精選卡片標題保留完整（不切｜）');
});

test('resolveView: 未設定 → 編輯精選＝目錄第一筆、更多精選＝其餘前 2', () => {
  const view = resolveHomepageFeaturedView(null, CATALOG);
  assert.equal(view.editorPickSlug, 's1');
  assert.deepEqual(view.tours.map((t) => t.activity.slug), ['s2', 's3']);
});

test('resolveView: 設定的 slug 已下架 → 退回目錄第一筆', () => {
  const view = resolveHomepageFeaturedView({ editorPickSlug: 'ghost', moreFeaturedSlugs: ['ghost'] }, CATALOG);
  assert.equal(view.editorPickSlug, 's1');
  assert.deepEqual(view.tours.map((t) => t.activity.slug), ['s2', 's3']);
});

test('resolveView: 目錄為空（DB 不可用）→ null/空，交由元件退回 fixtures', () => {
  const view = resolveHomepageFeaturedView({ editorPickSlug: 's1' }, []);
  assert.equal(view.editorPick, null);
  assert.deepEqual(view.tours, []);
});

test('formatDurationDisplay: 分鐘 → 顯示字串', () => {
  assert.equal(formatDurationDisplay(270), '約 5 小時');
  assert.equal(formatDurationDisplay(180), '約 3 小時');
  assert.equal(formatDurationDisplay(45), '45 分鐘');
  assert.equal(formatDurationDisplay(0), '');
  assert.equal(formatDurationDisplay(null), '');
});
