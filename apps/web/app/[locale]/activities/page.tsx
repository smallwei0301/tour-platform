import { Suspense } from 'react';
import ActivitiesContent from './ActivitiesContent';
import ActivitiesSkeleton from './ActivitiesSkeleton';
import ActivitiesFirstPaint from './ActivitiesFirstPaint';
import { resolveCoverSrc, buildCardImageSrcSet, CARD_IMAGE_SIZES } from './cover-image';
import { listPublishedActivitiesDb } from '../../../src/lib/db.mjs';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';

// Issue #1249 — match the `/api/activities` cache window so the SSR HTML
// for `/activities` is served from the edge cache for anonymous visitors
// instead of round-tripping Supabase on every render.
export const revalidate = 60;

export const metadata: Metadata = {
  title: '探索行程 | Midao 祕島',
  description: '瀏覽台灣全島私人導遊行程。柴山探洞、大稻埕老街、花蓮溯溪等在地體驗，依地區、主題自由篩選。',
  openGraph: {
    title: '探索行程 | Midao 祕島',
    description: '台灣私人導遊行程，實名認證、透明定價、安全付款。',
    images: [{ url: '/images/og-default.png', width: 1536, height: 1024, alt: '台灣在地導遊行程 | Midao 祕島' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '探索行程 | Midao 祕島',
    description: '台灣私人導遊行程，實名認證、透明定價、安全付款。',
    images: ['/images/og-default.png'],
  },
};

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';

export default async function ActivitiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'activities' });
  const tSeo = await getTranslations({ locale, namespace: 'seo' });
  const activitiesJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: tSeo('activitiesCollectionName'),
        description: tSeo('activitiesCollectionDescription'),
        url: `${baseUrl}/activities`,
        publisher: { '@type': 'Organization', name: tSeo('siteName'), url: baseUrl },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: t('breadcrumbHome'), item: baseUrl },
          { '@type': 'ListItem', position: 2, name: t('breadcrumbActivities'), item: `${baseUrl}/activities` },
        ],
      },
    ],
  };

  // Issue #1249 — server-side fetch so the first paint has cards. We
  // hand the full unfiltered list to the client; client-side filters and
  // search re-fetch through `/api/activities` as the operator types, but
  // the initial render no longer has to wait for a Supabase round-trip.
  // Fail soft: any error here just falls back to client-only fetch.
  const initialActivities = await listPublishedActivitiesDb({ region: '', category: '', q: '' }).catch(() => undefined);

  // Issue #1344 — LCP element 是第一張卡的 cover 圖,但卡片由 client
  // component render,圖片要等 JS bundle → hydrate → render 完才開始
  // 下載(slow-4G 實測 t≈6s)。在 SSR head 直接 preload 第一張卡的
  // responsive 變體(imagesrcset 跟 next/image 產生的 srcset 一致,
  // cache-hit),讓瀏覽器 HTML parse 階段就開抓圖。
  const firstCover = initialActivities?.[0] ? resolveCoverSrc(initialActivities[0].coverImageUrl) : null;

  return (
    <>
      {firstCover && (
        <link
          rel="preload"
          as="image"
          imageSrcSet={buildCardImageSrcSet(firstCover)}
          imageSizes={CARD_IMAGE_SIZES}
          fetchPriority="high"
        />
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(activitiesJsonLd) }} />
      {/* Issue #1344 — ActivitiesContent 用 useSearchParams()，ISR prerender
          時整棵 client 樹 CSR bailout，SSR HTML 只剩這個 fallback。fallback
          從 skeleton（#1345）升級成用 SSR 資料 render 的真卡片首屏
          （ActivitiesFirstPaint）：LCP 圖片直接進 HTML，不再等 hydration
          （原 render delay 佔 LCP 75%）。SSR 資料抓不到時退回 skeleton。 */}
      <Suspense
        fallback={
          initialActivities?.length
            ? <ActivitiesFirstPaint activities={initialActivities} locale={locale} />
            : <ActivitiesSkeleton />
        }
      >
        <ActivitiesContent initialActivities={initialActivities} />
      </Suspense>
    </>
  );
}

