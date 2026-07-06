import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LpHero, LpThemes, LpFeatured, LpGuide, LpTours, LpDestinations, LpStories, LpFaq, LpClosing } from '../../src/components/landing/LpSections';
import { getHomepageFeaturedDb, listPublishedActivitiesDb, getActivityGalleryBySlugDb } from '../../src/lib/db.mjs';
import { resolveHomepageFeaturedView, resolveEditorPickPhotos } from '../../src/lib/homepage-featured-copy.mjs';
import { resolveActivityReviewStats } from '../../src/lib/activity-review-stats.mjs';
import { HOMEPAGE_MORE_FEATURED_LIMIT } from '../../src/lib/homepage-featured.mjs';
import { buildAlternates } from '../../src/lib/seo-alternates.ts';

// 首頁採「on-demand 失效為主」的 ISR：admin 於 /admin/homepage 儲存精選時，
// PUT /api/admin/homepage-featured 會 revalidatePath('/') 立即重生（變更即時可見）；
// 行程上下架／編輯也會 revalidatePath('/')（見 activityRevalidationPaths）。
// 因此不靠短 timer 冷重生，改用長 revalidate 當安全網（最多每日自我修復一次），
// 大幅減少低流量時使用者踩到冷重生的 ~數秒延遲。
export const revalidate = 86400;

// 健檢 v2 SEO-1：static metadata → generateMetadata，補 canonical/hreflang（buildAlternates）
export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> }
): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: 'Midao 祕島｜台灣在地導遊預約平台',
    description: '找到懂路的人，帶你走進台灣最有故事的地方。柴山探洞、大稻埕老街、花蓮溯溪⋯⋯ 預約實名認證在地導遊，安全透明。',
    alternates: buildAlternates('/', locale),
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
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tSeo = await getTranslations({ locale, namespace: 'seo' });
  const tFaq = await getTranslations({ locale, namespace: 'home.faq' });
  const faqItems = tFaq.raw('items') as Array<{ q: string; a: string }>;

  const homeJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${baseUrl}/#organization`,
        name: tSeo('siteName'),
        url: baseUrl,
        description: tSeo('orgDescription'),
        contactPoint: {
          '@type': 'ContactPoint',
          email: 'midao2026@gmail.com',
          contactType: 'customer service',
          availableLanguage: ['zh-TW', 'en'],
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${baseUrl}/#website`,
        url: baseUrl,
        name: tSeo('siteName'),
        publisher: { '@id': `${baseUrl}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${baseUrl}/activities?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqItems.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  };

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
