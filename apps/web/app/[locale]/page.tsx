import type { Metadata } from 'next';
import { LpHero, LpThemes, LpFeatured, LpGuide, LpTours, LpDestinations, LpStories, LpFaq, LpClosing } from '../../src/components/landing/LpSections';
import { getHomepageFeaturedDb, listPublishedActivitiesDb, getActivityGalleryBySlugDb } from '../../src/lib/db.mjs';
import { resolveHomepageFeaturedView, resolveEditorPickPhotos } from '../../src/lib/homepage-featured-copy.mjs';
import { resolveActivityReviewStats } from '../../src/lib/activity-review-stats.mjs';
import { HOMEPAGE_MORE_FEATURED_LIMIT } from '../../src/lib/homepage-featured.mjs';

// 首頁採「on-demand 失效為主」的 ISR：admin 於 /admin/homepage 儲存精選時，
// PUT /api/admin/homepage-featured 會 revalidatePath('/') 立即重生（變更即時可見）；
// 行程上下架／編輯也會 revalidatePath('/')（見 activityRevalidationPaths）。
// 因此不靠短 timer 冷重生，改用長 revalidate 當安全網（最多每日自我修復一次），
// 大幅減少低流量時使用者踩到冷重生的 ~數秒延遲。
export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'Midao 祕島｜台灣在地導遊預約平台',
  description: '找到懂路的人，帶你走進台灣最有故事的地方。柴山探洞、大稻埕老街、花蓮溯溪⋯⋯ 預約實名認證在地導遊，安全透明。',
  openGraph: {
    title: 'Midao 祕島｜台灣在地導遊預約平台',
    description: '找到懂路的人，帶你走進台灣最有故事的地方。',
    images: [{ url: '/images/og-default.png', width: 1536, height: 1024, alt: 'Midao 祕島｜台灣在地導遊預約平台' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Midao 祕島｜台灣在地導遊預約平台',
    description: '找到懂路的人，帶你走進台灣最有故事的地方。',
    images: ['/images/og-default.png'],
  },
};

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';

const homeJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${baseUrl}/#organization`,
      name: 'Midao 祕島',
      url: baseUrl,
      description: '台灣在地導遊預約平台 — 連結旅客與在地導遊，提供深度文化體驗。',
      contactPoint: {
        '@type': 'ContactPoint',
        email: 'hello@midao.tw',
        contactType: 'customer service',
        availableLanguage: ['zh-TW', 'en'],
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${baseUrl}/#website`,
      url: baseUrl,
      name: 'Midao 祕島',
      publisher: { '@id': `${baseUrl}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: `${baseUrl}/activities?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: '為什麼這種旅遊方式更值得？',
          acceptedAnswer: { '@type': 'Answer', text: '看清楚再選，不賭人品——導遊資料、評論、專長一眼看清，幾分鐘選對人；走進回憶，而不是趕行程——看到的是「適合誰」「會記住什麼」，不只是地點；有在地人帶路，少花冤枉時間——熟悉地方的導遊，幫你避開陷阱、走穩定路線。' },
        },
        {
          '@type': 'Question',
          name: '什麼是私人導遊行程？',
          acceptedAnswer: { '@type': 'Answer', text: '私人導遊行程是由平台認證的在地導遊帶領的小團體驗，行程由導遊設計，旅客可以按照自己的節奏探索，不需要配合大團行程表。' },
        },
        {
          '@type': 'Question',
          name: '如何確保導遊品質與安全？',
          acceptedAnswer: { '@type': 'Answer', text: '所有導遊都經過實名認證（KYC），部分導遊另有急救認證、環境教育講師等專業資歷。平台也提供緊急熱線 30 分鐘回應服務。' },
        },
        {
          '@type': 'Question',
          name: '付款安全嗎？',
          acceptedAnswer: { '@type': 'Answer', text: '所有付款透過 ECPay 或 LINE Pay 加密處理，你的信用卡資料不會經過本站。' },
        },
        {
          '@type': 'Question',
          name: '可以取消預約嗎？',
          acceptedAnswer: { '@type': 'Answer', text: '可以。每個行程都有明確的退款政策，大部分行程在出團 168 小時前（含）以上可全額退款，出團前超過 72 小時且少於 168 小時可退 70%。詳細規則請見各行程頁面。' },
        },
        {
          '@type': 'Question',
          name: '適合帶小孩參加嗎？',
          acceptedAnswer: { '@type': 'Answer', text: '依行程而定。每個行程頁面都有標註「適合對象」與「不太適合」的說明，選擇前請先確認。部分行程有親子友善標籤。' },
        },
        {
          '@type': 'Question',
          name: '如何成為導遊？',
          acceptedAnswer: { '@type': 'Answer', text: '點擊「成為導遊」填寫申請表，經過平台審核後即可上架行程。我們歡迎有在地特色、專業背景的導遊加入。' },
        },
      ],
    },
  ],
};

export default async function HomePage() {
  // 讀取 admin 設定的首頁精選 + 真實已發布行程目錄；任何錯誤都 fail-open。
  // 目錄為空（DB 不可用）時 view 為 null/空 → 元件退回 fixtures 後備卡片。
  const [settings, catalog] = await Promise.all([
    getHomepageFeaturedDb().catch(() => null),
    listPublishedActivitiesDb({}).catch(() => []),
  ]);
  const { editorPick, tours } = resolveHomepageFeaturedView(settings, catalog, HOMEPAGE_MORE_FEATURED_LIMIT);
  // 精選卡評分以「真實行程平均 + 真實評論 + 暖場留言」覆寫顯示值（與行程詳情頁一致）。
  // 評分所需的 reviews/ratingAvg/socialProofQuotes 已包含在 catalog（listPublishedActivitiesDb
  // 批次撈出），editorPick.activity 即為 catalog row → 直接計算，不必再打詳情查詢。
  if (editorPick?.activity?.slug) {
    const stats = resolveActivityReviewStats(editorPick.activity);
    editorPick.copy.ratingScore = stats.score.toFixed(1);
    editorPick.copy.ratingCount = stats.count;
    // 編輯精選大卡照片吃「行程頁內照片」（相片集）。只有相片集 catalog 沒有，
    // 用單一輕量查詢取得（取代整套行程詳情抓取，省約 4 個序列查詢）。
    const gallery = await getActivityGalleryBySlugDb(editorPick.activity.slug).catch(() => []);
    const photos = resolveEditorPickPhotos({ imageUrls: gallery, coverImageUrl: editorPick.activity.coverImageUrl });
    if (photos.length > 0) editorPick.copy.imageUrls = photos;
  }
  return (
    <>
      {/* Preload hero background image to improve LCP */}
      <link
        rel="preload"
        as="image"
        href="/images/lp/hero-cave-fg.webp"
        fetchPriority="high"
      />
      <link
        rel="preload"
        as="image"
        href="/images/lp/hero-mountains.webp"
        fetchPriority="high"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }}
      />
      <div className="lp-root">
        <LpHero />
        <LpThemes />
        <LpFeatured featured={editorPick ?? undefined} />
        <LpGuide />
        {/* 原首頁資訊區塊（行程／目的地／評價／FAQ）以 LP 風格融合 */}
        <LpTours tours={tours} />
        <LpDestinations />
        <LpStories />
        <LpFaq />
        <LpClosing />
      </div>
    </>
  );
}
