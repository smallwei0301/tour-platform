import { Suspense } from 'react';
import ActivitiesContent from './ActivitiesContent';
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
      <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#666' }}>載入中⋯</div>}>
        <ActivitiesContent initialActivities={initialActivities} />
      </Suspense>
    </>
  );
}
