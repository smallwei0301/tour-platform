// 商店首頁像素級比對用的固定 mock 資料頁（脫離 Supabase／in-memory fixtures，
// 內容與版面永遠固定，供 Playwright 疊圖比對不受真實資料變動影響）。
// 保留字（reserved slug）：任何真實導遊都不可能用到，見 shop/page.tsx 的短路判斷。
export const SHOP_MOCK_SLUG = '__mock_landing__';

export const SHOP_LANDING_MOCK = {
  guide: {
    id: 'mock-landing',
    slug: SHOP_MOCK_SLUG,
    displayName: 'Andy Lee',
    region: '高雄市',
    bio: '土生土長的高雄人，熟悉山海與部落的日常。用在地的眼睛，帶你看見祕境也看見生活。',
    profilePhotoUrl: '/images/guides/andy-lee/avatar.jpg',
    heroImageUrl: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=1200&q=80',
  },
  activitiesByRegion: [],
};
