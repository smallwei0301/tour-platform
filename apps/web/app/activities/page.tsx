import { Suspense } from 'react';
import ActivitiesContent from './ActivitiesContent';
import ActivitiesSkeleton from './ActivitiesSkeleton';
import { listPublishedActivitiesDb } from '../../src/lib/db.mjs';
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
    images: [{ url: 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=1200&q=80', width: 1200, height: 630, alt: '台灣在地導遊行程 | Midao 祕島' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '探索行程 | Midao 祕島',
    description: '台灣私人導遊行程，實名認證、透明定價、安全付款。',
    images: ['https://images.unsplash.com/photo-1528164344705-47542687000d?w=1200&q=80'],
  },
};

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
const activitiesJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'CollectionPage',
      name: '探索行程 | Midao 祕島',
      description: '瀏覽台灣全島私人導遊行程。',
      url: `${baseUrl}/activities`,
      publisher: { '@type': 'Organization', name: 'Midao 祕島', url: baseUrl },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首頁', item: baseUrl },
        { '@type': 'ListItem', position: 2, name: '探索行程', item: `${baseUrl}/activities` },
      ],
    },
  ],
};

export default async function ActivitiesPage() {
  // Issue #1249 — server-side fetch so the first paint has cards. We
  // hand the full unfiltered list to the client; client-side filters and
  // search re-fetch through `/api/activities` as the operator types, but
  // the initial render no longer has to wait for a Supabase round-trip.
  // Fail soft: any error here just falls back to client-only fetch.
  const initialActivities = await listPublishedActivitiesDb({ region: '', category: '', q: '' }).catch(() => undefined);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(activitiesJsonLd) }} />
      {/* Issue #1345 — Suspense fallback 過去只 render 一行「載入中⋯」,
          當 ActivitiesContent 串流進來時 main-content 高度從 ~60px 暴增
          到 ~1500px,造成 CLS 0.93。改成跟真實卡片 grid 同骨架的 skeleton
          (6 張固定尺寸的 placeholder),fallback → cards 替換時整塊
          main-content 高度幾乎不變,shift 距離趨近 0。 */}
      <Suspense fallback={<ActivitiesSkeleton />}>
        <ActivitiesContent initialActivities={initialActivities} />
      </Suspense>
    </>
  );
}

